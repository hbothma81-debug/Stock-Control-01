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

create or replace function public.shift_day_window(
  p_date           date,
  p_weekday_start  time, p_weekday_end  time,
  p_saturday_start time, p_saturday_end time,
  p_sunday_start   time, p_sunday_end   time
)
returns table (starts_at timestamp, ends_at timestamp)
language sql
immutable
as $$
  select
    (p_date + s.on_at)::timestamp,
    case when s.off_at > s.on_at
         then (p_date + s.off_at)::timestamp
         else (p_date + 1 + s.off_at)::timestamp
    end
  from (
    select
      case extract(isodow from p_date)::int
        when 6 then p_saturday_start
        when 7 then p_sunday_start
        else        p_weekday_start
      end as on_at,
      case extract(isodow from p_date)::int
        when 6 then p_saturday_end
        when 7 then p_sunday_end
        else        p_weekday_end
      end as off_at
  ) s
  where s.on_at is not null;
$$;


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
  p_saturday_start time, p_saturday_end time,
  p_sunday_start   time, p_sunday_end   time
)
returns table (verdict_allowed boolean, verdict_ends timestamptz, verdict_next timestamptz)
language plpgsql
stable
as $$
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
      p_saturday_start, p_saturday_end,
      p_sunday_start,   p_sunday_end
    ) win
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
$$;


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
as $$
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
    sh.saturday_start, sh.saturday_end,
    sh.sunday_start,   sh.sunday_end
  );

  return query select
    v.verdict_allowed,
    v.verdict_ends,
    v.verdict_next,
    (case when v.verdict_allowed then 'on shift: ' || sh.name
          else 'outside ' || sh.name || ' hours' end)::text;
end;
$$;

grant execute on function public.shift_day_window(date, time, time, time, time, time, time) to authenticated;
grant execute on function public.shift_verdict(timestamptz, time, time, time, time, time, time) to authenticated;
grant execute on function public.shift_access(uuid, timestamptz) to authenticated;


-- ============ Self-test ============
--
-- Nineteen awkward moments, each with the answer written down beforehand.
-- Every time in a label is the time on the wall in Johannesburg; the +00 in
-- the middle is that same moment as the database sees it.
--
-- 2026-09-07 is a Monday, so that week runs Mon the 7th to Sun the 13th.
--
-- You should get one row back: "19 of 19 passed". Anything that failed is
-- listed under it, and a handful of worked examples at the bottom.

with cases (n, label, at_utc, ws, we, sas, sae, sus, sue, want) as (values
  -- Night shift: Mon-Fri 18:00 to 06:00, weekend off
  ( 1, 'Night, Wed 19:00 - on shift',
       timestamptz '2026-09-09 17:00+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, true),
  ( 2, 'Night, Thu 02:00 - still on last nights shift',
       timestamptz '2026-09-10 00:00+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, true),
  ( 3, 'Night, Thu 05:59 - last minute of it',
       timestamptz '2026-09-10 03:59+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, true),
  ( 4, 'Night, Thu 06:00 - shift is over',
       timestamptz '2026-09-10 04:00+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, false),
  ( 5, 'Night, Mon 17:59 - one minute early',
       timestamptz '2026-09-07 15:59+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, false),
  ( 6, 'Night, Mon 18:00 - on the dot',
       timestamptz '2026-09-07 16:00+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, true),
  ( 7, 'Night, Sat 02:00 - Fridays shift runs into Saturday',
       timestamptz '2026-09-12 00:00+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, true),
  ( 8, 'Night, Sat 19:00 - Saturday is off',
       timestamptz '2026-09-12 17:00+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, false),
  ( 9, 'Night, Sun 12:00 - Sunday is off',
       timestamptz '2026-09-13 10:00+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, false),
  (10, 'Night, Wed 18:30 - THE CLOCK: in UTC this reads 16:30 and gets refused',
       timestamptz '2026-09-09 16:30+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, true),
  (11, 'Night, Wed 06:30 - morning, and this is not a morning shift',
       timestamptz '2026-09-09 04:30+00', time '18:00', time '06:00', null::time, null::time, null::time, null::time, false),

  -- Day shift: Mon-Fri 07:00 to 17:00, Saturday 08:00 to 14:00, Sunday off
  (12, 'Day, Wed 08:00 - on shift',
       timestamptz '2026-09-09 06:00+00', time '07:00', time '17:00', time '08:00', time '14:00', null::time, null::time, true),
  (13, 'Day, Wed 16:59 - last minute of it',
       timestamptz '2026-09-09 14:59+00', time '07:00', time '17:00', time '08:00', time '14:00', null::time, null::time, true),
  (14, 'Day, Wed 17:00 - knocked off',
       timestamptz '2026-09-09 15:00+00', time '07:00', time '17:00', time '08:00', time '14:00', null::time, null::time, false),
  (15, 'Day, Wed 03:00 - no carry over, it is not a night shift',
       timestamptz '2026-09-09 01:00+00', time '07:00', time '17:00', time '08:00', time '14:00', null::time, null::time, false),
  (16, 'Day, Sat 09:00 - Saturday hours',
       timestamptz '2026-09-12 07:00+00', time '07:00', time '17:00', time '08:00', time '14:00', null::time, null::time, true),
  (17, 'Day, Sat 15:00 - after Saturday hours',
       timestamptz '2026-09-12 13:00+00', time '07:00', time '17:00', time '08:00', time '14:00', null::time, null::time, false),

  -- The two odd ones
  (18, 'Round the clock, Wed 03:00 - 00:00 to 00:00 means all day',
       timestamptz '2026-09-09 01:00+00', time '00:00', time '00:00', null::time, null::time, null::time, null::time, true),
  (19, 'A shift with no hours at all - nobody on it ever gets in',
       timestamptz '2026-09-09 10:00+00', null::time, null::time, null::time, null::time, null::time, null::time, false)
),
run as (
  select c.n, c.label, c.want, v.verdict_allowed as got, v.verdict_ends, v.verdict_next,
         (v.verdict_allowed = c.want) as ok
  from cases c
  cross join lateral public.shift_verdict(c.at_utc, c.ws, c.we, c.sas, c.sae, c.sus, c.sue) v
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
from run where n in (2, 4, 7, 8, 10, 19)
order by sort, thing;
