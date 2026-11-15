-- =============================================================
-- 追加SQL（2026-11 その9）：週ごとの練習日数と筋トレメニュー構成
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
-- ※ supabase/schema.sql にも同じ内容が入っています。
--
-- week_settings … コーチが「日程調整」で週ごとに設定する値（1週＝1行。週は月曜はじまり）
--   week_start    … その週の月曜日
--   practice_days … その週の練習日数（1〜7）。空＝カレンダーの練習日から自動で数える
--   menu          … 筋トレメニュー構成（A〜B / A〜C / A〜D）。空＝A〜C
-- 閲覧はメンバー全員、変更はコーチのみ
-- =============================================================

create table if not exists public.week_settings (
  week_start    date primary key,
  practice_days smallint check (practice_days between 1 and 7),
  menu          text check (menu in ('A〜B', 'A〜C', 'A〜D')),
  updated_at    timestamptz not null default now()
);

alter table public.week_settings enable row level security;
grant select, insert, update, delete on public.week_settings to authenticated;
grant all on public.week_settings to service_role;

drop policy if exists "week_select" on public.week_settings;
create policy "week_select" on public.week_settings for select to authenticated using (public.is_member());
drop policy if exists "week_write" on public.week_settings;
create policy "week_write" on public.week_settings for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- 表の変更をすぐ反映
notify pgrst, 'reload schema';
