-- Why the Production tab is not in the Stock Manager order.
--
-- READ ONLY. Changes nothing.
--
-- The Production tab lists the departments from each person's production
-- access, then puts them in the order set under Job Process Types. That
-- only works when the names match exactly. A name in someone's access that
-- is not in the list cannot be placed in it, so it falls to the end and
-- the rest of the order stops meaning anything.
--
-- Run this and read the second list. Anything marked NOT IN THE LIST is
-- the problem.
--
-- Select nothing before pressing Run.


-- 1. The order the Production tab should follow.
select 'the flow, in order' as section,
       sort_order::text as position,
       value as name,
       '' as problem
from master_string_lists
where list_name = 'jobProcessTypes'

union all

-- 2. What each person's Production tab is actually built from.
select 'production access: ' || coalesce(p.name, p.email),
       '',
       access.value,
       case
         when exists (
           select 1 from master_string_lists m
           where m.list_name = 'jobProcessTypes' and m.value = access.value
         ) then ''
         else '<<< NOT IN THE LIST — this is what breaks the order'
       end
from profiles p
cross join lateral jsonb_array_elements_text(p.allowed_process_types) as access(value)

order by section, position, name;
