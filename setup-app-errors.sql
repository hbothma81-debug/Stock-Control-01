-- A record of every crash the app's crash screen has caught.
--
-- When a screen crashes while it is being drawn, the person sees a red box
-- or a whole-page message (src/ErrorBoundary.jsx). Until now that was only
-- known about if somebody said so. This table is where the app writes it
-- down: what failed, on which job and stage, for whom, when, on which
-- device and which build of the app.
--
-- Anybody signed in can ADD a line, for themselves only. Only admins can
-- READ them (Stock Manager -> App errors). Nobody can edit or delete one:
-- there is no update or delete rule. Lines older than 90 days are cleared
-- by the table itself each time a new one arrives (Heinrich, 27 Sep 2026).
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  happened_at timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  user_email  text check (char_length(user_email) <= 320),
  heading     text not null check (char_length(heading) <= 300),
  message     text check (char_length(message) <= 2000),
  details     text check (char_length(details) <= 8000),
  app_build   text check (char_length(app_build) <= 200),
  device      text check (char_length(device) <= 500),
  site        text check (char_length(site) <= 200)
);

create index if not exists app_errors_happened_idx on public.app_errors (happened_at desc);

alter table public.app_errors enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_errors'
                 and policyname = 'Signed-in users can record an app error') then
    create policy "Signed-in users can record an app error"
      on public.app_errors for insert
      with check (auth.role() = 'authenticated' and user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_errors'
                 and policyname = 'Admins can read app errors') then
    create policy "Admins can read app errors"
      on public.app_errors for select
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
  end if;
end $do$;

-- The table keeps itself to 90 days. "security definer" lets the clearing
-- run for whoever's crash is being written down, since nobody has a
-- delete rule of their own.
create or replace function public.app_errors_keep_90_days()
returns trigger
language plpgsql
security definer set search_path = public
as $body$
begin
  delete from public.app_errors where happened_at < now() - interval '90 days';
  return null;
end;
$body$;

drop trigger if exists app_errors_keep_90_days on public.app_errors;
create trigger app_errors_keep_90_days
  after insert on public.app_errors
  for each statement execute function public.app_errors_keep_90_days();


-- ============ Check ============

select 'app errors' as step,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'app_errors')
             and (select count(*) from pg_policies
                  where schemaname = 'public' and tablename = 'app_errors') = 2
             and exists (select 1 from pg_trigger where tgname = 'app_errors_keep_90_days')
            then 'ready — crashes are written down, admins read them, 90 days kept'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
