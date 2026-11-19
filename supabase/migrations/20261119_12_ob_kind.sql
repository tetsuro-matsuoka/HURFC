-- =============================================================
-- 追加SQL（2026-11 その12）：OB・コーチの記録（区分と卒業年度）
--
-- users に ob_kind（'ob'＝OB / 'coach'＝コーチ）と grad_label（卒業年度の文字。例：2025年度卒）を追加します。
-- 「OB」タブの「＋ OB・コーチ記録を追加」で登録した人は、ログインには使わない「記録用のメンバー」です。
-- OB・コーチはどちらも、現役の集計・人数・ランキングには入りません（is_ob = true）。
-- ※ 先に「その11（OB）」を実行してください。何度実行しても大丈夫です。
-- =============================================================

alter table public.users add column if not exists ob_kind text not null default 'ob';
alter table public.users drop constraint if exists users_ob_kind_check;
alter table public.users add constraint users_ob_kind_check check (ob_kind in ('ob', 'coach'));
alter table public.users add column if not exists grad_label text;

-- 画面にすぐ反映されるよう、データベースの設定を読み直す
notify pgrst, 'reload schema';
