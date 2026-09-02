-- Material set aside for a job, and for a particular process on that job.
--
-- Stock ordered specially for a job used to have nowhere to live between
-- arriving and being used. The operator had to go and find it, knowing
-- from somewhere else that it was theirs.
--
-- An allocation reserves rather than removes: stock_items keeps its
-- quantity, so the count still matches what is physically on the shelf.
-- qty_used only rises when an operator actually books material out, and
-- the stock quantity drops at that moment, not before.
--
-- Safe to run more than once.

create table if not exists job_allocations (
  id text primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  job_number text not null default '',

  -- Which stage the material is for. Kept as a name as well as an id: the
  -- id is the real link, the name survives a process being removed from
  -- the job so history still reads correctly.
  process_id uuid references job_processes(id) on delete set null,
  process_name text not null default '',

  -- stock_items.id is text, not uuid. No foreign key on purpose: cutting a
  -- long length can retire the original row and file the remainder as a
  -- new one, and an allocation already used should not vanish because of
  -- that. item_name is kept for the same reason.
  item_id text not null default '',
  item_name text not null default '',
  main_cat text not null default '',

  qty_allocated numeric not null default 0,
  qty_used numeric not null default 0,

  allocated_by text not null default '',
  allocated_by_id uuid references profiles(id) on delete set null,
  note text not null default '',

  -- open -> partially or not yet used; used -> fully consumed;
  -- released -> handed back without being used
  status text not null default 'open',

  created_at timestamptz not null default now()
);

create index if not exists job_allocations_job_idx on job_allocations (job_id);
create index if not exists job_allocations_process_idx on job_allocations (process_id);
create index if not exists job_allocations_item_idx on job_allocations (item_id);

alter table job_allocations enable row level security;

do $$ begin
  create policy "Signed-in users can read job allocations" on job_allocations
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can insert job allocations" on job_allocations
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can update job allocations" on job_allocations
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can delete job allocations" on job_allocations
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Check: should return no rows on a fresh install.
select job_number, process_name, item_name, qty_allocated, qty_used, status
from job_allocations
order by created_at desc;
