-- What can a signed-in account actually read?
--
-- The app decides what each person sees in the browser -- who gets the
-- Stock Manager, who sees prices, which departments show. That is fine
-- for tidiness, but it is not security: the browser is the staff
-- member's own machine, and the key the app uses to talk to the
-- database is visible in the page source of the live site.
--
-- What actually stops someone reading data they should not is the
-- database's own rules, called policies. This tells us what those rules
-- currently say. Nothing is changed by running it.
--
--
-- Select nothing before pressing Run. Read-only. Safe to run any time.


-- ============ 1. Any table with no lock at all ============
--
-- A table listed here is readable and writable by anyone who can sign
-- in, and by anyone who signs themselves up. If this section is empty,
-- that is the good answer.

select 'UNLOCKED - anyone signed in can read and write this' as finding,
       tablename as table_name,
       '' as who,
       '' as rule
from pg_tables
where schemaname = 'public'
  and not rowsecurity

union all

-- ============ 2. Locked tables, and what the lock says ============
--
-- "who" of {authenticated} means every signed-in account, including one
-- somebody created for themselves thirty seconds ago with no permissions
-- in the app. "rule" is the condition they have to meet.
--
-- A rule of "true" means no condition at all -- signed in is enough.

select case
         when qual = 'true' or qual is null
           then 'OPEN TO ALL SIGNED IN - no condition'
         else 'conditional'
       end,
       tablename,
       array_to_string(roles, ', '),
       coalesce(qual, '(no condition)')
from pg_policies
where schemaname = 'public'
  and cmd in ('SELECT', 'ALL')

order by finding, table_name;


-- ============ 3. How many accounts exist ============
--
-- Compare this against the staff you expect. Anyone who has ever used
-- the login page's "Create account" tab is in here, whether or not you
-- ever gave them permissions.

select 'accounts that exist' as finding,
       count(*)::text as table_name,
       count(*) filter (where is_admin) || ' of them admin' as who,
       count(*) filter (where allowed_process_types is null
                          or cardinality(allowed_process_types) = 0)
         || ' with no production access' as rule
from public.profiles;
