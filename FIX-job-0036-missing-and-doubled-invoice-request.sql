-- JOB-0036 (Tilvis Engineering), live only. One-off data fix.
--
-- On 17 Sep 2026 at 15:42 the invoice request was pressed three times in
-- forty seconds, on the code of the day (lines marked first, document after):
--   1. marked the first ten lines (P-001 A to P-008 A, R 6,582.98) as
--      requested and then failed before its document was stored, so no
--      request covers them and no button finds them again;
--   2. made a real request for P-008 B to the bracket (R 9,852.88);
--   3. landed while 2 was still running and made a second request for the
--      last seven lines (R 6,161.28), all seven already in request 2.
-- The two requests add up to R 16,014.16 on a job worth R 16,435.86.
-- (The order was fixed in 199ef59, 19 Sep; the double press by the lock
-- that goes with this file.)
--
-- This puts the ten lines back to "nothing requested", removes the nine log
-- rows of the failed press and the seven doubled ones of press 3, and removes
-- the duplicate request. Then "Invoice Now (all remaining)" on the job's
-- Overview tab makes the missing request: R 6,582.98, two requests adding up
-- to the job. The duplicate's PDF stays in storage and in the documents log,
-- opened by nothing.
--
-- Safe to run twice: every step looks for the duplicate request, which is
-- removed last, so once it has run (and after Invoice Now) it changes nothing.

update job_quote_items q
   set qty_invoiced = 0, item_status = 'on_floor'
 where q.job_id = '7349b155-91c3-4292-a156-9573f83a9971'
   and q.description in (
     'HF_SP-220-01 REV-A P-001 A', 'HF_SP-220-01 REV-A P-001 B', 'HF_SP-220-01 REV-A P-001 C',
     'HF_SP-220-01 REV-A P-002', 'HF_SP-220-01 REV-A P-003', 'HF_SP-220-01 REV-A P-004',
     'HF_SP-220-01 REV-A P-005', 'HF_SP-220-01 REV-A P-006', 'HF_SP-220-01 REV-A P-007',
     'HF_SP-220-01 REV-A P-008 A')
   and q.item_status = 'invoice_requested'
   and q.qty_invoiced = q.qty
   and exists (select 1 from job_invoice_requests r where r.id = '358f0531-9f40-4791-bdc2-3b9292dc4ebd');

delete from job_quote_item_invoices l
 where l.job_id = '7349b155-91c3-4292-a156-9573f83a9971'
   and l.id in (
     'b04bbbe2-cf9d-4069-b4df-15123b9b4a8d', '9ca36133-e192-4063-bcb5-95b49a833d4f', 'b6a3c7f0-59be-4060-9f3e-1cc99c00e428',
     '464094d4-79df-4aa9-8d01-2605c9b40d65', '5536528b-4e95-4e0d-a8ba-ad92e8f3e802', 'f708e29e-1fad-4fe1-8386-e81979d8ecbb',
     '255ee5da-8bea-4ef9-bdba-8d83a4b81d94', '5e1178fb-b312-4da0-9fe1-f6c8a9fbe53b', '38bc2b3f-5a0f-47aa-a627-ea7b7b43c0a3',
     'abac3be5-a1d8-4c91-ba56-1eb236152cc1', '90571229-0f0c-408e-a4c8-baae2e42cb05', 'e7148691-650f-4215-b8c1-c907833814f5',
     '3cb9e62b-0d20-43c8-8bce-63de59fddf79', '4f19e7b7-512b-4f90-b5f5-3cc48d4c8c0b', 'cce6480e-e1c6-4269-ae39-23a40b444668',
     '1daddfab-ccfd-405d-9129-e53064ecfd81')
   and exists (select 1 from job_invoice_requests r where r.id = '358f0531-9f40-4791-bdc2-3b9292dc4ebd');

delete from job_invoice_requests
 where id = '358f0531-9f40-4791-bdc2-3b9292dc4ebd'
   and job_id = '7349b155-91c3-4292-a156-9573f83a9971'
   and total_amount between 6161.27 and 6161.29;

select 'line' as what, description as name, qty::text as qty, qty_invoiced::text as requested, item_status as note
  from job_quote_items where job_id = '7349b155-91c3-4292-a156-9573f83a9971'
union all
select 'request', file_name, null, total_amount::text, submitted_by
  from job_invoice_requests where job_id = '7349b155-91c3-4292-a156-9573f83a9971'
 order by 1, 2;
