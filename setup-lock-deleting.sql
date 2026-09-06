-- Only admins may delete.
--
-- Right now any of the ten accounts can delete your stock, your jobs and
-- your purchase orders straight from the database. The app itself already
-- says only an admin may delete stock -- the database simply does not
-- know that yet. This makes it agree.
--
--
-- HOW THIS WORKS, because it matters if you ever need to undo it.
--
-- Nothing existing is changed or removed. This ADDS a second rule beside
-- the ones already there. Postgres requires BOTH to pass, so the existing
-- rule keeps saying "you must be signed in" and the new one adds "...and
-- you must be an admin". Undoing it is dropping the new rule; the
-- original is untouched underneath.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


-- ============ 1. One place that knows what an admin is ============
--
-- Written once here rather than repeated in every rule, so there is one
-- thing to correct if the answer ever changes.
--
-- "security definer" lets it read the profiles table on your behalf even
-- when the person asking cannot. Without it, the rule could not do its
-- job for the very people it is meant to stop.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;


-- ============ 2. Stock cannot be deleted except by an admin ============
--
-- Started here on purpose. This is the one table where the app ALREADY
-- restricts deleting to admins (canDelete = isAdmin), so the database
-- agreeing changes nothing anybody does day to day. Nobody's work
-- changes. It only closes the back door.

drop policy if exists "deleting stock is for admins" on public.stock_items;

create policy "deleting stock is for admins"
on public.stock_items
as restrictive
for delete
to authenticated
using (public.is_admin());


-- ============ 3. The rest, deliberately NOT done yet ============
--
-- Twenty-five other tables also allow anyone signed in to delete. They
-- are not in this file, and that is on purpose: some deleting is real
-- work that real people do. Prince takes a job off a nesting program.
-- Somebody edits a job's stages. Locking those to admins would stop the
-- shop working, which is a worse problem than the one being fixed.
--
-- Each one needs checking against what the app actually lets people do,
-- one at a time, tested on practice. The pattern is exactly the block
-- above with a different table name:
--
--   drop policy if exists "deleting X is for admins" on public.X;
--   create policy "deleting X is for admins"
--   on public.X as restrictive for delete to authenticated
--   using (public.is_admin());
--
-- The usage log is a separate job again. It should be append-only -- an
-- audit trail the audited can edit is not a trail -- but the app saves it
-- with a routine that can update and delete rows, so the code has to
-- change before the rule can. Locking it first would break saving.


-- ============ Check ============
--
-- Expect: is_admin says true when an admin is signed in (and false in the
-- SQL editor, which is not signed in as anybody -- that is correct, not a
-- fault). And one restrictive delete rule on stock_items.

select 'am I seen as an admin right now' as check,
       coalesce(public.is_admin()::text, 'no answer') as result

union all

select 'restrictive delete rules now in place',
       coalesce(string_agg(tablename || ' -> ' || policyname, ', '), 'none')
from pg_policies
where schemaname = 'public'
  and permissive = 'RESTRICTIVE'
  and cmd = 'DELETE';
