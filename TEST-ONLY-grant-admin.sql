-- ============================================================
--  TEST DATABASE ONLY -- makes every account an admin
-- ============================================================
--
--  NEVER RUN THIS ON THE LIVE DATABASE.
--
--  On a fresh database, new accounts are created with every
--  permission set to false, so the first person to sign up is locked
--  out with "nobody's granted you access yet" -- there is no existing
--  admin to let them in.
--
--  This unlocks that first account. is_admin overrides every other
--  permission check in the app, so nothing else needs setting.
--
--  There is a guard below: if the database contains more than 5
--  accounts, this refuses to run, on the assumption that a database
--  with real staff in it is the live one. That is a safety net, not a
--  substitute for checking the project name says stock-control-TEST
--  before you press Run.
--
-- ============================================================

do $$
declare
  n int;
begin
  select count(*) into n from profiles;

  if n > 5 then
    raise exception
      'Refusing to run: this database has % accounts, which looks like the LIVE database, not a practice one. Check the project name.', n;
  end if;

  update profiles set is_admin = true;

  raise notice 'Granted admin to % account(s).', n;
end $$;

-- Check it worked -- should show your account with is_admin = true.
select email, is_admin from profiles;
