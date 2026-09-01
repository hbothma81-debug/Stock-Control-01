-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Part 1 of moving core stock data off the shared-blob pattern (one JSON
-- blob everyone's browser rewrote in full on every save) onto real,
-- individual database rows — the structural fix for the data-loss issue,
-- not just another patch on top of it. This covers stock items
-- specifically; master data, requisitions, purchase orders, and usage log
-- follow the same approach separately.
--
-- id stays text, not uuid — existing item ids were never real UUIDs (an
-- 8-character random string), and other tables already reference items by
-- this same id as plain text (item_id, linked_item_id) — matching that
-- exactly, not introducing a mismatch.

create table if not exists stock_items (
  id text primary key,
  main_cat text not null default '',
  loc text not null default '',
  low numeric not null default 0,
  sales_person text not null default '',
  customer text not null default '',
  supplier text not null default '',
  grade text not null default '',
  size text not null default '',
  thickness text not null default '',
  name text not null default '',
  sheet_name text not null default '',
  stock_type text not null default '',
  comment text not null default '',
  unit text not null default '',
  track_length boolean not null default false,
  length numeric not null default 0,
  qty numeric not null default 0,
  diameter text not null default '',
  part_number text not null default '',
  manufacturer text not null default '',
  serial_number text not null default '',
  purchase_date text not null default '',
  value numeric not null default 0,
  service_mode text not null default '',
  service_interval_months numeric not null default 0,
  service_interval_hours numeric not null default 0,
  service_interval_km numeric not null default 0,
  last_service_date text not null default '',
  last_service_reading numeric not null default 0,
  current_reading numeric not null default 0,
  status text not null default '',
  fastener_type text not null default '',
  fastener_grade text not null default '',
  finish text not null default '',
  attachment_type text not null default '',
  attachment_name text not null default '',
  stores_kind text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_items_main_cat_idx on stock_items (main_cat);
create index if not exists stock_items_customer_idx on stock_items (customer);

alter table stock_items enable row level security;

drop policy if exists "Signed-in users can read stock items" on stock_items;
create policy "Signed-in users can read stock items" on stock_items
  for select using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can insert stock items" on stock_items;
create policy "Signed-in users can insert stock items" on stock_items
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can update stock items" on stock_items;
create policy "Signed-in users can update stock items" on stock_items
  for update using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can delete stock items" on stock_items;
create policy "Signed-in users can delete stock items" on stock_items
  for delete using (auth.role() = 'authenticated');

-- Data migration: copy every item out of the existing shared blob into its
-- own real row. Safe to run even if some rows already exist — on conflict
-- does nothing, so re-running this after a partial run or a retry never
-- duplicates or overwrites anything.
insert into stock_items (
  id, main_cat, loc, low, sales_person, customer, supplier, grade, size, thickness,
  name, sheet_name, stock_type, comment, unit, track_length, length, qty, diameter,
  part_number, manufacturer, serial_number, purchase_date, value, service_mode,
  service_interval_months, service_interval_hours, service_interval_km,
  last_service_date, last_service_reading, current_reading, status,
  fastener_type, fastener_grade, finish, attachment_type, attachment_name, stores_kind
)
select
  elem->>'id',
  coalesce(elem->>'mainCat', ''),
  coalesce(elem->>'loc', ''),
  coalesce((elem->>'low')::numeric, 0),
  coalesce(elem->>'salesPerson', ''),
  coalesce(elem->>'customer', ''),
  coalesce(elem->>'supplier', ''),
  coalesce(elem->>'grade', ''),
  coalesce(elem->>'size', ''),
  coalesce(elem->>'thickness', ''),
  coalesce(elem->>'name', ''),
  coalesce(elem->>'sheetName', ''),
  coalesce(elem->>'stockType', ''),
  coalesce(elem->>'comment', ''),
  coalesce(elem->>'unit', ''),
  coalesce((elem->>'trackLength')::boolean, false),
  coalesce((elem->>'length')::numeric, 0),
  coalesce((elem->>'qty')::numeric, 0),
  coalesce(elem->>'diameter', ''),
  coalesce(elem->>'partNumber', ''),
  coalesce(elem->>'manufacturer', ''),
  coalesce(elem->>'serialNumber', ''),
  coalesce(elem->>'purchaseDate', ''),
  coalesce((elem->>'value')::numeric, 0),
  coalesce(elem->>'serviceMode', ''),
  coalesce((elem->>'serviceIntervalMonths')::numeric, 0),
  coalesce((elem->>'serviceIntervalHours')::numeric, 0),
  coalesce((elem->>'serviceIntervalKm')::numeric, 0),
  coalesce(elem->>'lastServiceDate', ''),
  coalesce((elem->>'lastServiceReading')::numeric, 0),
  coalesce((elem->>'currentReading')::numeric, 0),
  coalesce(elem->>'status', ''),
  coalesce(elem->>'fastenerType', ''),
  coalesce(elem->>'fastenerGrade', ''),
  coalesce(elem->>'finish', ''),
  coalesce(elem->>'attachmentType', ''),
  coalesce(elem->>'attachmentName', ''),
  coalesce(elem->>'storesKind', '')
from app_storage, jsonb_array_elements(value::jsonb) as elem
where key = 'stock-items-v3'
  and elem->>'id' is not null
on conflict (id) do nothing;
