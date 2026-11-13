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
alter table public.users add column if not exists position text check (position in ('フロント', 'バックロー', 'バックス')); -- ポジション
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
