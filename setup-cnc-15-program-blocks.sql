-- CNC module, file 15: program numbers in blocks of ten (Heinrich, 11 and
-- 14 Oct 2026). A new part takes a number ending in 0, first O00010010;
-- the nine after it are its own: side 2 / the second operation (G55) or
-- sub programs, …1 first. Programs made before this (O00001001 to
-- O00001039 and the like) keep their numbers and their old pair rule.
--
-- take_cnc_program_number()  the next free block (all ten numbers unused),
--                            counter moves on by ten.
-- take_cnc_sub_number(main)  the lowest free number in that main's block,
--                            for "+ Sub / 2nd op" on the program screen.
-- cnc_block_numbers(no, id)  every number a block uses: its programs and
--                            the numbers their current revisions write.
-- The trigger that guarded the pair now guards the blocks too: a new
-- program below O00010010 is refused, a main needs its whole block free,
-- and a sub needs its main and a number nobody writes.
--
-- Needs files 2, 3 and 4. One paste. Changes no program. Safe to run twice.

create or replace function public.cnc_block_numbers(p_no integer, p_except uuid default null)
returns table (number integer, owner_no integer)
language sql
stable
set search_path = public
as $fn$
  with blk as (select p_no - p_no % 10 as lo),
  rows_in as (
    select p.id, p.program_no, p.current_rev
      from cnc_programs p, blk
     where p.program_no between blk.lo and blk.lo + 9
       and (p_except is null or p.id <> p_except)
  )
  select r.program_no, r.program_no from rows_in r
  union
  select (e ->> 'number')::integer, r.program_no
    from rows_in r
    join cnc_program_revisions v on v.program_id = r.id and v.rev = r.current_rev
    cross join lateral jsonb_array_elements(v.programs) e
   where (e ->> 'number') ~ '^\d+$';
$fn$;

grant execute on function public.cnc_block_numbers(integer, uuid) to authenticated;

create or replace function public.cnc_programs_keep_pair()
returns trigger
language plpgsql
security definer set search_path = public
as $body$
declare
  v_other integer;
  v_main integer;
begin
  if new.program_no >= 10010 then
    v_main := new.program_no - new.program_no % 10;
    if new.program_no % 10 = 0 then
      select program_no into v_other from public.cnc_programs
       where id <> new.id and program_no between v_main and v_main + 9 limit 1;
      if v_other is not null then
        raise exception 'O% is in use, and O% to O% are kept for its side 2 and sub programs: pick another number ending in 0', lpad(v_other::text, 8, '0'), lpad(v_main::text, 8, '0'), lpad((v_main + 9)::text, 8, '0')
          using errcode = 'P0001', hint = 'cnc_number_taken', detail = v_other::text;
      end if;
    else
      if not exists (select 1 from public.cnc_programs where id <> new.id and program_no = v_main) then
        raise exception 'O% is a side 2 / sub number, but there is no program O% for it to belong to', lpad(new.program_no::text, 8, '0'), lpad(v_main::text, 8, '0')
          using errcode = 'P0001', hint = 'cnc_number_taken', detail = v_main::text;
      end if;
      select owner_no into v_other from public.cnc_block_numbers(new.program_no, new.id)
       where number = new.program_no limit 1;
      if v_other is not null then
        raise exception 'O% is already written by O%', lpad(new.program_no::text, 8, '0'), lpad(v_other::text, 8, '0')
          using errcode = 'P0001', hint = 'cnc_number_taken', detail = v_other::text;
      end if;
    end if;
    return new;
  end if;
  -- Below the blocks: an old program keeps its pair; nothing new goes there.
  if tg_op = 'INSERT' then
    raise exception 'New programs start at O00010010, in blocks of ten: leave the number empty for the next free one'
      using errcode = 'P0001', hint = 'cnc_number_taken';
  end if;
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
  insert into master_counters (counter_name, value) values ('nextCncProgramNumber', 10010)
    on conflict (counter_name) do nothing;
  select value into v_take from master_counters
   where counter_name = 'nextCncProgramNumber' for update;
  v_take := greatest(v_take, 10010);
  v_take := v_take + (10 - v_take % 10) % 10;
  while exists (select 1 from cnc_programs where program_no between v_take and v_take + 9) loop
    v_take := v_take + 10;
  end loop;
  update master_counters set value = v_take + 10 where counter_name = 'nextCncProgramNumber';
  return v_take;
end;
$fn$;

grant execute on function public.take_cnc_program_number() to authenticated;

create or replace function public.take_cnc_sub_number(p_main integer)
returns integer
language plpgsql
set search_path = public
as $fn$
declare
  k integer;
begin
  if not public.cnc_may('edit') then
    raise exception 'Only people with the CNC edit tick can make a program'
      using errcode = 'P0001', hint = 'cnc_not_allowed';
  end if;
  if p_main < 10010 or p_main % 10 <> 0 then
    raise exception 'O% is not the main of a block (O00010010 onwards, ending in 0)', lpad(p_main::text, 8, '0')
      using errcode = 'P0001', hint = 'cnc_number_taken';
  end if;
  perform 1 from cnc_programs where program_no = p_main for update;
  if not found then
    raise exception 'There is no program O%', lpad(p_main::text, 8, '0')
      using errcode = 'P0001', hint = 'cnc_number_taken';
  end if;
  for k in 1..9 loop
    if not exists (select 1 from public.cnc_block_numbers(p_main) b where b.number = p_main + k) then
      return p_main + k;
    end if;
  end loop;
  raise exception 'O% to O% are all in use: the block is full', lpad((p_main + 1)::text, 8, '0'), lpad((p_main + 9)::text, 8, '0')
    using errcode = 'P0001', hint = 'cnc_number_taken';
end;
$fn$;

grant execute on function public.take_cnc_sub_number(integer) to authenticated;

-- ============ Check ============

select 'cnc program blocks' as step,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'take_cnc_sub_number')
             and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'cnc_block_numbers')
             and exists (select 1 from pg_trigger where tgname = 'cnc_programs_keep_pair')
            then 'ready - the next new program is O' || lpad(greatest(
                   (select value from master_counters where counter_name = 'nextCncProgramNumber'), 10010)::text, 8, '0')
                 || ' or the next free block after it'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
