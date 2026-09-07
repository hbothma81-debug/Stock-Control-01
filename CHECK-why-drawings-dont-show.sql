-- Why a drawing is not showing against a job's items.
--
-- Drawings already appear in three places: the Production card for whatever
-- department is working the job, the job's own Items tab, and Prince's To
-- nest rows. But four things all have to be true before one shows, and if
-- any of them is not, nothing appears and nothing says why:
--
--   1. the line on the job is linked to a stock item
--   2. that stock item has a part number on it
--   3. a drawing exists in the library for that exact part number
--   4. the person looking has the Drawings permission
--
-- This says which of them is failing, and how often. It changes nothing.
--
-- Run it on the LIVE database. Select nothing before pressing Run.


-- ============ 1. Where the chain breaks, counted ============

with lines as (
  select qi.id,
         qi.job_id,
         qi.description,
         qi.linked_item_id,
         si.part_number,
         d.id as drawing_id
  from public.job_quote_items qi
  join public.jobs j          on j.id = qi.job_id and j.status = 'in_progress'
  left join public.stock_items si on si.id = qi.linked_item_id
  left join public.drawings d    on lower(trim(d.part_number)) = lower(trim(si.part_number))
)

select '1. lines on live jobs' as step, count(*)::text as how_many,
       'every item on every job still in progress' as meaning
from lines

union all

select '2. of those, linked to a stock item',
       count(*) filter (where linked_item_id is not null)::text,
       'a typed-in line has nothing to look a drawing up by'
from lines

union all

select '3. of those, whose stock item has a part number',
       count(*) filter (where coalesce(trim(part_number), '') <> '')::text,
       'the part number is what a drawing is filed under'
from lines

union all

select '4. of those, with a drawing on file',
       count(distinct id) filter (where drawing_id is not null)::text,
       'these are the only lines that can ever show one'
from lines

union all

select '5. people who can see drawings',
       (select count(*)::text from public.profiles
        where is_admin or (permissions -> 'drawings' ->> 'view') = 'true')
       || ' of ' || (select count(*)::text from public.profiles),
       'a welder without the permission sees no drawings anywhere'

order by 1;
