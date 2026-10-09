-- CNC module, file 13: each program's history, who changed what and when
-- (Heinrich, 8 Oct 2026: "program changed with new price, this will happen
-- a lot; a program history tab for safety to see who changed what").
-- Written by the database itself, never by the app: a line is added when
-- a program is made, when a revision is saved, and when the program's
-- price, settings (markups and tool crib included), part name, customer,
-- material, quote reference, project name or status change. Nobody can
-- add, change or delete a line from the browser; the CNC View tick reads
-- them. A deleted program takes its history with it. The app's History
-- tab reads them (src/cnc/historyRules.js names each field in words).
-- Needs files 1 to 3. Four pastes, in order. Safe to run twice.

-- ============ PASTE 1: the table, read only ============
create table if not exists public.cnc_program_history (
  id            uuid primary key default gen_random_uuid(),
  seq           bigint generated always as identity,
  program_id    uuid not null references public.cnc_programs(id) on delete cascade,
  kind          text not null check (kind in ('made', 'revision', 'changed')),
  rev           text,
  changes       jsonb not null default '[]'::jsonb,
  changed_by    text not null default '',
  changed_by_id uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists cnc_program_history_program_idx on public.cnc_program_history (program_id, created_at);
alter table public.cnc_program_history enable row level security;
drop policy if exists "CNC people can read history" on public.cnc_program_history;
create policy "CNC people can read history" on public.cnc_program_history for select using (public.cnc_may('view'));

-- ============ PASTE 2: who is asking, and a line when a program changes ============
create or replace function public.cnc_who() returns text language sql stable security definer set search_path = public as $body$
  select coalesce((select coalesce(nullif(name, ''), email) from public.profiles where id = auth.uid()), 'the database')
$body$;

create or replace function public.cnc_log_program() returns trigger language plpgsql security definer set search_path = public as $body$
declare
  ch jsonb := '[]'::jsonb;
  f text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    insert into public.cnc_program_history (program_id, kind, changed_by)
    values (new.id, 'made', coalesce(nullif(new.created_by, ''), public.cnc_who()));
    return null;
  end if;
  foreach f in array array['part_name', 'customer', 'material', 'quote_ref', 'project_name', 'status', 'fault'] loop
    if (o -> f) is distinct from (n -> f) then
      ch := ch || jsonb_build_array(jsonb_build_object('field', f, 'from', o -> f, 'to', n -> f));
    end if;
  end loop;
  if (old.costing -> 'price_per_part') is distinct from (new.costing -> 'price_per_part') then
    ch := ch || jsonb_build_array(jsonb_build_object('field', 'price_per_part', 'from', old.costing -> 'price_per_part', 'to', new.costing -> 'price_per_part', 'qty', new.costing -> 'qty'));
  end if;
  -- Settings the engine is re-sent on every run (the number, grade, price of the day) are left out.
  for f in select jsonb_object_keys(coalesce(old.settings, '{}'::jsonb) || coalesce(new.settings, '{}'::jsonb)) loop
    if f <> all (array['program_no', 'material', 'density', 'material_price', 'price_unit']) and (old.settings -> f) is distinct from (new.settings -> f) then
      ch := ch || jsonb_build_array(jsonb_build_object('field', 'settings.' || f, 'from', old.settings -> f, 'to', new.settings -> f));
    end if;
  end loop;
  if jsonb_array_length(ch) > 0 then
    insert into public.cnc_program_history (program_id, kind, rev, changes, changed_by) values (new.id, 'changed', new.current_rev, ch, public.cnc_who());
  end if;
  return null;
end;
$body$;
drop trigger if exists cnc_program_logged on public.cnc_programs;
create trigger cnc_program_logged after insert or update on public.cnc_programs for each row execute function public.cnc_log_program();

-- ============ PASTE 3: a line when a revision is saved ============
create or replace function public.cnc_log_revision() returns trigger language plpgsql security definer set search_path = public as $body$
begin
  insert into public.cnc_program_history (program_id, kind, rev, changes, changed_by)
  values (new.program_id, 'revision', new.rev,
          jsonb_build_array(jsonb_build_object('field', 'source', 'to', new.source), jsonb_build_object('field', 'cycle_s', 'to', new.cycle_s)),
          coalesce(nullif(new.created_by, ''), public.cnc_who()));
  return null;
end;
$body$;
drop trigger if exists cnc_revision_logged on public.cnc_program_revisions;
create trigger cnc_revision_logged after insert on public.cnc_program_revisions for each row execute function public.cnc_log_revision();

-- ============ PASTE 4: the programs already made, and the check ============
insert into public.cnc_program_history (program_id, kind, changed_by, created_at)
select p.id, 'made', p.created_by, p.created_at from public.cnc_programs p
 where not exists (select 1 from public.cnc_program_history h where h.program_id = p.id and h.kind = 'made');
insert into public.cnc_program_history (program_id, kind, rev, changes, changed_by, created_at)
select r.program_id, 'revision', r.rev,
       jsonb_build_array(jsonb_build_object('field', 'source', 'to', r.source), jsonb_build_object('field', 'cycle_s', 'to', r.cycle_s)),
       r.created_by, r.created_at
  from public.cnc_program_revisions r
 where not exists (select 1 from public.cnc_program_history h where h.program_id = r.program_id and h.kind = 'revision' and h.rev = r.rev);

select 'cnc program history' as step,
       case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cnc_program_history')
             and exists (select 1 from pg_trigger where tgname = 'cnc_program_logged')
             and exists (select 1 from pg_trigger where tgname = 'cnc_revision_logged')
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cnc_program_history') = 1
            then 'ready - ' || (select count(*) from public.cnc_program_history) || ' history lines'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
