-- Shift lockout, stage one of four: somewhere to put the settings.
--
-- This stage ENFORCES NOTHING. It adds the shifts table, says which shift
-- each person is on, and adds the master switch. Every person carries on
-- exactly as they do today whatever you set in here, so you can put the
-- whole shop on shifts, check the times read correctly, and change your
-- mind, before any of it means anything.
--
-- The teeth come in stage four.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


-- ============ 1. The shifts ============
--
-- A shift is a fact about the shop, not about a person: nights are 18:00 to
-- 06:00 whoever is on them. So it is set once here and people are put on
-- it, rather than every person carrying their own times for somebody to
-- forget about when the hours change.
--
-- Each day group holds its own pair of times. A NULL start means that day
-- is off -- Saturday off for the night shift, Sunday off for most.
--
-- End before start means the shift runs into the next day. 18:00 to 06:00
-- is a normal night shift, not a mistake, and stage two is where that gets
-- handled properly.

create table if not exists public.shifts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,

  weekday_start  time,          -- Mon to Thu
  weekday_end    time,

  friday_start   time,
  friday_end     time,

  saturday_start time,
  saturday_end   time,

  sunday_start   time,
  sunday_end     time,

  created_by     text not null default '',
  created_at     timestamptz not null default now()
);

alter table public.shifts enable row level security;

create unique index if not exists shifts_name_idx on public.shifts (lower(name));

-- Friday used to sit inside the Mon-Fri group. On a table that already
-- exists, add it and carry the old hours across, so no shift already set
-- up quietly loses its Friday. Guarded, so running this again does not
-- undo a Friday somebody has since changed or switched off.
do $do$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'shifts'
                   and column_name = 'friday_start') then
    alter table public.shifts add column friday_start time;
    alter table public.shifts add column friday_end   time;
    update public.shifts set friday_start = weekday_start, friday_end = weekday_end;
  end if;
end $do$;

-- A day is either set or off. Half a pair is neither, and would leave the
-- rule in stage two guessing.
alter table public.shifts drop constraint if exists shifts_pairs_complete;

alter table public.shifts add constraint shifts_pairs_complete check (
  (weekday_start  is null) = (weekday_end  is null) and
  (friday_start   is null) = (friday_end   is null) and
  (saturday_start is null) = (saturday_end is null) and
  (sunday_start   is null) = (sunday_end   is null)
);


-- ============ 2. Who is on what ============
--
-- Null is "not restricted", which is what everybody is until you move them.
-- Deleting a shift puts its people back to not restricted rather than
-- locking them out of everything, which is the safer way round to be wrong.

alter table public.profiles
  add column if not exists shift_id uuid references public.shifts(id) on delete set null;

-- The second person who helps run this: the shifts screen and the access
-- requests, so a Friday evening request does not wait for one person.
alter table public.profiles
  add column if not exists can_manage_shifts boolean not null default false;


-- ============ 3. The master switch ============
--
-- One row, one boolean, off. Nothing anywhere reads it yet. When stage four
-- lands this is what turns the whole lockout off in one press if a shift
-- changes and half the floor cannot sign in on a Monday morning.

create table if not exists public.app_settings (
  id                  boolean primary key default true,
  shift_lockout_on    boolean not null default false,
  updated_by          text not null default '',
  updated_at          timestamptz not null default now(),
  constraint app_settings_single_row check (id)
);

alter table public.app_settings enable row level security;

insert into public.app_settings (id) values (true) on conflict (id) do nothing;


-- ============ 4. Who may read and write these ============
--
-- Same as every other table in this app today: signed in. Stage four is
-- where that changes, and these three tables are among the few that stay
-- readable when somebody is locked out -- otherwise the screen cannot tell
-- them what their hours are or let them ask.

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'shifts' and policyname = 'Signed-in users can read shifts') then
    create policy "Signed-in users can read shifts" on public.shifts
      for select using (auth.role() = 'authenticated');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'shifts' and policyname = 'Shift managers can change shifts') then
    create policy "Shift managers can change shifts" on public.shifts
      for all
      using (
        exists (select 1 from public.profiles p
                where p.id = auth.uid() and (p.is_admin or p.can_manage_shifts))
      )
      with check (
        exists (select 1 from public.profiles p
                where p.id = auth.uid() and (p.is_admin or p.can_manage_shifts))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'app_settings' and policyname = 'Signed-in users can read settings') then
    create policy "Signed-in users can read settings" on public.app_settings
      for select using (auth.role() = 'authenticated');
  end if;

  -- The master switch is the way out of a bad lockout, so only an admin
  -- moves it. Someone who can edit shifts should not be able to switch the
  -- whole thing off.
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'app_settings' and policyname = 'Admins can change settings') then
    create policy "Admins can change settings" on public.app_settings
      for update
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
  end if;
end $do$;


-- ============ Check ============

select 'shifts table' as thing,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'shifts')
            then 'ready' else 'MISSING' end as status

union all

select 'shifts set up so far',
       coalesce((select count(*)::text from public.shifts), '0')

union all

select 'people on a shift',
       coalesce((select count(*)::text from public.profiles where shift_id is not null), '0')

union all

select 'people who can manage shifts',
       coalesce((select count(*)::text from public.profiles where can_manage_shifts), '0')

union all

select 'master switch',
       case when (select shift_lockout_on from public.app_settings where id) then 'ON' else 'off (correct for now)' end;
