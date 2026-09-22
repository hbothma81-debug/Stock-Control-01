-- JOB-0014 (Greenzone), live only. One-off data repair, 22 Sep 2026.
--
-- On 18 Sep at 13:44 Mark as Invoiced was pressed with "Cash" while eight
-- of the eleven lines were only partly invoiced and five stages were open
-- (Tube Laser, Bending, Packer, Delivery Note, Invoicing). The status went
-- to Invoiced, so the job left the Production tab and the laser screens
-- with its work unfinished. Nothing in the app stopped it then; since
-- src/jobs/markInvoiced.js it is refused.
--
-- This puts the job back In Progress with its counts as they are, clears
-- the mark (Heinrich, 22 Sep: clear), and puts the lines' status back to
-- "requested" (or "on floor" where nothing has been requested). The five
-- invoice requests and the quantities invoiced so far are left alone.
--
-- Safe to run twice: it only touches the job while it still reads
-- Invoiced with "Cash", and does nothing afterwards.

update job_quote_items q
   set item_status = case when q.qty_invoiced > 0 then 'invoice_requested' else 'on_floor' end
 where q.job_id = '69af768c-7962-4403-8515-b5f279b53131'
   and q.item_status = 'invoiced'
   and exists (select 1 from jobs j where j.id = q.job_id and j.status = 'invoiced' and j.invoice_number = 'Cash');

update jobs
   set status = 'in_progress',
       invoice_number = null,
       invoiced_by = null,
       invoiced_at = null,
       invoiced_amount = null
 where id = '69af768c-7962-4403-8515-b5f279b53131'
   and status = 'invoiced'
   and invoice_number = 'Cash';

select j.job_number, j.status, j.invoice_number,
       (select count(*) from job_processes p where p.job_id = j.id and not p.is_complete and p.shortage_id is null) as stages_open,
       (select count(*) from job_quote_items q where q.job_id = j.id and q.parent_quote_item_id is null and q.qty_invoiced < q.qty) as lines_left
  from jobs j
 where j.id = '69af768c-7962-4403-8515-b5f279b53131';
