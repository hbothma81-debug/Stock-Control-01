-- Run this once in Supabase → SQL Editor → New query, then Run.
-- This is the COMPLETE Jobs system setup, combining everything built
-- across today's session into one file. Every statement is safe to
-- re-run even if you've already run some of the earlier separate files —
-- "if not exists" everywhere means nothing gets duplicated or errors out.
-- If job creation is failing with a "column does not exist" error, running
-- this one file resolves it.

-- ============ Documents bucket ============
insert into storage.buckets (id, name, public)
values ('job-documents', 'job-documents', false)
on conflict (id) do nothing;

do $$ begin
  create policy "Signed-in users can read job documents"
    on storage.objects for select
    using (bucket_id = 'job-documents' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can upload job documents"
    on storage.objects for insert
    with check (bucket_id = 'job-documents' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can delete job documents"
    on storage.objects for delete
    using (bucket_id = 'job-documents' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ============ Jobs ============
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  customer text,
  status text not null default 'in_progress',
  sales_rep text,
  qty numeric,
  qty_complete numeric not null default 0,
  due_date date,
  job_location text,
  quote_reference text,
  laser_job_reference text,
  material_1_grade text,
  material_1_qty text,
  material_2_grade text,
  material_2_qty text,
  material_3_grade text,
  material_3_qty text,
  material_location text,
  buy_out_notes text,
  description text,
  quoted_value numeric,
  invoiced_by text,
  invoiced_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

alter table jobs add column if not exists qty_complete numeric not null default 0;
alter table jobs add column if not exists description text;
alter table jobs add column if not exists quoted_value numeric;
alter table jobs add column if not exists invoiced_by text;
alter table jobs add column if not exists invoiced_at timestamptz;

create index if not exists jobs_sales_rep_idx on jobs (sales_rep);
create index if not exists jobs_customer_idx on jobs (customer);

-- ============ Process checklist ============
create table if not exists job_processes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  process_name text not null,
  operator text,
  external_supplier text,
  is_complete boolean not null default false,
  completed_by text,
  completed_at timestamptz,
  notes text,
  sort_order integer not null default 0
);

alter table job_processes add column if not exists external_supplier text;

create index if not exists job_processes_job_id_idx on job_processes (job_id);

-- ============ Job documents ============
create table if not exists job_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create index if not exists job_documents_job_id_idx on job_documents (job_id);

-- ============ Job notifications ============
create table if not exists job_notifications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  job_number text,
  sales_rep text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists job_notifications_sales_rep_idx on job_notifications (sales_rep);

-- ============ Quantity progress log ============
create table if not exists job_qty_updates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  qty_reported numeric not null,
  reported_by text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists job_qty_updates_job_id_idx on job_qty_updates (job_id);

-- ============ Quoted line items (+ item linking + partial invoicing) ============
create table if not exists job_quote_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  description text not null,
  qty numeric not null,
  unit_price numeric not null default 0,
  qty_invoiced numeric not null default 0,
  linked_item_id text,
  sort_order integer not null default 0
);

alter table job_quote_items add column if not exists linked_item_id text;

create index if not exists job_quote_items_job_id_idx on job_quote_items (job_id);

create table if not exists job_quote_item_invoices (
  id uuid primary key default gen_random_uuid(),
  quote_item_id uuid not null references job_quote_items(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  qty_added numeric not null,
  invoiced_by text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists job_quote_item_invoices_item_idx on job_quote_item_invoices (quote_item_id);

-- ============ Delivery notes ============
create table if not exists delivery_notes (
  id uuid primary key default gen_random_uuid(),
  delivery_note_number text not null unique,
  job_id uuid references jobs(id) on delete set null,
  recipient_type text not null,
  recipient_name text not null,
  recipient_address text,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists delivery_note_items (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references delivery_notes(id) on delete cascade,
  description text not null,
  qty numeric not null,
  sort_order integer not null default 0
);

create index if not exists delivery_note_items_note_id_idx on delivery_note_items (delivery_note_id);
create index if not exists delivery_notes_job_id_idx on delivery_notes (job_id);

-- ============ RLS — same open-to-any-authenticated-user pattern as
-- every other table this session; the app's own permission system
-- controls what's actually shown in the UI. ============
alter table jobs enable row level security;
alter table job_processes enable row level security;
alter table job_documents enable row level security;
alter table job_notifications enable row level security;
alter table job_qty_updates enable row level security;
alter table job_quote_items enable row level security;
alter table job_quote_item_invoices enable row level security;
alter table delivery_notes enable row level security;
alter table delivery_note_items enable row level security;

do $$ begin
  create policy "Signed-in users can read jobs" on jobs for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add jobs" on jobs for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update jobs" on jobs for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete jobs" on jobs for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read job processes" on job_processes for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add job processes" on job_processes for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update job processes" on job_processes for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete job processes" on job_processes for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read job documents rows" on job_documents for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add job documents rows" on job_documents for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete job documents rows" on job_documents for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read job notifications" on job_notifications for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add job notifications" on job_notifications for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update job notifications" on job_notifications for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read job qty updates" on job_qty_updates for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add job qty updates" on job_qty_updates for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read quote items" on job_quote_items for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add quote items" on job_quote_items for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update quote items" on job_quote_items for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete quote items" on job_quote_items for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read quote item invoices" on job_quote_item_invoices for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add quote item invoices" on job_quote_item_invoices for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read delivery notes" on delivery_notes for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add delivery notes" on delivery_notes for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can read delivery note items" on delivery_note_items for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add delivery note items" on delivery_note_items for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
