-- Delivery notes that work, and one with every invoice request
-- (Heinrich, 28 Sep 2026).
--
-- What was wrong, found on live on 28 Sep:
--   1. The table refused two rows under one delivery note number, and the
--      app saves a row per line. So any note with more than one line failed
--      on its second line, half saved, and left the number it had tried
--      still "next": every note after it was refused. That has been the
--      state of live since DN-0005 on 31 Aug.
--   2. Nothing allowed a delivery note row to be changed, so "Check back
--      in" put the line back on the floor but never wrote itself on the
--      note.
--
-- What this does:
--   1. lets a note's rows share its number;
--   2. lets a note row be changed (check back in);
--   3. adds to each row what quantity went out, and which invoice request
--      the note was made for;
--   4. gives out delivery note numbers from the database, one caller at a
--      time, never a number already used.
--
-- Nothing existing is deleted or renumbered. DN-0001 to DN-0005 stay as
-- they are; the next note is DN-0006.
--
-- Run on PRACTICE first. Select nothing before pressing Run. Supabase will
-- say "Potential issue detected" because of the first statement: run it
-- unchanged. Safe to run more than once.

alter table public.delivery_notes drop constraint if exists delivery_notes_delivery_note_number_key;
create index if not exists delivery_notes_number_idx on public.delivery_notes (delivery_note_number);

alter table public.delivery_notes add column if not exists qty numeric;
alter table public.delivery_notes
  add column if not exists invoice_request_id uuid references public.job_invoice_requests(id) on delete set null;
create index if not exists delivery_notes_invoice_request_idx on public.delivery_notes (invoice_request_id);

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_notes'
                 and policyname = 'Signed-in users can update delivery notes') then
    create policy "Signed-in users can update delivery notes"
      on public.delivery_notes for update
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $do$;

-- The next delivery note number. The counter's row is held while this
-- runs, so two devices asking at the same moment are served one after the
-- other. The answer is never a number a note already carries, whatever the
-- counter says: on live the counter said 5 while DN-0005 existed.
create or replace function public.take_delivery_note_number()
returns integer
language plpgsql
set search_path = public
as $fn$
declare
  v_counter integer;
  v_used integer;
  v_take integer;
begin
  insert into master_counters (counter_name, value) values ('nextDeliveryNoteNumber', 1)
    on conflict (counter_name) do nothing;
  select value into v_counter from master_counters
   where counter_name = 'nextDeliveryNoteNumber' for update;
  select coalesce(max(substring(delivery_note_number from '^DN-([0-9]+)$')::integer), 0)
    into v_used from delivery_notes where delivery_note_number ~ '^DN-[0-9]+$';
  v_take := greatest(coalesce(v_counter, 1), v_used + 1);
  update master_counters set value = v_take + 1 where counter_name = 'nextDeliveryNoteNumber';
  return v_take;
end;
$fn$;

grant execute on function public.take_delivery_note_number() to authenticated;


-- ============ Check ============

select 'delivery notes' as step,
       case when not exists (select 1 from pg_constraint where conname = 'delivery_notes_delivery_note_number_key')
             and exists (select 1 from information_schema.columns where table_schema = 'public'
                          and table_name = 'delivery_notes' and column_name = 'invoice_request_id')
             and exists (select 1 from information_schema.columns where table_schema = 'public'
                          and table_name = 'delivery_notes' and column_name = 'qty')
             and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_notes' and cmd = 'UPDATE')
             and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'take_delivery_note_number')
            then 'ready — a note can carry several lines, and numbers come from the database'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
