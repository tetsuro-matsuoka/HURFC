-- =============================================================
-- 追加SQL（2026-11 その5）：欠席理由
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
-- ※ supabase/schema.sql にも同じ内容が入っています。
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
