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

create policy "Signed-in users can read process item progress" on job_process_item_progress for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add process item progress" on job_process_item_progress for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update process item progress" on job_process_item_progress for update using (auth.role() = 'authenticated');
create policy "Signed-in users can delete process item progress" on job_process_item_progress for delete using (auth.role() = 'authenticated');
