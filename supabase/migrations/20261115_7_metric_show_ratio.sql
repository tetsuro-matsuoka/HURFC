-- =============================================================
-- 追加SQL（2026-11 その7）：項目ごとの「体重比（相対値）も表示する」設定
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
-- ※ supabase/schema.sql にも同じ内容が入っています。
--
-- metrics に show_ratio（true＝選手一覧・CSVで「項目の値÷その日時点の体重」も表示）を追加します。初期値は false。
-- 体重比はアプリ側で自動計算するので、記録用の表や欄は増えません。
-- =============================================================

alter table public.metrics add column if not exists show_ratio boolean not null default false;
