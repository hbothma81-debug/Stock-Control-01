-- Importing the tube nesting report, and plain five-digit program numbers.
--
-- Two things, both small:
--
--   1. Program numbers on the tube laser lose the TL- prefix and go to
--      five digits: 00001, 00002 ... The nester types this number when he
--      exports the cut file from the tube software, so it should be a
--      number and nothing else. Numbers already handed out keep their
--      old form; the count carries on from where it is.
--   2. A memory of which Structural Steel section the tube software's
--      wording means. The report says "Round tube R19.05mm"; your list
--      says something else. The import asks once, and this table
--      remembers the answer for next time.
--
-- Run setup-tube-laser.sql first. Run on PRACTICE first. Select nothing
-- before pressing Run. Safe to run more than once.


-- ============ 1. Five digits, no prefix ============
--
-- The prefix still comes from the app (it now sends none), so the
-- function only changes how wide the number is.

create or replace function public.next_laser_program_number(p_machine text, p_prefix text)
returns text
language plpgsql
as $$
declare
  n integer;
begin
  insert into public.laser_program_counters (machine, last_number, updated_at)
  values (p_machine, 1, now())
  on conflict (machine) do update
    set last_number = public.laser_program_counters.last_number + 1,
        updated_at = now()
  returning last_number into n;
  return coalesce(p_prefix, '') || lpad(n::text, 5, '0');
end;
$$;


-- ============ 2. What the report's sections mean ============

create table if not exists public.tube_section_aliases (
  -- Exactly as the tube software writes it, e.g. "Round tube R19.05mm".
  report_section text primary key,
  -- The entry under Stock Manager -> Structural Steel it stands for.
  section_name text not null,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.tube_section_aliases enable row level security;

do $$ begin
  create policy "Signed-in users can read section aliases" on public.tube_section_aliases
  for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can insert section aliases" on public.tube_section_aliases
  for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can update section aliases" on public.tube_section_aliases
  for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Signed-in users can delete section aliases" on public.tube_section_aliases
  for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ============ Check ============
--
-- Two rows saying ready, and the next number the tube laser will hand
-- out, so you know where the count stands.

select 'tube_section_aliases' as what,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'tube_section_aliases')
            then 'ready' else 'MISSING' end as state
union all
select 'next number will be',
       lpad((coalesce((select last_number from public.laser_program_counters where machine = 'Tube Laser'), 0) + 1)::text, 5, '0');
