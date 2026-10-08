-- CNC module, file 3 of 5: a program's revisions (A, B, C...). Needs file 2.
-- A revision is never changed or deleted (no update or delete rule); it
-- goes only with its program. "generated" = made by the engine,
-- "machine_copy" = the operator's edited program imported, its own letter
-- (Heinrich, 8 Oct 2026). The app adds a revision with ONE insert and no
-- letter: the database gives the next letter and, in the same save, makes
-- it the program's current revision with its Ready / Not for machine and
-- fault. Two pastes: PASTE 1, then PASTE 2. Safe to run twice.

-- ============ PASTE 1: the table ============

create table if not exists public.cnc_program_revisions (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.cnc_programs(id) on delete cascade,
  rev           text not null,
  source        text not null default 'generated' check (source in ('generated', 'machine_copy')),
  programs      jsonb not null default '[]'::jsonb,
  report        text not null default '',
  ready         boolean not null default false,
  fault         text not null default '',
  fails         jsonb not null default '[]'::jsonb,
  warnings      jsonb not null default '[]'::jsonb,
  problems      jsonb not null default '[]'::jsonb,
  cycle_s       numeric,
  tool_s        numeric,
  costing       jsonb,
  settings      jsonb,
  step_path     text,
  step_name     text,
  note          text not null default '',
  created_by    text not null default '',
  created_by_id uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (program_id, rev)
);

alter table public.cnc_program_revisions enable row level security;

drop policy if exists "CNC people can read revisions" on public.cnc_program_revisions;
create policy "CNC people can read revisions" on public.cnc_program_revisions for select using (public.cnc_may('view'));
drop policy if exists "CNC editors can add revisions" on public.cnc_program_revisions;
create policy "CNC editors can add revisions" on public.cnc_program_revisions for insert with check (public.cnc_may('edit'));

-- ============ PASTE 2: the letter, and the program follows ============

create or replace function public.cnc_revision_letter()
returns trigger
language plpgsql
set search_path = public
as $body$
declare
  n integer;
  v text := '';
begin
  perform 1 from public.cnc_programs where id = new.program_id for update;
  select count(*) into n from public.cnc_program_revisions where program_id = new.program_id;
  loop
    v := chr(65 + n % 26) || v;
    n := n / 26 - 1;
    exit when n < 0;
  end loop;
  new.rev := v;
  return new;
end;
$body$;

create or replace function public.cnc_revision_is_current()
returns trigger
language plpgsql
set search_path = public
as $body$
begin
  update public.cnc_programs
     set current_rev = new.rev,
         status = case when new.ready then 'ready' else 'not_for_machine' end,
         fault = new.fault,
         settings = coalesce(new.settings, settings)
   where id = new.program_id;
  return null;
end;
$body$;

drop trigger if exists cnc_revision_letter on public.cnc_program_revisions;
create trigger cnc_revision_letter before insert on public.cnc_program_revisions
  for each row execute function public.cnc_revision_letter();
drop trigger if exists cnc_revision_is_current on public.cnc_program_revisions;
create trigger cnc_revision_is_current after insert on public.cnc_program_revisions
  for each row execute function public.cnc_revision_is_current();

select 'cnc revisions' as step,
       case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cnc_program_revisions')
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cnc_program_revisions') = 2
             and exists (select 1 from pg_trigger where tgname = 'cnc_revision_letter')
             and exists (select 1 from pg_trigger where tgname = 'cnc_revision_is_current')
            then 'ready - revisions are kept'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
