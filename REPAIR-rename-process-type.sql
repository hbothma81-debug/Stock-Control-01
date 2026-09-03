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
-- HOW TO USE: put the old and new names in the two lines below, exactly as
-- they appear, then run the whole thing. Case matters.
--
-- Safe to run more than once, and safe if there is nothing to fix.

do $$
declare
  old_name text := 'tube laser operator';   -- <<< the name that was left behind
  new_name text := 'tube laser';            -- <<< the name it should be
  n_processes int;
  n_docs int;
  n_shortages int;
  n_people int;
begin
  if old_name = new_name then
    raise exception 'Old and new names are the same — nothing to merge.';
  end if;

  update job_processes set process_name = new_name where process_name = old_name;
  get diagnostics n_processes = row_count;

  update job_documents set process_name = new_name where process_name = old_name;
  get diagnostics n_docs = row_count;

  update shortages set flagged_department = new_name where flagged_department = old_name;
  get diagnostics n_shortages = row_count;

  -- Production access is a JSON array, so the entry is swapped in place.
  -- Rebuilt as a set to avoid ending up with the new name twice on anyone
  -- who already had both.
  update profiles p
  set allowed_process_types = (
    select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
    from (
      select case when v = to_jsonb(old_name) then to_jsonb(new_name) else v end as value
      from jsonb_array_elements(p.allowed_process_types) as v
    ) swapped
  )
  where p.allowed_process_types @> to_jsonb(array[old_name]);
  get diagnostics n_people = row_count;

  -- Drop the stale entry from the list if both names ended up in it.
  delete from master_string_lists
  where list_name = 'jobProcessTypes' and value = old_name
    and exists (
      select 1 from master_string_lists
      where list_name = 'jobProcessTypes' and value = new_name
    );

  raise notice 'Merged "%" into "%": % job stages, % documents, % shortages, % people.',
    old_name, new_name, n_processes, n_docs, n_shortages, n_people;
end $$;

-- Check: the old name should appear nowhere below.
select 'process type list' as where_found, value as name from master_string_lists where list_name = 'jobProcessTypes'
union all
select 'job stages', distinct_name from (select distinct process_name as distinct_name from job_processes) x
order by where_found, name;
