-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds a Description field and Quoted Value to jobs, plus the quoted line
-- items themselves with partial-invoicing tracking. Run on top of
-- setup-jobs.sql and setup-jobs-qty-tracking.sql.

alter table jobs add column if not exists description text;
alter table jobs add column if not exists quoted_value numeric;

-- The quoted line items themselves — entered manually for now (auto-fill
-- from the Excel quote is a deliberately separate later step).
create table if not exists job_quote_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  description text not null,
  qty numeric not null,
  unit_price numeric not null default 0,
  qty_invoiced numeric not null default 0,
  sort_order integer not null default 0
);

create index if not exists job_quote_items_job_id_idx on job_quote_items (job_id);

-- A log of every "add to invoice" action against a quoted line — supports
-- partial/batched invoicing rather than one all-or-nothing flag.
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

alter table job_quote_items enable row level security;
alter table job_quote_item_invoices enable row level security;

create policy "Signed-in users can read quote items" on job_quote_items for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add quote items" on job_quote_items for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update quote items" on job_quote_items for update using (auth.role() = 'authenticated');
create policy "Signed-in users can delete quote items" on job_quote_items for delete using (auth.role() = 'authenticated');

create policy "Signed-in users can read quote item invoices" on job_quote_item_invoices for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add quote item invoices" on job_quote_item_invoices for insert with check (auth.role() = 'authenticated');
