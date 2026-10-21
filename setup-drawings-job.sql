-- Drawings that belong to one job only (Heinrich, 21 Oct 2026).
--
-- A drawing uploaded on a job's Drawings tab whose file name matches no
-- line's stock code goes in as "This job only" (a general arrangement,
-- say), or, when its name matches a line's description and that line has
-- no stock code, as this job's drawing for that line. It is still a row in
-- the drawings library, filed under the job's customer, so every drawing
-- has a backup and a history.
--   job_id         which job it belongs to; blank for every other drawing
--   quote_item_id  the job line it is for, when its name matched one
--
-- Safe to run twice. Adds two columns and an index; changes no rows.

alter table public.drawings
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

alter table public.drawings
  add column if not exists quote_item_id uuid references public.job_quote_items(id) on delete set null;

create index if not exists drawings_job_id_idx
  on public.drawings (job_id)
  where job_id is not null;

-- Shows the columns: two rows, job_id and quote_item_id, both uuid.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'drawings' and column_name in ('job_id', 'quote_item_id')
order by column_name;
