-- =============================================================
-- 追加SQL（2026-11 その3）：ポジションを10種類（PR・HO・LO・FL・No.8・SH・SO・CTB・WTB・FB）に
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
-- ※ supabase/schema.sql にも同じ内容が入っています。
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
