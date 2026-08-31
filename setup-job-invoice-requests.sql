-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Stores each "Submit Invoice" action as a real document instead of an
-- automatic download — visible and openable from both the job itself and
-- the Invoicing tab, until accounts marks it invoiced.

insert into storage.buckets (id, name, public)
values ('job-invoices', 'job-invoices', false)
on conflict (id) do nothing;

do $$ begin
  create policy "Signed-in users can read job invoice files"
    on storage.objects for select
    using (bucket_id = 'job-invoices' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can upload job invoice files"
    on storage.objects for insert
    with check (bucket_id = 'job-invoices' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

create table if not exists job_invoice_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  total_amount numeric not null default 0,
  submitted_by text,
  submitted_at timestamptz not null default now()
);

create index if not exists job_invoice_requests_job_id_idx on job_invoice_requests (job_id);

alter table job_invoice_requests enable row level security;

do $$ begin
  create policy "Signed-in users can read job invoice requests" on job_invoice_requests for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add job invoice requests" on job_invoice_requests for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
