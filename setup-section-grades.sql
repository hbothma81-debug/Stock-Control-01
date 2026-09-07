-- Somewhere to keep a section's material.
--
-- Sections are now one row per size AND grade -- 50x50x5 in mild steel is
-- a different price from 50x50x5 in S355, and a stock report has to be able
-- to split them. But the table they live in only has a name, so the grade
-- had nowhere to be written: setting it worked on screen and was gone by
-- the next reload.
--
-- This adds the column. It is empty text rather than null, so a row that
-- has never been given a material compares cleanly against one that has,
-- and every section already in here keeps working exactly as it does now --
-- an empty grade stands in for any of them until you split it.
--
-- Nothing is deleted and nothing is renamed.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


alter table public.master_factor_items
  add column if not exists grade text not null default '';


-- Sections are looked up by list, name and grade together.
create index if not exists master_factor_items_section_idx
  on public.master_factor_items (list_name, name, grade);


-- ============ Check ============

select 'grade column' as thing,
       case when exists (
              select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name = 'master_factor_items'
                and column_name = 'grade'
            ) then 'ready' else 'MISSING' end as status

union all

select 'sections stored',
       coalesce((select count(*)::text from public.master_factor_items
                 where list_name = 'sections'), '0')

union all

select 'of those, with a material set',
       coalesce((select count(*)::text from public.master_factor_items
                 where list_name = 'sections' and coalesce(grade, '') <> ''), '0');
