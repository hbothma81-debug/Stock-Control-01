-- CNC module, file 1 of 5: who may see, change and delete CNC programs.
--
-- The CNC tick under User Management is kept in profiles.permissions as
-- "cnc": { view, edit, delete }. These three questions are asked by every
-- rule on the cnc_ tables and the cnc-files store, so the database itself
-- refuses anyone without the tick, not only the screen. Admins may do all.
-- "security definer" lets the rule read profiles for whoever is asking.
-- Mirrored in the app by canView("cnc") / canEdit("cnc") and the delete
-- tick (src/UserManagement.jsx): change both together.
--
-- Run on PRACTICE first. Select nothing before pressing Run. Safe to run twice.

create or replace function public.cnc_may(p_kind text)
returns boolean
language sql
security definer
stable
set search_path = public
as $fn$
  select coalesce((
    select p.is_admin
        or coalesce((p.permissions -> 'cnc' ->> p_kind)::boolean, false)
        or (p_kind = 'view' and coalesce((p.permissions -> 'cnc' ->> 'edit')::boolean, false))
      from public.profiles p where p.id = auth.uid()
  ), false);
$fn$;

grant execute on function public.cnc_may(text) to authenticated;

-- ============ Check ============

select 'cnc access' as step,
       case when exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                          where n.nspname = 'public' and pr.proname = 'cnc_may')
            then 'ready - the database knows the CNC tick'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
