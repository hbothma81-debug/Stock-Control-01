-- Tying a purchase order to a job.
--
-- One column, plus the job number kept beside it. Nothing on screen
-- changes when this runs -- the picker and the automatic allocation come
-- with the code.
--
--
-- WHY
--
-- The order already has a "Reference (job number)" box, but it is plain
-- text. Nothing joins it to a job, so when the steel arrives nobody knows
-- it was bought for JOB-0042 -- it just lands in general stock and has to
-- be found and reserved by hand, if anyone remembers.
--
-- With a real link, receiving the order can set the material aside for
-- that job by itself.
--
--
-- WHY BOTH job_id AND job_number
--
-- job_id is the real link and survives the job being renumbered.
-- job_number is kept alongside so a finished order still reads correctly
-- years later, even if the job itself is eventually deleted -- the same
-- reason job_allocations keeps both.
--
-- The existing Reference box is untouched. An order that is not for a
-- particular job carries on exactly as it does now.
--
--
-- Select nothing before pressing Run. Safe to run more than once.


alter table purchase_orders
  add column if not exists job_id uuid references jobs(id) on delete set null;

alter table purchase_orders
  add column if not exists job_number text not null default '';

create index if not exists purchase_orders_job_idx on purchase_orders (job_id);


-- ============ Check ============
--
-- One row. The count is how many orders are tied to a job, which is 0
-- until someone raises one -- that is correct, not a problem.

select 'purchase_orders.job_id' as check_name,
       'ready - ' || count(*) filter (where job_id is not null)::text ||
       ' of ' || count(*)::text || ' order(s) tied to a job' as result
from purchase_orders;
