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
