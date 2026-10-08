-- CNC module, file 7: programs made from a shape, with typed sizes and no
-- STEP (Heinrich, 8 Oct 2026: the Shapes list beside Programs, saved as an
-- ordinary program). quick = {"shape": "flanged_bush", "sizes": {...}},
-- what the engine is sent instead of a STEP; empty for a STEP program.
-- On the program (what Update program opens with) and on each revision
-- (what made it). Needs files 2 and 3. Safe to run twice.

alter table public.cnc_programs add column if not exists quick jsonb;
alter table public.cnc_program_revisions add column if not exists quick jsonb;

select 'cnc shapes' as step,
       case when (select count(*) from information_schema.columns where table_schema = 'public'
                   and table_name in ('cnc_programs', 'cnc_program_revisions') and column_name = 'quick') = 2
            then 'ready - programs can be made from a shape'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
