-- A job can be billed on several Sage invoices, and one Sage invoice can
-- cover more than one invoice request (Heinrich, 22 Sep 2026, JOB-0014:
-- five requests, marked Invoiced as a whole while eight lines were still to
-- bill). Until this, a job held one invoice number, one date, one amount.
--
-- job_sage_invoices: one row per Sage invoice raised on a job, typed by
-- accounts on Records -> Invoicing (number, amount excluding VAT, who,
-- when). A request points at the Sage invoice that billed it
-- (job_invoice_requests.sage_invoice_id); several requests may point at
-- the same one. The job goes Invoiced by itself once every line is billed,
-- every stage ticked and every request has its Sage invoice.
--
-- Jobs marked Invoiced before this keep their one number on the job
-- (jobs.invoice_number, invoiced_at, invoiced_amount); nothing is copied.
--
-- Safe to run more than once.

create table if not exists job_sage_invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  invoice_number text not null,
  amount numeric,
  invoiced_by text,
  invoiced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table job_sage_invoices drop constraint if exists job_sage_invoices_amount_check;
alter table job_sage_invoices add constraint job_sage_invoices_amount_check
  check (amount is null or amount >= 0);

create index if not exists job_sage_invoices_job_id_idx on job_sage_invoices (job_id);

alter table job_invoice_requests
  add column if not exists sage_invoice_id uuid references job_sage_invoices(id) on delete set null;

create index if not exists job_invoice_requests_sage_invoice_id_idx on job_invoice_requests (sage_invoice_id);

-- The request row is changed when it is linked to a Sage invoice: it had
-- read and add rules only, and a table with no update rule refuses every
-- update silently.
do $sage$ begin
  create policy "Signed-in users can update job invoice requests" on job_invoice_requests for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $sage$;

alter table job_sage_invoices enable row level security;

do $sage$ begin
  create policy "Signed-in users can read job sage invoices" on job_sage_invoices for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $sage$;
do $sage$ begin
  create policy "Signed-in users can add job sage invoices" on job_sage_invoices for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $sage$;
do $sage$ begin
  create policy "Signed-in users can update job sage invoices" on job_sage_invoices for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $sage$;
do $sage$ begin
  create policy "Signed-in users can delete job sage invoices" on job_sage_invoices for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $sage$;

drop trigger if exists job_sage_invoices_set_updated_at on public.job_sage_invoices;
create trigger job_sage_invoices_set_updated_at
  before update on public.job_sage_invoices
  for each row execute function public.touch_updated_at();

-- Check: the table answers, and how many requests are linked so far (none
-- straight after this runs).
select count(*) as sage_invoices,
       (select count(*) from job_invoice_requests where sage_invoice_id is not null) as linked_requests
  from job_sage_invoices;
