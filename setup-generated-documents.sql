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
