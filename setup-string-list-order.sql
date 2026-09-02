-- Gives master_string_lists a real, storable order.
--
-- Job Process Types are the factory flow, so their sequence matters: the
-- floor cannot start a process until everything before it is complete.
-- Until now no order could be stored at all, and the list was loaded with
-- no ORDER BY, so the sequence could silently reshuffle.
--
-- Safe to run more than once. Adding the column is guarded, and the
-- backfill only touches lists that have never been ordered (every row
-- still sitting at 0), so a manual ordering set later is never reset.

alter table master_string_lists
  add column if not exists sort_order integer not null default 0;

with unordered as (
  select list_name
  from master_string_lists
  group by list_name
  having count(distinct sort_order) = 1 and min(sort_order) = 0
),
ranked as (
  select m.id,
         row_number() over (
           partition by m.list_name
           order by m.created_at, m.value
         ) - 1 as rn
  from master_string_lists m
  join unordered u on u.list_name = m.list_name
)
update master_string_lists m
set sort_order = r.rn
from ranked r
where m.id = r.id;

-- Reading the list always sorts by this, so an index keeps it cheap.
create index if not exists master_string_lists_order_idx
  on master_string_lists (list_name, sort_order);

-- Check: Job Process Types in factory order, numbered from 0.
select sort_order, value
from master_string_lists
where list_name = 'jobProcessTypes'
order by sort_order;
