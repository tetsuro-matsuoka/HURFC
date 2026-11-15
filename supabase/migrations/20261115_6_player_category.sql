-- =============================================================
-- 追加SQL（2026-11 その6）：選手のカテゴリー（レギュラー・ベンチ・ベンチ外）
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
-- ※ supabase/schema.sql にも同じ内容が入っています。
--
-- users に category（カテゴリー）を追加します。未設定は空（null）。
-- 変更はコーチのみ（サーバー側 app/api/admin/route.ts で確認してから保存）。
-- =============================================================

alter table public.users add column if not exists category text;

alter table public.users drop constraint if exists users_category_check;
alter table public.users add constraint users_category_check check (
  category is null or category in ('レギュラー', 'ベンチ', 'ベンチ外')
);
