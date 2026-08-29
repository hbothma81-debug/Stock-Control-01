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
