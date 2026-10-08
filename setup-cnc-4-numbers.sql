-- CNC module, file 4 of 5: the next free program number. Needs file 2.
-- One counter, nextCncProgramNumber in master_counters, starting at 1027
-- where the lathe app's NEXT PROGRAM NUMBER.txt stood (Heinrich, 8 Oct 2026).
-- take_cnc_program_number() hands out a number whose pair (it and the next)
-- no program uses, and moves the counter two on. Only CNC editors may take
-- one. The app hands the number to the engine as settings.program_no.
-- Safe to run twice.

insert into master_counters (counter_name, value) values ('nextCncProgramNumber', 1027)
  on conflict (counter_name) do nothing;

create or replace function public.take_cnc_program_number()
returns integer
language plpgsql
set search_path = public
as $fn$
declare
  v_take integer;
begin
  if not public.cnc_may('edit') then
    raise exception 'Only people with the CNC edit tick can make a program'
      using errcode = 'P0001', hint = 'cnc_not_allowed';
  end if;
  insert into master_counters (counter_name, value) values ('nextCncProgramNumber', 1027)
    on conflict (counter_name) do nothing;
  select value into v_take from master_counters
   where counter_name = 'nextCncProgramNumber' for update;
  while exists (select 1 from cnc_programs where program_no between v_take - 1 and v_take + 2) loop
    v_take := v_take + 1;
  end loop;
  update master_counters set value = v_take + 2 where counter_name = 'nextCncProgramNumber';
  return v_take;
end;
$fn$;

grant execute on function public.take_cnc_program_number() to authenticated;

-- ============ Check ============

select 'cnc program numbers' as step,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'take_cnc_program_number')
             and exists (select 1 from master_counters where counter_name = 'nextCncProgramNumber')
            then 'ready - next program number is ' || (select value from master_counters where counter_name = 'nextCncProgramNumber')
            else 'SOMETHING IS MISSING - tell Claude' end as result;
