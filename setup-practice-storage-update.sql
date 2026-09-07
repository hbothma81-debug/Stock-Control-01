-- Lets a file be written over, on PRACTICE.
--
-- Practice can read, add and delete files, but not replace one. Anything
-- the app writes over an existing file therefore fails: every generated
-- document -- process sheets, delivery notes, purchase orders -- and every
-- re-upload of a drawing. Live had the same gap and it was fixed there
-- earlier; practice never was, which is why documents cannot be tested on
-- it and the Files tab on a practice job stays empty however many are
-- printed.
--
-- Replacing a file is an UPDATE as far as storage is concerned, and there
-- was no rule allowing one. Same rule as the other three: signed in.
--
--
-- Run this on PRACTICE. Select nothing before pressing Run.
-- Safe to run more than once.
--
-- (Live already has these. Running it there does nothing.)


do $$ begin
  create policy "Signed-in users can replace job documents"
  on storage.objects for update
  using (bucket_id = 'job-documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'job-documents' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can replace drawings"
  on storage.objects for update
  using (bucket_id = 'drawings' and auth.role() = 'authenticated')
  with check (bucket_id = 'drawings' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ============ Check ============
--
-- Four rules per bucket is the full set: read, add, replace, delete.

select bucket,
       string_agg(cmd, ', ' order by cmd) as what_is_allowed,
       case when count(*) filter (where cmd = 'UPDATE') = 0
            then 'STILL CANNOT REPLACE A FILE'
            else 'ok' end as status
from (
  select case
           when qual like '%job-documents%' or with_check like '%job-documents%' then 'job-documents'
           when qual like '%drawings%' or with_check like '%drawings%' then 'drawings'
         end as bucket,
         cmd
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
) b
where bucket is not null
group by bucket
order by bucket;
