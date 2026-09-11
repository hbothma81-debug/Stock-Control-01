-- What the app pulls down on every background refresh, by table.
--
-- The app refreshes itself every minute. Anything in this list that is
-- fetched whole, every time, is being sent again and again whether it
-- changed or not -- which is where a month's data allowance goes.
--
-- Reads nothing but row counts and sizes. Changes nothing.
-- Run on LIVE (and on practice if you want to compare).

with t as (
  select 'stock_items'        as table_name, 'every refresh'      as fetched union all
  select 'usage_log',          'every refresh' union all
  select 'job_notifications',  'every refresh' union all
  select 'requisitions',       'every refresh' union all
  select 'purchase_orders',    'every refresh' union all
  select 'jobs',               'on the jobs screen' union all
  select 'job_quote_items',    'on the jobs screen' union all
  select 'job_processes',      'on the jobs screen' union all
  select 'delivery_notes',     'on the jobs screen' union all
  select 'shortages',          'on the jobs screen'
)
select
  t.table_name,
  t.fetched,
  (select n_live_tup from pg_stat_user_tables s
    where s.schemaname = 'public' and s.relname = t.table_name)      as rows_roughly,
  pg_size_pretty(
    pg_total_relation_size(('public.' || t.table_name)::regclass))   as size_on_disk
from t
where exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = t.table_name)
order by pg_total_relation_size(('public.' || t.table_name)::regclass) desc;
