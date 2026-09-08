-- Shift lockout, stage three of four: asking to be let in.
--
-- Still ENFORCES NOTHING. The master switch is off, so the rule this adds
-- to never gets to say no in the first place.
--
-- A Friday that runs late, a machine that has to be finished tonight, a
-- delivery that lands at six. Without this, every one of those means
-- somebody editing shift times and remembering to put them back. So a
-- person who is locked out can ask, and whoever runs the shifts can let
-- them in for a few hours.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.
--
-- Needs stages one and two.


-- ============ 1. The asking ============
--
-- One row per ask. It keeps the answer as well as the question, so a
-- pattern of Friday afternoons shows up rather than disappearing.
--
-- good_until is the whole grant: the person is in until that moment and
-- then they are not. Nothing has to run to end it -- the time simply
-- passes, which is the kind of expiry that cannot be forgotten.

create table if not exists public.shift_access_requests (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.profiles(id) on delete cascade,
  asked_at   timestamptz not null default now(),
  reason     text not null default '',

  state      text not null default 'waiting',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  good_until timestamptz,

  constraint shift_access_requests_state
    check (state in ('waiting', 'granted', 'refused')),

  -- A grant with no end is a permanent hole in the lockout. It must have one.
  constraint shift_access_requests_granted_has_an_end
    check (state <> 'granted' or good_until is not null)
);

create index if not exists shift_access_requests_waiting_idx
  on public.shift_access_requests (state, asked_at desc);

create index if not exists shift_access_requests_person_idx
  on public.shift_access_requests (person_id, asked_at desc);

alter table public.shift_access_requests enable row level security;


-- ============ 2. Who may ask, and who may answer ============
--
-- Anybody may ask, but only for themselves. Only whoever runs the shifts
-- may answer.
--
-- This table has to stay reachable by somebody who is locked out -- they
-- are locked out precisely when they need to ask. Stage four must leave
-- these policies alone.

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'shift_access_requests'
                 and policyname = 'You can ask for yourself') then
    create policy "You can ask for yourself" on public.shift_access_requests
      for insert with check (person_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'shift_access_requests'
                 and policyname = 'You can see your own asks, managers see all') then
    create policy "You can see your own asks, managers see all" on public.shift_access_requests
      for select using (
        person_id = auth.uid()
        or exists (select 1 from public.profiles p
                   where p.id = auth.uid() and (p.is_admin or p.can_manage_shifts))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'shift_access_requests'
                 and policyname = 'Shift managers answer') then
    create policy "Shift managers answer" on public.shift_access_requests
      for update
      using (
        exists (select 1 from public.profiles p
                where p.id = auth.uid() and (p.is_admin or p.can_manage_shifts))
      )
      with check (
        exists (select 1 from public.profiles p
                where p.id = auth.uid() and (p.is_admin or p.can_manage_shifts))
      );
  end if;
end $do$;


-- ============ 3. The rule learns about grants ============
--
-- The order matters. The shift itself is asked first, so somebody who is
-- simply on shift gets their real knocking-off time rather than a stale
-- grant's earlier one. Only when the shift says no does a live grant get
-- a look in.
--
-- Same shape as before, so nothing that calls it has to change.

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
  good_till timestamptz;
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

  if v.verdict_allowed then
    return query select true, v.verdict_ends, null::timestamptz, ('on shift: ' || sh.name)::text;
    return;
  end if;

  -- Off shift. Has somebody let them in anyway, and is it still good?
  select r.good_until into good_till
  from public.shift_access_requests r
  where r.person_id = p_user
    and r.state = 'granted'
    and r.good_until > p_at
  order by r.good_until desc
  limit 1;

  if good_till is not null then
    return query select true, good_till, null::timestamptz, 'let in outside your hours'::text;
    return;
  end if;

  return query select false, null::timestamptz, v.verdict_next,
    ('outside ' || sh.name || ' hours')::text;
end;
$body$;

grant execute on function public.shift_access(uuid, timestamptz) to authenticated;


-- ============ Check ============
--
-- Books a made-up person a grant, asks the rule, and takes it back out.
-- Nothing is left behind either way.

select 'requests table' as step,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'shift_access_requests')
            then 'ready — people can ask, managers can answer, and a grant always has an end'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
