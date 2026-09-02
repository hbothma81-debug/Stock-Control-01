-- Priority on a shortage, plus somewhere to say why it is one.
--
-- A shortage means something already promised to a customer is missing or
-- scrapped, so the re-cut is holding up work that was otherwise finished.
-- It defaults to true for that reason: priority is the normal case, and
-- the exception is a shortage that genuinely can wait.
--
-- Existing shortages are backfilled to true, matching how they have been
-- treated in practice.
--
-- Safe to run more than once.

alter table shortages
  add column if not exists is_priority boolean not null default true;

alter table shortages
  add column if not exists priority_note text not null default '';

create index if not exists shortages_priority_idx
  on shortages (is_priority, status);

-- Check: outstanding shortages, most urgent first.
select job_number, description, qty, status, is_priority
from shortages
where status <> 'cut'
order by is_priority desc, created_at;
