-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Part 3 of moving core data off the shared-blob pattern onto real,
-- individual rows. Requisitions specifically — each one is now its own
-- row, so raising one, marking one ordered, or marking one received can
-- never collide with or overwrite anyone else's requisition.
--
-- Every field here was verified against every place in the app that
-- creates or updates a requisition, not just the creation form — qty,
-- dateFulfilled, and poNumber in particular are only ever set later, from
-- markReceived and the PO builder respectively, not at creation.

create table if not exists requisitions (
  id text primary key,
  main_cat text not null default '',
  item_id text not null default '',
  item_label text not null default '',
  item_grade text not null default '',
  item_raw_name text not null default '',
  qty text not null default '',
  notes text not null default '',
  requested_by text not null default '',
  date_requested text not null default '',
  status text not null default 'pending',
  supplier text not null default '',
  ordered_by text not null default '',
  date_ordered text not null default '',
  received_by text not null default '',
  date_received text not null default '',
  date_fulfilled text not null default '',
  po_number text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists requisitions_status_idx on requisitions (status);
create index if not exists requisitions_item_id_idx on requisitions (item_id);

alter table requisitions enable row level security;

drop policy if exists "Signed-in users can read requisitions" on requisitions;
create policy "Signed-in users can read requisitions" on requisitions
  for select using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can insert requisitions" on requisitions;
create policy "Signed-in users can insert requisitions" on requisitions
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can update requisitions" on requisitions;
create policy "Signed-in users can update requisitions" on requisitions
  for update using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can delete requisitions" on requisitions;
create policy "Signed-in users can delete requisitions" on requisitions
  for delete using (auth.role() = 'authenticated');

-- Data migration: copy every requisition out of the existing shared blob
-- into its own real row. Safe to run more than once — on conflict does
-- nothing, so a re-run never duplicates or overwrites anything.
insert into requisitions (
  id, main_cat, item_id, item_label, item_grade, item_raw_name, qty, notes,
  requested_by, date_requested, status, supplier, ordered_by, date_ordered,
  received_by, date_received, date_fulfilled, po_number
)
select
  elem->>'id',
  coalesce(elem->>'mainCat', ''),
  coalesce(elem->>'itemId', ''),
  coalesce(elem->>'itemLabel', ''),
  coalesce(elem->>'itemGrade', ''),
  coalesce(elem->>'itemRawName', ''),
  coalesce(elem->>'qty', ''),
  coalesce(elem->>'notes', ''),
  coalesce(elem->>'requestedBy', ''),
  coalesce(elem->>'dateRequested', ''),
  coalesce(elem->>'status', 'pending'),
  coalesce(elem->>'supplier', ''),
  coalesce(elem->>'orderedBy', ''),
  coalesce(elem->>'dateOrdered', ''),
  coalesce(elem->>'receivedBy', ''),
  coalesce(elem->>'dateReceived', ''),
  coalesce(elem->>'dateFulfilled', ''),
  coalesce(elem->>'poNumber', '')
from app_storage, jsonb_array_elements(coalesce(value::jsonb, '[]'::jsonb)) as elem
where key = 'stock-requisitions-v1'
  and elem->>'id' is not null
on conflict (id) do nothing;
