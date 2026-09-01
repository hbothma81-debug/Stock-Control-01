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
create policy "Signed-in users can read shortages" on shortages
  for select using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can insert shortages" on shortages;
create policy "Signed-in users can insert shortages" on shortages
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can update shortages" on shortages;
create policy "Signed-in users can update shortages" on shortages
  for update using (auth.role() = 'authenticated');

drop policy if exists "Signed-in users can delete shortages" on shortages;
create policy "Signed-in users can delete shortages" on shortages
  for delete using (auth.role() = 'authenticated');

-- One or more people can be the designated shortage handler(s) — always
-- notified when a shortage is flagged, regardless of which job it's on or
-- who (if anyone) is currently assigned to Nesting there.
alter table profiles add column if not exists is_shortage_handler boolean not null default false;
