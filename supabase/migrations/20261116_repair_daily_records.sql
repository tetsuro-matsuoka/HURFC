-- =============================================================
-- 修復SQL：「毎日の記録」が保存できないときに実行する
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
--
-- やること：
--   1. daily_records に、アプリが保存に使う欄（absence_reason＝欠席理由）が無ければ追加
--   2. 欠席理由に入れてよい値の制限（6つの理由）を作り直す
--   3. 出欠（attendance）を空でも保存できるようにする（オフの日に体重だけ記録するため）
--   4. 選手が自分の記録を保存できる権限（RLS）を作り直す
--   5. Supabase に表の変更をすぐ読み込み直してもらう
--   6. 最後に、daily_records の欄の一覧を表示（absence_reason が出ていれば OK）
-- =============================================================

-- 1. 欠席理由の欄
alter table public.daily_records add column if not exists absence_reason text;

-- 2. 欠席理由に入れてよい値
alter table public.daily_records drop constraint if exists daily_records_absence_reason_check;
alter table public.daily_records add constraint daily_records_absence_reason_check check (
  absence_reason is null
  or absence_reason in ('体調不良', '学校関連', '病院・リハビリ', '冠婚葬祭', 'ずる休み', 'その他')
);

-- 3. 出欠は空でもよい（オフの日）
alter table public.daily_records alter column attendance drop not null;

-- 4. 権限：メンバーは全員分を見られる・書き込みは本人分のみ
alter table public.daily_records enable row level security;
grant select, insert, update, delete on public.daily_records to authenticated;
grant usage, select on all sequences in schema public to authenticated;

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

-- 5. 表の変更をすぐ反映
notify pgrst, 'reload schema';

-- 6. 確認用：daily_records の欄の一覧
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'daily_records'
 order by ordinal_position;
