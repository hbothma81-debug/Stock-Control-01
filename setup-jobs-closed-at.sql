-- When a finished job with no Invoicing stage was closed.
--
-- Heinrich, 7 Oct 2026: a job with no Invoicing stage finishes and is
-- Completed, never To invoice (src/jobs/completeWithoutInvoice.js). Its
-- status becomes 'closed' (a word of its own, so 'invoiced' keeps meaning
-- invoiced) and this column says when, for the Jobs list's days chip.
--
-- The app writes the column only where it exists, so the push can go
-- first and this paste after; until then closed jobs carry no date.
--
-- Safe to run more than once.

alter table jobs
  add column if not exists closed_at timestamptz;

-- Check: finished jobs with no Invoicing stage, as the app will close
-- them on the next Jobs page load (none read 'closed' until it does).
select j.job_number, j.customer, j.status, j.closed_at
from jobs j
where j.status in ('complete', 'closed')
  and not exists (
    select 1 from job_processes p
    where p.job_id = j.id and p.shortage_id is null
      and lower(trim(p.process_name)) = 'invoicing')
  and not exists (select 1 from job_invoice_requests r where r.job_id = j.id)
order by j.job_number;
