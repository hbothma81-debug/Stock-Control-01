-- A job's place in the plate laser's queue.
--
-- The nester and admins set it on the job (decided 16-17 Sep 2026):
-- 1 is cut first, two jobs may share a number, blank is ordinary work.
-- The laser screens read it (src/laser); every change is written to the
-- job's History. Who set it and when ride along on the job so a nesting
-- row can say so without opening the history.
--
-- Safe to run more than once.

alter table jobs
  add column if not exists laser_priority integer,
  add column if not exists laser_priority_by text,
  add column if not exists laser_priority_at timestamptz;

alter table jobs drop constraint if exists jobs_laser_priority_check;
alter table jobs add constraint jobs_laser_priority_check
  check (laser_priority is null or laser_priority >= 1);

-- Check: which jobs carry a number (none, straight after this runs).
select job_number, laser_priority, laser_priority_by, laser_priority_at
from jobs
where laser_priority is not null
order by laser_priority, due_date;
