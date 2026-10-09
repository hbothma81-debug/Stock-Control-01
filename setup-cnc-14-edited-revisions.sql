-- CNC module, file 14: a revision edited in the app (Heinrich, 9 Oct 2026:
-- "an edit button on the program display to edit the text in the app").
-- A revision's source may now also be 'edited': the program text typed on
-- the Program tab, checked by the engine and saved as the next letter.
-- Ready or Not for machine is the engine's check (his answer). The two
-- sources there were ('generated', 'machine_copy') are unchanged.
-- Needs file 3. One paste. Changes no data. Safe to run twice.

do $body$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.cnc_program_revisions'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%source%'
  loop
    execute format('alter table public.cnc_program_revisions drop constraint %I', c);
  end loop;
end;
$body$;

alter table public.cnc_program_revisions
  add constraint cnc_program_revisions_source_check
  check (source in ('generated', 'machine_copy', 'edited'));

select 'cnc edited revisions' as step,
       case when exists (select 1 from pg_constraint
                          where conrelid = 'public.cnc_program_revisions'::regclass
                            and conname = 'cnc_program_revisions_source_check'
                            and pg_get_constraintdef(oid) like '%edited%')
            then 'ready - a revision can be edited in the app'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
