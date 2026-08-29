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
