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
-- ONE query, on purpose. An earlier version had a second statement after
-- a semicolon, and the editor only ever shows you the last result -- so
-- the important half was run and thrown away.
--
-- Select nothing before pressing Run. Read-only. Safe to run any time.


-- ============ A. Any table with no lock at all ============
--
-- A row here is a table readable and writable by anyone who can sign in,
-- and by anyone who signs themselves up. No rows in section A is the
-- good answer.

select 'A. UNLOCKED - anyone signed in can read and write this' as finding,
       tablename                                                as detail,
       ''                                                       as who,
       ''                                                       as rule

from pg_tables
where schemaname = 'public'
  and not rowsecurity

union all

-- ============ B and C. Locked tables, and what the lock says ============
--
-- "who" of {authenticated} means every signed-in account, including one
-- somebody created for themselves thirty seconds ago with no permissions
-- in the app. "rule" is the condition they have to meet.
--
-- Section B means signed in is the only condition -- there is no further
-- test at all. Section C means there is a real condition, and the rule
-- column says what it is.

select case
         when qual = 'true' or qual is null
           then 'B. OPEN TO ALL SIGNED IN - no condition'
         else 'C. conditional - see the rule column'
       end,
       tablename,
       array_to_string(roles, ', '),
       coalesce(qual, '(no condition)')

from pg_policies
where schemaname = 'public'
  and cmd in ('SELECT', 'ALL')

union all

-- ============ D. How many accounts exist ============
--
-- Compare against the staff you expect. Anyone who has ever used the
-- login page's "Create account" tab is in here, whether or not you gave
-- them permissions.
--
-- allowed_process_types is stored as JSON rather than as a Postgres list,
-- so it is compared against an empty JSON array rather than counted.

select 'D. accounts that exist',
       count(*)::text,
       count(*) filter (where is_admin) || ' of them admin',
       count(*) filter (where allowed_process_types is null
                          or allowed_process_types::text in ('[]', 'null'))
         || ' with no production access'

from public.profiles

order by finding, detail;
