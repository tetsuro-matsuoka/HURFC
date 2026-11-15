-- =============================================================
-- 追加SQL（2026-11 その4）：練習日（日程調整）
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
-- ※ supabase/schema.sql にも同じ内容が入っています。
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
