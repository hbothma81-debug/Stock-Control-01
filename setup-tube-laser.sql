-- The tube laser on its own tab, working like the plate laser.
--
-- The screens are the plate laser's screens told which machine they are
-- on. Programs go in the same laser_programs table with machine = 'Tube
-- Laser'; nothing about the plate laser's rows changes. This file adds
-- the four things the tube laser needs that the plate laser did not:
--
--   1. A second tick on a shift: the tube laser cuts on this shift.
--   2. A nesting name on a program. The tube software has no program
--      numbers, so the app hands one out (TL-0001, TL-0002 ...) and the
--      nester types the name he calls the nest by. Both show on screen.
--   3. The number counter, and the function that hands out the next one.
--   4. Program numbers unique per machine rather than across both.
--
-- Nothing here changes what is on screen until the new build is pushed.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


-- ============ 1. Which shifts the tube laser cuts on ============
--
-- The plate laser has cuts_laser. The tube laser gets its own, because
-- the two do not necessarily keep the same hours. The Tube Laser tab's
-- counter and Shifts report read only shifts ticked here; with none
-- ticked they read every shift and say so, the same as the plate laser
-- did before its tick was set.

alter table public.shifts
  add column if not exists cuts_tube_laser boolean not null default false;


-- ============ 2. The nesting name ============
--
-- Blank on every plate program, and stays blank: the plate laser has a
-- SigmaNest number and nothing else.

alter table public.laser_programs
  add column if not exists nesting_name text not null default '';


-- ============ 3. The next program number ============
--
-- One row per machine, holding the last number handed out. The function
-- bumps it and returns the new number in one statement, so two nesters
-- pressing Create at the same moment cannot both be given TL-0007.
--
-- A number is used the moment it is handed out. If the program then
-- fails to save, that number is simply skipped -- a gap in the sequence
-- is harmless, a duplicate is not.

create table if not exists public.laser_program_counters (
  machine text primary key,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.laser_program_counters enable row level security;

do $$ begin
  create policy "Signed-in users can read program counters" on public.laser_program_counters
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can insert program counters" on public.laser_program_counters
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can update program counters" on public.laser_program_counters
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- p_prefix is what goes in front: 'TL-' for the tube laser. Four digits,
-- so the numbers sort properly as text until there are ten thousand of
-- them, which at a few a day is a long way off.
create or replace function public.next_laser_program_number(p_machine text, p_prefix text)
returns text
language plpgsql
as $$
declare
  n integer;
begin
  insert into public.laser_program_counters (machine, last_number, updated_at)
  values (p_machine, 1, now())
  on conflict (machine) do update
    set last_number = public.laser_program_counters.last_number + 1,
        updated_at = now()
  returning last_number into n;
  return coalesce(p_prefix, '') || lpad(n::text, 4, '0');
end;
$$;


-- ============ 4. Program numbers unique per machine ============
--
-- The plate index says a live program number must be unique full stop.
-- With two machines in the one table that would let a tube number block
-- a plate number. Unique per machine instead: the same number may exist
-- on both lasers, and still never twice on one. Every existing row is
-- 'Laser 4kw', so the new index goes on without a clash.

drop index if exists public.laser_programs_number_live_idx;

create unique index if not exists laser_programs_machine_number_live_idx
  on public.laser_programs (machine, program_number)
  where not is_cancelled;


-- ============ Check ============
--
-- Four rows, all saying "ready". The counter table is empty until the
-- first tube program is made -- that is correct.

select 'shifts.cuts_tube_laser' as what,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'shifts' and column_name = 'cuts_tube_laser')
            then 'ready' else 'MISSING' end as state
union all
select 'laser_programs.nesting_name',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'laser_programs' and column_name = 'nesting_name')
            then 'ready' else 'MISSING' end
union all
select 'next_laser_program_number()',
       case when exists (select 1 from pg_proc where proname = 'next_laser_program_number')
            then 'ready' else 'MISSING' end
union all
select 'unique per machine',
       case when exists (select 1 from pg_indexes where indexname = 'laser_programs_machine_number_live_idx')
            then 'ready' else 'MISSING' end;
