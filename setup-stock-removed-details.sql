-- Why, when and by whom an asset was removed (Heinrich, 7 Oct 2026).
--
-- The Remove asset window has always asked for a reason and a date, and
-- the app showed them under Removed / Archive, but no column kept them:
-- they were gone at the next reload. This adds the three columns. It
-- changes no row; assets removed before today stay without a reason.
--
-- The app reads and writes them only once a loaded row shows they exist
-- (stockHasRemovedDetails in src/App.jsx), so it works before and after
-- this is run. Run on PRACTICE first. Safe to run more than once.

alter table public.stock_items add column if not exists removed_reason text;
alter table public.stock_items add column if not exists removed_date text;
alter table public.stock_items add column if not exists removed_by text;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'stock_items'
  and column_name in ('removed_reason', 'removed_date', 'removed_by')
order by column_name;
