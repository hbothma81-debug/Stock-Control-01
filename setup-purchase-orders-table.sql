-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Part 4 of moving core data off the shared-blob pattern onto real,
-- individual rows. Purchase orders specifically.
--
-- Line items, received-line-items, and linked requisition ids stay as
-- JSON columns on each PO's own row, rather than further split into their
-- own tables — deliberately, not for lack of trying. The data-loss risk
-- this whole effort is fixing was always about one PO's save overwriting
-- a *different* PO's — every PO sharing one blob. A single PO's own line
-- items are only ever built or edited by one person at a time (raised,
-- later received) and have no stable id of their own to key off in the
-- first place. Once each PO is its own row, that cross-PO collision is
-- fully eliminated either way — splitting line items out further would
-- add real complexity for a risk that was never really there.
--
-- Every field verified against every place in the app that creates or
-- updates a PO, not just the builder form — receivedLineItems in
-- particular is only ever set later, from the receiving flow.

create table if not exists purchase_orders (
  id text primary key,
  po_number text not null default '',
  supplier_id text not null default '',
  supplier_name text not null default '',
  date_created text not null default '',
  created_by text not null default '',
  line_items jsonb not null default '[]'::jsonb,
  exclusive_total numeric not null default 0,
  vat_rate numeric not null default 0,
  vat_total numeric not null default 0,
  total_value numeric not null default 0,
  delivery_date text not null default '',
  reference text not null default '',
  sales_person text not null default '',
  notes text not null default '',
  linked_requisition_ids jsonb not null default '[]'::jsonb,
  status text not null default 'outstanding',
  received_by text not null default '',
  received_date text not null default '',
  delivery_note_number text not null default '',
  received_line_items jsonb,
  created_at timestamptz not null default now()
);

create index if not exists purchase_orders_status_idx on purchase_orders (status);
create index if not exists purchase_orders_supplier_idx on purchase_orders (supplier_id);

alter table purchase_orders enable row level security;

drop policy if exists "Signed-in users can read purchase orders" on purchase_orders;
create policy "Signed-in users can read purchase orders" on purchase_orders
  for select using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can insert purchase orders" on purchase_orders;
create policy "Signed-in users can insert purchase orders" on purchase_orders
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can update purchase orders" on purchase_orders;
create policy "Signed-in users can update purchase orders" on purchase_orders
  for update using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can delete purchase orders" on purchase_orders;
create policy "Signed-in users can delete purchase orders" on purchase_orders
  for delete using (auth.role() = 'authenticated');

-- Data migration: copy every PO out of the existing shared blob into its
-- own real row. Safe to run more than once — on conflict does nothing.
insert into purchase_orders (
  id, po_number, supplier_id, supplier_name, date_created, created_by,
  line_items, exclusive_total, vat_rate, vat_total, total_value,
  delivery_date, reference, sales_person, notes, linked_requisition_ids,
  status, received_by, received_date, delivery_note_number, received_line_items
)
select
  elem->>'id',
  coalesce(elem->>'poNumber', ''),
  coalesce(elem->>'supplierId', ''),
  coalesce(elem->>'supplierName', ''),
  coalesce(elem->>'dateCreated', ''),
  coalesce(elem->>'createdBy', ''),
  coalesce(elem->'lineItems', '[]'::jsonb),
  coalesce((elem->>'exclusiveTotal')::numeric, 0),
  coalesce((elem->>'vatRate')::numeric, 0),
  coalesce((elem->>'vatTotal')::numeric, 0),
  coalesce((elem->>'totalValue')::numeric, 0),
  coalesce(elem->>'deliveryDate', ''),
  coalesce(elem->>'reference', ''),
  coalesce(elem->>'salesPerson', ''),
  coalesce(elem->>'notes', ''),
  coalesce(elem->'linkedRequisitionIds', '[]'::jsonb),
  coalesce(elem->>'status', 'outstanding'),
  coalesce(elem->>'receivedBy', ''),
  coalesce(elem->>'receivedDate', ''),
  coalesce(elem->>'deliveryNoteNumber', ''),
  elem->'receivedLineItems'
from app_storage, jsonb_array_elements(coalesce(value::jsonb, '[]'::jsonb)) as elem
where key = 'stock-purchase-orders-v1'
  and elem->>'id' is not null
on conflict (id) do nothing;
