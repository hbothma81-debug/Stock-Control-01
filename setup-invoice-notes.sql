-- Questions on an invoice, and the answers.
--
-- Accounts gets a request to bill with something missing off it -- no
-- order number, a quantity that does not look right, a customer name
-- that has changed. Today that conversation happens by walking over, and
-- leaves no trace on the job.
--
-- This keeps it against the job. Anybody signed in can read the thread
-- and add to it. Nobody can edit or delete a line: there is deliberately
-- no update or delete policy, so a question cannot quietly disappear
-- once it has been asked.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.job_invoice_notes (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  note       text not null,
  written_by text,
  created_at timestamptz not null default now()
);

create index if not exists job_invoice_notes_job_idx
  on public.job_invoice_notes (job_id, created_at);

alter table public.job_invoice_notes enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'job_invoice_notes'
                 and policyname = 'Signed-in users can read invoice notes') then
    create policy "Signed-in users can read invoice notes"
      on public.job_invoice_notes for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'job_invoice_notes'
                 and policyname = 'Signed-in users can add invoice notes') then
    create policy "Signed-in users can add invoice notes"
      on public.job_invoice_notes for insert
      with check (auth.role() = 'authenticated');
  end if;
end $do$;


-- ============ Check ============

select 'invoice notes' as step,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'job_invoice_notes')
            then 'ready — a thread per job, add only, nothing can be edited away'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
