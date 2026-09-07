-- A program that has to be cut more than once.
--
-- Today a program is cut or it is not -- one sheet, one tick. But the same
-- nest is often run several times off the same material, and there was no
-- way to say so: Prince had to make five identical programs, or tell the
-- operator out loud and hope.
--
-- Two numbers fix it. How many are needed, and how many are done.
--
-- Everything downstream still reads is_complete, which now means "all of
-- them are cut" instead of "it is cut". A program needing one sheet behaves
-- exactly as it does today.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


alter table public.laser_programs
  add column if not exists sheets_required integer not null default 1,
  add column if not exists sheets_cut      integer not null default 0;


-- A program already cut is one sheet, cut. Without this every finished
-- program would read "0 of 1 cut" while flagged complete, which is two
-- things on screen disagreeing about the same program.
update public.laser_programs
   set sheets_cut = 1
 where is_complete
   and sheets_cut = 0;


-- Neither number is ever negative, and you cannot need none.
do $$ begin
  alter table public.laser_programs
    add constraint laser_programs_sheets_sane
    check (sheets_required >= 1 and sheets_cut >= 0);
exception when duplicate_object then null; end $$;


-- ============ Check ============

select 'programs' as thing, count(*)::text as value from public.laser_programs

union all

select 'cut, counted as done',
       count(*)::text
from public.laser_programs
where is_complete and sheets_cut >= 1

union all

select 'disagreeing (should be none)',
       count(*)::text
from public.laser_programs
where is_complete <> (sheets_cut >= sheets_required)

union all

select 'needing more than one sheet',
       count(*)::text
from public.laser_programs
where sheets_required > 1;
