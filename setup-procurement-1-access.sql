-- Procurement page, step 1 of the SQL: who may use it, and the Claude limits.
--
-- Adds to each person in User Management:
--   * a "Procurement" tick (can_procure). Only ticked people see the
--     Procurement page. This counts for admins too: an admin without the
--     tick does not see it.
--   * "Claude documents a month" (ai_docs_per_month). 0 means the person
--     cannot have documents read by Claude at all.
-- Adds to the app-wide settings:
--   * the monthly Claude spend cap for the whole app, US$15 to start
--   * the shared mailboxes the Procurement page reads (sales@)
--
-- Nobody is ticked by this file. Heinrich ticks himself in User
-- Management once the box is there. Only admins can change either one:
-- the existing rules on profiles and app_settings already say so.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.profiles add column if not exists can_procure boolean not null default false;
alter table public.profiles add column if not exists ai_docs_per_month integer not null default 0;

alter table public.app_settings add column if not exists ai_monthly_cap_usd numeric(8,2) not null default 15;
alter table public.app_settings add column if not exists procurement_shared_mailboxes text[] not null
  default '{sales@ersupplies.co.za}';

-- One place that knows whether the signed-in person has the Procurement
-- tick. "security definer" lets the row rules read profiles on their behalf.
create or replace function public.can_procure()
returns boolean
language sql
security definer
stable
set search_path = public
as $body$
  select coalesce((select p.can_procure from public.profiles p where p.id = auth.uid()), false);
$body$;

grant execute on function public.can_procure() to authenticated;


-- ============ Check ============

select 'procurement access' as step,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'profiles' and column_name = 'can_procure')
             and exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'app_settings' and column_name = 'ai_monthly_cap_usd')
            then 'ready - cap US$' || (select ai_monthly_cap_usd from public.app_settings where id)
            else 'SOMETHING IS MISSING - tell Claude' end as result;
