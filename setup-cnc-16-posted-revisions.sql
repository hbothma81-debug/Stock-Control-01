-- CNC module, file 16: a revision stays open until it is posted (Heinrich,
-- 14 Oct 2026: "I don't want a revision change if the program has not been
-- posted to the usb yet. so changes stay in the same revision until it is
-- posted"). Posted = Copy to USB or Download (his answer), with who and
-- when. While a revision is not posted, Update program, Tool crib, Turn
-- around and Edit overwrite it (Edit too, his answer); once posted, the
-- next change is the next letter as before. Every overwrite still adds a
-- line to the History (his answer). A machine copy imported is always a
-- new letter.
-- Revisions saved before this file count as posted, so nothing already
-- made is overwritten. The letter, the program it belongs to and when it
-- was made never change; a posted revision can never be changed.
-- Needs files 1 to 3, 13 and 14. One paste. Safe to run twice.

do $body$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cnc_program_revisions' and column_name = 'posted_at') then
    alter table public.cnc_program_revisions add column posted_at timestamptz;
    alter table public.cnc_program_revisions add column posted_by text not null default '';
    update public.cnc_program_revisions set posted_at = created_at, posted_by = 'before posting was kept';
  end if;
end;
$body$;

-- Only a revision not yet posted can be changed (overwritten, or marked posted).
drop policy if exists "CNC editors can change an unposted revision" on public.cnc_program_revisions;
create policy "CNC editors can change an unposted revision" on public.cnc_program_revisions
  for update using (public.cnc_may('edit') and posted_at is null) with check (public.cnc_may('edit'));

-- The letter, the program and the making stay as they were.
create or replace function public.cnc_revision_keeps_letter() returns trigger language plpgsql set search_path = public as $body$
begin
  new.rev := old.rev;
  new.program_id := old.program_id;
  new.created_at := old.created_at;
  return new;
end;
$body$;
drop trigger if exists cnc_revision_keeps_letter on public.cnc_program_revisions;
create trigger cnc_revision_keeps_letter before update on public.cnc_program_revisions
  for each row execute function public.cnc_revision_keeps_letter();

-- An overwritten revision is still the program's current one (file 3's function).
drop trigger if exists cnc_revision_is_current_again on public.cnc_program_revisions;
create trigger cnc_revision_is_current_again after update on public.cnc_program_revisions
  for each row when (old.programs is distinct from new.programs or old.ready is distinct from new.ready
                     or old.fault is distinct from new.fault or old.settings is distinct from new.settings)
  execute function public.cnc_revision_is_current();

-- A History line for each overwrite, and one when it is posted.
create or replace function public.cnc_log_revision_change() returns trigger language plpgsql security definer set search_path = public as $body$
begin
  if old.posted_at is null and new.posted_at is not null then
    insert into public.cnc_program_history (program_id, kind, rev, changes, changed_by)
    values (new.program_id, 'changed', new.rev,
            jsonb_build_array(jsonb_build_object('field', 'posted', 'to', new.posted_by)),
            coalesce(nullif(new.posted_by, ''), public.cnc_who()));
  end if;
  if old.programs is distinct from new.programs or old.settings is distinct from new.settings or old.source is distinct from new.source then
    insert into public.cnc_program_history (program_id, kind, rev, changes, changed_by)
    values (new.program_id, 'revision', new.rev,
            jsonb_build_array(jsonb_build_object('field', 'source', 'to', new.source),
                              jsonb_build_object('field', 'cycle_s', 'to', new.cycle_s),
                              jsonb_build_object('field', 'overwritten', 'to', true)),
            coalesce(nullif(new.created_by, ''), public.cnc_who()));
  end if;
  return null;
end;
$body$;
drop trigger if exists cnc_revision_change_logged on public.cnc_program_revisions;
create trigger cnc_revision_change_logged after update on public.cnc_program_revisions
  for each row execute function public.cnc_log_revision_change();

select 'cnc posted revisions' as step,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cnc_program_revisions' and column_name = 'posted_at')
             and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cnc_program_revisions' and cmd = 'UPDATE')
             and exists (select 1 from pg_trigger where tgname = 'cnc_revision_keeps_letter')
             and exists (select 1 from pg_trigger where tgname = 'cnc_revision_is_current_again')
             and exists (select 1 from pg_trigger where tgname = 'cnc_revision_change_logged')
            then 'ready - ' || (select count(*) from public.cnc_program_revisions where posted_at is null) || ' revisions not posted yet'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
