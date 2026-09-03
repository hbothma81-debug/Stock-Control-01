-- Merges a process type that was renamed before renaming carried across.
--
-- Renaming a process type in Stock Manager used to change only the list.
-- Every job, document, shortage and person's production access kept the
-- old name, so the old one stayed alive on all the existing work while the
-- new one applied to nothing. It looked like a duplicate had appeared.
--
-- The app now carries a rename across on its own. This is only for data
-- left behind by a rename done before that fix.
--
--
-- HOW TO USE
--
--   1. Find and replace  OLD_NAME_HERE  with the name left behind,
--      e.g.  tube laser operator
--   2. Find and replace  NEW_NAME_HERE  with the name it should be,
--      e.g.  tube laser
--   3. Keep the single quotes around them.
--   4. Select nothing, then press Run — Supabase runs only the highlighted
--      text if you leave something selected.
--
-- Case and spacing matter: 'Tube Laser' and 'tube laser' are different.
-- Safe to run more than once, and safe if there is nothing to fix.


-- 1. Every stage on every job
update job_processes
set process_name = 'NEW_NAME_HERE'
where process_name = 'OLD_NAME_HERE';

-- 2. Documents filed against that stage
update job_documents
set process_name = 'NEW_NAME_HERE'
where process_name = 'OLD_NAME_HERE';

-- 3. Where a shortage was raised
update shortages
set flagged_department = 'NEW_NAME_HERE'
where flagged_department = 'OLD_NAME_HERE';

-- 4. Everyone's production access. This is a JSON list, so the entry is
--    swapped inside it. distinct avoids ending up with the new name twice
--    on anyone who somehow had both.
update profiles p
set allowed_process_types = (
  select coalesce(jsonb_agg(distinct swapped.value), '[]'::jsonb)
  from (
    select case when v = to_jsonb('OLD_NAME_HERE'::text)
                then to_jsonb('NEW_NAME_HERE'::text)
                else v end as value
    from jsonb_array_elements(p.allowed_process_types) as v
  ) swapped
)
where p.allowed_process_types @> to_jsonb(array['OLD_NAME_HERE'::text]);

-- 5. Drop the stale entry from the list, but only if the correct name is
--    already there — otherwise this would delete the only copy.
delete from master_string_lists
where list_name = 'jobProcessTypes'
  and value = 'OLD_NAME_HERE'
  and exists (
    select 1 from master_string_lists
    where list_name = 'jobProcessTypes' and value = 'NEW_NAME_HERE'
  );


-- Check: the old name should not appear anywhere below.
select 'in the process type list' as found_in, value as name
from master_string_lists
where list_name = 'jobProcessTypes'
union all
select 'on job stages', process_name
from (select distinct process_name from job_processes) s
union all
select 'in production access', jsonb_array_elements_text(allowed_process_types)
from profiles
order by found_in, name;
