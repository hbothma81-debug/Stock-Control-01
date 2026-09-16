-- How close the Production tab's load is to its two limits. Reads only. Run on LIVE.
--
-- The tab loads every job In Progress or Complete (not yet invoiced) in one go.
-- 1. One request brings back at most 1000 rows. The rest are left off with no
--    error: parts vanish from a card and stage counts come out wrong.
-- 2. The job ids, and the stage ids, travel in the web address as a list. The
--    database refused a list of 650 ids and took 600 (practice, 16 Sep 2026).
--    Past that the request fails and the whole tab loads empty.
-- room_left is how far each one is from its limit. One table, so the editor shows it all.
with j as (select id, job_number from public.jobs where status in ('in_progress', 'complete')),
p as (select p.id from public.job_processes p join j on j.id = p.job_id),
t as (
  select 1 as ord, 'jobs, as ids in one address' as what, (select count(*) from j) as how_many, 600 as stops_at
  union all select 2, 'stages, as rows', (select count(*) from p), 1000
  union all select 3, 'stages, as ids in one address', (select count(*) from p), 600
  union all select 4, 'lines and parts', (select count(*) from public.job_quote_items q join j on j.id = q.job_id), 1000
  union all select 5, 'per-item counts (Each stages)', (select count(*) from public.job_process_item_progress ip join p on p.id = ip.job_process_id), 1000
  union all select 6, 'files filed on a stage', (select count(*) from public.job_documents d join j on j.id = d.job_id where d.process_name is not null), 1000
  union all select 7, 'shortages', (select count(*) from public.shortages s join j on j.id = s.job_id), 1000
  union all select 8, 'cut list lines', (select count(*) from public.job_cut_items c join j on j.id = c.job_id), 1000
  union all select 9, 'printed cutting lists', (select count(*) from public.generated_documents g join j on j.id = g.job_id where g.document_type = 'cutting_list'), 1000
  union all select 10, 'lines and parts on every job, invoiced too (743 on 14 Sep)', (select count(*) from public.job_quote_items), null
  union all (select 11, 'most lines and parts on one job: ' || j.job_number, count(*), null
             from public.job_quote_items q join j on j.id = q.job_id group by j.job_number order by count(*) desc limit 1)
)
select what, how_many, stops_at, stops_at - how_many as room_left from t order by ord;
