-- What accounts invoiced a job for in Sage, excluding VAT.
--
-- Typed on Mark as Invoiced, beside the Sage invoice number (decided
-- 17 Sep 2026). The box is filled in from the job's invoice requests so
-- accounts checks a number rather than typing one. It feeds the Jobs
-- list's "Invoiced in <month>" figure (src/jobs/jobFigures.js).
--
-- Blank on every job invoiced before this: those count at what the job
-- was quoted at, and the figure says how many.
--
-- Safe to run more than once.

alter table jobs
  add column if not exists invoiced_amount numeric;

alter table jobs drop constraint if exists jobs_invoiced_amount_check;
alter table jobs add constraint jobs_invoiced_amount_check
  check (invoiced_amount is null or invoiced_amount >= 0);

-- Check: invoiced jobs and their amount (all blank straight after this runs).
select job_number, status, invoice_number, invoiced_at, invoiced_amount
from jobs
where status = 'invoiced'
order by invoiced_at desc
limit 20;
