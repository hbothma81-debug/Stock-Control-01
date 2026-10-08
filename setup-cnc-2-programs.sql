-- CNC module, file 2 of 5: the programs list. One row per part.
-- Needs setup-cnc-1-access.sql and touch_updated_at() (setup-updated-at-everywhere.sql).
-- Every program keeps two O numbers, program_no and program_no + 1, so a
-- part that later splits into side 1 and side 2 keeps its number
-- (Heinrich, 8 Oct 2026). A typed number that overlaps another program's
-- pair is refused. Two pastes: PASTE 1, then PASTE 2. Safe to run twice.

-- ============ PASTE 1: the table ============

create table if not exists public.cnc_programs (
  id            uuid primary key default gen_random_uuid(),
  program_no    integer not null unique check (program_no > 0),
  part_name     text not null check (char_length(part_name) between 1 and 200),
  customer      text not null default '',
  material      text not null default '',
  stock         text not null default '',
  settings      jsonb not null default '{}'::jsonb,
  current_rev   text,
  status        text not null default 'not_for_machine' check (status in ('ready', 'not_for_machine')),
  fault         text not null default '',
  created_by    text not null default '',
  created_by_id uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists cnc_programs_updated_at_idx on public.cnc_programs (updated_at);

drop trigger if exists cnc_programs_set_updated_at on public.cnc_programs;
create trigger cnc_programs_set_updated_at before update on public.cnc_programs
  for each row execute function public.touch_updated_at();

alter table public.cnc_programs enable row level security;

drop policy if exists "CNC people can read programs" on public.cnc_programs;
create policy "CNC people can read programs" on public.cnc_programs for select using (public.cnc_may('view'));
drop policy if exists "CNC editors can add programs" on public.cnc_programs;
create policy "CNC editors can add programs" on public.cnc_programs for insert with check (public.cnc_may('edit'));
drop policy if exists "CNC editors can change programs" on public.cnc_programs;
create policy "CNC editors can change programs" on public.cnc_programs for update using (public.cnc_may('edit'));
drop policy if exists "CNC deleters can delete programs" on public.cnc_programs;
create policy "CNC deleters can delete programs" on public.cnc_programs for delete using (public.cnc_may('delete'));

-- ============ PASTE 2: a program's two numbers stay its own ============

create or replace function public.cnc_programs_keep_pair()
returns trigger
language plpgsql
security definer set search_path = public
as $body$
declare
  v_other integer;
begin
  select program_no into v_other from public.cnc_programs
   where id <> new.id and abs(program_no - new.program_no) <= 1 limit 1;
  if v_other is not null then
    raise exception 'Program number % is too close to O% (each program keeps its number and the next one)', new.program_no, v_other
      using errcode = 'P0001', hint = 'cnc_number_taken', detail = v_other::text;
  end if;
  return new;
end;
$body$;

drop trigger if exists cnc_programs_keep_pair on public.cnc_programs;
create trigger cnc_programs_keep_pair before insert or update of program_no on public.cnc_programs
  for each row execute function public.cnc_programs_keep_pair();

select 'cnc programs' as step,
       case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cnc_programs')
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cnc_programs') = 4
             and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cnc_programs' and cmd = 'UPDATE')
             and exists (select 1 from pg_trigger where tgname = 'cnc_programs_set_updated_at')
             and exists (select 1 from pg_trigger where tgname = 'cnc_programs_keep_pair')
            then 'ready - the programs list is there'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
