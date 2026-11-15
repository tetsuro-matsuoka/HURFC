-- =============================================================
-- 追加SQL（2026-11）：チームダッシュボード改修・項目のカスタマイズ・筋トレ遂行度
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
-- ※ supabase/schema.sql にも同じ内容が入っています。どちらを実行しても同じ結果になります。
--
-- 追加する表：
--   metrics            … 測定項目（体脂肪率・30mスプリントなど）。コーチが追加・変更・削除できる
--   metric_records     … 測定項目ごとの記録（誰が・いつ・いくつ）
--   training_records   … 週ごとの筋トレ遂行度（0〜10の11段階）
--   app_settings       … アプリの設定（筋トレ遂行度の評価基準の説明文など）
-- =============================================================

-- ---------- 表 ----------
create table if not exists public.metrics (
  id         bigint generated always as identity primary key,
  key        text unique,                                            -- 計算に使う項目の目印（height=身長, body_fat=体脂肪率）。普通の項目は空
  name       text not null,                                          -- 項目名（例：体脂肪率）
  unit       text not null default '',                               -- 単位（例：%、秒、kg）
  category   text not null check (category in ('体組成', 'フィジカル')), -- カテゴリ
  better     text not null default 'high' check (better in ('high', 'low')), -- 良い方向（high=大きいほど良い / low=小さいほど良い）
  sort_order integer not null default 0,                             -- 並び順
  created_at timestamptz not null default now()
);

create table if not exists public.metric_records (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  metric_id  bigint not null references public.metrics (id) on delete cascade,
  date       date not null,                                          -- 測定日
  value      numeric(8, 2) not null,                                 -- 数値
  created_at timestamptz not null default now(),
  unique (user_id, metric_id, date)
);

create table if not exists public.training_records (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  week_start date not null,                                          -- その週の月曜日
  score      smallint not null check (score between 0 and 10),       -- 筋トレ遂行度（0〜10）
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.app_settings (
  key   text primary key,
  value text not null default ''
);

-- ---------- 補助関数 ----------
-- ログインしている人がコーチかどうか
create or replace function public.is_coach()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'coach');
$$;
revoke all on function public.is_coach() from public;
grant execute on function public.is_coach() to authenticated;

-- ---------- 権限（RLS）----------
alter table public.metrics enable row level security;
alter table public.metric_records enable row level security;
alter table public.training_records enable row level security;
alter table public.app_settings enable row level security;

grant select, insert, update, delete on public.metrics, public.metric_records, public.training_records, public.app_settings to authenticated;
grant all on public.metrics, public.metric_records, public.training_records, public.app_settings to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- metrics・app_settings：メンバーは見られる。追加・変更・削除はコーチのみ
drop policy if exists "metrics_select" on public.metrics;
create policy "metrics_select" on public.metrics for select to authenticated using (public.is_member());
drop policy if exists "metrics_write" on public.metrics;
create policy "metrics_write" on public.metrics for all to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "settings_select" on public.app_settings;
create policy "settings_select" on public.app_settings for select to authenticated using (public.is_member());
drop policy if exists "settings_write" on public.app_settings;
create policy "settings_write" on public.app_settings for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- metric_records・training_records：メンバーは全員分を見られる。書き込みは本人分のみ
drop policy if exists "metric_rec_select" on public.metric_records;
create policy "metric_rec_select" on public.metric_records for select to authenticated using (public.is_member());
drop policy if exists "metric_rec_write" on public.metric_records;
create policy "metric_rec_write" on public.metric_records for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "training_select" on public.training_records;
create policy "training_select" on public.training_records for select to authenticated using (public.is_member());
drop policy if exists "training_write" on public.training_records;
create policy "training_write" on public.training_records for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- 最初の項目と設定（初回だけ入れる。コーチが消した項目は復活しません）----------
do $$
begin
  if not exists (select 1 from public.app_settings where key = 'metrics_seeded') then
    insert into public.metrics (key, name, unit, category, better, sort_order) values
      ('height',   '身長',         'cm', '体組成',     'high', 1),
      ('body_fat', '体脂肪率',     '%',  '体組成',     'low',  2),
      (null,       '30mスプリント', '秒', 'フィジカル', 'low',  1)
    on conflict do nothing;
    insert into public.app_settings (key, value) values
      ('metrics_seeded', '1'),
      ('training_criteria',
       E'10：予定メニューをすべて、予定以上の強度でやり切った\n8：予定メニューをすべてやり切った\n6：予定の半分以上をやった\n4：予定の半分くらいやった\n2：少しだけやった\n0：まったくできなかった')
    on conflict (key) do nothing;
  end if;
end $$;
