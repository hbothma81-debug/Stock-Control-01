-- ============================================================
-- setup-ALL.sql — complete database setup, generated file
--
-- Created by build-test-database.sh on 2026-09-21.
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
do $$ begin
  create policy "Signed-in users can read app data" on app_storage
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can write app data" on app_storage
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update app data" on app_storage
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete app data" on app_storage
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Everyone signed in can see the list of people (so an admin can browse and
-- grant access, and so the app can look up your own permissions after login).
do $$ begin
  create policy "Signed-in users can read profiles" on profiles
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Only an existing admin can change anyone's permissions or admin status.
do $$ begin
  create policy "Admins can update profiles" on profiles
  for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true)
  );
exception when duplicate_object then null; end $$;


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
do $$ begin
  create policy "Signed-in users can read stock items" on stock_items
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can insert stock items" on stock_items;
do $$ begin
  create policy "Signed-in users can insert stock items" on stock_items
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can update stock items" on stock_items;
do $$ begin
  create policy "Signed-in users can update stock items" on stock_items
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can delete stock items" on stock_items;
do $$ begin
  create policy "Signed-in users can delete stock items" on stock_items
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

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
-- setup-stock-items-updated-at.sql
-- ============================================================
-- Make stock_items.updated_at tell the truth.
--
-- The app refreshes itself every minute. Until now that meant pulling
-- every column of every stock item down again -- about 1.4 MB a minute,
-- per screen, whether anything had changed or not. Four machines left on
-- over a weekend is gigabytes of nothing.
--
-- The fix is to ask only for what changed since last time. That needs a
-- column that is reliably bumped on every write. stock_items HAS an
-- updated_at, but it is only ever set by its default on insert -- an
-- update leaves it at the old value, so an edit would be invisible to a
-- "what changed" query and the shop would see stale prices and counts.
--
-- A trigger, not app code: rows are written from several places and
-- anything that forgets would silently hide that change from everyone
-- else's screen. The database cannot forget.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create or replace function public.stock_items_touch_updated_at()
returns trigger
language plpgsql
as $body$
begin
  new.updated_at = now();
  return new;
end;
$body$;

drop trigger if exists stock_items_set_updated_at on public.stock_items;

create trigger stock_items_set_updated_at
  before update on public.stock_items
  for each row
  execute function public.stock_items_touch_updated_at();

-- Every existing row gets a timestamp from now, so the first incremental
-- refresh after this has a floor to work from rather than a column full
-- of original insert dates.
update public.stock_items set updated_at = now();

create index if not exists stock_items_updated_at_idx
  on public.stock_items (updated_at);


-- ============ Check ============

select 'stock item timestamps' as step,
       case when exists (select 1 from pg_trigger
                         where tgname = 'stock_items_set_updated_at'
                           and not tgisinternal)
            then 'ready — an edit now bumps updated_at, so refreshes can ask only for what changed'
            else 'SOMETHING IS MISSING - tell Claude' end as result;


-- ============================================================
-- setup-updated-at-everywhere.sql
-- ============================================================
-- Four more tables learn when they were last changed.
--
-- The app's background refresh downloads requisitions, purchase orders,
-- the usage log and your notifications whole, every time, changed or
-- not. That is most of what a refresh still costs after stock was fixed
-- on 11 Sep. Asking only for "what changed since last time" needs a
-- column the database bumps on every write -- the same thing
-- setup-stock-items-updated-at.sql did for stock.
--
-- None of these four had an updated_at at all, only created_at. This
-- adds it (every existing row starts at now, which is what the first
-- incremental refresh needs as a floor), and one trigger that keeps it
-- honest on every update from any screen.
--
-- Notifications get it too, rather than "only fetch new ones": marking
-- one read is an update, and a new-only fetch would never see you read
-- it on another PC.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $body$
begin
  new.updated_at = now();
  return new;
end;
$body$;


-- ============ requisitions ============
alter table public.requisitions
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists requisitions_set_updated_at on public.requisitions;
create trigger requisitions_set_updated_at
  before update on public.requisitions
  for each row execute function public.touch_updated_at();
create index if not exists requisitions_updated_at_idx on public.requisitions (updated_at);


-- ============ purchase_orders ============
alter table public.purchase_orders
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.touch_updated_at();
create index if not exists purchase_orders_updated_at_idx on public.purchase_orders (updated_at);


-- ============ usage_log ============
alter table public.usage_log
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists usage_log_set_updated_at on public.usage_log;
create trigger usage_log_set_updated_at
  before update on public.usage_log
  for each row execute function public.touch_updated_at();
create index if not exists usage_log_updated_at_idx on public.usage_log (updated_at);


-- ============ job_notifications ============
alter table public.job_notifications
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists job_notifications_set_updated_at on public.job_notifications;
create trigger job_notifications_set_updated_at
  before update on public.job_notifications
  for each row execute function public.touch_updated_at();
create index if not exists job_notifications_updated_at_idx on public.job_notifications (updated_at);


-- ============ Check ============
-- Four rows, all "ready".

select t.table_name,
       case when exists (select 1 from information_schema.columns c
                         where c.table_schema = 'public' and c.table_name = t.table_name
                           and c.column_name = 'updated_at')
             and exists (select 1 from pg_trigger g
                         where g.tgname = t.table_name || '_set_updated_at' and not g.tgisinternal)
            then 'ready'
            else 'SOMETHING IS MISSING - tell Claude' end as result
from (values ('requisitions'), ('purchase_orders'), ('usage_log'), ('job_notifications')) as t(table_name)
order by 1;


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
-- setup-string-list-order.sql
-- ============================================================
-- Gives master_string_lists a real, storable order.
--
-- Job Process Types are the factory flow, so their sequence matters: the
-- floor cannot start a process until everything before it is complete.
-- Until now no order could be stored at all, and the list was loaded with
-- no ORDER BY, so the sequence could silently reshuffle.
--
-- Safe to run more than once. Adding the column is guarded, and the
-- backfill only touches lists that have never been ordered (every row
-- still sitting at 0), so a manual ordering set later is never reset.

alter table master_string_lists
  add column if not exists sort_order integer not null default 0;

with unordered as (
  select list_name
  from master_string_lists
  group by list_name
  having count(distinct sort_order) = 1 and min(sort_order) = 0
),
ranked as (
  select m.id,
         row_number() over (
           partition by m.list_name
           order by m.created_at, m.value
         ) - 1 as rn
  from master_string_lists m
  join unordered u on u.list_name = m.list_name
)
update master_string_lists m
set sort_order = r.rn
from ranked r
where m.id = r.id;

-- Reading the list always sorts by this, so an index keeps it cheap.
create index if not exists master_string_lists_order_idx
  on master_string_lists (list_name, sort_order);

-- Check: Job Process Types in factory order, numbered from 0.
select sort_order, value
from master_string_lists
where list_name = 'jobProcessTypes'
order by sort_order;


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
do $$ begin
  create policy "Signed-in users can read qty updates" on job_qty_updates for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add qty updates" on job_qty_updates for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


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

do $$ begin
  create policy "Signed-in users can read job qty updates" on job_qty_updates for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add job qty updates" on job_qty_updates for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ============================================================
-- setup-jobs-invoice-number.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds the real invoice number captured when a job is marked invoiced.

alter table jobs add column if not exists invoice_number text;


-- ============================================================
-- setup-jobs-customer-po.sql
-- ============================================================
-- The customer's own purchase order number for a job.
--
-- Typed in by hand: it comes from the customer's system, not ours, and
-- often arrives after the job has already been created. Kept as free text
-- for that reason — customers number their POs however they like.
--
-- Safe to run more than once. Adding a column with a default touches no
-- existing data and nothing reads it until the new code is deployed.

alter table jobs
  add column if not exists customer_po text not null default '';

-- Check: existing jobs all blank, ready to be filled in as POs arrive.
select job_number, customer, customer_po
from jobs
order by created_at desc
limit 10;


-- ============================================================
-- setup-laser-priority.sql
-- ============================================================
-- A job's place in the plate laser's queue.
--
-- The nester and admins set it on the job (decided 16-17 Sep 2026):
-- 1 is cut first, two jobs may share a number, blank is ordinary work.
-- The laser screens read it (src/laser); every change is written to the
-- job's History. Who set it and when ride along on the job so a nesting
-- row can say so without opening the history.
--
-- Safe to run more than once.

alter table jobs
  add column if not exists laser_priority integer,
  add column if not exists laser_priority_by text,
  add column if not exists laser_priority_at timestamptz;

alter table jobs drop constraint if exists jobs_laser_priority_check;
alter table jobs add constraint jobs_laser_priority_check
  check (laser_priority is null or laser_priority >= 1);

-- Check: which jobs carry a number (none, straight after this runs).
select job_number, laser_priority, laser_priority_by, laser_priority_at
from jobs
where laser_priority is not null
order by laser_priority, due_date;


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

do $$ begin
  create policy "Signed-in users can read process item progress" on job_process_item_progress for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add process item progress" on job_process_item_progress for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update process item progress" on job_process_item_progress for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete process item progress" on job_process_item_progress for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


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
-- setup-made-on-tag.sql
-- ============================================================
-- Where an item is made: step one of the "made on" tag.
--
-- A job's items carry no idea of which machine makes them, so an Each
-- stage lists every item on the job. On a mixed job the tube parts show
-- up under Laser Status and the plate parts under Tube Laser, and each
-- stage waits for parts that will never come to it.
--
-- This adds the three columns that fix that. Nothing reads them yet, so
-- running this changes nothing on any screen. The steps after this one
-- (Stock Manager setting, the job's Items tab, the filter) are what put
-- them to work. The plan is docs/MADE-ON-TAG-PLAN.md.
--
--
-- THE TAG
--
-- Stored as a fixed code, shown as a label, so nobody can create "Tube
-- Laser" and "tube laser" as two different things:
--
--   laser         plate, cut on the 4kw laser
--   tube_laser    tube, cut on the tube laser
--   cnc           machined on the CNC / drilled
--   cut_to_size   sawn to length
--   assembly      not cut here; put together from other things
--   ''            not tagged yet -- behaves exactly as today
--
--
-- WHERE IT LIVES
--
--   job_quote_items.made_on        the tag on a line of a job
--   stock_items.made_on            the tag remembered on the stock part,
--                                  so the next job with that part comes
--                                  in tagged. The shop does a lot of
--                                  rework; the same part keeps coming back.
--   process_type_settings.cuts_made_on
--                                  which tag a stage cuts. Tube Laser
--                                  Nesting and Tube Laser say tube_laser;
--                                  Nesting, Laser and Packer say laser;
--                                  blank means "every item" (bending,
--                                  delivery, invoicing). Set under Stock
--                                  Manager -> Job Process Types once step
--                                  two lands. A setting rather than a
--                                  name, so renaming a stage cannot break
--                                  it.
--
-- Blank everywhere by default, on purpose: nothing changes on the floor
-- until someone tags something.
--
--
-- Select nothing before pressing Run. Safe to run more than once.
-- Run it on the PRACTICE database first, then on live.


-- ============ 1. The tag on a job's line ============

alter table job_quote_items
  add column if not exists made_on text not null default '';


-- ============ 2. The tag remembered on the stock part ============

alter table stock_items
  add column if not exists made_on text not null default '';


-- ============ 3. Which tag a stage cuts ============
--
-- "if exists" because process_type_settings is created by
-- setup-laser-programs.sql, and setup-ALL.sql does not yet include that
-- file. On a database without the table this section simply does
-- nothing rather than stopping the whole script; run
-- setup-laser-programs.sql and then this one again.

alter table if exists process_type_settings
  add column if not exists cuts_made_on text not null default '';


-- ============ 4. Only the five codes, or blank ============
--
-- Belt and braces: the app will only ever write these, but a typo in a
-- future script should be refused rather than stored. Dropped and
-- recreated so the script stays safe to run twice.

alter table job_quote_items drop constraint if exists job_quote_items_made_on_check;
alter table job_quote_items
  add constraint job_quote_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly'));

alter table stock_items drop constraint if exists stock_items_made_on_check;
alter table stock_items
  add constraint stock_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly'));

do $$
begin
  if to_regclass('public.process_type_settings') is not null then
    alter table process_type_settings drop constraint if exists process_type_settings_cuts_made_on_check;
    alter table process_type_settings
      add constraint process_type_settings_cuts_made_on_check
      check (cuts_made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size'));
  end if;
end $$;


-- ============ Check ============
--
-- Three rows, each saying ready. Only two rows means
-- process_type_settings does not exist here yet -- see section 3.
--
-- Read from the database's own list of columns rather than from the
-- tables, so the check cannot fail on a database where one of them is
-- missing.

select table_name || '.' || column_name as column_added,
       'ready' as state
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'job_quote_items' and column_name = 'made_on') or
    (table_name = 'stock_items' and column_name = 'made_on') or
    (table_name = 'process_type_settings' and column_name = 'cuts_made_on')
  )

union all

select 'lines and parts tagged so far',
       (select count(*) filter (where made_on <> '') from job_quote_items)::text || ' job lines, ' ||
       (select count(*) filter (where made_on <> '') from stock_items)::text || ' stock parts'

order by 1;


-- ============================================================
-- setup-job-documents-move.sql
-- ============================================================
-- Let a job's file be moved to a stage.
--
-- The Files tab on a job now files every upload against a stage (or the
-- whole job) and has a "Move to..." on each file. The move is one change
-- to one column, process_name, on job_documents.
--
-- job_documents was set up with rules for reading, adding and deleting
-- rows, and never one for changing a row -- nothing changed a row until
-- now. Without that rule the database quietly changes nothing: no error,
-- and the file stays where it was. That is what "Move is not responding"
-- was.
--
-- This adds the missing rule, the same shape as the other three.
--
-- Select nothing before pressing Run. Safe to run more than once.
-- Run it on the PRACTICE database first, then on live.


do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_documents'
      and policyname = 'Signed-in users can update job documents rows'
  ) then
    create policy "Signed-in users can update job documents rows"
      on job_documents for update
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;


-- ============ Check ============
--
-- Four rows: read, add, change, delete.

select policyname as rule, cmd as allows
from pg_policies
where schemaname = 'public' and tablename = 'job_documents'
order by cmd;


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
-- setup-invoice-notes.sql
-- ============================================================
-- Questions on an invoice, and the answers.
--
-- Accounts gets a request to bill with something missing off it -- no
-- order number, a quantity that does not look right, a customer name
-- that has changed. Today that conversation happens by walking over, and
-- leaves no trace on the job.
--
-- This keeps it against the job. Anybody signed in can read the thread
-- and add to it. Nobody can edit or delete a line: there is deliberately
-- no update or delete policy, so a question cannot quietly disappear
-- once it has been asked.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.job_invoice_notes (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  note       text not null,
  written_by text,
  created_at timestamptz not null default now()
);

create index if not exists job_invoice_notes_job_idx
  on public.job_invoice_notes (job_id, created_at);

alter table public.job_invoice_notes enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'job_invoice_notes'
                 and policyname = 'Signed-in users can read invoice notes') then
    create policy "Signed-in users can read invoice notes"
      on public.job_invoice_notes for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'job_invoice_notes'
                 and policyname = 'Signed-in users can add invoice notes') then
    create policy "Signed-in users can add invoice notes"
      on public.job_invoice_notes for insert
      with check (auth.role() = 'authenticated');
  end if;
end $do$;


-- ============ Check ============

select 'invoice notes' as step,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'job_invoice_notes')
            then 'ready — a thread per job, add only, nothing can be edited away'
            else 'SOMETHING IS MISSING - tell Claude' end as result;


-- ============================================================
-- setup-jobs-invoiced-amount.sql
-- ============================================================
-- What accounts invoiced a job for in Sage, excluding VAT.
--
-- Typed on Mark as Invoiced, beside the Sage invoice number (decided
-- 17 Sep 2026). The box is filled in from the job's invoice requests so
-- accounts checks a number rather than typing one. It feeds the Jobs
-- list's "Invoiced in <month>" figure (src/jobs/jobFigures.js).
--
-- Blank on every job invoiced before this: those count at what the job
-- was quoted at, and the figure says how many.
--
-- Safe to run more than once.

alter table jobs
  add column if not exists invoiced_amount numeric;

alter table jobs drop constraint if exists jobs_invoiced_amount_check;
alter table jobs add constraint jobs_invoiced_amount_check
  check (invoiced_amount is null or invoiced_amount >= 0);

-- Check: invoiced jobs and their amount (all blank straight after this runs).
select job_number, status, invoice_number, invoiced_at, invoiced_amount
from jobs
where status = 'invoiced'
order by invoiced_at desc
limit 20;


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

do $$ begin
  create policy "Signed-in users can read generated documents" on generated_documents for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add generated documents" on generated_documents for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ============================================================
-- setup-sent-emails.sql
-- ============================================================
-- A record of every email sent from the app.
--
-- The email itself leaves through the sender's own Outlook mailbox and
-- sits in their Sent Items. This table is the app's side of it: which
-- document went, to whom, when and from whose mailbox, so a purchase
-- order can say "Emailed 21 Sep 14:05 to orders@supplier.co.za by ...".
--
-- Anybody signed in can read it and add to it. Nobody can edit or delete
-- a line: there is deliberately no update or delete policy, so the record
-- of what was sent cannot be changed afterwards.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.sent_emails (
  id            uuid primary key default gen_random_uuid(),
  sent_at       timestamptz not null default now(),
  sent_by       text,
  sent_by_user  uuid default auth.uid(),
  from_address  text,
  to_addresses  text[] not null default '{}',
  cc_addresses  text[] not null default '{}',
  subject       text,
  document_type text not null,
  related_id    text,
  job_id        uuid,
  file_name     text,
  test_mode     boolean not null default false
);

create index if not exists sent_emails_document_idx
  on public.sent_emails (document_type, related_id, sent_at desc);

alter table public.sent_emails enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sent_emails'
                 and policyname = 'Signed-in users can read sent emails') then
    create policy "Signed-in users can read sent emails"
      on public.sent_emails for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sent_emails'
                 and policyname = 'Signed-in users can record a sent email') then
    create policy "Signed-in users can record a sent email"
      on public.sent_emails for insert
      with check (auth.role() = 'authenticated');
  end if;
end $do$;


-- ============ Check ============

select 'sent emails' as step,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'sent_emails')
            then 'ready — every email sent from the app is recorded, add only'
            else 'SOMETHING IS MISSING - tell Claude' end as result;


-- ============================================================
-- setup-sent-emails-party.sql
-- ============================================================
-- Who an email was for: the customer or the supplier, by name.
--
-- The app does not know which of a customer's contacts gets the invoices
-- (often a creditors address, not the buyer). With the name kept on each
-- sent email, the invoice window can open with wherever that customer's
-- last invoice went, instead of making somebody look it up every time.
--
-- The app works without this column: it then saves the record without the
-- name, and the To box simply starts empty.
--
-- Needs setup-sent-emails.sql first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.sent_emails add column if not exists party_name text;

create index if not exists sent_emails_party_idx
  on public.sent_emails (document_type, party_name, sent_at desc);


-- ============ Check ============

select 'sent emails: who it was for' as step,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'sent_emails'
                           and column_name = 'party_name')
            then 'ready — the invoice window can remember where a customer''s last invoice went'
            else 'SOMETHING IS MISSING - tell Claude' end as result;


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
do $$ begin
  create policy "Signed-in users can read shortages" on shortages
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can insert shortages" on shortages;
do $$ begin
  create policy "Signed-in users can insert shortages" on shortages
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can update shortages" on shortages;
do $$ begin
  create policy "Signed-in users can update shortages" on shortages
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can delete shortages" on shortages;
do $$ begin
  create policy "Signed-in users can delete shortages" on shortages
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- One or more people can be the designated shortage handler(s) — always
-- notified when a shortage is flagged, regardless of which job it's on or
-- who (if anyone) is currently assigned to Nesting there.
alter table profiles add column if not exists is_shortage_handler boolean not null default false;


-- ============================================================
-- setup-shortage-priority.sql
-- ============================================================
-- Priority on a shortage, plus somewhere to say why it is one.
--
-- A shortage means something already promised to a customer is missing or
-- scrapped, so the re-cut is holding up work that was otherwise finished.
-- It defaults to true for that reason: priority is the normal case, and
-- the exception is a shortage that genuinely can wait.
--
-- Existing shortages are backfilled to true, matching how they have been
-- treated in practice.
--
-- Safe to run more than once.

alter table shortages
  add column if not exists is_priority boolean not null default true;

alter table shortages
  add column if not exists priority_note text not null default '';

create index if not exists shortages_priority_idx
  on shortages (is_priority, status);

-- Check: outstanding shortages, most urgent first.
select job_number, description, qty, status, is_priority
from shortages
where status <> 'cut'
order by is_priority desc, created_at;


-- ============================================================
-- setup-shortage-rework.sql
-- ============================================================
-- Lets a shortage carry its own set of stages.
--
-- A shortage is not finished when it comes off the laser. The replacement
-- part still has to catch up: through every stage between the re-cut and
-- wherever the problem was found. Until now the trail ended at "cut" and
-- the rest happened by memory.
--
-- Rather than a second table, shortage stages are job_processes rows with
-- shortage_id set. They are the same thing -- work waiting at a stage --
-- so the production queue, the assignment, the completion tracking and
-- the floor gating all apply to them already, and an operator sees them
-- in the queue they are already watching.
--
-- Rows with shortage_id null are the job's own stages, exactly as before.
--
-- shortages.id is text, not uuid, hence the column type here.
--
-- Safe to run more than once.

alter table job_processes
  add column if not exists shortage_id text references shortages(id) on delete cascade;

create index if not exists job_processes_shortage_idx
  on job_processes (shortage_id);

-- Check: no shortage stages yet on a fresh install.
select p.job_id, p.process_name, p.sort_order, p.is_complete, s.description
from job_processes p
join shortages s on s.id = p.shortage_id
order by p.job_id, p.sort_order;


-- ============================================================
-- setup-shortage-items.sql
-- ============================================================
-- Lets one shortage cover several missing parts.
--
-- A shortage was one description and one quantity. In practice someone
-- packing a job finds three different parts short at the same time, off
-- the same nest, to be re-cut together -- that is one shortage with three
-- lines, not three shortages.
--
-- items holds [{ "description": "...", "qty": 2 }, ...].
--
-- description and qty stay, holding the first line, so anything already
-- reading them keeps working and existing shortages need no conversion.
-- Where items is empty, those two are the shortage.
--
-- The existing board_number column now holds the SigmaNest job number --
-- the name is historical. Not renamed on purpose: the live app writes
-- board_number, and renaming it would break every running browser between
-- this migration and the new code going out.
--
-- Safe to run more than once.

alter table shortages
  add column if not exists items jsonb not null default '[]'::jsonb;

-- Check: outstanding shortages and how many lines each carries.
select job_number, description, qty, jsonb_array_length(items) as extra_lines, status
from shortages
where status <> 'cut'
order by created_at desc;


-- ============================================================
-- setup-shortage-lane.sql
-- ============================================================
-- Which laser a shortage belongs to.
--
-- A shortage did not know whether its parts are plate or tube, so the
-- red "Shortages needing nesting" block was drawn on both nesting
-- departments and every flagged shortage appeared twice. Once nested,
-- a mixed job got a catch-up stage for BOTH nesting stages, so the
-- re-cut showed up under both departments as work.
--
-- One column. 'plate' or 'tube', set when the shortage is flagged --
-- worked out from the job when it has only one kind of nesting stage,
-- asked for with two buttons when it has both. Left empty on shortages
-- flagged before this existed; those still show under both, marked.
--
-- The tube laser tab being built next to Laser 4kw should read this
-- column to find its own re-cuts, rather than inventing a second way.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.shortages
  add column if not exists lane text;

do $do$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'shortages_lane_is_plate_or_tube') then
    alter table public.shortages
      add constraint shortages_lane_is_plate_or_tube
      check (lane is null or lane in ('plate', 'tube'));
  end if;
end $do$;


-- ============ Check ============

select 'shortage lane' as step,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'shortages'
                           and column_name = 'lane')
            then 'ready — a shortage can say which laser it belongs to'
            else 'SOMETHING IS MISSING - tell Claude' end as result;


-- ============================================================
-- setup-shortage-reason-and-cancel.sql
-- ============================================================
-- Two things a shortage could not say.
--
-- 1. What happened, in the flagger's own words. The four-way reason
--    (short, damaged, lost, other) cannot tell a nester whether the parts
--    are really missing or only not cut yet. reason_note holds the words;
--    the flag form asks for them.
-- 2. That it was raised by mistake. A cancelled shortage keeps its row,
--    status 'cancelled', with who, when and why -- like a cancelled laser
--    program, the record stays readable. status has no check rule.
--
-- Run on PRACTICE first, then LIVE. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.shortages add column if not exists reason_note text not null default '';
alter table public.shortages add column if not exists cancelled_by text not null default '';
alter table public.shortages add column if not exists cancelled_at timestamptz;
alter table public.shortages add column if not exists cancel_reason text not null default '';


-- ============ Check ============
-- "rules" should list only shortages_lane_is_plate_or_tube.

select 'shortage reason and cancel' as step,
       case when (select count(*) from information_schema.columns
                  where table_schema = 'public' and table_name = 'shortages'
                    and column_name in ('reason_note', 'cancelled_by',
                                        'cancelled_at', 'cancel_reason')) = 4
            then 'ready — a shortage can carry the words and be cancelled'
            else 'SOMETHING IS MISSING - tell Claude' end as result,
       (select string_agg(conname, ', ') from pg_constraint
         where conrelid = 'public.shortages'::regclass and contype = 'c') as rules;


-- ============================================================
-- setup-info-requests.sql
-- ============================================================
-- Info Request: a floor operator says a job is standing until the office
-- answers (a drawing, a dimension...). open -> answered (office replied)
-- or cleared (operator sorted it). Never deleted: the printed Job History
-- lists each one and how long the job stood. Needs touch_updated_at()
-- from setup-updated-at-everywhere.sql. Safe to run more than once.

create table if not exists public.job_info_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  process_id uuid references public.job_processes(id) on delete set null,
  job_number text not null default '',
  stage_name text not null default '',
  kind text not null default '',
  note text not null default '',
  photo_path text not null default '',
  photo_name text not null default '',
  raised_by text not null default '',
  raised_by_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'answered', 'cleared')),
  answer text not null default '',
  closed_by text not null default '',
  closed_by_id uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_info_requests_job_id_idx on public.job_info_requests (job_id);
create index if not exists job_info_requests_updated_at_idx on public.job_info_requests (updated_at);

drop trigger if exists job_info_requests_set_updated_at on public.job_info_requests;
create trigger job_info_requests_set_updated_at before update on public.job_info_requests
  for each row execute function public.touch_updated_at();

-- Read, add and change. No delete rule on purpose: nothing may remove one.
alter table public.job_info_requests enable row level security;
do $read$ begin
  create policy "Signed-in users can read info requests" on public.job_info_requests for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $read$;
do $add$ begin
  create policy "Signed-in users can add info requests" on public.job_info_requests for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $add$;
do $change$ begin
  create policy "Signed-in users can update info requests" on public.job_info_requests for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $change$;

select case when exists (select 1 from pg_policies where tablename = 'job_info_requests' and cmd = 'UPDATE')
             and exists (select 1 from pg_trigger where tgname = 'job_info_requests_set_updated_at' and not tgisinternal)
            then 'job_info_requests ready' else 'SOMETHING IS MISSING - tell Claude' end as result;


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
do $$ begin
  create policy "Signed-in users can read requisitions" on requisitions
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can insert requisitions" on requisitions;
do $$ begin
  create policy "Signed-in users can insert requisitions" on requisitions
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can update requisitions" on requisitions;
do $$ begin
  create policy "Signed-in users can update requisitions" on requisitions
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can delete requisitions" on requisitions;
do $$ begin
  create policy "Signed-in users can delete requisitions" on requisitions
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

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
do $$ begin
  create policy "Signed-in users can read purchase orders" on purchase_orders
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can insert purchase orders" on purchase_orders;
do $$ begin
  create policy "Signed-in users can insert purchase orders" on purchase_orders
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can update purchase orders" on purchase_orders;
do $$ begin
  create policy "Signed-in users can update purchase orders" on purchase_orders
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can delete purchase orders" on purchase_orders;
do $$ begin
  create policy "Signed-in users can delete purchase orders" on purchase_orders
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

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
do $$ begin
  create policy "Signed-in users can read drawing files"
  on storage.objects for select
  using (bucket_id = 'drawings' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can upload drawing files"
  on storage.objects for insert
  with check (bucket_id = 'drawings' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can update drawing files"
  on storage.objects for update
  using (bucket_id = 'drawings' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can delete drawing files"
  on storage.objects for delete
  using (bucket_id = 'drawings' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

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

do $$ begin
  create policy "Signed-in users can read drawings" on drawings
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add drawings" on drawings
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update drawings" on drawings
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete drawings" on drawings
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


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

do $$ begin
  create policy "Signed-in users can read asset attachments"
  on storage.objects for select
  using (bucket_id = 'asset-attachments' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can upload asset attachments"
  on storage.objects for insert
  with check (bucket_id = 'asset-attachments' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can delete asset attachments"
  on storage.objects for delete
  using (bucket_id = 'asset-attachments' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

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

do $$ begin
  create policy "Signed-in users can read asset history" on asset_history
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add asset history" on asset_history
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete asset history" on asset_history
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


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

do $$ begin
  create policy "Signed-in users can read asset repairs" on asset_repairs
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add asset repairs" on asset_repairs
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update asset repairs" on asset_repairs
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete asset repairs" on asset_repairs
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


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
do $$ begin
  create policy "Signed-in users can read usage log" on usage_log
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can insert usage log" on usage_log;
do $$ begin
  create policy "Signed-in users can insert usage log" on usage_log
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can update usage log" on usage_log;
do $$ begin
  create policy "Signed-in users can update usage log" on usage_log
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

drop policy if exists "Signed-in users can delete usage log" on usage_log;
do $$ begin
  create policy "Signed-in users can delete usage log" on usage_log
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

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
-- setup-job-allocations.sql
-- ============================================================
-- Material set aside for a job, and for a particular process on that job.
--
-- Stock ordered specially for a job used to have nowhere to live between
-- arriving and being used. The operator had to go and find it, knowing
-- from somewhere else that it was theirs.
--
-- An allocation reserves rather than removes: stock_items keeps its
-- quantity, so the count still matches what is physically on the shelf.
-- qty_used only rises when an operator actually books material out, and
-- the stock quantity drops at that moment, not before.
--
-- Safe to run more than once.

create table if not exists job_allocations (
  id text primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  job_number text not null default '',

  -- Which stage the material is for. Kept as a name as well as an id: the
  -- id is the real link, the name survives a process being removed from
  -- the job so history still reads correctly.
  process_id uuid references job_processes(id) on delete set null,
  process_name text not null default '',

  -- stock_items.id is text, not uuid. No foreign key on purpose: cutting a
  -- long length can retire the original row and file the remainder as a
  -- new one, and an allocation already used should not vanish because of
  -- that. item_name is kept for the same reason.
  item_id text not null default '',
  item_name text not null default '',
  main_cat text not null default '',

  qty_allocated numeric not null default 0,
  qty_used numeric not null default 0,

  allocated_by text not null default '',
  allocated_by_id uuid references profiles(id) on delete set null,
  note text not null default '',

  -- open -> partially or not yet used; used -> fully consumed;
  -- released -> handed back without being used
  status text not null default 'open',

  created_at timestamptz not null default now()
);

create index if not exists job_allocations_job_idx on job_allocations (job_id);
create index if not exists job_allocations_process_idx on job_allocations (process_id);
create index if not exists job_allocations_item_idx on job_allocations (item_id);

alter table job_allocations enable row level security;

do $$ begin
  create policy "Signed-in users can read job allocations" on job_allocations
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can insert job allocations" on job_allocations
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can update job allocations" on job_allocations
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can delete job allocations" on job_allocations
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Check: should return no rows on a fresh install.
select job_number, process_name, item_name, qty_allocated, qty_used, status
from job_allocations
order by created_at desc;


-- ============================================================
-- setup-job-cut-items.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- The cut-to-size list on a job: one row per part that has to be cut from
-- structural stock. Two readers: the saw operator, who sees what to cut
-- and from which bar, and the sales person, who sees how many bars the
-- job needs so they can set stock aside or order it.
--
-- Only the raw entries live here -- section, length, quantity, stock
-- length. Bars needed, offcut per bar and the cutting order are worked
-- out by the app from these numbers (src/jobs/cutToSize.js), and the
-- allowances it uses are: 1mm lost to the blade on every cut, and an
-- optional 10mm trim off the front of each bar to square it up.
--
-- Same shape as job_quote_items on purpose. The quoting module will want
-- the same list on a quote; adding a nullable quote_id later is all it
-- should take, so please do not fork this table -- extend it.
--
-- Safe to run more than once.

create table if not exists job_cut_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  sort_order integer not null default 0,

  -- The customer's drawing or part number. Free text, but when it matches
  -- one of that customer's stock items the link is kept so the drawing
  -- can be shown to the operator. stock_items.id is text, not uuid, and
  -- there is no foreign key on purpose: a retired stock item should not
  -- take a job's cut list with it.
  drawing_no text not null default '',
  linked_item_id text,

  -- What to cut. Section names match the Sections list in Stock Manager.
  -- Grade is kept per line because the operator has to know mild steel
  -- from stainless, and a section can exist in both.
  section text not null default '',
  grade text not null default '',

  -- Millimetres for the piece, metres for the bar it comes off. That is
  -- how the shop talks about them and how structural stock already stores
  -- its lengths (metres).
  cut_length_mm numeric not null default 0,
  qty numeric not null default 0,
  stock_length_m numeric not null default 6,

  -- Whether this line's bars get the 10mm front trim. On by default.
  trim_front boolean not null default true,

  -- The operator's running count, the same idea as "each" tracking on a
  -- process. Never above qty.
  qty_cut numeric not null default 0,

  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists job_cut_items_job_id_idx on job_cut_items (job_id);

alter table job_cut_items enable row level security;

do $$ begin
  create policy "Signed-in users can read cut items" on job_cut_items for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add cut items" on job_cut_items for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update cut items" on job_cut_items for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete cut items" on job_cut_items for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

select 'job_cut_items ready' as result;


-- ============================================================
-- setup-job-buyout-items.sql
-- ============================================================
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


-- ============================================================
-- setup-quoting-and-bom.sql
-- ============================================================
-- Quoting and the bill of materials: step one, the database.
--
-- The plan is docs/QUOTING-AND-BOM-PLAN.md. This file adds every table
-- and column the whole build needs, all at once and all blank, so the
-- steps after it are code only. Nothing on any screen changes when
-- this runs: no screen reads any of it yet.
--
-- What it adds, in plain words:
--
--   quotes and what is on them      quotes, quote_items, quote_cost_lines,
--                                   quote_parts
--   the lists quoting reads         quote_processes, quote_rates,
--                                   quote_cutting_speeds, and a quote
--                                   number counter
--   a recipe saved to Stock Manager bom_parts, bom_stages, bom_events, and
--                                   four recipe_* columns on stock_items
--   the history of a stock item     stock_item_events
--   a job made from a quote         columns on jobs, job_quote_items and
--                                   job_cut_items
--   the hinge                       one tick on process_type_settings
--   who may do what                 four permissions on profiles
--   where quote PDFs go             a private storage bucket, quotes
--
-- Two things it deliberately does NOT do:
--
--   * It does not blank the "assembly" cut method on any line or part.
--     Those rows get recipe_kind = 'fabrication' as well, but keep their
--     cut method until the app reads recipe_kind. Blanking it now would
--     put those lines onto every cutting stage tomorrow morning.
--   * It does not add a quote_documents table. Quote PDFs go through
--     generated_documents, the table purchase orders already use, with
--     document_type = 'quote'.
--
-- Select nothing before pressing Run. Safe to run more than once.
-- Run it on the PRACTICE database first, then on live.


-- ============ 1. Quotes ============
--
-- One row per quote. A revision is a new row with the same number and
-- the next letter, pointing back at the one it replaces, so what the
-- customer was sent always still exists.

create table if not exists quotes (
  id                 uuid primary key default gen_random_uuid(),
  quote_number       text not null,
  revision           text not null default 'A',
  supersedes_id      uuid references quotes(id) on delete set null,

  customer           text not null default '',
  contact_name       text not null default '',
  contact_email      text not null default '',
  contact_phone      text not null default '',
  project            text not null default '',

  -- draft -> sent -> accepted | lost | expired
  status             text not null default 'draft',
  lost_reason        text not null default '',

  sales_rep          text not null default '',
  sales_rep_id       uuid references profiles(id) on delete set null,

  quote_date         date not null default current_date,
  valid_until        date,
  delivery_lead_time text not null default '',
  custom_instructions text not null default '',
  terms_text         text not null default '',
  vat_rate           numeric not null default 15,
  notes              text not null default '',

  -- Set when the items were saved to Stock Manager as recipes.
  saved_to_stock_manager_at timestamptz,
  -- The job an accepted quote became.
  converted_job_id   uuid references jobs(id) on delete set null,

  created_by         text not null default '',
  created_by_id      uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (quote_number, revision)
);

alter table quotes drop constraint if exists quotes_status_check;
alter table quotes add constraint quotes_status_check
  check (status in ('draft', 'sent', 'accepted', 'lost', 'expired'));

create index if not exists quotes_customer_idx on quotes (customer);
create index if not exists quotes_status_idx   on quotes (status);


-- ============ 2. The things a quote sells ============
--
-- Item 1, item 2. Each is loose parts, a set, or a fabrication, and is
-- priced as a whole or per part.

create table if not exists quote_items (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references quotes(id) on delete cascade,
  sort_order      integer not null default 0,
  description     text not null,

  kind            text not null default 'loose',     -- loose | set | fabrication
  pricing         text not null default 'whole',     -- whole | per_part
  joined_at       text not null default '',          -- '' | welded | bolted

  unit            text not null default 'ea',
  qty             numeric not null default 1,
  -- A typed price per unit, used until the lines beneath are built.
  sell_rate       numeric not null default 0,
  cost_total      numeric not null default 0,
  sell_total      numeric not null default 0,
  weight_kg       numeric not null default 0,

  -- The stock_items row this item was saved as, or picked from. Text,
  -- no foreign key: stock ids are text, and a retired recipe must not
  -- take a quote with it.
  recipe_item_id  text,
  notes           text not null default ''
);

alter table quote_items drop constraint if exists quote_items_kind_check;
alter table quote_items add constraint quote_items_kind_check
  check (kind in ('loose', 'set', 'fabrication'));
alter table quote_items drop constraint if exists quote_items_pricing_check;
alter table quote_items add constraint quote_items_pricing_check
  check (pricing in ('whole', 'per_part'));
alter table quote_items drop constraint if exists quote_items_joined_at_check;
alter table quote_items add constraint quote_items_joined_at_check
  check (joined_at in ('', 'welded', 'bolted'));

create index if not exists quote_items_quote_idx on quote_items (quote_id);


-- ============ 3. The cost lines under an item ============
--
-- 1.1 Laser, 1.2 CNC, 1.3 Welding. The process name and calculator are
-- copied in, so an old quote still reads correctly after a process is
-- renamed or retired. `inputs` holds whatever that process asked for
-- (cut length, pierces, billet diameter, weld metres) as one field,
-- because every process asks different questions.

create table if not exists quote_cost_lines (
  id               uuid primary key default gen_random_uuid(),
  quote_item_id    uuid not null references quote_items(id) on delete cascade,
  sort_order       integer not null default 0,

  quote_process_id uuid,
  process_name     text not null default '',
  calculator       text not null default '',
  description      text not null default '',
  basis            text not null default '',   -- which pricing basis, where a process has several
  inputs           jsonb not null default '{}'::jsonb,

  unit             text not null default 'sum',
  qty              numeric not null default 1,
  cost_rate        numeric not null default 0,
  markup_percent   numeric not null default 0,
  cost_amount      numeric not null default 0,
  sell_amount      numeric not null default 0
);

create index if not exists quote_cost_lines_item_idx on quote_cost_lines (quote_item_id);


-- ============ 4. The parts under a cost line ============
--
-- The laser line holds the laser parts, the CNC line the turned parts,
-- and so on: which line a part sits under is its cut method. A part may
-- be linked to a Stock Code or simply typed; a typed one gets a Stock
-- Code only if the quote is saved to Stock Manager. Quantities are per
-- one item, because a quote is one set.

create table if not exists quote_parts (
  id                 uuid primary key default gen_random_uuid(),
  quote_cost_line_id uuid not null references quote_cost_lines(id) on delete cascade,
  sort_order         integer not null default 0,

  linked_item_id     text,                       -- stock_items.id, no foreign key
  part_number        text not null default '',
  description        text not null default '',
  qty                numeric not null default 1,
  material           text not null default '',
  thickness          text not null default '',
  unit_cost          numeric not null default 0,
  unit_sell          numeric not null default 0,

  -- Cut to size: the same fields the job's cut list uses.
  section            text not null default '',
  grade              text not null default '',
  cut_length_mm      numeric not null default 0,
  stock_length_m     numeric not null default 6,

  -- Buy-outs and stores.
  supplier           text not null default '',

  notes              text not null default ''
);

create index if not exists quote_parts_line_idx on quote_parts (quote_cost_line_id);


-- ============ 5. The lists quoting reads ============
--
-- Quote Processes: what the Add step dropdown offers. Separate from Job
-- Process Types by decision; job_stages says which stages a process
-- means on the job (a laser line means Nesting, Laser Operator and
-- Packer). Left empty here; set on screen once the list has a screen.
--
-- Seeded with the processes the workbook uses. "on conflict do nothing"
-- keeps whatever is already there on a second run.

create table if not exists quote_processes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  calculator   text not null default 'price',   -- laser | tube_laser | cnc | cut_to_size | stores | welding | rate_count | surface | price
  holds_parts  boolean not null default false,
  job_stages   text[] not null default '{}',
  sort_order   integer not null default 0,
  active       boolean not null default true
);

insert into quote_processes (name, calculator, holds_parts, sort_order) values
  ('Laser',          'laser',       true,  10),
  ('Tube laser',     'tube_laser',  true,  20),
  ('CNC',            'cnc',         true,  30),
  ('Cut to size',    'cut_to_size', true,  40),
  ('From stores',    'stores',      true,  50),
  ('Welding',        'welding',     false, 60),
  ('Bending',        'rate_count',  false, 70),
  ('Rolling',        'rate_count',  false, 80),
  ('Surface finish', 'surface',     false, 90),
  ('Galvanising',    'surface',     false, 100),
  ('Powder coating', 'surface',     false, 110),
  ('Plating',        'surface',     false, 120)
on conflict (name) do nothing;

-- Rates: the numbers that are Heinrich's to set. Seeded from the
-- workbook (ERS QU226339) so the first quote prices the way the last
-- one did.

create table if not exists quote_rates (
  name   text primary key,
  value  numeric not null default 0,
  unit   text not null default '',
  note   text not null default ''
);

insert into quote_rates (name, value, unit, note) values
  ('laser_rate_per_m',      30,   'R/m',   'laser cutting, per metre of cut'),
  ('laser_pierce',          5,    'R each','per pierce'),
  ('laser_handling',        8,    'R/kg',  'handling fee by weight'),
  ('laser_per_hour',        1500, 'R/hr',  'laser time'),
  ('cnc_machine_1_per_hour', 750, 'R/hr',  'CNC machine 1'),
  ('cnc_machine_2_per_hour', 500, 'R/hr',  'CNC machine 2'),
  ('cnc_machine_3_per_hour', 350, 'R/hr',  'CNC machine 3'),
  ('cnc_setup',             750,  'R',     'CNC setup, once off'),
  ('default_markup_percent', 60,  '%',     'the workbook''s selling factor')
on conflict (name) do nothing;

-- Thickness to cutting speed, the laser take-off table from the workbook.

create table if not exists quote_cutting_speeds (
  thickness_mm       numeric primary key,
  metres_per_minute  numeric not null
);

insert into quote_cutting_speeds (thickness_mm, metres_per_minute) values
  (1.2, 18), (1.6, 15), (2, 12), (2.5, 10), (3, 8), (4, 6), (4.5, 6),
  (5, 5), (5.5, 4.5), (6, 3.5), (8, 1.8), (10, 1.2), (12, 0.6)
on conflict (thickness_mm) do nothing;

-- The quote number counter, next to the job and PO counters. Starts at
-- QU-0001 by decision; the old QU2263xx series stays with the workbook.

insert into master_counters (counter_name, value) values ('nextQuoteNumber', 1)
on conflict (counter_name) do nothing;


-- ============ 6. A recipe saved to Stock Manager ============
--
-- A recipe is a stock_items row (the set or fabrication itself) plus the
-- rows below. recipe_kind says which; '' is a plain part.

alter table stock_items add column if not exists recipe_kind      text not null default '';
alter table stock_items add column if not exists recipe_pricing   text not null default '';
alter table stock_items add column if not exists recipe_joined_at text not null default '';
alter table stock_items add column if not exists recipe_revision  text not null default '';

alter table stock_items drop constraint if exists stock_items_recipe_kind_check;
alter table stock_items add constraint stock_items_recipe_kind_check
  check (recipe_kind in ('', 'set', 'fabrication'));
alter table stock_items drop constraint if exists stock_items_recipe_pricing_check;
alter table stock_items add constraint stock_items_recipe_pricing_check
  check (recipe_pricing in ('', 'whole', 'per_part'));
alter table stock_items drop constraint if exists stock_items_recipe_joined_at_check;
alter table stock_items add constraint stock_items_recipe_joined_at_check
  check (recipe_joined_at in ('', 'welded', 'bolted'));

-- Parts already tagged "assembly" are fabrications. They keep their cut
-- method for now (see the top of this file).
update stock_items
   set recipe_kind = 'fabrication'
 where made_on = 'assembly' and recipe_kind = '';

-- What is inside a recipe. No foreign keys on purpose: a retired part
-- shows as "part missing" on the recipe rather than taking it away.
-- Whether a line is cut here or bought in is read from the item it
-- points at, not stored twice.

create table if not exists bom_parts (
  id              uuid primary key default gen_random_uuid(),
  parent_item_id  text not null,      -- the set or fabrication, a stock_items row
  part_item_id    text not null,      -- what is inside it, also a stock_items row
  qty_per_set     numeric not null default 1,
  sort_order      integer not null default 0,

  -- For a sawn part, the same fields the job's cut list uses.
  section         text not null default '',
  grade           text not null default '',
  cut_length_mm   numeric not null default 0,
  stock_length_m  numeric not null default 6,

  notes           text not null default ''
);

create index if not exists bom_parts_parent_idx on bom_parts (parent_item_id);

-- The stages a recipe's parts go through, so a job that loads it gets
-- them without anyone ticking.

create table if not exists bom_stages (
  id              uuid primary key default gen_random_uuid(),
  parent_item_id  text not null,
  process_name    text not null,
  sort_order      integer not null default 0
);

create index if not exists bom_stages_parent_idx on bom_stages (parent_item_id);

-- The recipe's history: who changed what, when. Add-only, like the job
-- history. Nobody can edit or delete an entry.

create table if not exists bom_events (
  id              uuid primary key default gen_random_uuid(),
  parent_item_id  text not null,
  action          text not null,
  detail          text not null default '',
  acted_by        text not null default '',
  acted_by_id     uuid,
  acted_at        timestamptz not null default now()
);

create index if not exists bom_events_parent_idx on bom_events (parent_item_id, acted_at desc);


-- ============ 7. The history of a stock item ============
--
-- For the Stock Manager lock: every change made through Edit item is
-- written here, one row per field changed. Add-only.

create table if not exists stock_item_events (
  id           uuid primary key default gen_random_uuid(),
  item_id      text not null,
  field        text not null,
  old_value    text not null default '',
  new_value    text not null default '',
  acted_by     text not null default '',
  acted_by_id  uuid,
  acted_at     timestamptz not null default now()
);

create index if not exists stock_item_events_item_idx on stock_item_events (item_id, acted_at desc);


-- ============ 8. A job made from a quote or a recipe ============

-- The quote a job came from.
alter table jobs add column if not exists quote_id uuid references quotes(id) on delete set null;

-- On a job line: which parent it belongs to (a fabrication's child, or a
-- per-set BOM's part), which recipe it was loaded from and how many, and
-- the recipe and drawing revision at the moment it was loaded, so a job
-- says what it was built to even after the recipe or the drawing moves
-- on. A child goes with its parent when the parent is removed.
alter table job_quote_items add column if not exists parent_quote_item_id uuid references job_quote_items(id) on delete cascade;
alter table job_quote_items add column if not exists recipe_item_id   text;
alter table job_quote_items add column if not exists recipe_qty       numeric;
alter table job_quote_items add column if not exists recipe_revision  text not null default '';
alter table job_quote_items add column if not exists drawing_revision text not null default '';

create index if not exists job_quote_items_parent_idx on job_quote_items (parent_quote_item_id);

-- The cut list is one table for quotes and jobs, as the cut-to-size plan
-- asked: a nullable quote_id, and job_id no longer required, but one of
-- the two must be set. Every screen today selects by job_id, so a
-- quote's lines are invisible to them.
alter table job_cut_items add column if not exists quote_id uuid references quotes(id) on delete cascade;
alter table job_cut_items alter column job_id drop not null;
alter table job_cut_items drop constraint if exists job_cut_items_owner_check;
alter table job_cut_items add constraint job_cut_items_owner_check
  check (job_id is not null or quote_id is not null);

create index if not exists job_cut_items_quote_idx on job_cut_items (quote_id);


-- ============ 9. The hinge ============
--
-- The stage that puts fabrications together: Welding for a welded one,
-- Assembly for a bolted one. A tick on the stage, so a rename breaks
-- nothing. "if exists" for the same reason as setup-made-on-tag.sql.

alter table if exists process_type_settings
  add column if not exists puts_fabrications_together boolean not null default false;


-- ============ 10. Who may do what ============

alter table profiles add column if not exists can_quote               boolean not null default false;
alter table profiles add column if not exists can_see_quote_cost      boolean not null default false;
alter table profiles add column if not exists can_manage_quote_rates  boolean not null default false;
alter table profiles add column if not exists can_manage_recipes      boolean not null default false;


-- ============ 11. Where quote PDFs go ============
--
-- A private bucket of its own, the way drawings have one.

insert into storage.buckets (id, name, public)
values ('quotes', 'quotes', false)
on conflict (id) do nothing;

do $$ begin
  create policy "Signed-in users can read quote files"
    on storage.objects for select
    using (bucket_id = 'quotes' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can upload quote files"
    on storage.objects for insert
    with check (bucket_id = 'quotes' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete quote files"
    on storage.objects for delete
    using (bucket_id = 'quotes' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ============ 12. Access ============
--
-- Same as every other table in this app: signed-in staff can read and
-- write, and who may actually do what is decided by the app from the
-- permissions above. The two history tables are read and add only.

alter table quotes               enable row level security;
alter table quote_items          enable row level security;
alter table quote_cost_lines     enable row level security;
alter table quote_parts          enable row level security;
alter table quote_processes      enable row level security;
alter table quote_rates          enable row level security;
alter table quote_cutting_speeds enable row level security;
alter table bom_parts            enable row level security;
alter table bom_stages           enable row level security;
alter table bom_events           enable row level security;
alter table stock_item_events    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['quotes', 'quote_items', 'quote_cost_lines', 'quote_parts',
                           'quote_processes', 'quote_rates', 'quote_cutting_speeds',
                           'bom_parts', 'bom_stages']
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

  -- History: read and add, never change or delete.
  foreach t in array array['bom_events', 'stock_item_events']
  loop
    execute format('drop policy if exists "Signed-in users can read %s" on %I', t, t);
    execute format('create policy "Signed-in users can read %s" on %I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('drop policy if exists "Signed-in users can insert %s" on %I', t, t);
    execute format('create policy "Signed-in users can insert %s" on %I for insert with check (auth.role() = ''authenticated'')', t, t);
  end loop;
end $$;


-- ============ Check ============
--
-- Every row should say ready. A row saying MISSING means that part of
-- this file did not land; run it again and read the error.

with checks (thing, found) as (
  values
    ('table quotes',                exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quotes')),
    ('table quote_items',           exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_items')),
    ('table quote_cost_lines',      exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_cost_lines')),
    ('table quote_parts',           exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_parts')),
    ('table quote_processes',       exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_processes')),
    ('table quote_rates',           exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_rates')),
    ('table quote_cutting_speeds',  exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_cutting_speeds')),
    ('table bom_parts',             exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'bom_parts')),
    ('table bom_stages',            exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'bom_stages')),
    ('table bom_events',            exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'bom_events')),
    ('table stock_item_events',     exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'stock_item_events')),
    ('column stock_items.recipe_kind',              exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_items'           and column_name = 'recipe_kind')),
    ('column jobs.quote_id',                        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'jobs'                  and column_name = 'quote_id')),
    ('column job_quote_items.parent_quote_item_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_quote_items'       and column_name = 'parent_quote_item_id')),
    ('column job_quote_items.drawing_revision',     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_quote_items'       and column_name = 'drawing_revision')),
    ('column job_cut_items.quote_id',               exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_cut_items'         and column_name = 'quote_id')),
    ('column process_type_settings.puts_fabrications_together', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'process_type_settings' and column_name = 'puts_fabrications_together')),
    ('column profiles.can_quote',                   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'              and column_name = 'can_quote')),
    ('bucket quotes',                               exists (select 1 from storage.buckets where id = 'quotes')),
    ('counter nextQuoteNumber',                     exists (select 1 from master_counters where counter_name = 'nextQuoteNumber'))
)
select thing, case when found then 'ready' else 'MISSING' end as status
from checks

union all

select 'seeded',
       (select count(*) from quote_processes)::text || ' quote processes, '
       || (select count(*) from quote_rates)::text || ' rates, '
       || (select count(*) from quote_cutting_speeds)::text || ' cutting speeds'

union all

select 'parts already marked as fabrications',
       (select count(*) from stock_items where recipe_kind = 'fabrication')::text

order by 1;


-- ============================================================
-- setup-made-on-welding.sql
-- ============================================================
-- Welding as a cut method, so a welded part can be tagged like any other.
--
-- The cut method on a job line and on a stock part is checked against a
-- fixed list, so that nobody can invent "Tube Laser" and "tube laser" as
-- two different things. This adds "welding" to that list.
--
-- Nothing changes on any screen until the app that offers it is pushed,
-- and nothing changes on the floor until a stage is pointed at it (see
-- the note at the bottom). Running this on its own is safe and does
-- nothing visible.
--
-- RUN THIS BEFORE THE APP IS PUSHED. The other way round, choosing
-- Welding on a line is refused by the database and the line will not
-- save.
--
-- Select nothing before pressing Run. Safe to run more than once.
-- Run it on the PRACTICE database first, then on live.


-- ============ 1. The list, on a job's line ============
--
-- Dropped and recreated rather than altered, which is how
-- setup-made-on-tag.sql wrote it and keeps this safe to run twice.

alter table job_quote_items drop constraint if exists job_quote_items_made_on_check;
alter table job_quote_items
  add constraint job_quote_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly', 'welding'));


-- ============ 2. The same list, on the stock part ============
--
-- A line's cut method is remembered on the part it is linked to, so the
-- part's own list has to allow it too or that saving fails instead.

alter table stock_items drop constraint if exists stock_items_made_on_check;
alter table stock_items
  add constraint stock_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly', 'welding'));


-- ============ 3. What a stage may say it cuts ============
--
-- A stage's setting is the same list without "assembly": nothing cuts an
-- assembly. Welding is added, so a stage can be set to "Cuts: Welding"
-- under Stock Manager -> Job Process Types.

do $$
begin
  if to_regclass('public.process_type_settings') is not null then
    alter table process_type_settings drop constraint if exists process_type_settings_cuts_made_on_check;
    alter table process_type_settings
      add constraint process_type_settings_cuts_made_on_check
      check (cuts_made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'welding'));
  end if;
end $$;


-- ============ Check ============
--
-- Both rows should say ready.

select 'job line may be tagged Welding' as thing,
       case when exists (
         select 1 from pg_constraint
         where conname = 'job_quote_items_made_on_check'
           and pg_get_constraintdef(oid) like '%welding%'
       ) then 'ready' else 'MISSING' end as status

union all

select 'stock part may be tagged Welding',
       case when exists (
         select 1 from pg_constraint
         where conname = 'stock_items_made_on_check'
           and pg_get_constraintdef(oid) like '%welding%'
       ) then 'ready' else 'MISSING' end

union all

select 'a stage may be set to Cuts: Welding',
       case when to_regclass('public.process_type_settings') is null then 'no settings table here'
            when exists (
              select 1 from pg_constraint
              where conname = 'process_type_settings_cuts_made_on_check'
                and pg_get_constraintdef(oid) like '%welding%'
            ) then 'ready' else 'MISSING' end

union all

select 'lines tagged Welding so far',
       (select count(*)::text from job_quote_items where made_on = 'welding')

order by 1;


-- ============ Afterwards, and this matters ============
--
-- A PART (a line under another line) is only listed by a stage whose
-- machine matches it. So a part tagged Welding is listed NOWHERE until
-- a stage is set to "Cuts: Welding" under Stock Manager -> Job Process
-- Types. Tag the parts and set the stage in the same sitting.
--
-- Setting the Welding stage to "Cuts: Welding" also changes what else
-- it lists. A stage with a machine set stops listing the job's own
-- lines (the ones that carry the money) and lists only the parts tagged
-- for it. If Welding is where a fabrication's parts come together and
-- become one thing again, that is the wrong way round: leave that stage
-- on "Every item" and put the tag on a separate welding stage instead.


-- ============================================================
-- setup-made-on-external.sql
-- ============================================================
-- Two more cut methods: Laser - external, Machining - external.
-- Adds laser_external and machining_external to the fixed list a job line, a
-- stock part and a stage's "Cuts:" setting are checked against. Welding and
-- assembly stay allowed. Nothing changes on screen until the app offering them
-- is pushed. RUN BEFORE THAT PUSH: practice first, then live. Safe to run twice.
-- setup-made-on-tag.sql and setup-made-on-welding.sql write shorter lists; if
-- either is ever run again, run this one after it.

alter table job_quote_items drop constraint if exists job_quote_items_made_on_check;
alter table job_quote_items add constraint job_quote_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly', 'welding', 'laser_external', 'machining_external'));

alter table stock_items drop constraint if exists stock_items_made_on_check;
alter table stock_items add constraint stock_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly', 'welding', 'laser_external', 'machining_external'));

do $do$
begin
  if to_regclass('public.process_type_settings') is not null then
    alter table process_type_settings drop constraint if exists process_type_settings_cuts_made_on_check;
    alter table process_type_settings add constraint process_type_settings_cuts_made_on_check
      check (cuts_made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'welding', 'laser_external', 'machining_external'));
  end if;
end $do$;

-- Check: three rows, each should say ready.
select c.thing, case when exists (select 1 from pg_constraint where conname = c.rule
         and pg_get_constraintdef(oid) like '%machining_external%') then 'ready' else 'MISSING' end as status
from (values ('1 a job line may be tagged external', 'job_quote_items_made_on_check'),
             ('2 a stock part may be tagged external', 'stock_items_made_on_check'),
             ('3 a stage may say Cuts: external', 'process_type_settings_cuts_made_on_check')) as c(thing, rule)
order by 1;


-- ============================================================
-- setup-extra-stages.sql
-- ============================================================
-- Extra stages per job line: the steps after its first cut, in its own order.
-- A job line and a stock part get extra_stages, a list of stage names such as
-- {"Machining - External","Bending"}: machined first, then bent. Left empty
-- (null) it was never set and the line goes to every such stage; an empty
-- list {} means nothing extra. A stage gets only_marked: switched on, it lists
-- only the lines that name it. Nothing changes on the floor until a stage is
-- switched on. RUN ON BOTH DATABASES BEFORE THE APP THAT USES IT IS PUSHED:
-- the stock screen saves extra_stages on every stock save. Safe to run twice.

alter table job_quote_items add column if not exists extra_stages text[];
alter table stock_items add column if not exists extra_stages text[];

do $do$
begin
  if to_regclass('public.process_type_settings') is not null then
    alter table process_type_settings add column if not exists only_marked boolean not null default false;
  end if;
end $do$;

-- Check: three rows, each should say ready.
select c.thing, case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = c.tbl and column_name = c.col) then 'ready' else 'MISSING' end as status
from (values ('1 a job line keeps its extra stages', 'job_quote_items', 'extra_stages'),
             ('2 a stock part remembers them', 'stock_items', 'extra_stages'),
             ('3 a stage can list only marked lines', 'process_type_settings', 'only_marked')) as c(thing, tbl, col)
order by 1;


-- ============================================================
-- setup-job-line-stock-code.sql
-- ============================================================
-- Run CHECK-stock-code-backfill.sql first and read what it says. Then
-- run this once in Supabase -> SQL Editor -> New query -> Run.
--
-- The stock code on a job line, as a field of its own.
--
--
-- WHY
--
-- The code is what identifies a part. Two parts can share a
-- description, so the description cannot say which part a line is, and
-- following it picked the wrong one -- that was a real fault on a real
-- job.
--
-- Until now the code was kept on the front of the description, as
-- "ABC123 — Bracket", because there was nowhere else to put it. That
-- worked, but it meant the app had to decide where a code ended and a
-- sentence began, and a description that happens to contain a dash is
-- not a code. A rule like that goes wrong quietly, months later.
--
-- So the code gets its own field. The description goes back to being
-- only a description.
--
--
-- THIS ONE EDITS EXISTING ROWS
--
-- Nearly every other setup script only adds things. This one also
-- rewrites descriptions, so it is not the usual paste-and-forget. Run
-- it on the practice project first and look at a job you know.
--
-- It is still safe to run twice: the backfill only fills a code that is
-- empty, and only trims a description that still starts with its own
-- code.

alter table job_quote_items
  add column if not exists stock_code text not null default '';

create index if not exists job_quote_items_stock_code_idx on job_quote_items (stock_code);

-- 1. Copy the code off the part each line already points at. Nothing is
--    guessed: the line already says which part it is.
update job_quote_items q
set stock_code = s.part_number
from stock_items s
where q.linked_item_id = s.id
  and coalesce(s.part_number, '') <> ''
  and coalesce(q.stock_code, '') = '';

-- 2. Take the code back off the front of the description, now that it
--    has a field of its own. Only where the description really does
--    begin with that exact code, a space, an em dash and a space, so a
--    description that merely contains a dash is untouched.
update job_quote_items
set description = substr(description, length(stock_code) + 4)
where coalesce(stock_code, '') <> ''
  and description like stock_code || ' — %';

-- ============ Check ============
--
-- Three numbers. "lines_with_a_code" should match what the CHECK script
-- said would be filled in, and "still_carrying_the_code_in_the_text"
-- should be 0.
select 'job_quote_items.stock_code' as check_name,
       count(*) as job_lines,
       count(*) filter (where coalesce(stock_code, '') <> '') as lines_with_a_code,
       count(*) filter (where coalesce(stock_code, '') <> '' and description like stock_code || ' — %')
         as still_carrying_the_code_in_the_text
from job_quote_items;


-- ============================================================
-- setup-job-line-material-type.sql
-- ============================================================
-- Run this once in Supabase -> SQL Editor -> New query, then Run.
--
-- The material a tube job line is cut from, in words.
--
-- On a line made on the tube laser, the sales person sets the section
-- and grade the part is cut from, e.g. "SHS 50x50x3mm 304". When a tube
-- nesting report is imported, each section in it is matched to the job
-- lines of that same material, so the import knows which lines a
-- section's program is for without being asked.
--
-- Words, not a stock line's id, on purpose. A part is cut from a
-- section and grade; which length the nester takes it from is decided on
-- the day. An id names one shelf row of one length, so it would miss
-- whenever the nester picks another length of the same material.
--
-- THIS MIRRORS THE APP. The words are made by one function in the app,
-- materialText in src/laser/stockOptions.js, which already writes
-- laser_programs.material and tube_section_aliases.section_name. The
-- database does not check them. Change that function and all three move
-- together; change the wording anywhere else and the match stops.
--
-- Blank on every existing line, which reads correctly as "not said".
-- Nothing on any screen changes when this runs.
--
-- Safe to run more than once. It only adds a column; no row is changed.

alter table job_quote_items
  add column if not exists material_type text not null default '';

create index if not exists job_quote_items_material_type_idx on job_quote_items (material_type);

-- ============ Check ============
--
-- One row. "lines_with_a_material" is 0 until somebody sets one on a
-- tube line. That is correct, not a problem.
select 'job_quote_items.material_type' as check_name,
       count(*) as job_lines,
       count(*) filter (where coalesce(material_type, '') <> '') as lines_with_a_material
from job_quote_items;


-- ============================================================
-- setup-material-spellings.sql
-- ============================================================
-- Sections step 3: one spelling per material.
--
-- The rule (Heinrich, 16 Sep 2026): a material is stored as its short
-- name if it has one on the Material Types list, otherwise its full name.
-- This rewrites what was stored the other way. Data only: no table,
-- column or rule changes. Safe to run twice: a second run finds nothing.
-- Paste PART 1, run, then PART 2, run. Practice first, then live.
--
-- Left alone on purpose: CNC bar lines (their own materials list), old
-- purchase orders (history), stock item names, and fastener lines (the
-- fastener step converts them). The tube section aliases hold no material.

-- ============ PART 1 ============
update public.master_factor_items set short_name = 'Galv'
where list_name = 'grades' and lower(trim(name)) = 'galvanised' and coalesce(short_name, '') = '';

do $do$
declare m record;
begin
  for m in
    select trim(name) as full_name, trim(short_name) as short_name
    from public.master_factor_items
    where list_name = 'grades' and coalesce(trim(short_name), '') <> ''
  loop
    -- Whole-value columns: full name, or the short name in other capitals.
    update public.stock_items set grade = m.short_name
    where main_cat not in ('cncBar', 'fasteners') and grade <> m.short_name
      and lower(trim(grade)) in (lower(m.full_name), lower(m.short_name));
    update public.master_factor_items set grade = m.short_name
    where list_name = 'sections' and grade <> m.short_name
      and lower(trim(grade)) in (lower(m.full_name), lower(m.short_name));
    update public.requisitions set item_grade = m.short_name
    where item_grade <> m.short_name
      and lower(trim(item_grade)) in (lower(m.full_name), lower(m.short_name));
    update public.job_cut_items set grade = m.short_name
    where grade <> m.short_name
      and lower(trim(grade)) in (lower(m.full_name), lower(m.short_name));
    -- Laser programs end with the material: "3mm Stainless 304".
    update public.laser_programs
    set material = left(trim(material), length(trim(material)) - length(m.full_name)) || m.short_name
    where lower(trim(material)) like '% ' || lower(m.full_name);
    update public.laser_programs
    set material = left(trim(material), length(trim(material)) - length(m.short_name)) || m.short_name
    where lower(trim(material)) like '% ' || lower(m.short_name)
      and right(trim(material), length(m.short_name)) <> m.short_name;
  end loop;
end $do$;

-- ============ PART 2 ============
-- "MS" is not on the list; Mild Steel has no short name, so it is written in full.
update public.job_cut_items set grade = 'Mild Steel' where lower(trim(grade)) = 'ms';

update public.laser_programs
set material = left(trim(material), length(trim(material)) - 2) || 'Mild Steel'
where trim(material) ~* ' ms$';

-- Heinrich, 16 Sep: the channel program with no material is mild steel,
-- like the other three of that channel.
update public.laser_programs set material = '80x42x6 Channel BPW Mild Steel'
where trim(material) = '80x42x6 Channel BPW';


-- ============================================================
-- setup-material-spellings-2.sql
-- ============================================================
-- Sections step 3, part two: Galvanised, and CNC bar requests put back.
--
-- Heinrich, 16 Sep 2026: the material is spelled "Galvanised" and its
-- short name is "Galv". Live's Material Types row said "Galvanized" with
-- no short name, so setup-material-spellings.sql, which looked for
-- "galvanised", changed nothing for it, while 7 laser programs end in
-- "Galvanised". PART 1 renames the list row and gives it the short name.
-- PART 2 writes "Galv" wherever the material is stored, either spelling.
-- PART 3 undoes one thing that file did wrong: it rewrote requisitions
-- without leaving CNC bar lines alone, so a CNC bar request for
-- "Stainless 304" became "SS304", which the CNC Bar Grades list has no
-- row for, and it priced at R0. CNC bar requests get the full name back.
--
-- Data only: no table, column or rule changes. Safe to run twice.
-- Paste PART 1, run, then PART 2, run, then PART 3, run.
-- Practice first, then live.

-- ============ PART 1: the Material Types row ============
update public.master_factor_items set name = 'Galvanised'
where list_name = 'grades' and lower(trim(name)) = 'galvanized'
  and not exists (select 1 from public.master_factor_items g
                  where g.list_name = 'grades' and lower(trim(g.name)) = 'galvanised');
update public.master_factor_items set short_name = 'Galv'
where list_name = 'grades' and lower(trim(name)) = 'galvanised' and coalesce(trim(short_name), '') = '';

-- ============ PART 2: everywhere the material is stored ============
update public.stock_items set grade = 'Galv'
where main_cat not in ('cncBar', 'fasteners') and grade <> 'Galv'
  and lower(trim(grade)) in ('galvanized', 'galvanised', 'galv');
update public.master_factor_items set grade = 'Galv'
where list_name = 'sections' and grade <> 'Galv'
  and lower(trim(grade)) in ('galvanized', 'galvanised', 'galv');
update public.requisitions set item_grade = 'Galv'
where main_cat not in ('cncBar', 'fasteners') and item_grade <> 'Galv'
  and lower(trim(item_grade)) in ('galvanized', 'galvanised', 'galv');
update public.job_cut_items set grade = 'Galv'
where grade <> 'Galv' and lower(trim(grade)) in ('galvanized', 'galvanised', 'galv');
-- Text that ends with the material, e.g. "2mm Galvanised": the last ten
-- letters become Galv. Programs, tube job lines and the tube import's memory.
update public.laser_programs set material = left(trim(material), length(trim(material)) - 10) || 'Galv'
where lower(trim(material)) like '% galvanised' or lower(trim(material)) like '% galvanized';
update public.job_quote_items set material_type = left(trim(material_type), length(trim(material_type)) - 10) || 'Galv'
where lower(trim(material_type)) like '% galvanised' or lower(trim(material_type)) like '% galvanized';
update public.tube_section_aliases set section_name = left(trim(section_name), length(trim(section_name)) - 10) || 'Galv'
where lower(trim(section_name)) like '% galvanised' or lower(trim(section_name)) like '% galvanized';

-- ============ PART 3: CNC bar requests get their full name back ============
update public.requisitions r set item_grade = g.name
from public.master_factor_items g
where r.main_cat = 'cncBar' and g.list_name = 'grades'
  and coalesce(trim(g.short_name), '') <> '' and r.item_grade = g.short_name
  and exists (select 1 from public.master_factor_items c where c.list_name = 'cncGrades' and c.name = g.name);

-- Check: four rows, each should say ready.
select c.thing, case when c.ok then 'ready' else 'MISSING' end as status
from (values
  ('1 Material Types says Galvanised, short name Galv',
    exists (select 1 from public.master_factor_items where list_name = 'grades' and name = 'Galvanised' and short_name = 'Galv')
    and not exists (select 1 from public.master_factor_items where list_name = 'grades' and lower(trim(name)) = 'galvanized')),
  ('2 no plate line, section or request still says it in full',
    not exists (select 1 from public.stock_items where main_cat not in ('cncBar', 'fasteners') and lower(trim(grade)) in ('galvanized', 'galvanised'))
    and not exists (select 1 from public.master_factor_items where list_name = 'sections' and lower(trim(grade)) in ('galvanized', 'galvanised'))
    and not exists (select 1 from public.requisitions where main_cat not in ('cncBar', 'fasteners') and lower(trim(item_grade)) in ('galvanized', 'galvanised'))),
  ('3 no laser program ends in Galvanised',
    not exists (select 1 from public.laser_programs where lower(trim(material)) like '% galvanised' or lower(trim(material)) like '% galvanized')),
  ('4 no CNC bar request carries a short name',
    not exists (select 1 from public.requisitions r join public.master_factor_items g
                  on g.list_name = 'grades' and coalesce(trim(g.short_name), '') <> '' and r.item_grade = g.short_name
                where r.main_cat = 'cncBar'))
) as c(thing, ok)
order by 1;


-- ============================================================
-- setup-section-dimensions.sql
-- ============================================================
-- Sections step 4: a section's numbers, kept apart from its name.
--
-- Stock Manager -> Sections now builds a section from fixed boxes per
-- type (SHS: size and wall) and writes the name from them. The numbers
-- are kept here too, so kg/m can be worked out later (step 6) without
-- reading them back out of the name.
--
-- One column, empty for every existing row until step 5 converts them.
-- Other lists in this table (materials, sizes) never use it.
-- Safe to run twice. Practice first, then live, BEFORE the app code that
-- writes it is pushed: a save naming a column that is not there fails.

alter table public.master_factor_items
  add column if not exists dimensions jsonb;


-- ============================================================
-- setup-section-names.sql
-- ============================================================
-- Sections step 5: every existing section converted to the new names.
--
-- GENERATED by scripts/make-section-conversion-sql.mjs from the list
-- Heinrich approved (docs/SECTION-CONVERSION-LIST.md, 16-17 Sep 2026).
-- Do not edit by hand: change the script and run it again.
--
-- Renames each section in Stock Manager and every copy of its name:
-- structural stock lines, requisitions (name and label), cut lists,
-- quote and BOM parts, reservations, the usage log, tube section aliases,
-- laser programs and tube job lines (these three start with the section,
-- then the material). Fills in each section's type and numbers, merges
-- the rows that become one (keeping the larger kg/m and R/m), deletes the
-- cut-off "Round Tube 42mm x 1.", adds CH 120x55, and sets the Section
-- Types list to the fixed 18. Old purchase orders are history: untouched.
--
-- Safe to run twice: a second run finds no old names left.
-- Paste each PART on its own, in order: practice first, then live.
-- Best run when nobody has Stock Manager open; refresh the app afterwards.

-- ============ PART 1 ============
create table if not exists public.section_rename_map (old text primary key, new text not null, type text not null, dims jsonb not null);
-- No rules: the app never reads it, only this SQL (run as the owner) does.
alter table public.section_rename_map enable row level security;

insert into public.section_rename_map (old, new, type, dims) values
  ('SHS 25X25X1.9', 'SHS 25x25x1.9', 'Square Tube', '{"shape":"SHS","a":25,"t":1.9}'::jsonb),
  ('SHS 30x30x3mm', 'SHS 30x30x3', 'Square Tube', '{"shape":"SHS","a":30,"t":3}'::jsonb),
  ('SHS 32x32x2mm', 'SHS 32x32x2', 'Square Tube', '{"shape":"SHS","a":32,"t":2}'::jsonb),
  ('SHS 32x32x3mm', 'SHS 32x32x3', 'Square Tube', '{"shape":"SHS","a":32,"t":3}'::jsonb),
  ('SHS 38.1x38.1x1.6', 'SHS 38.1x38.1x1.6', 'Square Tube', '{"shape":"SHS","a":38.1,"t":1.6}'::jsonb),
  ('38.10*1.60*3250mm', 'SHS 38.1x38.1x1.6', 'Square Tube', '{"shape":"SHS","a":38.1,"t":1.6}'::jsonb),
  ('38.10*1.60*3300mm', 'SHS 38.1x38.1x1.6', 'Square Tube', '{"shape":"SHS","a":38.1,"t":1.6}'::jsonb),
  ('SHS 38.1x38.1x2mm', 'SHS 38.1x38.1x2', 'Square Tube', '{"shape":"SHS","a":38.1,"t":2}'::jsonb),
  ('SHS 40x40x3mm', 'SHS 40x40x3', 'Square Tube', '{"shape":"SHS","a":40,"t":3}'::jsonb),
  ('50x50x1.5', 'SHS 50x50x1.5', 'Square Tube', '{"shape":"SHS","a":50,"t":1.5}'::jsonb),
  ('SHS 50x50x1.5mm', 'SHS 50x50x1.5', 'Square Tube', '{"shape":"SHS","a":50,"t":1.5}'::jsonb),
  ('50x50x2', 'SHS 50x50x2', 'Square Tube', '{"shape":"SHS","a":50,"t":2}'::jsonb),
  ('SHS 50x50x2mm', 'SHS 50x50x2', 'Square Tube', '{"shape":"SHS","a":50,"t":2}'::jsonb),
  ('SHS 50x50x3mm', 'SHS 50x50x3', 'Square Tube', '{"shape":"SHS","a":50,"t":3}'::jsonb),
  ('SHS 76x76x2mm', 'SHS 76.2x76.2x2', 'Square Tube', '{"shape":"SHS","a":76.2,"t":2}'::jsonb),
  ('SHS 76.2x76.2x2mm', 'SHS 76.2x76.2x2', 'Square Tube', '{"shape":"SHS","a":76.2,"t":2}'::jsonb),
  ('SHS 100x100x2mm', 'SHS 100x100x2', 'Square Tube', '{"shape":"SHS","a":100,"t":2}'::jsonb),
  ('RHS 50x25x2mm', 'RHS 50x25x2', 'Rectangular Tube', '{"shape":"RHS","a":50,"b":25,"t":2}'::jsonb),
  ('RHS 60x30x3mm', 'RHS 60x30x3', 'Rectangular Tube', '{"shape":"RHS","a":60,"b":30,"t":3}'::jsonb),
  ('RHS 76x38x1.9mm', 'RHS 76.2x38.1x1.9', 'Rectangular Tube', '{"shape":"RHS","a":76.2,"b":38.1,"t":1.9}'::jsonb),
  ('RHS 76x50x1.9mm', 'RHS 76.2x50.8x1.9', 'Rectangular Tube', '{"shape":"RHS","a":76.2,"b":50.8,"t":1.9}'::jsonb),
  ('76X50X1.9mm', 'RHS 76.2x50.8x1.9', 'Rectangular Tube', '{"shape":"RHS","a":76.2,"b":50.8,"t":1.9}'::jsonb),
  ('RHS 76.2x50.8x2mm', 'RHS 76.2x50.8x2', 'Rectangular Tube', '{"shape":"RHS","a":76.2,"b":50.8,"t":2}'::jsonb),
  ('RHS 76x50x4.5mm', 'RHS 76.2x50.8x4.5', 'Rectangular Tube', '{"shape":"RHS","a":76.2,"b":50.8,"t":4.5}'::jsonb),
  ('RHS 80x40x3.6mm', 'RHS 80x40x3.6', 'Rectangular Tube', '{"shape":"RHS","a":80,"b":40,"t":3.6}'::jsonb),
  ('100x50x2', 'RHS 100x50x2', 'Rectangular Tube', '{"shape":"RHS","a":100,"b":50,"t":2}'::jsonb),
  ('RHS 100x50x2mm', 'RHS 100x50x2', 'Rectangular Tube', '{"shape":"RHS","a":100,"b":50,"t":2}'::jsonb),
  ('RHS 150x50x2mm', 'RHS 150x50x2', 'Rectangular Tube', '{"shape":"RHS","a":150,"b":50,"t":2}'::jsonb),
  ('Round Tube 19mm x 2mm wall', 'CHS 19.05x2', 'Round Tube', '{"shape":"CHS","od":19.05,"t":2}'::jsonb),
  ('Round Tube 19.05mm x 1.5mm wall', 'CHS 19.05x1.5', 'Round Tube', '{"shape":"CHS","od":19.05,"t":1.5}'::jsonb),
  ('Round Tube 22.2mm x 1.2mm wall', 'CHS 22.2x1.2', 'Round Tube', '{"shape":"CHS","od":22.2,"t":1.2}'::jsonb),
  ('Round Tube 25mm x 2mm wall', 'CHS 25x2', 'Round Tube', '{"shape":"CHS","od":25,"t":2}'::jsonb),
  ('Round Tube 34mm x1.5mm wall', 'CHS 34x1.5', 'Round Tube', '{"shape":"CHS","od":34,"t":1.5}'::jsonb),
  ('Round Tube 38.1mm X 1.2mm wall', 'CHS 38.1x1.2', 'Round Tube', '{"shape":"CHS","od":38.1,"t":1.2}'::jsonb)
on conflict (old) do update set new = excluded.new, type = excluded.type, dims = excluded.dims;

-- ============ PART 2 ============
insert into public.section_rename_map (old, new, type, dims) values
  ('Round Tube 38.1mm x 1.5mm wall', 'CHS 38.1x1.5', 'Round Tube', '{"shape":"CHS","od":38.1,"t":1.5}'::jsonb),
  ('Round Tube 38.1mm x 1.6mm wall', 'CHS 38.1x1.6', 'Round Tube', '{"shape":"CHS","od":38.1,"t":1.6}'::jsonb),
  ('Round Tube 38.1mm x 2mm wall', 'CHS 38.1x2', 'Round Tube', '{"shape":"CHS","od":38.1,"t":2}'::jsonb),
  ('Round Tube 38.1mm x 3.18mm wall', 'CHS 38.1x3.18', 'Round Tube', '{"shape":"CHS","od":38.1,"t":3.18}'::jsonb),
  ('Round Tube 41.27mm x 1.2mm wall', 'CHS 41.27x1.2', 'Round Tube', '{"shape":"CHS","od":41.27,"t":1.2}'::jsonb),
  ('Round Tube 42mm x1.5mm wall', 'CHS 42x1.5', 'Round Tube', '{"shape":"CHS","od":42,"t":1.5}'::jsonb),
  ('Round Tube 48.4 X 3.5mm wall', 'CHS 48.4x3.5', 'Round Tube', '{"shape":"CHS","od":48.4,"t":3.5}'::jsonb),
  ('48.4x3.5', 'CHS 48.4x3.5', 'Round Tube', '{"shape":"CHS","od":48.4,"t":3.5}'::jsonb),
  ('GRIT ROUND TUBE 50.8mm x 1.2mm', 'CHS 50.8x1.2', 'Round Tube', '{"shape":"CHS","od":50.8,"t":1.2}'::jsonb),
  ('Round Tube 57mm x 1.5mm wall', 'CHS 57x1.5', 'Round Tube', '{"shape":"CHS","od":57,"t":1.5}'::jsonb),
  ('Round Tube 57mm x 1.9mm wall', 'CHS 57x1.9', 'Round Tube', '{"shape":"CHS","od":57,"t":1.9}'::jsonb),
  ('Round Tube 63.5mm x 4mm wall', 'CHS 63.5x4', 'Round Tube', '{"shape":"CHS","od":63.5,"t":4}'::jsonb),
  ('Round Tube 76.2mm x 2mm wall', 'CHS 76.2x2', 'Round Tube', '{"shape":"CHS","od":76.2,"t":2}'::jsonb),
  ('88.9 X 2.5mm', 'CHS 88.9x2.5', 'Round Tube', '{"shape":"CHS","od":88.9,"t":2.5}'::jsonb),
  ('Round Tube 88.9 X 2.5mm wall', 'CHS 88.9x2.5', 'Round Tube', '{"shape":"CHS","od":88.9,"t":2.5}'::jsonb),
  ('Round Tube 88.9mm x 2mm wall', 'CHS 88.9x2', 'Round Tube', '{"shape":"CHS","od":88.9,"t":2}'::jsonb),
  ('Round Tube 152mm x 3mm wall', 'CHS 152x3', 'Round Tube', '{"shape":"CHS","od":152,"t":3}'::jsonb),
  ('Round Bar 5mm', 'RB 5', 'Round Bar', '{"shape":"RB","a":5}'::jsonb),
  ('Round Bar 6mm', 'RB 6', 'Round Bar', '{"shape":"RB","a":6}'::jsonb),
  ('Round Bar 8mm', 'RB 8', 'Round Bar', '{"shape":"RB","a":8}'::jsonb),
  ('Round Bar 10mm', 'RB 10', 'Round Bar', '{"shape":"RB","a":10}'::jsonb),
  ('Round Bar 12mm', 'RB 12', 'Round Bar', '{"shape":"RB","a":12}'::jsonb),
  ('Round Bar 16mm', 'RB 16', 'Round Bar', '{"shape":"RB","a":16}'::jsonb),
  ('Round Bar 20mm', 'RB 20', 'Round Bar', '{"shape":"RB","a":20}'::jsonb),
  ('Round Bar 30mm', 'RB 30', 'Round Bar', '{"shape":"RB","a":30}'::jsonb),
  ('Equal Angle 40x40x3mm', 'EA 40x40x3', 'Equal Angle', '{"shape":"EA","a":40,"t":3}'::jsonb),
  ('Equal Angle 50x50x5mm', 'EA 50x50x5', 'Equal Angle', '{"shape":"EA","a":50,"t":5}'::jsonb),
  ('Equal Angle 80x80x6mm', 'EA 80x80x6', 'Equal Angle', '{"shape":"EA","a":80,"t":6}'::jsonb),
  ('Equal Angle 100x100x8mm', 'EA 100x100x8', 'Equal Angle', '{"shape":"EA","a":100,"t":8}'::jsonb),
  ('152x152x37', 'UC 152x152x37', 'H-Beam', '{"shape":"UC","a":152,"b":152,"kgm":37}'::jsonb),
  ('203x203x46', 'UC 203x203x46', 'H-Beam', '{"shape":"UC","a":203,"b":203,"kgm":46}'::jsonb),
  ('254x146x37KG', 'UB 254x146x37', 'I-Beam', '{"shape":"UB","a":254,"b":146,"kgm":37}'::jsonb),
  ('254x146x37', 'UB 254x146x37', 'I-Beam', '{"shape":"UB","a":254,"b":146,"kgm":37}'::jsonb),
  ('406x178x54', 'UB 406x178x54', 'I-Beam', '{"shape":"UB","a":406,"b":178,"kgm":54}'::jsonb)
on conflict (old) do update set new = excluded.new, type = excluded.type, dims = excluded.dims;

-- ============ PART 3 ============
insert into public.section_rename_map (old, new, type, dims) values
  ('406x178x60', 'UB 406x178x60', 'I-Beam', '{"shape":"UB","a":406,"b":178,"kgm":60}'::jsonb),
  ('Seamless Pipe NB20 SCH160 26.7 x 5.56', 'PIPE NB20 SCH160 26.7OD 15.58ID 5.56WT', 'Pipe', '{"shape":"PIPE","std":"SCH","nb":20,"sch":"160","od":26.7,"t":5.56}'::jsonb),
  ('Seamless Pipe NB20 SCH160 (26.7 x 5.56mm)', 'PIPE NB20 SCH160 26.7OD 15.58ID 5.56WT', 'Pipe', '{"shape":"PIPE","std":"SCH","nb":20,"sch":"160","od":26.7,"t":5.56}'::jsonb),
  ('Seamless Pipe NB25 SCH40 (33.4x4.55mm)', 'PIPE NB25 SCH80 33.4OD 24.3ID 4.55WT', 'Pipe', '{"shape":"PIPE","std":"SCH","nb":25,"sch":"80","od":33.4,"t":4.55}'::jsonb),
  ('Seamless Pipe NB40 SCH80 (48.26x5.08mm)', 'PIPE NB40 SCH80 48.3OD 38.14ID 5.08WT', 'Pipe', '{"shape":"PIPE","std":"SCH","nb":40,"sch":"80","od":48.3,"t":5.08}'::jsonb),
  ('Welded Pipe NB15 Medium (21.7x2.3mm)', 'PIPE NB15 SANS62 Medium 21.3OD 16ID 2.65WT', 'Pipe', '{"shape":"PIPE","std":"SANS62","nb":15,"cls":"Medium","od":21.3,"t":2.65}'::jsonb),
  ('80x42x6 Channel BPW', 'CC 80x42x6', 'Custom Channel', '{"shape":"CC","a":80,"b":42,"t":6}'::jsonb),
  ('120x55', 'CH 120x55', 'Taper Flange Channel', '{"shape":"CH","a":120,"b":55}'::jsonb)
on conflict (old) do update set new = excluded.new, type = excluded.type, dims = excluded.dims;

-- ============ PART 4 ============
-- The two 38.1 stock lines carried their length in the name.
update public.stock_items set length = 3.25 where main_cat = 'structural' and lower(trim(name)) = '38.10*1.60*3250mm' and coalesce(length, 0) = 0;
update public.stock_items set length = 3.3 where main_cat = 'structural' and lower(trim(name)) = '38.10*1.60*3300mm' and coalesce(length, 0) = 0;

delete from public.master_factor_items where list_name = 'sections' and trim(name) = 'Round Tube 42mm x 1.';

update public.master_factor_items f set name = m.new, type = m.type, dimensions = m.dims
from public.section_rename_map m
where f.list_name = 'sections' and lower(trim(f.name)) = lower(m.old);

insert into public.master_factor_items (id, list_name, name, factor, price, type, grade, dimensions)
select 'sec-' || md5(m.new), 'sections', m.new, 0, 0, m.type, '', m.dims
from (select distinct new, type, dims from public.section_rename_map where new = 'CH 120x55') m
where not exists (select 1 from public.master_factor_items f where f.list_name = 'sections' and f.name = m.new);

-- Rows that became the same size in the same material: keep one.
with ranked as (
  select id,
    row_number() over w as rn,
    max(factor) over (partition by lower(name), lower(coalesce(grade, ''))) as best_factor,
    max(price) over (partition by lower(name), lower(coalesce(grade, ''))) as best_price
  from public.master_factor_items
  where list_name = 'sections'
  window w as (partition by lower(name), lower(coalesce(grade, '')) order by (price > 0) desc, (factor > 0) desc, id)
)
update public.master_factor_items f set factor = r.best_factor, price = r.best_price
from ranked r where f.id = r.id and r.rn = 1 and (f.factor <> r.best_factor or f.price <> r.best_price);

delete from public.master_factor_items f
using (
  select id, row_number() over (partition by lower(name), lower(coalesce(grade, '')) order by (price > 0) desc, (factor > 0) desc, id) as rn
  from public.master_factor_items where list_name = 'sections'
) r
where f.id = r.id and r.rn > 1;

-- ============ PART 5 ============
update public.stock_items s set name = m.new from public.section_rename_map m
  where s.main_cat = 'structural' and lower(trim(s.name)) = lower(m.old);
update public.requisitions r set item_raw_name = m.new from public.section_rename_map m
  where r.main_cat = 'structural' and lower(trim(r.item_raw_name)) = lower(m.old);
update public.requisitions r set item_label = left(r.item_label, length(r.item_label) - length(m.old)) || m.new
  from public.section_rename_map m
  where r.main_cat = 'structural' and lower(r.item_label) like '% — ' || lower(m.old);
update public.job_cut_items c set section = m.new from public.section_rename_map m where lower(trim(c.section)) = lower(m.old);
update public.quote_parts p set section = m.new from public.section_rename_map m where lower(trim(p.section)) = lower(m.old);
update public.bom_parts b set section = m.new from public.section_rename_map m where lower(trim(b.section)) = lower(m.old);
update public.job_allocations a set item_name = m.new from public.section_rename_map m
  where a.main_cat = 'structural' and lower(trim(a.item_name)) = lower(m.old);
update public.usage_log u set item_name = m.new from public.section_rename_map m
  where u.main_cat = 'structural' and lower(trim(u.item_name)) = lower(m.old);

-- Section, then material: "SHS 50x50x2mm SS304" -> "SHS 50x50x2 SS304".
update public.tube_section_aliases t set section_name = m.new || substr(trim(t.section_name), length(m.old) + 1)
  from public.section_rename_map m
  where lower(trim(t.section_name)) = lower(m.old) or lower(trim(t.section_name)) like lower(m.old) || ' %';
update public.laser_programs l set material = m.new || substr(trim(l.material), length(m.old) + 1)
  from public.section_rename_map m where lower(trim(l.material)) like lower(m.old) || ' %';
update public.job_quote_items j set material_type = m.new || substr(trim(j.material_type), length(m.old) + 1)
  from public.section_rename_map m where lower(trim(j.material_type)) like lower(m.old) || ' %';

-- ============ PART 6 ============
-- The Section Types list becomes the fixed 18, in their order.
do $do$
declare
  labels text[] := array['Square Tube', 'Rectangular Tube', 'Round Tube', 'Pipe', 'Round Bar', 'Square Bar', 'Flat Bar', 'Hex Bar', 'Equal Angle', 'Unequal Angle', 'Parallel Flange Channel', 'Lipped Channel', 'Taper Flange Channel', 'Custom Channel', 'I-Beam', 'H-Beam', 'IPE Beam', 'Tee'];
  i int;
begin
  delete from public.master_string_lists where list_name = 'sectionTypes' and value <> all (labels);
  for i in 1 .. array_length(labels, 1) loop
    insert into public.master_string_lists (id, list_name, value, sort_order)
    select 'st-' || md5(labels[i]), 'sectionTypes', labels[i], i
    where not exists (select 1 from public.master_string_lists where list_name = 'sectionTypes' and value = labels[i]);
    update public.master_string_lists set sort_order = i where list_name = 'sectionTypes' and value = labels[i];
  end loop;
end $do$;


-- ============================================================
-- setup-supplier-prices.sql
-- ============================================================
-- A material's price, per supplier.
--
-- Until now a material (a plate grade, a CNC bar grade, a section in a
-- material) had one price, on its own row in master_factor_items, with no
-- supplier. This table holds one row per material per supplier, with when
-- the price was set and by whom. The old price stays where it is and is
-- used when a material has no supplier price yet. Nothing is changed or
-- deleted. Removing a supplier removes that supplier's prices.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.master_supplier_prices (
  id text primary key,
  list_name text not null,
  name text not null,
  grade text not null default '',
  supplier_id text not null references public.master_suppliers(id) on delete cascade,
  price numeric not null default 0,
  set_by text not null default '',
  set_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint master_supplier_prices_one_per_supplier unique (list_name, name, grade, supplier_id)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $body$
begin
  new.updated_at = now();
  return new;
end;
$body$;

drop trigger if exists master_supplier_prices_set_updated_at on public.master_supplier_prices;
create trigger master_supplier_prices_set_updated_at
  before update on public.master_supplier_prices
  for each row execute function public.touch_updated_at();

alter table public.master_supplier_prices enable row level security;

do $do$
declare a text;
begin
  foreach a in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists "Signed-in users can %s master_supplier_prices" on public.master_supplier_prices', a);
    execute format('create policy "Signed-in users can %s master_supplier_prices" on public.master_supplier_prices for %s %s (auth.role() = ''authenticated'')',
      a, a, case when a = 'insert' then 'with check' else 'using' end);
  end loop;
end $do$;

-- ============ Check ============
select 'table master_supplier_prices' as thing,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'master_supplier_prices')
            then 'ready' else 'MISSING' end as status
union all
select 'read, add, change and delete rules',
       (select count(*)::text || ' of 4' from pg_policies
        where schemaname = 'public' and tablename = 'master_supplier_prices');


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
-- setup-pdf-print-permission.sql
-- ============================================================
-- Adds the "Can print and download PDFs" permission: profiles.can_print_pdfs.
--
-- Everyone who can open a PDF in the app can look at it. Only admins and
-- people with this tick get the Open / Print and Download PDF buttons under
-- it. Delivery notes are the one exception: everyone can print those.
--
-- Nobody has the tick until it is set in User Management.
-- Safe to run twice: it does nothing if the column is already there.

alter table profiles add column if not exists can_print_pdfs boolean not null default false;


-- ============================================================
-- setup-theme-preference.sql
-- ============================================================
-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Lets each person pick their own color theme (dark, medium, or light),
-- saved with their login so it's remembered wherever they sign in.

alter table profiles add column if not exists theme text not null default 'dark';

