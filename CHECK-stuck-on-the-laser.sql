-- Jobs that are stuck on the laser, and why.
--
-- A job's laser stage only finishes when its nesting has been ticked off
-- AND every program carrying it has been cut. Until today the only thing
-- that ticked nesting was a checkbox nobody could find, so jobs sat on the
-- laser with all their cutting long done.
--
-- This finds them. It changes nothing -- it only reads.
--
-- Run it on the LIVE database. Select nothing before pressing Run.


with laser_stage as (
  select * from public.job_processes
  where shortage_id is null
    and process_name ilike '%laser%'
    and process_name not ilike '%tube%'
    and process_name not ilike '%external%'
),
nest_stage as (
  select * from public.job_processes
  where shortage_id is null
    and process_name ilike '%nest%'
    and process_name not ilike '%tube%'
),
job_programs as (
  select l.job_id,
         count(*) as programs,
         count(*) filter (where p.is_complete) as cut
  from public.laser_program_jobs l
  join public.laser_programs p on p.id = l.program_id
  where not p.is_cancelled
  group by l.job_id
)

-- ============ 1. Everything cut, but nesting was never ticked ============
--
-- These are the ones the new Done nesting button is for. Pressing it
-- finishes them off. Until then they sit on the laser.

select distinct '1. all cut, nesting not ticked' as finding,
       j.job_number,
       j.customer,
       coalesce(jp.cut, 0)::text || ' of ' || coalesce(jp.programs, 0)::text || ' programs cut' as detail
from public.jobs j
join laser_stage  ls on ls.job_id = j.id and not ls.is_complete
join nest_stage   ns on ns.job_id = j.id and not ns.is_complete
join job_programs jp on jp.job_id = j.id
where j.status = 'in_progress'
  and jp.programs > 0
  and jp.cut = jp.programs

union all

-- ============ 2. Nesting ticked, but nothing was ever nested ============
--
-- Work cut outside the app. Deliberate, but the laser stage will never
-- finish on its own -- someone has to tick it by hand on the job.

select distinct '2. nesting ticked, no programs',
       j.job_number,
       j.customer,
       'laser stage still open'
from public.jobs j
join laser_stage ls on ls.job_id = j.id and not ls.is_complete
join nest_stage  ns on ns.job_id = j.id and ns.is_complete
left join job_programs jp on jp.job_id = j.id
where j.status = 'in_progress'
  and coalesce(jp.programs, 0) = 0

union all

-- ============ 3. The same stage on a job twice ============
--
-- The app copes with these -- it completes every copy, not just the first
-- one it finds. They are worth knowing about anyway: they came from the
-- checklist being ticked twice when the job was built, and they make the
-- job's own checklist read oddly.

select '3. same stage listed twice',
       j.job_number,
       j.customer,
       p.process_name || ' × ' || count(*)::text
from public.job_processes p
join public.jobs j on j.id = p.job_id
where p.shortage_id is null
group by j.job_number, j.customer, p.process_name
having count(*) > 1

order by 1, 2;
