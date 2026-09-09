-- Let a job's file be moved to a stage.
--
-- The Files tab on a job now files every upload against a stage (or the
-- whole job) and has a "Move to..." on each file. The move is one change
-- to one column, process_name, on job_documents.
--
-- job_documents was set up with rules for reading, adding and deleting
-- rows, and never one for changing a row -- nothing changed a row until
-- now. Without that rule the database quietly changes nothing: no error,
-- and the file stays where it was. That is what "Move is not responding"
-- was.
--
-- This adds the missing rule, the same shape as the other three.
--
-- Select nothing before pressing Run. Safe to run more than once.
-- Run it on the PRACTICE database first, then on live.


do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_documents'
      and policyname = 'Signed-in users can update job documents rows'
  ) then
    create policy "Signed-in users can update job documents rows"
      on job_documents for update
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;


-- ============ Check ============
--
-- Four rows: read, add, change, delete.

select policyname as rule, cmd as allows
from pg_policies
where schemaname = 'public' and tablename = 'job_documents'
order by cmd;
