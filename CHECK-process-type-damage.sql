-- Looks for damage left by a rename done before renaming carried across.
--
-- READ ONLY. Changes nothing. Run it, read the three lists, then decide.
--
-- Select nothing before pressing Run — Supabase runs only the highlighted
-- text if you leave something selected.


-- 1. Process types in the list that no job uses.
--    A rename done before the fix left the old name here, attached to
--    nothing. Safe to delete in Stock Manager if it shows up.
select 'unused process type' as finding,
       m.value as detail,
       'nothing uses it — delete it in Stock Manager' as what_to_do
from master_string_lists m
where m.list_name = 'jobProcessTypes'
  and not exists (select 1 from job_processes p where p.process_name = m.value)

union all

-- 2. Names on jobs that are not in the list.
--    The opposite problem: work sitting at a stage the list no longer
--    knows about, so it can never appear in anyone's Production tab.
select 'stage not in the list',
       p.process_name || ' — on ' || count(*)::text || ' job stage(s)',
       'rename it in Stock Manager to the correct name, or add it back'
from job_processes p
where not exists (
  select 1 from master_string_lists m
  where m.list_name = 'jobProcessTypes' and m.value = p.process_name
)
group by p.process_name

union all

-- 3. Jobs carrying the same stage twice.
--    If a job had both the old and the new name as separate stages, the
--    repair merged them into two identical ones. Both must be completed
--    before the job can move on, so this stalls work.
select 'duplicate stage on a job',
       j.job_number || ' — ' || p.process_name || ' × ' || count(*)::text,
       'open the job, Edit processes, and remove the extra one'
from job_processes p
join jobs j on j.id = p.job_id
where p.shortage_id is null
group by j.job_number, p.process_name
having count(*) > 1

order by finding, detail;
