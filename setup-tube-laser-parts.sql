-- The parts on a tube nesting become lines on the job.
--
-- The tube software's report lists every part with its quantity and
-- length. The import (and a hand-typed program) now puts those on the
-- job as child lines under the job's own line for that work -- the
-- parent, or batch item. The parent stays the line that is invoiced and
-- delivered; the parts are what the tube stages cut and pack, and what
-- the packer picks against.
--
-- The parent column already exists (setup-quoting-and-bom.sql put it
-- there for assemblies). This adds:
--
--   1. length_mm on a job line, for a part's cut length.
--   2. part_count and parts on a program, so the nesting card and the
--      operator's card say "150 parts" and can open the list.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


-- ============ 1. A part's length ============

alter table public.job_quote_items
  add column if not exists length_mm numeric;


-- ============ 2. The parts on a program ============

alter table public.laser_programs
  add column if not exists part_count integer;

alter table public.laser_programs
  add column if not exists parts jsonb not null default '[]'::jsonb;


-- ============ Check ============

select 'job_quote_items.length_mm' as what,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'job_quote_items' and column_name = 'length_mm')
            then 'ready' else 'MISSING' end as state
union all
select 'laser_programs.part_count',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'laser_programs' and column_name = 'part_count')
            then 'ready' else 'MISSING' end
union all
select 'laser_programs.parts',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'laser_programs' and column_name = 'parts')
            then 'ready' else 'MISSING' end
union all
select 'job_quote_items.parent_quote_item_id (from setup-quoting-and-bom.sql)',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'job_quote_items' and column_name = 'parent_quote_item_id')
            then 'ready' else 'MISSING - run setup-quoting-and-bom.sql' end;
