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
