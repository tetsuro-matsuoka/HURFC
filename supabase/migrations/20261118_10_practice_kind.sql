-- =============================================================
-- 追加SQL（2026-11 その10）：日程の活動の種類（練習・試合・合同練習）
--
-- practice_days に kind（活動の種類）を追加します。
-- 今までに設定した日はすべて「練習」になります。
-- 何度実行しても大丈夫です。
-- =============================================================

alter table public.practice_days add column if not exists kind text not null default '練習';

alter table public.practice_days drop constraint if exists practice_days_kind_check;
alter table public.practice_days add constraint practice_days_kind_check check (kind in ('練習', '試合', '合同練習'));

-- 画面にすぐ反映されるよう、データベースの設定を読み直す
notify pgrst, 'reload schema';
