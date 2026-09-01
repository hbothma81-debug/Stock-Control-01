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
