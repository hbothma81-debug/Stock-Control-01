-- The nests on a tube program, kept for the floor printout.
--
-- The tube software's report says, for every nest, how many tubes to
-- cut it on, the tube length, the offcut left per tube, and which parts
-- come off each tube. The import used to keep only a one-line note of
-- it. This keeps the whole thing on the program, so the printout can
-- give each nest its own page.
--
-- One column on laser_programs, a list, empty by default. Programs made
-- before it stay empty and print their first page only.
--
-- Run on PRACTICE first, then LIVE. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.laser_programs
  add column if not exists nests jsonb not null default '[]'::jsonb;

-- Check: one row, saying "ready".
select 'laser_programs.nests' as what,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'laser_programs' and column_name = 'nests')
            then 'ready' else 'MISSING' end as state;
