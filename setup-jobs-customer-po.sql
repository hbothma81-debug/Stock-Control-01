-- The customer's own purchase order number for a job.
--
-- Typed in by hand: it comes from the customer's system, not ours, and
-- often arrives after the job has already been created. Kept as free text
-- for that reason — customers number their POs however they like.
--
-- Safe to run more than once. Adding a column with a default touches no
-- existing data and nothing reads it until the new code is deployed.

alter table jobs
  add column if not exists customer_po text not null default '';

-- Check: existing jobs all blank, ready to be filled in as POs arrive.
select job_number, customer, customer_po
from jobs
order by created_at desc
limit 10;
