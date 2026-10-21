-- Drawings that belong to one job only (Heinrich, 21 Oct 2026).
--
-- A drawing uploaded on a job's Drawings tab whose file name matches none
-- of the job's part numbers can be kept as "This job only" (a general
-- arrangement, say). It is still a row in the drawings library, filed
-- under the job's customer, so every drawing has a backup and a history;
-- job_id says which job it belongs to. Blank for every other drawing.
--
-- Safe to run twice. Adds one column and one index; changes no rows.

alter table public.drawings
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

create index if not exists drawings_job_id_idx
  on public.drawings (job_id)
  where job_id is not null;

-- Shows the column: one row, job_id, uuid.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'drawings' and column_name = 'job_id';
