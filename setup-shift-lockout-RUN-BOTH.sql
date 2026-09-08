-- Shift lockout: stages one and two, in one paste.
--
-- Stages one and two together ENFORCE NOTHING. They add the settings and
-- the rule that reads them, and nothing anywhere asks that rule yet.
-- Everybody carries on exactly as they do today.
--
-- Run on PRACTICE first, then on LIVE. Select nothing before pressing Run.
-- Safe to run more than once.
--
-- You should get one row back: "self-test | 19 of 19 passed".

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
-- Switching a day off used to mean clearing both times, which threw them
-- away -- so putting Saturday back meant typing 07:30 and 14:00 again.
-- The times now stay put and the day's name goes in here instead, which
-- is what the tick box on each line writes to.
--
-- One column rather than four booleans, so the rule below takes one more
-- argument instead of four. The words in it are the same words the screen
-- shows: weekday, friday, saturday, sunday.
alter table public.shifts
  add column if not exists days_off text[] not null default '{}';

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


-- ============ 2b. Days the whole shop is shut ============
--
-- Public holidays and shutdown days. One row per date, and it applies to
-- every shift -- it is the shop that is closed, not one team.
--
-- A closure removes the shift that STARTS on that date. So if the Monday
-- is a holiday, Sunday night's shift still runs through to Monday
-- morning, and Monday night's does not start.

create table if not exists public.shop_closures (
  closed_on  date primary key,
  note       text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

alter table public.shop_closures enable row level security;


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
                 and tablename = 'shop_closures' and policyname = 'Signed-in users can read closures') then
    create policy "Signed-in users can read closures" on public.shop_closures
      for select using (auth.role() = 'authenticated');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'shop_closures' and policyname = 'Shift managers can change closures') then
    create policy "Shift managers can change closures" on public.shop_closures
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


-- Shift lockout, stage two of four: the rule itself.
--
-- This stage ENFORCES NOTHING either. It adds one question the app will be
-- able to ask -- "is this person allowed in right now?" -- and nothing
-- anywhere asks it yet. No screen changes. No login changes.
--
-- The point of doing it on its own is that a rule about time is very easy
-- to get quietly wrong: midnight, Saturday mornings, and the clock the
-- database keeps versus the clock on the wall. So it goes in by itself,
-- with a self-test at the bottom that proves it against nineteen awkward
-- moments before anything relies on it.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.
--
-- Needs stage one to have been run first.


-- ============ The clock ============
--
-- This matters more than it looks. The database keeps time in UTC, which is
-- two hours behind us. Ask it the time at half past six on a Wednesday
-- evening and it says 16:30 -- so a night shift starting at 18:00 would
-- look like it had not started yet, and nobody could sign in until eight.
--
-- So every comparison below converts to Johannesburg time first. The
-- self-test has a case for exactly this, because it is the mistake that
-- would otherwise have been found by the night shift rather than by us.


-- ============ 1. One day's window ============
--
-- Given a date and a shift's six times, this gives back when that day's
-- shift starts and ends. Nothing at all if that day is off.
--
-- End before start means it runs into the next morning: 18:00 to 06:00 is a
-- night shift, not a typo. End equal to start means a full 24 hours.

-- Friday now has its own hours, so both of these take two more times
-- than they did. Postgres will not replace a function whose arguments
-- have changed, so the old shape goes first.
drop function if exists public.shift_verdict(timestamptz, time, time, time, time, time, time);
drop function if exists public.shift_day_window(date, time, time, time, time, time, time);
drop function if exists public.shift_verdict(timestamptz, time, time, time, time, time, time, time, time);
drop function if exists public.shift_day_window(date, time, time, time, time, time, time, time, time);

create or replace function public.shift_day_window(
  p_date           date,
  p_weekday_start  time, p_weekday_end  time,
  p_friday_start   time, p_friday_end   time,
  p_saturday_start time, p_saturday_end time,
  p_sunday_start   time, p_sunday_end   time,
  p_days_off       text[] default '{}'
)
returns table (starts_at timestamp, ends_at timestamp)
language sql
immutable
as $body$
  select
    (p_date + s.on_at)::timestamp,
    case when s.off_at > s.on_at
         then (p_date + s.off_at)::timestamp
         else (p_date + 1 + s.off_at)::timestamp
    end
  from (
    select
      d.name,
      case d.name when 'friday'   then p_friday_start
                  when 'saturday' then p_saturday_start
                  when 'sunday'   then p_sunday_start
                  else                 p_weekday_start end as on_at,
      case d.name when 'friday'   then p_friday_end
                  when 'saturday' then p_saturday_end
                  when 'sunday'   then p_sunday_end
                  else                 p_weekday_end   end as off_at
    from (
      select case extract(isodow from p_date)::int
               when 5 then 'friday'
               when 6 then 'saturday'
               when 7 then 'sunday'
               else        'weekday'
             end as name
    ) d
  ) s
  where s.on_at is not null
    and not (s.name = any (coalesce(p_days_off, '{}'::text[])));
$body$;


-- ============ 2. The rule ============
--
-- Is this moment inside the shift, and if not, when does it open again.
--
-- It looks at yesterday as well as today, because at two in the morning the
-- shift somebody is on started yesterday evening. That one line is what
-- makes Saturday 02:00 come out right for a person on Friday nights.
--
-- verdict_ends is what the ten-minute warning counts down to.
-- verdict_next is what the screen tells somebody who has come in too early.

create or replace function public.shift_verdict(
  p_at             timestamptz,
  p_weekday_start  time, p_weekday_end  time,
  p_friday_start   time, p_friday_end   time,
  p_saturday_start time, p_saturday_end time,
  p_sunday_start   time, p_sunday_end   time,
  p_days_off       text[] default '{}'
)
returns table (verdict_allowed boolean, verdict_ends timestamptz, verdict_next timestamptz)
language plpgsql
stable
as $body$
declare
  shop_now  timestamp := p_at at time zone 'Africa/Johannesburg';
  w         record;
  inside    boolean   := false;
  ends_when timestamp := null;
  next_open timestamp := null;
begin
  for w in
    select win.starts_at as s, win.ends_at as e
    from generate_series(
           (shop_now::date - 1)::timestamp,
           (shop_now::date + 8)::timestamp,
           interval '1 day'
         ) g(d)
    cross join lateral public.shift_day_window(
      g.d::date,
      p_weekday_start,  p_weekday_end,
      p_friday_start,   p_friday_end,
      p_saturday_start, p_saturday_end,
      p_sunday_start,   p_sunday_end,
      p_days_off
    ) win
    where not exists (
      select 1 from public.shop_closures c where c.closed_on = g.d::date
    )
    order by win.starts_at
  loop
    if shop_now >= w.s and shop_now < w.e then
      inside := true;
      ends_when := w.e;
    elsif w.s > shop_now and next_open is null then
      next_open := w.s;
    end if;
  end loop;

  return query select
    inside,
    case when inside then (ends_when at time zone 'Africa/Johannesburg') end,
    case when inside then null else (next_open at time zone 'Africa/Johannesburg') end;
end;
$body$;


-- ============ 3. The question the app will ask ============
--
-- Everything that can let somebody in, in the order it is checked:
--
--   the master switch is off      -> everybody in, which is where we are today
--   they are an admin             -> always in
--   they are on no shift          -> in
--   their shift has been deleted  -> in
--
-- Admins are never locked out, on purpose. The master switch is the way out
-- of a bad lockout and only an admin can move it, so an admin who could
-- lock themselves out could lock the whole shop out with no way back in.
--
-- security definer so that somebody who has been locked out can still ask
-- why, and be told their own hours, once stage four tightens things up.

create or replace function public.shift_access(
  p_user uuid        default auth.uid(),
  p_at   timestamptz default now()
)
returns table (allowed boolean, ends_at timestamptz, next_start timestamptz, reason text)
language plpgsql
stable
security definer
set search_path = public
as $body$
declare
  switch_on boolean;
  me        record;
  sh        record;
  v         record;
begin
  select coalesce(a.shift_lockout_on, false) into switch_on from public.app_settings a where a.id;

  if not coalesce(switch_on, false) then
    return query select true, null::timestamptz, null::timestamptz, 'the lockout is switched off'::text;
    return;
  end if;

  select p.is_admin, p.shift_id into me from public.profiles p where p.id = p_user;
  if not found then
    return query select true, null::timestamptz, null::timestamptz, 'no profile found'::text;
    return;
  end if;

  if me.is_admin then
    return query select true, null::timestamptz, null::timestamptz, 'admins are never locked out'::text;
    return;
  end if;

  if me.shift_id is null then
    return query select true, null::timestamptz, null::timestamptz, 'not on a shift'::text;
    return;
  end if;

  select * into sh from public.shifts s where s.id = me.shift_id;
  if not found then
    return query select true, null::timestamptz, null::timestamptz, 'that shift has been deleted'::text;
    return;
  end if;

  select * into v from public.shift_verdict(
    p_at,
    sh.weekday_start,  sh.weekday_end,
    sh.friday_start,   sh.friday_end,
    sh.saturday_start, sh.saturday_end,
    sh.sunday_start,   sh.sunday_end,
    sh.days_off
  );

  return query select
    v.verdict_allowed,
    v.verdict_ends,
    v.verdict_next,
    (case when v.verdict_allowed then 'on shift: ' || sh.name
          else 'outside ' || sh.name || ' hours' end)::text;
end;
$body$;

grant execute on function public.shift_day_window(date, time, time, time, time, time, time, time, time, text[]) to authenticated;
grant execute on function public.shift_verdict(timestamptz, time, time, time, time, time, time, time, time, text[]) to authenticated;
grant execute on function public.shift_access(uuid, timestamptz) to authenticated;


-- ============ Self-test ============
--
-- Twenty-five awkward moments, each with the answer written down first.
-- Every time in a label is the time on the wall in Johannesburg; the +00 in
-- the middle is that same moment as the database sees it.
--
-- 2026-09-07 is a Monday, so that week runs Mon the 7th to Sun the 13th,
-- and Friday is the 11th.
--
-- You should get one row back: "25 of 25 passed". Anything that failed is
-- listed under it, and a handful of worked examples.

with cases (n, label, at_utc, ws, we, fs, fe, sas, sae, sus, sue, offdays, want) as (values
  -- Night: Mon-Thu 18:00 to 06:00, Friday the same, weekend off
  ( 1, 'Night, Wed 19:00 - on shift',
       timestamptz '2026-09-09 17:00+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], true),
  ( 2, 'Night, Thu 02:00 - still on last nights shift',
       timestamptz '2026-09-10 00:00+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], true),
  ( 3, 'Night, Thu 05:59 - last minute of it',
       timestamptz '2026-09-10 03:59+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], true),
  ( 4, 'Night, Thu 06:00 - shift is over',
       timestamptz '2026-09-10 04:00+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], false),
  ( 5, 'Night, Mon 17:59 - one minute early',
       timestamptz '2026-09-07 15:59+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], false),
  ( 6, 'Night, Mon 18:00 - on the dot',
       timestamptz '2026-09-07 16:00+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], true),
  ( 7, 'Night, Sat 02:00 - Fridays shift runs into Saturday',
       timestamptz '2026-09-12 00:00+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], true),
  ( 8, 'Night, Sat 19:00 - Saturday is off',
       timestamptz '2026-09-12 17:00+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], false),
  ( 9, 'Night, Sun 12:00 - Sunday is off',
       timestamptz '2026-09-13 10:00+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], false),
  (10, 'Night, Wed 18:30 - THE CLOCK: in UTC this reads 16:30 and gets refused',
       timestamptz '2026-09-09 16:30+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], true),
  (11, 'Night, Wed 06:30 - morning, and this is not a morning shift',
       timestamptz '2026-09-09 04:30+00', time '18:00', time '06:00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, '{}'::text[], false),
  (12, 'Night with FRIDAY OFF, Sat 02:00 - nothing left to run into Saturday',
       timestamptz '2026-09-12 00:00+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, null::time, null::time, '{}'::text[], false),

  -- Day: Mon-Thu 07:00 to 17:00, Friday 07:00 to 14:00, Saturday 08:00 to 14:00
  (13, 'Day, Wed 08:00 - on shift',
       timestamptz '2026-09-09 06:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{}'::text[], true),
  (14, 'Day, Wed 16:59 - last minute of it',
       timestamptz '2026-09-09 14:59+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{}'::text[], true),
  (15, 'Day, Wed 17:00 - knocked off',
       timestamptz '2026-09-09 15:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{}'::text[], false),
  (16, 'Day, Wed 03:00 - no carry over, it is not a night shift',
       timestamptz '2026-09-09 01:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{}'::text[], false),
  (17, 'Day, FRI 13:00 - inside Fridays shorter day',
       timestamptz '2026-09-11 11:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{}'::text[], true),
  (18, 'Day, FRI 14:00 - Friday knocks off at two',
       timestamptz '2026-09-11 12:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{}'::text[], false),
  (19, 'Day, FRI 16:00 - would have been on shift under the old Mon-Fri hours',
       timestamptz '2026-09-11 14:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{}'::text[], false),
  (20, 'Day, Sat 09:00 - Saturday hours',
       timestamptz '2026-09-12 07:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{}'::text[], true),
  (21, 'Day, Sat 15:00 - after Saturday hours',
       timestamptz '2026-09-12 13:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{}'::text[], false),

  -- The two odd ones
  (22, 'Round the clock, Wed 03:00 - 00:00 to 00:00 means all day',
       timestamptz '2026-09-09 01:00+00', time '00:00', time '00:00', time '00:00', time '00:00', null::time, null::time, null::time, null::time, '{}'::text[], true),
  (23, 'A shift with no hours at all - nobody on it ever gets in',
       timestamptz '2026-09-09 10:00+00', null::time, null::time, null::time, null::time, null::time, null::time, null::time, null::time, '{}'::text[], false),

  -- The tick box: same Saturday hours, day switched off
  (24, 'Day with SATURDAY SWITCHED OFF, Sat 09:00 - hours still set, day is off',
       timestamptz '2026-09-12 07:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{saturday}'::text[], false),
  (25, 'Day with SATURDAY SWITCHED OFF, Wed 08:00 - the rest of the week is untouched',
       timestamptz '2026-09-09 06:00+00', time '07:00', time '17:00', time '07:00', time '14:00', time '08:00', time '14:00', null::time, null::time, '{saturday}'::text[], true)
),
run as (
  select c.n, c.label, c.want, v.verdict_allowed as got, v.verdict_ends, v.verdict_next,
         (v.verdict_allowed = c.want) as ok
  from cases c
  cross join lateral public.shift_verdict(c.at_utc, c.ws, c.we, c.fs, c.fe, c.sas, c.sae, c.sus, c.sue, c.offdays) v
)
select 0 as sort, 'self-test' as thing,
       count(*) filter (where ok)::text || ' of ' || count(*)::text || ' passed' as result
from run
union all
select 1, 'FAILED - ' || label,
       'expected ' || want::text || ', the rule said ' || got::text
from run where not ok
union all
select 2, 'worked example - ' || label,
       case when got
            then 'in, until ' || to_char(verdict_ends at time zone 'Africa/Johannesburg', 'Dy DD Mon HH24:MI')
            else 'out' || coalesce(', back in ' || to_char(verdict_next at time zone 'Africa/Johannesburg', 'Dy DD Mon HH24:MI'), ', never') end
from run where n in (7, 17, 18, 24, 25, 23)
order by sort, thing;


-- ============ Holiday check ============
--
-- The rule reads the closures table, so this one cannot be answered with
-- made-up numbers alone. It books a holiday on a date nobody will ever
-- work, asks the rule about it, takes the holiday straight back out, and
-- then tells you what happened.
--
-- If you ever do book the 1st of January 2099 off, tell me and I will move
-- this date.

insert into public.shop_closures (closed_on, note)
values (date '2099-01-01', 'self-test only, removed by the next statement')
on conflict (closed_on) do nothing;

create temp table zz_holiday_check as
select
  not (select verdict_allowed from public.shift_verdict(
         timestamptz '2099-01-01 07:00+00',
         time '07:00', time '17:00', time '07:00', time '14:00',
         time '08:00', time '14:00', null::time, null::time, '{}'::text[])) as shut,
  (select verdict_allowed from public.shift_verdict(
         timestamptz '2098-12-31 07:00+00',
         time '07:00', time '17:00', time '07:00', time '14:00',
         time '08:00', time '14:00', null::time, null::time, '{}'::text[])) as open_the_day_before;

delete from public.shop_closures where closed_on = date '2099-01-01';

select 'holiday check' as step,
       case when (select shut and open_the_day_before from zz_holiday_check)
            then 'a booked day closes the shop, the day before is unaffected, and the test holiday has been removed'
            else 'HOLIDAYS ARE NOT WORKING - tell Claude' end as result;
