-- =============================================================
-- 追加SQL（2026-11 その8）：体重の測定タイミング・時刻
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
-- ※ supabase/schema.sql にも同じ内容が入っています。
--
-- daily_records に次の2つを追加します（どちらも空でもよい）。
--   weight_timing … 測定タイミング（朝（起床後）・練習前・練習後・夜（就寝前））
--   weight_time   … 測定時刻（"07:15" のような 時:分）
-- =============================================================

alter table public.daily_records add column if not exists weight_timing text;
alter table public.daily_records add column if not exists weight_time text;

alter table public.daily_records drop constraint if exists daily_records_weight_timing_check;
alter table public.daily_records add constraint daily_records_weight_timing_check check (
  weight_timing is null or weight_timing in ('朝（起床後）', '練習前', '練習後', '夜（就寝前）')
);
alter table public.daily_records drop constraint if exists daily_records_weight_time_check;
alter table public.daily_records add constraint daily_records_weight_time_check check (
  weight_time is null or weight_time ~ '^[0-2][0-9]:[0-5][0-9]$'
);

-- 表の変更をすぐ反映
notify pgrst, 'reload schema';

-- 確認用：daily_records の欄の一覧（weight_timing と weight_time が出ていれば OK）
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'daily_records'
 order by ordinal_position;
