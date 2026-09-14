-- Info Request: a floor operator says a job is standing until the office
-- answers (a drawing, a dimension...). open -> answered (office replied)
-- or cleared (operator sorted it). Never deleted: the printed Job History
-- lists each one and how long the job stood. Needs touch_updated_at()
-- from setup-updated-at-everywhere.sql. Safe to run more than once.

create table if not exists public.job_info_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  process_id uuid references public.job_processes(id) on delete set null,
  job_number text not null default '',
  stage_name text not null default '',
  kind text not null default '',
  note text not null default '',
  photo_path text not null default '',
  photo_name text not null default '',
  raised_by text not null default '',
  raised_by_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'answered', 'cleared')),
  answer text not null default '',
  closed_by text not null default '',
  closed_by_id uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_info_requests_job_id_idx on public.job_info_requests (job_id);
create index if not exists job_info_requests_updated_at_idx on public.job_info_requests (updated_at);

drop trigger if exists job_info_requests_set_updated_at on public.job_info_requests;
create trigger job_info_requests_set_updated_at before update on public.job_info_requests
  for each row execute function public.touch_updated_at();

-- Read, add and change. No delete rule on purpose: nothing may remove one.
alter table public.job_info_requests enable row level security;
do $read$ begin
  create policy "Signed-in users can read info requests" on public.job_info_requests for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $read$;
do $add$ begin
  create policy "Signed-in users can add info requests" on public.job_info_requests for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $add$;
do $change$ begin
  create policy "Signed-in users can update info requests" on public.job_info_requests for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $change$;

select case when exists (select 1 from pg_policies where tablename = 'job_info_requests' and cmd = 'UPDATE')
             and exists (select 1 from pg_trigger where tgname = 'job_info_requests_set_updated_at' and not tgisinternal)
            then 'job_info_requests ready' else 'SOMETHING IS MISSING - tell Claude' end as result;
