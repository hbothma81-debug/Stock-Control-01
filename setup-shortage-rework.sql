-- Lets a shortage carry its own set of stages.
--
-- A shortage is not finished when it comes off the laser. The replacement
-- part still has to catch up: through every stage between the re-cut and
-- wherever the problem was found. Until now the trail ended at "cut" and
-- the rest happened by memory.
--
-- Rather than a second table, shortage stages are job_processes rows with
-- shortage_id set. They are the same thing -- work waiting at a stage --
-- so the production queue, the assignment, the completion tracking and
-- the floor gating all apply to them already, and an operator sees them
-- in the queue they are already watching.
--
-- Rows with shortage_id null are the job's own stages, exactly as before.
--
-- shortages.id is text, not uuid, hence the column type here.
--
-- Safe to run more than once.

alter table job_processes
  add column if not exists shortage_id text references shortages(id) on delete cascade;

create index if not exists job_processes_shortage_idx
  on job_processes (shortage_id);

-- Check: no shortage stages yet on a fresh install.
select p.job_id, p.process_name, p.sort_order, p.is_complete, s.description
from job_processes p
join shortages s on s.id = p.shortage_id
order by p.job_id, p.sort_order;
