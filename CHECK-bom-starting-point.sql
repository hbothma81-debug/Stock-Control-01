-- What the bill of materials (BOM) build starts from, on THIS database.
--
-- The plan is docs/BOM-PLAN.md. Before step one it helps to know how
-- much setup work is waiting: how many customer parts there are, how
-- many already carry a cut method (the "made on" tag), which stage is
-- the one that puts assemblies together, and whether any open job
-- already has lines that read like assemblies.
--
-- This reads all of that and changes nothing.
--
-- Run it on the LIVE database. Select nothing before pressing Run.
-- One result, in five numbered sections:
--
--   0. database       whether the BOM tables and columns exist yet
--   1. parts          per customer: tagged, untagged, assemblies, no code, no price
--   2. stages         the stage list in shop order, what each one cuts,
--                     and the one that looks like the Assembly hinge
--   3. open jobs      per job: lines, linked to a part, typed in, untagged
--   4. lines          lines on open jobs whose wording reads like an assembly
--   5. totals


with
open_jobs as (
  select id, job_number, customer
  from public.jobs
  where status = 'in_progress'
),
parts as (
  select *
  from public.stock_items
  where main_cat = 'custom'
),
lines as (
  select q.*, j.job_number
  from public.job_quote_items q
  join open_jobs j on j.id = q.job_id
)


-- ============ 0. Is the BOM database work there yet? ============

select '0. database' as section,
       'table assembly_parts' as what,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'assembly_parts')
            then 'ready' else 'not yet -- step 1 of the plan' end as detail

union all

select '0. database',
       'column job_quote_items.parent_quote_item_id',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'job_quote_items'
                           and column_name = 'parent_quote_item_id')
            then 'ready' else 'not yet -- step 1 of the plan' end

union all

select '0. database',
       'column process_type_settings.assembles_parts',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'process_type_settings'
                           and column_name = 'assembles_parts')
            then 'ready' else 'not yet -- step 1 of the plan' end

union all

select '0. database',
       'column stock_items.made_on  (the cut method, already live)',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'stock_items'
                           and column_name = 'made_on')
            then 'ready' else 'MISSING -- run setup-made-on-tag.sql first' end


-- ============ 1. Customer parts, per customer ============
--
-- "untagged" is the setup work the plan's step 2 makes fast.
-- "without a part code" matters because the plan's one rule is that
-- everything inside a BOM has one.

union all

select '1. parts per customer',
       coalesce(nullif(customer, ''), '(no customer)'),
       count(*)::text || ' parts, '
       || count(*) filter (where made_on <> '')::text || ' tagged, '
       || count(*) filter (where made_on = '')::text || ' untagged, '
       || count(*) filter (where made_on = 'assembly')::text || ' tagged Assembly, '
       || count(*) filter (where coalesce(part_number, '') = '')::text || ' without a part code, '
       || count(*) filter (where coalesce(value, 0) = 0)::text || ' without a price'
from parts
group by customer


-- ============ 2. The stages, in shop order ============
--
-- The stage that puts assemblies together is the hinge in the plan:
-- stages before it list an assembly's parts, it and the ones after list
-- the assembly. The plan says it gets a tick in Job Process Types so
-- the rule survives a rename. Until then this only guesses by name.

union all

select '2. stages in order',
       lpad(coalesce(m.sort_order, 0)::text, 2, '0') || '  ' || m.value,
       case when coalesce(s.cuts_made_on, '') = '' then 'every item' else 'cuts ' || s.cuts_made_on end
       || ' | on '
       || (select count(*) from public.job_processes p
           join open_jobs j on j.id = p.job_id
           where p.process_name = m.value and p.shortage_id is null)::text
       || ' open jobs'
       || case when m.value ilike '%assembl%' then '  <-- looks like the hinge stage' else '' end
from public.master_string_lists m
left join public.process_type_settings s on s.process_name = m.value
where m.list_name = 'jobProcessTypes'


-- ============ 3. Open jobs and their lines ============
--
-- "typed in" lines have no part behind them. Under the strict rule
-- (plan question 1) every one of these would have had to be a part.

union all

select '3. open jobs',
       j.job_number || '  ' || coalesce(j.customer, ''),
       count(l.id)::text || ' lines, '
       || count(l.id) filter (where l.linked_item_id is not null)::text || ' linked to a part, '
       || count(l.id) filter (where l.linked_item_id is null)::text || ' typed in, '
       || count(l.id) filter (where coalesce(l.made_on, '') = '')::text || ' untagged'
from open_jobs j
left join lines l on l.job_id = j.id
group by j.job_number, j.customer


-- ============ 4. Lines on open jobs that read like assemblies ============
--
-- Wording only. These are the ones that would become a parent line
-- with children under the plan; worth a look to see what a real one
-- looks like before designing the BOM tab around it.

union all

select '4. lines that read like assemblies',
       l.job_number || '  ' || l.description,
       l.qty::text || ' off, '
       || case when coalesce(l.made_on, '') = '' then 'untagged' else 'tagged ' || l.made_on end
       || case when l.linked_item_id is null then ', typed in' else ', linked to a part' end
from lines l
where l.description ~* '(assy|assembl|welded|frame|complete)'


-- ============ 5. Totals ============

union all

select '5. totals',
       'customer parts',
       count(*)::text || ' parts across '
       || count(distinct customer)::text || ' customers, '
       || count(*) filter (where made_on = '')::text || ' still untagged'
from parts

union all

select '5. totals',
       'open jobs',
       (select count(*) from open_jobs)::text || ' jobs, '
       || (select count(*) from lines)::text || ' lines, '
       || (select count(*) from lines where linked_item_id is null)::text || ' typed in with no part behind them'

order by 1, 2;
