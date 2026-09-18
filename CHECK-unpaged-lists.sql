-- How close the lists that load in ONE request are to the 1000-row limit. Reads only. Run on LIVE.
--
-- One request brings back at most 1000 rows. The rest are left off with no
-- error: a section, a supplier or a stores item simply is not in the picker.
-- Stock, jobs and the Production tab already load in pages (fetchAllRows).
-- These tables do not yet: the eight master tables (loadMasterFromTables in
-- src/App.jsx) and a few smaller lists read whole.
-- room_left is how far each one is from the limit. One table, so the editor shows it all.
with t as (
  select 1 as ord, 'master: sections, materials, plate rates (master_factor_items)' as what, (select count(*) from public.master_factor_items) as how_many
  union all (select 2, '   biggest list in it: ' || list_name, count(*) from public.master_factor_items group by list_name order by count(*) desc limit 1)
  union all select 3, 'master: plain lists (master_string_lists)', (select count(*) from public.master_string_lists)
  union all select 4, 'master: stores catalogue', (select count(*) from public.master_stores_catalog)
  union all select 5, 'master: suppliers', (select count(*) from public.master_suppliers)
  union all select 6, 'master: supplier contacts', (select count(*) from public.master_supplier_contacts)
  union all select 7, 'master: customer contacts', (select count(*) from public.master_customer_contacts)
  union all select 8, 'shortages, every one ever flagged', (select count(*) from public.shortages)
  union all select 9, 'drawings', (select count(*) from public.drawings)
  union all select 10, 'info requests', (select count(*) from public.job_info_requests)
  union all select 11, 'invoice notes', (select count(*) from public.job_invoice_notes)
  union all select 12, 'people (profiles)', (select count(*) from public.profiles)
)
select what, how_many, 1000 as stops_at, 1000 - how_many as room_left from t order by ord;
