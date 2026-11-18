-- =============================================================
-- 追加SQL（2026-11 その11）：OB（引退した選手）
--
-- users に is_ob（OBなら true）と retired_on（引退した日）を追加します。
-- 今いる選手はすべて「現役」（is_ob = false）のままです。
-- 変更はコーチ画面の「選手管理」からサーバー経由で行います（選手は変更できません）。
-- 何度実行しても大丈夫です。
-- =============================================================

alter table public.users add column if not exists is_ob boolean not null default false;
alter table public.users add column if not exists retired_on date;

-- 画面にすぐ反映されるよう、データベースの設定を読み直す
notify pgrst, 'reload schema';
