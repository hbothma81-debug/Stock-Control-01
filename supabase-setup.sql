-- Run this once in your Supabase project's SQL Editor (Supabase dashboard →
-- SQL Editor → New query → paste this whole file → Run).
--
-- This replaces the old shared-PIN "department" system with real, individual
-- sign-in. Every person who uses the app creates their own account (email +
-- password) via Supabase's built-in authentication. This table stores what
-- each person is allowed to do.

-- 1. The shared app data (stock, requisitions, master library) — same as before.
create table if not exists app_storage (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- 2. One row per person, created automatically the moment they sign up.
-- Brand new accounts start with zero permissions and are not admin — an
-- existing admin has to switch them on in the app's User Management screen
-- (or you, manually, for the very first admin — see the deploy guide).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  is_admin boolean not null default false,
  permissions jsonb not null default '{"plate":{"view":false,"edit":false},"structural":{"view":false,"edit":false},"custom":{"view":false,"edit":false},"stores":{"view":false,"edit":false}}',
  can_add_items boolean not null default false,
  can_edit_items boolean not null default false,
  can_requisition boolean not null default false,
  can_mark_received boolean not null default false,
  can_see_value boolean not null default false,
  can_access_stock_manager boolean not null default false,
  can_manage_requisitions boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. Auto-create a blank profile row whenever someone signs up, so they
-- immediately show up in User Management for an admin to grant access to.
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

-- 4. Security rules.
alter table app_storage enable row level security;
alter table profiles enable row level security;

-- You must be signed in to touch the shared stock data at all — this is the
-- real security boundary now, replacing the old "anyone with the PIN" model.
create policy "Signed-in users can read app data" on app_storage
  for select using (auth.role() = 'authenticated');
create policy "Signed-in users can write app data" on app_storage
  for insert with check (auth.role() = 'authenticated');
create policy "Signed-in users can update app data" on app_storage
  for update using (auth.role() = 'authenticated');
create policy "Signed-in users can delete app data" on app_storage
  for delete using (auth.role() = 'authenticated');

-- Everyone signed in can see the list of people (so an admin can browse and
-- grant access, and so the app can look up your own permissions after login).
create policy "Signed-in users can read profiles" on profiles
  for select using (auth.role() = 'authenticated');

-- Only an existing admin can change anyone's permissions or admin status.
create policy "Admins can update profiles" on profiles
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true)
  );
