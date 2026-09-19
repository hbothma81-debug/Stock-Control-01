-- JOB-0088 (STAINLESS STEEL DESIGN C C), live only. One-off data fix.
--
-- On 15 Sep 2026 at 14:11 "Request invoice" marked the job's three lines as
-- requested (150 of 150 each) and then failed to store the request
-- document. The code of the day returned without a word and Invoicing was
-- ticked anyway, so the job sits under Records -> Invoicing with "No
-- invoice request submitted yet" and every button finds nothing left to
-- send. (Fixed in 199ef59, 19 Sep: the document and the request row are
-- saved first, the lines marked after.)
--
-- This puts the three lines back to "nothing requested" and removes the
-- three log rows of that failed attempt. Then "Invoice Now (all remaining)"
-- on the job's Overview tab makes the request properly.
--
-- Safe to run twice: it only touches lines still reading exactly what the
-- failed attempt left, and does nothing at all once the job has a request.

update job_quote_items q
   set qty_invoiced = 0, item_status = 'on_floor'
 where q.job_id = 'e6ce68ad-cf99-4793-8831-c3ebb5f5ef8e'
   and q.qty_invoiced = 150
   and q.item_status = 'invoice_requested'
   and not exists (select 1 from job_invoice_requests r where r.job_id = q.job_id);

delete from job_quote_item_invoices l
 where l.job_id = 'e6ce68ad-cf99-4793-8831-c3ebb5f5ef8e'
   and l.id in ('16297318-b3c8-43ed-8f02-a937437d6149',
                '17e67c6d-b37d-4040-95b2-94589a11c809',
                '89ca91e3-33d8-4f83-826a-5270bb9deed2')
   and not exists (select 1 from job_invoice_requests r where r.job_id = l.job_id);

select description, qty, qty_invoiced, item_status
  from job_quote_items
 where job_id = 'e6ce68ad-cf99-4793-8831-c3ebb5f5ef8e'
 order by sort_order;
