-- Tube Laser Nesting.
--
-- A normal stage on the Production tab, not a copy of the Laser 4kw
-- screens. Tube work is not combined onto sheets, so there is nothing to
-- carry several jobs on: a nest belongs to one job, gets a name rather
-- than a program number, and is tracked by quantity like any other stage.
--
--   Batch  -- the whole job is nested, or it is not
--   Each   -- log how many of each item have been nested as they go
--
-- Both already work on every stage. All this adds is somewhere to put
-- the name.
--
--
-- Select nothing before pressing Run. Safe to run more than once.


-- ============ 1. Somewhere for the name ============
--
-- On the stage rather than a table of its own, because a tube nest
-- belongs to one job. A plate program needs its own table precisely
-- because it carries several.

alter table job_processes add column if not exists nesting_name text;


-- ============ 2. The stage itself ============
--
-- Added at the top of the flow so it lands right after Laser Status on
-- the Production tab. Move it with the arrows under Stock Manager -> Job
-- Process Types if you want it somewhere else -- that list is the order,
-- and it is yours to set.
--
-- Skipped entirely if you have already added it by hand.

insert into master_string_lists (id, list_name, value, sort_order)
select gen_random_uuid()::text, 'jobProcessTypes', 'Tube Laser Nesting', -1
where not exists (
  select 1 from master_string_lists
  where list_name = 'jobProcessTypes' and lower(trim(value)) = 'tube laser nesting'
);


-- ============ Check ============
--
-- Tube Laser Nesting should appear in the list below, and the column
-- count should say ready.

select 'the flow, in order' as section,
       sort_order::text as position,
       value as name
from master_string_lists
where list_name = 'jobProcessTypes'

union all

select 'nesting_name column',
       '',
       'ready - ' || count(*)::text || ' stage(s) named so far'
from job_processes
where nesting_name is not null and trim(nesting_name) <> ''

order by section desc, position, name;
