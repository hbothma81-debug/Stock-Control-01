-- PRACTICE ONLY. Puts back what the first mailbox read on practice
-- (19 Oct 2026, 16:34) got wrong, before the fix in mailRules.js:
--   PR-009 Monitor Spray, PR-010 Supplyrite: our own request mail was taken
--     for the supplier's reply. Back to Sent, waiting since the request.
--   PR-011 National Castors: the supplier forwarding our request inside
--     their company was taken for a reply. Back to Sent.
--   PR-012 Johan Burger (bwie.co.za): ERS answering a customer's RFQ was
--     taken for a new request. Marked Not a request (kept, not deleted).
-- Touches each row only while it still reads exactly what the fault left
-- (status Reply, changed by the read). Does nothing a second time.
-- Select nothing before pressing Run.

update public.procurement_requests
set status = 'Sent', waiting_since = v.waiting, reply_message_id = null, chases = 0,
    updated_at = now(), updated_by = 'FIX first practice read'
from (values ('PR-009', date '2026-10-16'), ('PR-010', date '2026-10-19'), ('PR-011', date '2026-10-19')) as v(pr, waiting)
where pr_number = v.pr and status = 'Reply' and updated_by = 'Test' and reply_message_id is not null;

update public.procurement_requests
set status = 'Not a request', reply_message_id = null, updated_at = now(), updated_by = 'FIX first practice read'
where pr_number = 'PR-012' and contact_email = 'johanb@bwie.co.za' and status = 'Reply';

select pr_number, supplier_name, status, waiting_since, updated_by
from public.procurement_requests
where pr_number in ('PR-009', 'PR-010', 'PR-011', 'PR-012')
order by pr_number;
