-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Fixes two things:
-- 1. Backfills a profiles row for anyone who already has a real login
--    (auth.users) but is missing the matching profiles row — this is what
--    makes them invisible in User Management even though they can log in
--    fine. Safe to run any time: only inserts rows that don't already
--    exist, never touches anyone who's already showing up correctly.
-- 2. Re-asserts the trigger that's supposed to create this row
--    automatically for every future signup, in case it was never active
--    on this project or got dropped at some point. Safe to re-run even if
--    it's already there.

insert into public.profiles (id, name, email)
select id, coalesce(raw_user_meta_data->>'name', ''), email
from auth.users
where id not in (select id from public.profiles);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
