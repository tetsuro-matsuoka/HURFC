-- =============================================================
-- 追加SQL（2026-11 その2）：体重・Big3 を「項目設定」の項目として並べる
--
-- 使い方：Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても壊れないように作ってあります（今ある記録は消えません）。
-- ※ 先に 20261115_dashboard_items.sql を実行しておく必要があります。
-- ※ supabase/schema.sql にも同じ内容が入っています。
--
-- 体重・ベンチプレス・スクワット・デッドリフト・Big3合計を metrics（項目設定）に追加します。
-- これらの値は、今までどおり「毎日の記録（体重）」「測定（Big3）」の入力を使います（key で目印を付ける）。
--   weight=体重 / bench_press / squat / deadlift / big3_total=Big3合計（自動計算）
-- すでに同じ名前の項目をコーチが追加していた場合は、新しく作らずにその項目に目印を付けて1つにまとめます。
-- 初回だけ実行されます（あとでコーチが削除した項目は復活しません）。
-- =============================================================

do $$
declare
  r record;
begin
  if exists (select 1 from public.app_settings where key = 'linked_metrics_seeded') then
    return;
  end if;

  for r in
    select * from (values
      ('weight',      '体重',         'kg', '体組成',     'high', -10),
      ('bench_press', 'ベンチプレス', 'kg', 'フィジカル', 'high', -10),
      ('squat',       'スクワット',   'kg', 'フィジカル', 'high', -9),
      ('deadlift',    'デッドリフト', 'kg', 'フィジカル', 'high', -8),
      ('big3_total',  'Big3合計',     'kg', 'フィジカル', 'high', -7)
    ) as t(k, n, u, c, b, s)
  loop
    if not exists (select 1 from public.metrics where key = r.k) then
      -- 同じ名前の項目があれば、それに目印を付ける（重複させない）
      update public.metrics set key = r.k
       where id = (select id from public.metrics where key is null and name = r.n order by id limit 1);
      if not found then
        insert into public.metrics (key, name, unit, category, better, sort_order)
        values (r.k, r.n, r.u, r.c, r.b, r.s);
      end if;
    end if;
  end loop;

  insert into public.app_settings (key, value) values ('linked_metrics_seeded', '1')
  on conflict (key) do nothing;
end $$;
