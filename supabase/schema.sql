-- =============================================================
-- NUMBERS（選手向けフィジカル・モチベーション管理アプリ）
-- データベースの作成SQL
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります。
--
-- テーブル構成は要件定義書 4章に対応：
--   users            … ユーザー情報（名前・権限・学年・ポジション・並び順）。コーチの合言葉は Supabase Auth が暗号化して保管
--   daily_records    … 日次データ（出欠・体重）
--   physical_records … フィジカルデータ（Big3）
--   metrics / metric_records / training_records / app_settings … ファイル末尾の「追加SQL（2026-11）」を参照
-- =============================================================

-- ---------- テーブル ----------
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null unique,                                  -- 氏名（ログインID兼用）
  role        text not null check (role in ('player', 'coach')),     -- 権限
  login_email text not null unique,                                  -- ログイン用の内部アドレス（メールは送らない）
  created_at  timestamptz not null default now()
);

create table if not exists public.daily_records (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  date       date not null,                                          -- 記録日
  attendance text check (attendance in ('出席', '欠席')),             -- 出欠状況
  weight     numeric(5, 1),                                          -- 体重（kg）
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.physical_records (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users (id) on delete cascade,
  date        date not null,                                         -- 測定日
  bench_press numeric(5, 1),                                         -- ベンチプレス（kg）
  squat       numeric(5, 1),                                         -- スクワット（kg）
  deadlift    numeric(5, 1),                                         -- デッドリフト（kg）
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

-- 選手の学年・ポジション・並び順（あとから追加した列。既存のデータベースにも追加されます）
alter table public.users add column if not exists grade smallint check (grade between 1 and 6);                         -- 学年（画面では1〜4年を選択）
alter table public.users add column if not exists position text check (position in ('フロント', 'バックロー', 'バックス')); -- ポジション（ファイル末尾の「その3」で10種類に変更）
alter table public.users add column if not exists sort_order integer;                                                  -- 一覧での並び順（小さいほど上）

create index if not exists daily_records_date_idx on public.daily_records (date);

-- ---------- 補助関数 ----------
-- ログインしている人が、このアプリのメンバーかどうか
create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid());
$$;

-- ログイン画面に出す名前の一覧（合言葉は含まない）
create or replace function public.login_members()
returns table (name text, login_email text, role text)
language sql stable security definer
set search_path = public
as $$
  select name, login_email, role from public.users
  order by role, sort_order nulls last, grade desc nulls last, name;
$$;

revoke all on function public.is_member() from public;
revoke all on function public.login_members() from public;
grant execute on function public.is_member() to authenticated;
grant execute on function public.login_members() to anon, authenticated;

-- ---------- 権限（RLS：行ごとのアクセス制御）----------
alter table public.users enable row level security;
alter table public.daily_records enable row level security;
alter table public.physical_records enable row level security;

grant select on public.users to authenticated;
grant select, insert, update, delete on public.daily_records to authenticated;
grant select, insert, update, delete on public.physical_records to authenticated;
grant all on public.users, public.daily_records, public.physical_records to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- users：メンバーは全員の名前・権限を見られる（ランキング表示のため）。追加・変更はサーバー側のみ
drop policy if exists "users_select" on public.users;
create policy "users_select" on public.users
  for select to authenticated using (public.is_member());

-- daily_records：メンバーは全員分を見られる（コーチ画面・ランキングのため）。書き込みは本人分のみ
drop policy if exists "daily_select" on public.daily_records;
create policy "daily_select" on public.daily_records
  for select to authenticated using (public.is_member());
drop policy if exists "daily_insert" on public.daily_records;
create policy "daily_insert" on public.daily_records
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "daily_update" on public.daily_records;
create policy "daily_update" on public.daily_records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "daily_delete" on public.daily_records;
create policy "daily_delete" on public.daily_records
  for delete to authenticated using (user_id = auth.uid());

-- physical_records：daily_records と同じルール
drop policy if exists "physical_select" on public.physical_records;
create policy "physical_select" on public.physical_records
  for select to authenticated using (public.is_member());
drop policy if exists "physical_insert" on public.physical_records;
create policy "physical_insert" on public.physical_records
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "physical_update" on public.physical_records;
create policy "physical_update" on public.physical_records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "physical_delete" on public.physical_records;
create policy "physical_delete" on public.physical_records
  for delete to authenticated using (user_id = auth.uid());

-- =============================================================
-- 追加SQL（2026-11）：チームダッシュボード改修・項目のカスタマイズ・筋トレ遂行度
--
-- （supabase/migrations/20261115_dashboard_items.sql と同じ内容）
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

-- =============================================================
-- 追加SQL（2026-11 その2）：体重・Big3 を「項目設定」の項目として並べる
--
-- （supabase/migrations/20261115_2_linked_metrics.sql と同じ内容）
--
-- 体重・ベンチプレス・スクワット・デッドリフト・Big3合計を metrics（項目設定）に追加します。
-- これらの値は、今までどおり「毎日の記録（体重）」「測定（Big3）」の入力を使います（key で目印を付ける）。
--   weight=体重 / bench_press / squat / deadlift / big3_total=Big3合計（自動計算）
-- すでに同じ名前の項目をコーチが追加していた場合は、新しく作らずにその項目に目印を付けて1つにまとめます。
-- 初回だけ実行されます（あとでコーチが削除した項目は復活しません）。
-- =============================================================

do $$
declare
  r record;
begin
  if exists (select 1 from public.app_settings where key = 'linked_metrics_seeded') then
    return;
  end if;

  for r in
    select * from (values
      ('weight',      '体重',         'kg', '体組成',     'high', -10),
      ('bench_press', 'ベンチプレス', 'kg', 'フィジカル', 'high', -10),
      ('squat',       'スクワット',   'kg', 'フィジカル', 'high', -9),
      ('deadlift',    'デッドリフト', 'kg', 'フィジカル', 'high', -8),
      ('big3_total',  'Big3合計',     'kg', 'フィジカル', 'high', -7)
    ) as t(k, n, u, c, b, s)
  loop
    if not exists (select 1 from public.metrics where key = r.k) then
      -- 同じ名前の項目があれば、それに目印を付ける（重複させない）
      update public.metrics set key = r.k
       where id = (select id from public.metrics where key is null and name = r.n order by id limit 1);
      if not found then
        insert into public.metrics (key, name, unit, category, better, sort_order)
        values (r.k, r.n, r.u, r.c, r.b, r.s);
      end if;
    end if;
  end loop;

  insert into public.app_settings (key, value) values ('linked_metrics_seeded', '1')
  on conflict (key) do nothing;
end $$;

-- =============================================================
-- 追加SQL（2026-11 その3）：ポジションを10種類（PR・HO・LO・FL・No.8・SH・SO・CTB・WTB・FB）に
--
-- （supabase/migrations/20261115_3_positions.sql と同じ内容）
--
-- ・FW / BK の区分はアプリ側で自動判定します（PR・HO・LO・FL・No.8 → FW / SH・SO・CTB・WTB・FB → BK）
-- ・すでに登録済みの「フロント」「バックロー」「バックス」はそのまま残します（FW・BK に自動で振り分け）。
--   選手管理の「編集」から新しいポジションに変更できます。
-- ・学年は 1〜6 まで保存できる設定のままです（画面では 1〜5年を選択）
-- =============================================================

do $$
declare
  c record;
begin
  -- 古いポジションの制限（チェック）を外す
  for c in
    select conname from pg_constraint
     where conrelid = 'public.users'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%position%'
  loop
    execute format('alter table public.users drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.users add constraint users_position_check check (
  position in ('PR', 'HO', 'LO', 'FL', 'No.8', 'SH', 'SO', 'CTB', 'WTB', 'FB', 'フロント', 'バックロー', 'バックス')
);

-- =============================================================
-- 追加SQL（2026-11 その4）：練習日（日程調整）
--
-- （supabase/migrations/20261115_4_practice_days.sql と同じ内容）
--
-- practice_days … コーチが「日程調整」で設定した練習日（1日1行。行がある日＝練習日）
-- 出欠席率は「練習日」を分母に計算します（練習日を1日も設定していない月は、今までどおり記録ベース）。
-- =============================================================

create table if not exists public.practice_days (
  date       date primary key,                 -- 練習日
  created_at timestamptz not null default now()
);

alter table public.practice_days enable row level security;
grant select, insert, update, delete on public.practice_days to authenticated;
grant all on public.practice_days to service_role;

-- メンバーは見られる（選手画面で「今日は練習日か」を表示するため）。追加・削除はコーチのみ
drop policy if exists "practice_select" on public.practice_days;
create policy "practice_select" on public.practice_days for select to authenticated using (public.is_member());
drop policy if exists "practice_write" on public.practice_days;
create policy "practice_write" on public.practice_days for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- =============================================================
-- 追加SQL（2026-11 その5）：欠席理由
--
-- （supabase/migrations/20261115_5_absence_reason.sql と同じ内容）
--
-- daily_records に absence_reason（欠席理由）を追加します。
-- 欠席のときだけ入り、出席・オフの日は空（null）です。
-- =============================================================

alter table public.daily_records add column if not exists absence_reason text;

alter table public.daily_records drop constraint if exists daily_records_absence_reason_check;
alter table public.daily_records add constraint daily_records_absence_reason_check check (
  absence_reason is null
  or absence_reason in ('体調不良', '学校関連', '病院・リハビリ', '冠婚葬祭', 'ずる休み', 'その他')
);

-- =============================================================
-- 追加SQL（2026-11 その6）：選手のカテゴリー（レギュラー・ベンチ・ベンチ外）
--
-- （supabase/migrations/20261115_6_player_category.sql と同じ内容）
--
-- users に category（カテゴリー）を追加します。未設定は空（null）。
-- 変更はコーチのみ（サーバー側 app/api/admin/route.ts で確認してから保存）。
-- =============================================================

alter table public.users add column if not exists category text;

alter table public.users drop constraint if exists users_category_check;
alter table public.users add constraint users_category_check check (
  category is null or category in ('レギュラー', 'ベンチ', 'ベンチ外')
);

-- =============================================================
-- 追加SQL（2026-11 その7）：項目ごとの「体重比（相対値）も表示する」設定
--
-- （supabase/migrations/20261115_7_metric_show_ratio.sql と同じ内容）
--
-- metrics に show_ratio（true＝選手一覧・CSVで「項目の値÷その日時点の体重」も表示）を追加します。初期値は false。
-- 体重比はアプリ側で自動計算するので、記録用の表や欄は増えません。
-- =============================================================

alter table public.metrics add column if not exists show_ratio boolean not null default false;

-- =============================================================
-- 追加SQL（2026-11 その8）：体重の測定タイミング・時刻
--
-- （supabase/migrations/20261116_2_weight_timing.sql と同じ内容）
--
-- daily_records に次の2つを追加します（どちらも空でもよい）。
--   weight_timing … 測定タイミング（朝（起床後）・練習前・練習後・夜（就寝前））
--   weight_time   … 測定時刻（"07:15" のような 時:分）
-- =============================================================

alter table public.daily_records add column if not exists weight_timing text;
alter table public.daily_records add column if not exists weight_time text;

alter table public.daily_records drop constraint if exists daily_records_weight_timing_check;
alter table public.daily_records add constraint daily_records_weight_timing_check check (
  weight_timing is null or weight_timing in ('朝（起床後）', '練習前', '練習後', '夜（就寝前）')
);
alter table public.daily_records drop constraint if exists daily_records_weight_time_check;
alter table public.daily_records add constraint daily_records_weight_time_check check (
  weight_time is null or weight_time ~ '^[0-2][0-9]:[0-5][0-9]$'
);

-- 表の変更をすぐ反映
notify pgrst, 'reload schema';

-- 確認用：daily_records の欄の一覧（weight_timing と weight_time が出ていれば OK）
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'daily_records'
 order by ordinal_position;
