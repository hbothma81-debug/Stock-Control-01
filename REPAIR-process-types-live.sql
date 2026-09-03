-- Brings the stray job stages back onto the Job Process Types list.
--
--   Laser Operator       ->  Laser                  (12 stages)
--   Tube Laser Operator  ->  Tube Laser             (1 stage)
--   Machine/Drilling     ->  Machine/Drilling/CNC   (2 stages)
--   Dispatch             ->  deleted from jobs      (7 stages)
--   Quality Check        ->  deleted from jobs      (3 stages)
--
-- Laser, Tube Laser and Machine/Drilling/CNC are already in the list, so
-- these are renames onto names that exist, not new entries.
--
-- Renames carry to job stages, documents, shortages and everyone's
-- production access, so nothing is left pointing at a name that is gone.
--
-- Deleting a stage also removes its per-item progress, because the
-- database cascades that. Notes and completion on those 10 stages go with
-- them, and that cannot be undone.
--
-- Nothing is removed from the Job Process Types list. Galvanising,
-- Plating, Powder Coating, Wet Spray, Assembly, Delivery Note, Buy - out,
-- Cut To Size, Machining - External and Laser - External show as "unused"
-- only because no current job happens to be at those stages. They are
-- real parts of the flow and deleting them would mean typing them all
-- back in.
--
-- Select nothing before pressing Run. Safe to run more than once.


-- ============ The three renames ============

update job_processes set process_name = 'Laser' where process_name = 'Laser Operator';
update job_documents  set process_name = 'Laser' where process_name = 'Laser Operator';
update shortages set flagged_department = 'Laser' where flagged_department = 'Laser Operator';

update job_processes set process_name = 'Tube Laser' where process_name = 'Tube Laser Operator';
update job_documents  set process_name = 'Tube Laser' where process_name = 'Tube Laser Operator';
update shortages set flagged_department = 'Tube Laser' where flagged_department = 'Tube Laser Operator';

update job_processes set process_name = 'Machine/Drilling/CNC' where process_name = 'Machine/Drilling';
update job_documents  set process_name = 'Machine/Drilling/CNC' where process_name = 'Machine/Drilling';
update shortages set flagged_department = 'Machine/Drilling/CNC' where flagged_department = 'Machine/Drilling';


-- ============ Production access follows them ============
-- A JSON list, so entries are swapped inside it. distinct guards against
-- anyone ending up holding the new name twice.

update profiles p
set allowed_process_types = (
  select coalesce(jsonb_agg(distinct swapped.value), '[]'::jsonb)
  from (
    select case
             when v = '"Laser Operator"'::jsonb      then '"Laser"'::jsonb
             when v = '"Tube Laser Operator"'::jsonb then '"Tube Laser"'::jsonb
             when v = '"Machine/Drilling"'::jsonb    then '"Machine/Drilling/CNC"'::jsonb
             else v
           end as value
    from jsonb_array_elements(p.allowed_process_types) as v
  ) swapped
)
where p.allowed_process_types ?| array['Laser Operator', 'Tube Laser Operator', 'Machine/Drilling'];


-- ============ Dispatch and Quality Check off the jobs ============

delete from job_processes where process_name in ('Dispatch', 'Quality Check');

update profiles p
set allowed_process_types = (
  select coalesce(jsonb_agg(v), '[]'::jsonb)
  from jsonb_array_elements(p.allowed_process_types) as v
  where v not in ('"Dispatch"'::jsonb, '"Quality Check"'::jsonb)
)
where p.allowed_process_types ?| array['Dispatch', 'Quality Check'];


-- ============ Check: both lists should come back empty ============

select 'stage on a job but not in the list' as problem, p.process_name as name, count(*)::text as detail
from job_processes p
where not exists (
  select 1 from master_string_lists m
  where m.list_name = 'jobProcessTypes' and m.value = p.process_name
)
group by p.process_name

union all

select 'access to a department that is gone',
       access.value,
       coalesce(pr.name, pr.email)
from profiles pr
cross join lateral jsonb_array_elements_text(pr.allowed_process_types) as access(value)
where not exists (
  select 1 from master_string_lists m
  where m.list_name = 'jobProcessTypes' and m.value = access.value
);
