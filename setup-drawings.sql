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
