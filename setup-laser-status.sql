-- Laser Status, and the packer releasing the rest of the job.
--
-- STEP 4 OF 5. Two new columns and one setting. On its own this changes
-- nothing you can see -- the screen that uses it comes with the code.
--
--
-- WHY A "STARTED" COLUMN
--
-- Everywhere else in this app a stage lets the next one begin by being
-- COMPLETE. The packer is different: a big job is cut over several days,
-- and bending should not sit and wait for the last program. So the stages
-- after him open as soon as he ACCEPTS the job, not when he finishes it.
--
-- A stage had no way to say "someone is on this" -- only done or not done
-- -- so that is what started_at records.
--
--
-- WHY SETTINGS RATHER THAN CODE
--
-- Both of the things that make the packer special are ticks on the
-- process type, not his name written into the program. Writing "Packer"
-- into the code is exactly what made the shortages disappear: "Nesting"
-- and "Laser Operator" were written in, and the day those names changed
-- it broke silently.
--
--   releases_on_start       the stages after this one open as soon as it
--                           is started, instead of waiting for it to be
--                           finished
--
--   worked_in_laser_status  this stage has no box of its own on the
--                           Production tab -- it is worked on the Laser
--                           Status screen instead
--
-- Rename Packer to anything you like afterwards and both follow it.
--
--
-- Select nothing before pressing Run. Safe to run more than once.


-- ============ 1. A stage can say someone is on it ============

alter table job_processes add column if not exists started_at timestamptz;
alter table job_processes add column if not exists started_by text;


-- ============ 2. The second setting ============

alter table process_type_settings
  add column if not exists worked_in_laser_status boolean not null default false;


-- ============ 3. Turn both on for the packer ============
--
-- Written as an upsert so it is correct whether or not step 1 already
-- created this row, and unchanged if you run it again.

insert into process_type_settings (process_name, releases_on_start, worked_in_laser_status)
values ('Packer', true, true)
on conflict (process_name) do update
  set releases_on_start = true,
      worked_in_laser_status = true,
      updated_at = now();


-- ============ Check ============
--
-- Two rows. The first should say both settings are on for Packer. The
-- second confirms the new columns exist -- it counts stages that have
-- been started, which is 0 until someone uses the screen.

select 'packer settings' as check_name,
       coalesce(
         (select case when releases_on_start and worked_in_laser_status
                      then 'ready - releases on start, worked in Laser Status'
                      else 'PROBLEM - a setting is off' end
          from process_type_settings where process_name = 'Packer'),
         'PROBLEM - no Packer row'
       ) as result

union all

select 'started column',
       'ready - ' || count(*)::text || ' stage(s) started so far'
from job_processes
where started_at is not null;
