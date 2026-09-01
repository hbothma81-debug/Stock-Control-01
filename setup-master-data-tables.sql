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
