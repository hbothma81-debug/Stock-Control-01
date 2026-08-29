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
