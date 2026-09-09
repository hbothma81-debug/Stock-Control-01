-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- The buy-outs on a job: one row per bought-in part the job needs.
-- The sales person lists them here, then raises a purchase order per
-- supplier from the same tab. The order itself is an ordinary row in
-- purchase_orders -- same numbering, same Receiving tab, same automatic
-- set-aside for the job when it arrives. This table only remembers
-- what the job needs and which order each line went on.
--
-- Not invoiced: a buy-out is a cost inside something quoted, never a
-- line the customer is billed for. That is why this is its own table
-- and not job_quote_items.
--
-- Same shape as job_cut_items on purpose; the quoting module may want
-- the same list on a quote later, in which case add a nullable
-- quote_id here rather than forking the table.
--
-- Safe to run more than once.

create table if not exists job_buyout_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  sort_order integer not null default 0,

  -- The Buy-out Code this line points at, when it came from the list.
  -- stock_items.id is text, and there is no foreign key on purpose: a
  -- retired code should not take a job's history with it. The fields
  -- below are copied in at the time for the same reason.
  item_id text,
  part_number text not null default '',
  description text not null default '',
  supplier text not null default '',

  qty numeric not null default 0,
  unit_cost numeric not null default 0,

  -- The purchase order this line was put on. purchase_orders.id is
  -- text. Blank until a PO is raised for it.
  po_id text,
  po_number text not null default '',

  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists job_buyout_items_job_id_idx on job_buyout_items (job_id);
create index if not exists job_buyout_items_po_id_idx on job_buyout_items (po_id);

alter table job_buyout_items enable row level security;

do $$ begin
  create policy "Signed-in users can read buyout items" on job_buyout_items for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add buyout items" on job_buyout_items for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update buyout items" on job_buyout_items for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete buyout items" on job_buyout_items for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

select 'job_buyout_items ready' as result;
