-- ============================================================
-- setup-ALL.sql — complete database setup, generated file
--
-- Created by build-test-database.sh on 2026-09-02.
-- Do not edit by hand; edit the individual setup-*.sql files
-- and re-run the script instead.
--
-- Paste the whole thing into Supabase -> SQL Editor -> Run.
-- Every statement uses "if not exists", so running it twice is safe.
-- ============================================================


-- ============================================================
-- supabase-setup.sql
-- ============================================================
-- Run this once in your Supabase project's SQL Editor (Supabase dashboard →
-- SQL Editor → New query → paste this whole file → Run).
--
-- This replaces the old shared-PIN "department" system with real, individual
-- sign-in. Every person who uses the app creates their own account (email +
-- password) via Supabase's built-in authentication. This table stores what
-- each person is allowed to do.

-- 1. The shared app data (stock, requisitions, master library) — same as before.
create table if not exists app_storage (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- 2. One row per person, created automatically the moment they sign up.
-- Brand new accounts start with zero permissions and are not admin — an
-- existing admin has to switch them on in the app's User Management screen
-- (or you, manually, for the very first admin — see the deploy guide).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  is_admin boolean not null default false,
  permissions jsonb not null default '{"plate":{"view":false,"edit":false},"structural":{"view":false,"edit":false},"custom":{"view":false,"edit":false},"stores":{"view":false,"edit":false}}',
  can_add_items boolean not null default false,
  can_edit_items boolean not null default false,
  can_requisition boolean not null default false,
  can_mark_received boolean not null default false,
  can_see_value boolean not null default false,
  can_access_stock_manager boolean not null default false,
  can_manage_requisitions boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. Auto-create a blank profile row whenever someone signs up, so they
-- immediately show up in User Management for an admin to grant access to.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Security rules.
alter table app_storage enable row level security;
alter table profiles enable row level security;

-- You must be signed in to touch the shared stock data at all — this is the
-- real security boundary now, replacing the old "anyone with the PIN" model.
create policy "Signed-in users can read app data" on app_storage
  for select using (auth.role() = 'authenticated');
create policy "Signed-in users can write app data" on app_storage
  for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update app data" on app_storage
  for update using (auth.role() = 'authenticated');
create policy "Signed-in users can delete app data" on app_storage
  for delete using (auth.role() = 'authenticated');

-- Everyone signed in can see the list of people (so an admin can browse and
-- grant access, and so the app can look up your own permissions after login).
create policy "Signed-in users can read profiles" on profiles
  for select using (auth.role() = 'authenticated');

-- Only an existing admin can change anyone's permissions or admin status.
create policy "Admins can update profiles" on profiles
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true)
  );


-- ============================================================
-- setup-backfill-missing-profiles.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Fixes two things:
-- 1. Backfills a profiles row for anyone who already has a real login
--    (auth.users) but is missing the matching profiles row — this is what
--    makes them invisible in User Management even though they can log in
--    fine. Safe to run any time: only inserts rows that don't already
--    exist, never touches anyone who's already showing up correctly.
-- 2. Re-asserts the trigger that's supposed to create this row
--    automatically for every future signup, in case it was never active
--    on this project or got dropped at some point. Safe to re-run even if
--    it's already there.

insert into public.profiles (id, name, email)
select id, coalesce(raw_user_meta_data->>'name', ''), email
from auth.users
where id not in (select id from public.profiles);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================
-- setup-stock-items-table.sql
-- ============================================================
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


-- ============================================================
-- setup-master-data-tables.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Requires setup-stock-items-table.sql to have been run first — this
-- script's final step migrates any leftover Stock Codes entries into the
-- stock_items table that script creates.
--
-- Part 2 of moving core data off the shared-blob pattern onto real,
-- individual rows. Master data (grades, sizes, customers, suppliers,
-- categories, and everything else configured in Stock Manager) covers a
-- lot of different shapes, so rather than one table per list (15+ tables),
-- this groups by shape: one table for simple named lists, one for
-- name/factor/price lists, and separate tables for the few things with
-- their own distinct shape (suppliers, stores catalog, customer contacts,
-- company details, running counters). Each individual entry is still its
-- own row either way — adding one customer, one grade, one supplier only
-- ever touches that one row, never anything else.
--
-- ids stay text throughout, matching stock_items and the rest of the app —
-- existing ids were never real UUIDs.

-- Simple named lists: sizes, section types, sales people, customers, staff
-- departments, job process types, store categories, fastener categories/
-- grades/finishes, sheet names. One row per entry per list.
create table if not exists master_string_lists (
  id text primary key,
  list_name text not null,
  value text not null,
  created_at timestamptz not null default now()
);
create index if not exists master_string_lists_name_idx on master_string_lists (list_name);

-- name/factor/price lists: sections, grades, cnc grades. "type" is only
-- used by sections (the section-type grouping); null for the others.
create table if not exists master_factor_items (
  id text primary key,
  list_name text not null,
  name text not null,
  factor numeric not null default 0,
  price numeric not null default 0,
  type text,
  created_at timestamptz not null default now()
);
create index if not exists master_factor_items_name_idx on master_factor_items (list_name);

create table if not exists master_suppliers (
  id text primary key,
  name text not null,
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  logo text not null default '',
  vat_number text not null default '',
  created_at timestamptz not null default now()
);

-- A supplier can have several contact people (sales rep, accounts, etc.),
-- each their own row rather than nested inside the supplier's own row.
create table if not exists master_supplier_contacts (
  id text primary key,
  supplier_id text not null references master_suppliers(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists master_supplier_contacts_supplier_idx on master_supplier_contacts (supplier_id);

create table if not exists master_stores_catalog (
  id text primary key,
  code text not null default '',
  name text not null default '',
  category text not null default '',
  supplier text not null default '',
  price numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists master_customer_contacts (
  id text primary key,
  customer_name text not null,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists master_customer_contacts_customer_idx on master_customer_contacts (customer_name);

-- Single row, fixed id — there's only ever one company.
create table if not exists master_company_details (
  id int primary key default 1,
  name text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  vat_number text not null default '',
  reg_number text not null default '',
  constraint single_row check (id = 1)
);

-- Running counters (next job number, next PO number, etc.) — one row per
-- counter, so incrementing one can never touch or race against another.
create table if not exists master_counters (
  counter_name text primary key,
  value int not null default 1
);

alter table master_string_lists enable row level security;
alter table master_factor_items enable row level security;
alter table master_suppliers enable row level security;
alter table master_supplier_contacts enable row level security;
alter table master_stores_catalog enable row level security;
alter table master_customer_contacts enable row level security;
alter table master_company_details enable row level security;
alter table master_counters enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['master_string_lists', 'master_factor_items', 'master_suppliers', 'master_supplier_contacts', 'master_stores_catalog', 'master_customer_contacts', 'master_company_details', 'master_counters']
  loop
    execute format('drop policy if exists "Signed-in users can read %s" on %I', t, t);
    execute format('create policy "Signed-in users can read %s" on %I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('drop policy if exists "Signed-in users can insert %s" on %I', t, t);
    execute format('create policy "Signed-in users can insert %s" on %I for insert with check (auth.role() = ''authenticated'')', t, t);
    execute format('drop policy if exists "Signed-in users can update %s" on %I', t, t);
    execute format('create policy "Signed-in users can update %s" on %I for update using (auth.role() = ''authenticated'')', t, t);
    execute format('drop policy if exists "Signed-in users can delete %s" on %I', t, t);
    execute format('create policy "Signed-in users can delete %s" on %I for delete using (auth.role() = ''authenticated'')', t, t);
  end loop;
end $$;

-- Data migration: copy everything out of the existing shared blob into its
-- real table. Safe to run more than once — every insert below skips rows
-- that already exist rather than duplicating or overwriting them.

-- Simple string lists — one insert per list, all from the same jsonb blob.
insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'sizes', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'sizes', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'sectionTypes', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'sectionTypes', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'salesPeople', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'salesPeople', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'customers', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'customers', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'staffDepartments', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'staffDepartments', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'jobProcessTypes', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'jobProcessTypes', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'storeCategories', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'storeCategories', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'fastenerCategories', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'fastenerCategories', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'fastenerGrades', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'fastenerGrades', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'fastenerFinishes', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'fastenerFinishes', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_string_lists (id, list_name, value)
select gen_random_uuid()::text, 'sheetNames', elem
from app_storage, jsonb_array_elements_text(coalesce(value::jsonb -> 'sheetNames', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

-- name/factor/price lists.
insert into master_factor_items (id, list_name, name, factor, price, type)
select gen_random_uuid()::text, 'sections', elem->>'name', coalesce((elem->>'factor')::numeric, 0), coalesce((elem->>'price')::numeric, 0), elem->>'type'
from app_storage, jsonb_array_elements(coalesce(value::jsonb -> 'sections', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_factor_items (id, list_name, name, factor, price, type)
select gen_random_uuid()::text, 'grades', elem->>'name', coalesce((elem->>'factor')::numeric, 0), coalesce((elem->>'price')::numeric, 0), null
from app_storage, jsonb_array_elements(coalesce(value::jsonb -> 'grades', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

insert into master_factor_items (id, list_name, name, factor, price, type)
select
  gen_random_uuid()::text, 'cncGrades',
  case when jsonb_typeof(elem) = 'string' then elem #>> '{}' else elem->>'name' end,
  case when jsonb_typeof(elem) = 'string' then 0 else coalesce((elem->>'factor')::numeric, 0) end,
  case when jsonb_typeof(elem) = 'string' then 0 else coalesce((elem->>'price')::numeric, 0) end,
  null
from app_storage, jsonb_array_elements(coalesce(value::jsonb -> 'cncGrades', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

-- Suppliers — some very old entries were saved as bare strings before
-- suppliers gained these extra fields; coalesce handles both shapes.
insert into master_suppliers (id, name, email, phone, address, logo, vat_number)
select
  coalesce(elem->>'id', gen_random_uuid()::text),
  case when jsonb_typeof(elem) = 'string' then elem #>> '{}' else elem->>'name' end,
  coalesce(elem->>'email', ''),
  coalesce(elem->>'phone', ''),
  coalesce(elem->>'address', ''),
  coalesce(elem->>'logo', ''),
  coalesce(elem->>'vatNumber', '')
from app_storage, jsonb_array_elements(coalesce(value::jsonb -> 'suppliers', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

-- Supplier contacts — nested inside each supplier's own record in the old
-- blob, each now its own row.
insert into master_supplier_contacts (id, supplier_id, name, email)
select
  coalesce(contact->>'id', gen_random_uuid()::text),
  elem->>'id',
  coalesce(contact->>'name', ''),
  coalesce(contact->>'email', '')
from app_storage,
  jsonb_array_elements(coalesce(value::jsonb -> 'suppliers', '[]'::jsonb)) as elem,
  jsonb_array_elements(coalesce(elem -> 'contacts', '[]'::jsonb)) as contact
where key = 'stock-master-data-v2'
  and elem->>'id' is not null
on conflict (id) do nothing;

-- Stores catalog.
insert into master_stores_catalog (id, code, name, category, supplier, price)
select
  coalesce(elem->>'id', gen_random_uuid()::text),
  coalesce(elem->>'code', ''),
  coalesce(elem->>'name', ''),
  coalesce(elem->>'category', ''),
  coalesce(elem->>'supplier', ''),
  coalesce((elem->>'price')::numeric, 0)
from app_storage, jsonb_array_elements(coalesce(value::jsonb -> 'storesCatalog', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

-- Customer contacts — a dictionary keyed by customer name, each value a
-- list of contacts, so this needs two levels of unnesting.
insert into master_customer_contacts (id, customer_name, name, email, phone)
select
  coalesce(contact->>'id', gen_random_uuid()::text),
  cust_key,
  coalesce(contact->>'name', ''),
  coalesce(contact->>'email', ''),
  coalesce(contact->>'phone', '')
from app_storage,
  jsonb_each(coalesce(value::jsonb -> 'customerContacts', '{}'::jsonb)) as cc(cust_key, contacts),
  jsonb_array_elements(contacts) as contact
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

-- Company details — single row.
insert into master_company_details (id, name, address, phone, email, vat_number, reg_number)
select
  1,
  coalesce(value::jsonb -> 'companyDetails' ->> 'name', ''),
  coalesce(value::jsonb -> 'companyDetails' ->> 'address', ''),
  coalesce(value::jsonb -> 'companyDetails' ->> 'phone', ''),
  coalesce(value::jsonb -> 'companyDetails' ->> 'email', ''),
  coalesce(value::jsonb -> 'companyDetails' ->> 'vatNumber', ''),
  coalesce(value::jsonb -> 'companyDetails' ->> 'regNumber', '')
from app_storage
where key = 'stock-master-data-v2'
on conflict (id) do nothing;

-- Counters.
insert into master_counters (counter_name, value)
select 'nextJobNumber', coalesce((value::jsonb ->> 'nextJobNumber')::int, 1) from app_storage where key = 'stock-master-data-v2'
on conflict (counter_name) do nothing;
insert into master_counters (counter_name, value)
select 'nextDeliveryNoteNumber', coalesce((value::jsonb ->> 'nextDeliveryNoteNumber')::int, 1) from app_storage where key = 'stock-master-data-v2'
on conflict (counter_name) do nothing;
insert into master_counters (counter_name, value)
select 'nextFastenerNumber', coalesce((value::jsonb ->> 'nextFastenerNumber')::int, 1) from app_storage where key = 'stock-master-data-v2'
on conflict (counter_name) do nothing;
insert into master_counters (counter_name, value)
select 'nextToolNumber', coalesce((value::jsonb ->> 'nextToolNumber')::int, 1) from app_storage where key = 'stock-master-data-v2'
on conflict (counter_name) do nothing;
insert into master_counters (counter_name, value)
select 'nextPoNumber', coalesce((value::jsonb ->> 'nextPoNumber')::int, 1) from app_storage where key = 'stock-master-data-v2'
on conflict (counter_name) do nothing;

-- Stock Codes was retired a while back in favor of real Customer Stock
-- items, and the app has been auto-converting any leftover entries on
-- every load since — so this is very likely already empty, but any
-- straggler gets carried into stock_items now rather than silently
-- dropped once this migration removes the app's read access to the old
-- blob. Matches the app's own existing conversion logic: skip if a real
-- item already exists with the same part number and customer, at qty 0
-- since a price-list import never carried a real on-hand count.
insert into stock_items (id, main_cat, customer, part_number, name, grade, qty, value, low, loc, comment, sales_person)
select
  gen_random_uuid()::text,
  'custom',
  coalesce(elem->>'customer', ''),
  coalesce(elem->>'stockCode', ''),
  coalesce(elem->>'description', elem->>'stockCode', ''),
  '',
  0,
  coalesce((elem->>'price')::numeric, 0),
  coalesce((elem->>'recommendedStock')::numeric, 0),
  '',
  '',
  ''
from app_storage, jsonb_array_elements(coalesce(value::jsonb -> 'stockCodes', '[]'::jsonb)) as elem
where key = 'stock-master-data-v2'
  and not exists (
    select 1 from stock_items si
    where si.main_cat = 'custom'
      and lower(si.part_number) = lower(coalesce(elem->>'stockCode', ''))
      and si.customer = coalesce(elem->>'customer', '')
  );


-- ============================================================
-- setup-master-factor-short-name.sql
-- ============================================================
-- Adds the missing short_name column to master_factor_items. grades is the
-- only one of the three factor lists (sections, grades, cncGrades) that
-- ever had a short name field in the app — it was simply never added to
-- this table when it was first created, so every short name entered was
-- silently discarded on save: it only ever existed in memory, gone the
-- moment anything refreshed from the database.
-- Safe to run again if already applied.

alter table master_factor_items add column if not exists short_name text;


-- ============================================================
-- setup-jobs.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Sets up the Jobs system: a real relational structure (not the JSON-blob
-- pattern) because jobs need genuine multi-user coordination — a floor
-- manager ticking progress while a salesperson is watching their own
-- notifications — which a shared JSON blob handles poorly at this scale.

-- 1. Documents attached to jobs (quote PDF/Excel, laser files) — same
-- reasoning as Drawings and Asset History: real file storage, not a blob.
insert into storage.buckets (id, name, public)
values ('job-documents', 'job-documents', false)
on conflict (id) do nothing;

create policy "Signed-in users can read job documents"
  on storage.objects for select
  using (bucket_id = 'job-documents' and auth.role() = 'authenticated');
create policy "Signed-in users can upload job documents"
  on storage.objects for insert
  with check (bucket_id = 'job-documents' and auth.role() = 'authenticated');
create policy "Signed-in users can delete job documents"
  on storage.objects for delete
  using (bucket_id = 'job-documents' and auth.role() = 'authenticated');

-- 2. The job itself.
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  customer text,
  status text not null default 'in_progress', -- in_progress | complete | invoiced | cancelled
  sales_rep text,
  qty numeric,
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
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists jobs_sales_rep_idx on jobs (sales_rep);
create index if not exists jobs_customer_idx on jobs (customer);

-- 3. The process checklist — one row per selected process per job, so a
-- laser-only job simply has fewer rows than a full fabrication job instead
-- of a fixed twenty-item list every time.
create table if not exists job_processes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  process_name text not null,
  operator text,
  is_complete boolean not null default false,
  completed_by text,
  completed_at timestamptz,
  notes text,
  sort_order integer not null default 0
);

create index if not exists job_processes_job_id_idx on job_processes (job_id);

-- 4. Documents metadata (the actual files live in the bucket above).
create table if not exists job_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create index if not exists job_documents_job_id_idx on job_documents (job_id);

-- 5. Notifications — created automatically when a process is marked
-- complete, routed to that job's Sales Rep.
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

-- RLS — same open-to-any-authenticated-user pattern as every other table
-- built this session; the app's own permission system controls who sees
-- what within the UI.
alter table jobs enable row level security;
alter table job_processes enable row level security;
alter table job_documents enable row level security;
alter table job_notifications enable row level security;

create policy "Signed-in users can read jobs" on jobs for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add jobs" on jobs for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update jobs" on jobs for update using (auth.role() = 'authenticated');
create policy "Signed-in users can delete jobs" on jobs for delete using (auth.role() = 'authenticated');

create policy "Signed-in users can read job processes" on job_processes for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add job processes" on job_processes for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update job processes" on job_processes for update using (auth.role() = 'authenticated');
create policy "Signed-in users can delete job processes" on job_processes for delete using (auth.role() = 'authenticated');

create policy "Signed-in users can read job documents rows" on job_documents for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add job documents rows" on job_documents for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can delete job documents rows" on job_documents for delete using (auth.role() = 'authenticated');

create policy "Signed-in users can read job notifications" on job_notifications for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add job notifications" on job_notifications for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update job notifications" on job_notifications for update using (auth.role() = 'authenticated');


-- ============================================================
-- setup-jobs-COMBINED.sql
-- ============================================================
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


-- ============================================================
-- setup-jobs-quote-items.sql
-- ============================================================
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


-- ============================================================
-- setup-jobs-item-linking.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds linking a quoted item to a real Customer Stock item, so price stays
-- in sync both ways and available stock/revision can be shown. Run on top
-- of the earlier setup-jobs*.sql files.

alter table job_quote_items add column if not exists linked_item_id text;


-- ============================================================
-- setup-jobs-item-tracking.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds real item-level tracking to a job: status per quoted item (on the
-- floor, sent out to an external supplier, ready to invoice, invoiced),
-- and links a delivery note to the specific item it's carrying.

alter table job_quote_items add column if not exists item_status text not null default 'on_floor';
-- item_status values: on_floor | out_external | ready_to_invoice | invoiced

alter table delivery_notes add column if not exists quote_item_id uuid references job_quote_items(id) on delete set null;
alter table delivery_notes add column if not exists direction text not null default 'to_supplier';
-- direction values: to_supplier | to_customer

alter table delivery_notes add column if not exists checked_back_in_at timestamptz;
alter table delivery_notes add column if not exists checked_back_in_by text;


-- ============================================================
-- setup-jobs-qty.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds quantity-complete tracking to Jobs — for batched deliveries, where
-- a floor manager or machine operator reports how many units are actually
-- done over time, separate from the original target quantity.

alter table jobs add column if not exists qty_complete numeric not null default 0;

create table if not exists job_qty_updates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  qty_reported numeric not null,
  reported_by text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists job_qty_updates_job_id_idx on job_qty_updates (job_id);

alter table job_qty_updates enable row level security;
create policy "Signed-in users can read qty updates" on job_qty_updates for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add qty updates" on job_qty_updates for insert with check (auth.role() = 'authenticated');


-- ============================================================
-- setup-jobs-qty-tracking.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds quantity-progress tracking to Jobs — a running total the floor
-- manager/operator logs against as batches get completed, rather than a
-- single number set once. Needed on top of setup-jobs.sql.

alter table jobs add column if not exists qty_complete numeric not null default 0;

create table if not exists job_qty_updates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  qty_reported numeric not null,
  reported_by text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists job_qty_updates_job_id_idx on job_qty_updates (job_id);

alter table job_qty_updates enable row level security;

create policy "Signed-in users can read job qty updates" on job_qty_updates for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add job qty updates" on job_qty_updates for insert with check (auth.role() = 'authenticated');


-- ============================================================
-- setup-jobs-invoice-number.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds the real invoice number captured when a job is marked invoiced.

alter table jobs add column if not exists invoice_number text;


-- ============================================================
-- setup-process-assignment.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- 1. A real connection from a process to an actual person, not just a
--    name typed in a text box — this is what makes a genuine "assigned to
--    you" notification possible, and gives each process someone
--    accountable for completing it.
alter table job_processes add column if not exists assigned_to uuid references profiles(id) on delete set null;

-- 2. Notifications were only ever built for sales people (targeted by
--    name, via sales_rep). A process can be assigned to anyone — floor
--    staff, not just sales — so notifications need a real recipient
--    column, not a role-specific one. The existing sales_rep column and
--    everything that already uses it is untouched; this is additive.
alter table job_notifications add column if not exists recipient_id uuid references profiles(id) on delete cascade;


-- ============================================================
-- setup-process-documents.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Lets a document uploaded from the Production tab be tagged with which
-- process it came from (e.g. Nesting), so it can be shown on that
-- process's card specifically.

alter table job_documents add column if not exists process_name text;

-- Flags the original quote file uploaded at job creation, so it can be
-- restricted to sales people only — everyone else sees the rest of a
-- job's documents as normal, just not this one.
alter table job_documents add column if not exists is_quote_file boolean not null default false;


-- ============================================================
-- setup-process-notes.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Optional free-text notes per process, per job — shown on the
-- Production tab, across every process type.

alter table job_processes add column if not exists notes text;


-- ============================================================
-- setup-process-tracking-mode.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Per-job, per-process tracking mode: "batch" (one tick, whole line done)
-- or "each" (a running count against the item's quantity, auto-completing
-- once it reaches the total).

alter table job_processes add column if not exists tracking_mode text not null default 'batch';
alter table job_processes add column if not exists qty_complete numeric not null default 0;


-- ============================================================
-- setup-process-item-progress.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Tracks "Each" mode progress per job item, not lumped together as one
-- combined count per process — matches how the printed process sheet
-- lists items individually.

create table if not exists job_process_item_progress (
  id uuid primary key default gen_random_uuid(),
  job_process_id uuid not null references job_processes(id) on delete cascade,
  job_quote_item_id uuid not null references job_quote_items(id) on delete cascade,
  qty_complete numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (job_process_id, job_quote_item_id)
);

create index if not exists job_process_item_progress_process_idx on job_process_item_progress(job_process_id);

-- Same access pattern as every other table in this app: RLS on, any
-- signed-in user has full access. Without this, RLS with no policy at
-- all blocks everyone, including the app itself.
alter table job_process_item_progress enable row level security;

create policy "Signed-in users can read process item progress" on job_process_item_progress for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add process item progress" on job_process_item_progress for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update process item progress" on job_process_item_progress for update using (auth.role() = 'authenticated');
create policy "Signed-in users can delete process item progress" on job_process_item_progress for delete using (auth.role() = 'authenticated');


-- ============================================================
-- setup-production-priority-shortage.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds per-process priority flagging and shortage tracking for the
-- Production tab.

alter table job_processes add column if not exists is_urgent boolean not null default false;
alter table job_processes add column if not exists has_shortage boolean not null default false;
alter table job_processes add column if not exists shortage_note text;
alter table job_processes add column if not exists shortage_flagged_by text;
alter table job_processes add column if not exists shortage_flagged_at timestamptz;


-- ============================================================
-- setup-invoicing-delivery.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds the invoicing completion stamp, an external supplier field per job
-- process, and delivery notes (customer or external-supplier deliveries).

alter table jobs add column if not exists invoiced_by text;
alter table jobs add column if not exists invoiced_at timestamptz;

-- Chosen fresh per job, per process — not a fixed default per process type.
alter table job_processes add column if not exists external_supplier text;

-- Delivery notes — standalone printable documents, kept as real records for
-- an audit trail same as everything else. Line items are picked fresh each
-- time, not a locked mirror of the job's quoted items.
create table if not exists delivery_notes (
  id uuid primary key default gen_random_uuid(),
  delivery_note_number text not null unique,
  job_id uuid references jobs(id) on delete set null,
  recipient_type text not null, -- customer | supplier
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

alter table delivery_notes enable row level security;
alter table delivery_note_items enable row level security;

create policy "Signed-in users can read delivery notes" on delivery_notes for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add delivery notes" on delivery_notes for insert with check (auth.role() = 'authenticated');

create policy "Signed-in users can read delivery note items" on delivery_note_items for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add delivery note items" on delivery_note_items for insert with check (auth.role() = 'authenticated');


-- ============================================================
-- setup-job-invoice-requests.sql
-- ============================================================
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


-- ============================================================
-- setup-generated-documents.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- One consistent audit trail for every document the app generates,
-- regardless of type (process sheet, delivery note, invoice request,
-- purchase order, PO report) — a single place to browse or search
-- everything that's ever been created, separate from each document
-- type's own workflow-specific table (delivery_notes, job_invoice_requests),
-- which keep tracking their own richer detail unchanged.

create table if not exists generated_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  bucket text not null,
  storage_path text not null,
  file_name text not null,
  job_id uuid references jobs(id) on delete set null,
  related_id text,
  generated_by text,
  generated_at timestamptz not null default now()
);

create index if not exists generated_documents_job_idx on generated_documents(job_id);
create index if not exists generated_documents_type_idx on generated_documents(document_type);

alter table generated_documents enable row level security;

create policy "Signed-in users can read generated documents" on generated_documents for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add generated documents" on generated_documents for insert with check (auth.role() = 'authenticated');


-- ============================================================
-- setup-shortages-table.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Replaces the old, thin shortage flag (a yes/no on one process, one free
-- text note, notified the sales rep) with a real, independent record.
-- A job can have several separate shortages over its life — one part
-- damaged in bending, another missing at packing — each needing its own
-- board number, quantity, reason, and its own two-step tracking through
-- Nesting then the Laser Operator. A single boolean on job_processes could
-- never represent that.

create table if not exists shortages (
  id text primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  job_number text not null default '',
  customer text not null default '',
  flagged_by text not null default '',
  flagged_by_id uuid references profiles(id) on delete set null,
  flagged_department text not null default '',
  board_number text not null default '',
  description text not null default '',
  qty numeric not null default 0,
  reason text not null default '',
  status text not null default 'flagged', -- flagged -> nested -> cut (cut = fully resolved)
  nested_by text not null default '',
  nested_at text not null default '',
  cut_by text not null default '',
  cut_at text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists shortages_status_idx on shortages (status);
create index if not exists shortages_job_id_idx on shortages (job_id);

alter table shortages enable row level security;

drop policy if exists "Signed-in users can read shortages" on shortages;
create policy "Signed-in users can read shortages" on shortages
  for select using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can insert shortages" on shortages;
create policy "Signed-in users can insert shortages" on shortages
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can update shortages" on shortages;
create policy "Signed-in users can update shortages" on shortages
  for update using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can delete shortages" on shortages;
create policy "Signed-in users can delete shortages" on shortages
  for delete using (auth.role() = 'authenticated');

-- One or more people can be the designated shortage handler(s) — always
-- notified when a shortage is flagged, regardless of which job it's on or
-- who (if anyone) is currently assigned to Nesting there.
alter table profiles add column if not exists is_shortage_handler boolean not null default false;


-- ============================================================
-- setup-requisitions-table.sql
-- ============================================================
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


-- ============================================================
-- setup-purchase-orders-table.sql
-- ============================================================
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


-- ============================================================
-- setup-drawings.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Sets up everything Drawing Management needs: a proper file storage bucket
-- for the actual PDFs, and a real database table for the lightweight
-- metadata (part number, customer, revisions, which file it points to).
--
-- Why a separate storage bucket instead of the app_storage table everything
-- else uses: that table holds JSON blobs of text, and rewrites the whole
-- blob on every save. Fine for stock data, wrong tool for potentially
-- hundreds of PDF files — this keeps drawings fast to load and cheap to
-- update regardless of how many you have.

-- 1. The actual PDF files live here — private, not publicly accessible.
insert into storage.buckets (id, name, public)
values ('drawings', 'drawings', false)
on conflict (id) do nothing;

-- Anyone signed in can read a drawing file or upload/replace one. The app
-- itself controls who actually sees the Drawings section via the same
-- permission system as everything else — this is just "you must be logged
-- in at all" as the outer boundary, same as the rest of the app's data.
create policy "Signed-in users can read drawing files"
  on storage.objects for select
  using (bucket_id = 'drawings' and auth.role() = 'authenticated');

create policy "Signed-in users can upload drawing files"
  on storage.objects for insert
  with check (bucket_id = 'drawings' and auth.role() = 'authenticated');

create policy "Signed-in users can update drawing files"
  on storage.objects for update
  using (bucket_id = 'drawings' and auth.role() = 'authenticated');

create policy "Signed-in users can delete drawing files"
  on storage.objects for delete
  using (bucket_id = 'drawings' and auth.role() = 'authenticated');

-- 2. The metadata about each drawing — a real table, not a JSON blob, so it
-- can be searched and filtered properly as the library grows.
create table if not exists drawings (
  id uuid primary key default gen_random_uuid(),
  part_number text not null,
  customer text,
  internal_revision integer not null default 1,
  customer_revision text,
  storage_path text not null,
  file_name text not null,
  status text not null default 'current', -- 'current' | 'superseded'
  linked_item_id text,
  description text,
  price numeric,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create index if not exists drawings_part_number_idx on drawings (part_number);
create index if not exists drawings_customer_idx on drawings (customer);

alter table drawings enable row level security;

create policy "Signed-in users can read drawings" on drawings
  for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add drawings" on drawings
  for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update drawings" on drawings
  for update using (auth.role() = 'authenticated');
create policy "Signed-in users can delete drawings" on drawings
  for delete using (auth.role() = 'authenticated');


-- ============================================================
-- setup-asset-history.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Sets up Asset Management's history log: a real table (not the JSON-blob
-- pattern) because entries can carry a photo or file attachment, same
-- reasoning as the Drawings feature — this keeps the app fast regardless
-- of how many maintenance entries and photos pile up over time.

-- 1. Attachments (photos, invoices, reports) for maintenance entries.
insert into storage.buckets (id, name, public)
values ('asset-attachments', 'asset-attachments', false)
on conflict (id) do nothing;

create policy "Signed-in users can read asset attachments"
  on storage.objects for select
  using (bucket_id = 'asset-attachments' and auth.role() = 'authenticated');

create policy "Signed-in users can upload asset attachments"
  on storage.objects for insert
  with check (bucket_id = 'asset-attachments' and auth.role() = 'authenticated');

create policy "Signed-in users can delete asset attachments"
  on storage.objects for delete
  using (bucket_id = 'asset-attachments' and auth.role() = 'authenticated');

-- 2. The history log itself — one row per note or meter reading, per asset.
create table if not exists asset_history (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  entry_type text not null default 'note', -- 'note' | 'meter_reading'
  note text,
  hours_reading numeric,
  km_reading numeric,
  attachment_path text,
  attachment_name text,
  logged_by text,
  created_at timestamptz not null default now()
);

create index if not exists asset_history_item_id_idx on asset_history (item_id);

alter table asset_history enable row level security;

create policy "Signed-in users can read asset history" on asset_history
  for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add asset history" on asset_history
  for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can delete asset history" on asset_history
  for delete using (auth.role() = 'authenticated');


-- ============================================================
-- setup-asset-service-and-repairs.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Two additions to Asset Management:
--
-- 1. A "service" entry type on the existing asset_history log, carrying
--    the list of consumables used (Stores items and custom entries alike)
--    as a small JSON list — bounded and always read/written as a whole,
--    same reasoning as purchase_orders.line_items elsewhere in this app,
--    not something that needs its own relational table.
--
-- 2. A new asset_repairs table — a per-asset list of small problems
--    flagged for later attention, separate from the history log because
--    unlike history it has real state: open vs resolved.

alter table asset_history add column if not exists consumables jsonb;

create table if not exists asset_repairs (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  description text not null,
  status text not null default 'open', -- 'open' | 'resolved'
  logged_by text,
  created_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz
);

create index if not exists asset_repairs_item_id_idx on asset_repairs (item_id);

alter table asset_repairs enable row level security;

create policy "Signed-in users can read asset repairs" on asset_repairs
  for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add asset repairs" on asset_repairs
  for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update asset repairs" on asset_repairs
  for update using (auth.role() = 'authenticated');
create policy "Signed-in users can delete asset repairs" on asset_repairs
  for delete using (auth.role() = 'authenticated');


-- ============================================================
-- setup-usage-log-table.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Part 5, the last one, of moving core data off the shared-blob pattern
-- onto real, individual rows. Usage log specifically — every stock
-- add/use/receive event, one row each.
--
-- This is a pure append-only log — verified across every place in the app
-- that writes to it (four separate creation sites, all append-only, none
-- ever edit or delete an existing entry afterward). cutLength/cutPieces
-- are the one field pair that isn't always present — only set when the
-- Track Length cutting flow is what created the entry.

create table if not exists usage_log (
  id text primary key,
  item_id text not null default '',
  item_name text not null default '',
  main_cat text not null default '',
  qty numeric not null default 0,
  cut_length numeric,
  cut_pieces numeric,
  direction text not null default '',
  "by" text not null default '',
  job_number text not null default '',
  customer text not null default '',
  note text not null default '',
  line_cost numeric not null default 0,
  timestamp text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists usage_log_item_id_idx on usage_log (item_id);
create index if not exists usage_log_timestamp_idx on usage_log (timestamp);

alter table usage_log enable row level security;

drop policy if exists "Signed-in users can read usage log" on usage_log;
create policy "Signed-in users can read usage log" on usage_log
  for select using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can insert usage log" on usage_log;
create policy "Signed-in users can insert usage log" on usage_log
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can update usage log" on usage_log;
create policy "Signed-in users can update usage log" on usage_log
  for update using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can delete usage log" on usage_log;
create policy "Signed-in users can delete usage log" on usage_log
  for delete using (auth.role() = 'authenticated');

-- Data migration: copy every log entry out of the existing shared blob
-- into its own real row. Safe to run more than once — on conflict does
-- nothing, so a re-run never duplicates or overwrites anything.
insert into usage_log (
  id, item_id, item_name, main_cat, qty, cut_length, cut_pieces,
  direction, "by", job_number, customer, note, line_cost, timestamp
)
select
  elem->>'id',
  coalesce(elem->>'itemId', ''),
  coalesce(elem->>'itemName', ''),
  coalesce(elem->>'mainCat', ''),
  coalesce((elem->>'qty')::numeric, 0),
  (elem->>'cutLength')::numeric,
  (elem->>'cutPieces')::numeric,
  coalesce(elem->>'direction', ''),
  coalesce(elem->>'by', ''),
  coalesce(elem->>'jobNumber', ''),
  coalesce(elem->>'customer', ''),
  coalesce(elem->>'note', ''),
  coalesce((elem->>'lineCost')::numeric, 0),
  coalesce(elem->>'timestamp', '')
from app_storage, jsonb_array_elements(coalesce(value::jsonb, '[]'::jsonb)) as elem
where key = 'stock-usage-log-v1'
  and elem->>'id' is not null
on conflict (id) do nothing;


-- ============================================================
-- setup-production-access.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds real, enforced access to specific process types (not just the
-- free-text Department label) — this is what gates the new Production tab.

alter table profiles add column if not exists allowed_process_types jsonb not null default '[]'::jsonb;


-- ============================================================
-- setup-profiles-sales-department.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds three columns the app was built assuming existed, but never
-- actually had matching SQL provided: the "Is a Sales Person" toggle and
-- "Department" picker in User Management, and "Can manage Invoicing".

alter table profiles add column if not exists is_sales_person boolean not null default false;
alter table profiles add column if not exists department text;
alter table profiles add column if not exists can_manage_invoicing boolean not null default false;


-- ============================================================
-- add-purchase-order-permission.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds the new "Can raise Purchase Orders" permission to your existing
-- profiles table. Safe to run even if you're not sure — it does nothing
-- if the column already exists.

alter table profiles add column if not exists can_raise_po boolean not null default false;


-- ============================================================
-- add-usage-log-permission.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds the "Can view Usage Log" permission. Safe to run even if you're not
-- sure — it does nothing if the column already exists.

alter table profiles add column if not exists can_view_usage_log boolean not null default false;


-- ============================================================
-- setup-theme-preference.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Lets each person pick their own color theme (dark, medium, or light),
-- saved with their login so it's remembered wherever they sign in.

alter table profiles add column if not exists theme text not null default 'dark';

