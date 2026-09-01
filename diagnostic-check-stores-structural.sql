-- Run this in Supabase → SQL Editor → New query, then Run.
-- This only reads data — it changes nothing. Paste the results back and
-- I can tell you exactly what's actually happening.

select 'stock_items (stores)' as what, count(*) as row_count
from stock_items where main_cat = 'stores'
union all
select 'stock_items (structural)', count(*)
from stock_items where main_cat = 'structural'
union all
select 'stock_items (stores) with qty = 0', count(*)
from stock_items where main_cat = 'stores' and qty = 0
union all
select 'stock_items (structural) with qty = 0', count(*)
from stock_items where main_cat = 'structural' and qty = 0
union all
select 'master_stores_catalog', count(*)
from master_stores_catalog
union all
select 'app_storage: stock-items-v3 (old blob, for comparison)', 1
from app_storage where key = 'stock-items-v3'
union all
select 'app_storage: stock-master-data-v2 (old blob, for comparison)', 1
from app_storage where key = 'stock-master-data-v2';
