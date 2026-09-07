-- Job history, so an edited job says who changed what.
--
-- Jobs cannot be edited today: the Items tab shows what was quoted and
-- lets you act on it, but nothing can be added, corrected or removed.
-- Before that changes, there has to be somewhere to record it -- an
-- editable job with no history is worse than one that cannot be edited,
-- because a quantity can move and nobody can say who moved it.
--
-- Modelled on the laser program history that already works the same way.
--
-- (There is an older job_qty_updates table in here, unused and nearly
-- empty. It is left exactly as it is -- untouched, not dropped.)
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


-- ============ The table ============

create table if not exists public.job_events (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  action       text not null,          -- item added, item changed, item removed, note
  detail       text not null default '',
  acted_by     text not null default '',
  acted_by_id  uuid,
  acted_at     timestamptz not null default now()
);

create index if not exists job_events_job_idx on public.job_events (job_id, acted_at desc);


-- ============ Who may read and write it ============
--
-- Matches how every other table in this app is set up today. Note that
-- nobody can change or delete an entry -- history that can be edited is
-- not history. Only reading and adding.

alter table public.job_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'job_events' and policyname = 'Signed-in users can read job history') then
    create policy "Signed-in users can read job history"
      on public.job_events for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'job_events' and policyname = 'Signed-in users can add job history') then
    create policy "Signed-in users can add job history"
      on public.job_events for insert
      with check (auth.role() = 'authenticated');
  end if;
end $$;


-- ============ Check ============

select 'job_events table' as thing,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'job_events')
            then 'ready' else 'MISSING' end as status

union all

select 'rules on it',
       coalesce((select string_agg(cmd, ', ' order by cmd) from pg_policies
                 where schemaname = 'public' and tablename = 'job_events'), 'none')

union all

select 'entries so far',
       coalesce((select count(*)::text from public.job_events), '0');
