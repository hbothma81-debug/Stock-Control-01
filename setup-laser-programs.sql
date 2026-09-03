-- SigmaNest program numbers, tracked in the app.
--
-- STEP 1 OF 5. Tables only. Nothing on screen changes when this runs --
-- no new buttons, no new tabs, nothing moved. It only makes room for the
-- work in steps 2 to 5. If you ran this and never ran another step, the
-- app would carry on exactly as it does today.
--
--
-- WHY THESE TABLES
--
-- Prince combines several jobs onto one nest so the sheet gets used
-- properly. So one program carries many jobs, and a job with two
-- materials lands on two programs. Neither one owns the other, so the
-- programs cannot live inside a job record -- they need their own list,
-- with the links kept separately. That is laser_programs and
-- laser_program_jobs below.
--
-- The link stores the JOB, not the SigmaNest number Prince types. The
-- number is kept alongside it as history. That way correcting a SigmaNest
-- number later cannot orphan a program -- the same problem that broke
-- everything when the process types were renamed.
--
--
-- WHAT IS NOT HERE
--
-- The laser materials list needs no new table. It is rows in the
-- master_string_lists table you already have, the same as Sheet Sizes and
-- Material Types, so it arrives in step 2 together with the screen that
-- uses it. There is nothing to run for it now.
--
--
-- Select nothing before pressing Run -- Supabase runs only the
-- highlighted text if you leave something selected.
--
-- Safe to run more than once.


-- ============ 1. The programs ============

create table if not exists laser_programs (
  id uuid primary key default gen_random_uuid(),

  -- What the operator types into the machine to pull the program up.
  program_number text not null,

  -- Picked from the laser materials list in step 2. Free text until then,
  -- which is why nothing writes to this table yet.
  material text not null default '',

  -- Which laser cuts it. Defaults to the machine you have now, so adding
  -- a second one later is a list entry and a filter rather than a rebuild
  -- of a table that by then has live work in it.
  machine text not null default 'Laser 4kw',

  -- Set by the laser operator when the program has been cut. He can
  -- unset it if he ticked the wrong one; both are recorded in the events
  -- table below.
  is_complete boolean not null default false,
  completed_by text not null default '',
  completed_at timestamptz,

  -- Programs are cancelled, never deleted, so one that was already cut
  -- leaves a trace instead of disappearing.
  is_cancelled boolean not null default false,
  cancelled_by text not null default '',
  cancelled_at timestamptz,

  created_by text not null default '',
  created_at timestamptz not null default now()
);

-- A program number has to be unique, but only among live ones. If a
-- number gets cancelled and SigmaNest later reuses it, that must still be
-- allowed -- hence "where not is_cancelled" rather than a plain unique.
create unique index if not exists laser_programs_number_live_idx
  on laser_programs (program_number)
  where not is_cancelled;

create index if not exists laser_programs_open_idx
  on laser_programs (is_complete, machine)
  where not is_cancelled;


-- ============ 2. Which jobs are on which program ============

create table if not exists laser_program_jobs (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references laser_programs(id) on delete cascade,

  -- The real link. Resolved when Prince types the SigmaNest number, so
  -- the connection survives that number being corrected afterwards.
  job_id uuid not null references jobs(id) on delete cascade,

  -- Exactly what he typed, kept so the history reads the way it happened.
  sigmanest_number text not null default '',

  -- Set only when the row is a shortage re-cut rather than the original
  -- job. shortages.id is text, not uuid, which is why this is text.
  shortage_id text references shortages(id) on delete cascade,

  created_by text not null default '',
  created_at timestamptz not null default now()
);

-- A job should not be able to go onto the same program twice. A re-cut
-- for that job is a different thing, so it is allowed alongside the
-- original -- coalesce is needed because Postgres treats two empty
-- shortage_id values as different from each other.
create unique index if not exists laser_program_jobs_unique_idx
  on laser_program_jobs (program_id, job_id, (coalesce(shortage_id, '')));

create index if not exists laser_program_jobs_job_idx on laser_program_jobs (job_id);
create index if not exists laser_program_jobs_program_idx on laser_program_jobs (program_id);
create index if not exists laser_program_jobs_shortage_idx on laser_program_jobs (shortage_id);


-- ============ 3. What happened to each program ============
--
-- Append-only. Nothing here is ever changed or deleted, so "who marked
-- 8821 cut, and who changed it afterwards" stays answerable. This cannot
-- be worked out after the fact, which is why it goes in from the start.

create table if not exists laser_program_events (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references laser_programs(id) on delete cascade,

  -- cut | un-cut | cancelled | job added | job removed | created
  action text not null default '',

  -- Free text describing what it applied to, e.g. the job number that was
  -- added. Kept as text on purpose: this is a record of what happened,
  -- and it must still read correctly after the thing it mentions is gone.
  detail text not null default '',

  acted_by text not null default '',
  acted_by_id uuid references profiles(id) on delete set null,
  acted_at timestamptz not null default now()
);

create index if not exists laser_program_events_program_idx
  on laser_program_events (program_id, acted_at desc);


-- ============ 4. The release setting ============
--
-- Everywhere else in the app, a stage lets the next one start by being
-- COMPLETE. The packer is different: the next stage opens as soon as he
-- accepts the job, because a big job gets cut over several days and
-- bending should not sit and wait for the last program.
--
-- Writing "Packer" into the code is what caused the shortages to go
-- invisible -- "Nesting" and "Laser Operator" were written in, and the
-- day those names changed it broke without saying anything. So this is a
-- setting instead.
--
-- It is a separate table rather than a column on the process type list,
-- because renaming an entry in that list deletes the old row and inserts
-- a new one -- a column there would be wiped every time you renamed a
-- process. Step 4 adds this table to the rename cascade so the setting
-- follows a rename instead.

create table if not exists process_type_settings (
  process_name text primary key,

  -- When true, the stages after this one open as soon as it is STARTED,
  -- not when it is finished.
  releases_on_start boolean not null default false,

  updated_at timestamptz not null default now()
);

-- Set it for Packer now so it is ready. Nothing reads this column until
-- step 4, so this changes no behaviour today. on conflict keeps whatever
-- is already there if you run this file again.
insert into process_type_settings (process_name, releases_on_start)
values ('Packer', true)
on conflict (process_name) do nothing;


-- ============ 5. Access ============
--
-- Same as every other table in this app: signed-in staff can read and
-- write, and who is actually allowed to do what is decided by the app
-- from their permissions. Only Prince and admin get the buttons that
-- create or edit a program.

alter table laser_programs        enable row level security;
alter table laser_program_jobs    enable row level security;
alter table laser_program_events  enable row level security;
alter table process_type_settings enable row level security;

do $$ begin
  create policy "Signed-in users can read laser programs" on laser_programs
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can insert laser programs" on laser_programs
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can update laser programs" on laser_programs
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can delete laser programs" on laser_programs
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read laser program jobs" on laser_program_jobs
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can insert laser program jobs" on laser_program_jobs
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can update laser program jobs" on laser_program_jobs
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can delete laser program jobs" on laser_program_jobs
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- The events list is written to and read, never edited or deleted -- that
-- is the whole point of it, so it gets no update or delete policy.
do $$ begin
  create policy "Signed-in users can read laser program events" on laser_program_events
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can insert laser program events" on laser_program_events
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read process type settings" on process_type_settings
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can insert process type settings" on process_type_settings
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can update process type settings" on process_type_settings
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can delete process type settings" on process_type_settings
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ============ Check ============
--
-- Four rows, all saying "ready". The programs, links and events tables
-- are empty because nothing writes to them until step 2 -- that is
-- correct, not a problem.

select 'laser_programs'        as table_name, count(*)::text as row_count, 'ready' as state from laser_programs
union all
select 'laser_program_jobs',   count(*)::text, 'ready' from laser_program_jobs
union all
select 'laser_program_events', count(*)::text, 'ready' from laser_program_events
union all
select 'process_type_settings', count(*)::text,
       case when bool_or(process_name = 'Packer' and releases_on_start)
            then 'ready - Packer set to release on start'
            else 'PROBLEM - Packer row missing' end
from process_type_settings
order by table_name;
