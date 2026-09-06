-- Why purchase order PDFs are refused by storage.
--
-- Files live in "buckets", and each bucket has its own rules -- separate
-- from the table rules we already looked at. Storage is refusing the
-- upload outright (403), so every PO PDF has been shown to you and then
-- thrown away.
--
-- The app writes documents to four different shapes of path inside the
-- same job-documents bucket:
--
--   <job id>/delivery-note-1234.pdf    delivery notes   -- works?
--   <job id>/process-sheet.pdf         process sheets   -- works?
--   po/<po id>/PO-0002.pdf             purchase orders  -- REFUSED
--   po-reports/PO-Report-....pdf       spend reports    -- ?
--
-- The first two start with a job's id. The last two start with a plain
-- word. If the rule expects a job id there, that alone explains it.
--
-- Select nothing before pressing Run. Read-only. Safe to run any time.


-- ============ 1. The buckets ============

select 'A. bucket'                        as finding,
       id                                 as name,
       case when public then 'public' else 'private' end as detail,
       coalesce(file_size_limit::text, 'no size limit')  as extra

from storage.buckets

union all

-- ============ 2. The rules on files ============
--
-- "extra" is the actual condition. Look for anything comparing the first
-- folder of the path -- storage.foldername(name)[1] -- against a list of
-- job ids, or a bucket name check.

select 'B. rule: ' || cmd,
       policyname,
       array_to_string(roles, ', '),
       coalesce(qual, with_check, '(none)')

from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'

order by finding, name;
