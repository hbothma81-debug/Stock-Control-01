-- How long a program takes to cut.
--
-- Two numbers, deliberately kept apart.
--
-- cut_minutes is the planned time, typed in by whoever nests, off the
-- SigmaNest estimate. It is per sheet: a program run three times off the
-- same material takes three times this. It is what the shift report and
-- the efficiency figure are worked out from, and what the cutting screen
-- adds up to say how much work is left on the list.
--
-- actual_minutes is what the operator says it really took, asked for when
-- he marks the program cut. It is for information only. It never changes
-- the planned figure, and nothing is worked out from it yet. He can skip
-- it for now; whether it becomes compulsory is a later decision.
--
-- Both are null until somebody types them. Null means "not given", which
-- is a different thing from zero, and the screens say so.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


alter table public.laser_programs
  add column if not exists cut_minutes    numeric,
  add column if not exists actual_minutes numeric;


-- A negative time is a typo, not a time.
do $$ begin
  alter table public.laser_programs
    add constraint laser_programs_minutes_sane
    check (
      (cut_minutes    is null or cut_minutes    >= 0) and
      (actual_minutes is null or actual_minutes >= 0)
    );
exception when duplicate_object then null; end $$;


-- What you should see: the columns exist, and every program still reads
-- as it did, with no time on it yet.
select 'programs' as thing, count(*)::text as value from public.laser_programs
union all
select 'with a planned time',
       count(*)::text
from public.laser_programs
where cut_minutes is not null
union all
select 'with an actual time',
       count(*)::text
from public.laser_programs
where actual_minutes is not null;
