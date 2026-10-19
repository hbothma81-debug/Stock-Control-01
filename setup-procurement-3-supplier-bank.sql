-- Procurement page, step 3 of the SQL: each supplier's terms and bank details.
--
-- Kept in their own table, apart from master_suppliers, because the
-- supplier list can be read and changed by everybody signed in, and bank
-- details must not be:
--   * people with the Procurement tick can read them
--   * only an admin who also has the tick can add or change them
--   * every add, change or removal is written to supplier_bank_changes,
--     with who and when. That log cannot be edited by anyone, and only
--     admins can read it.
-- The page's fraud check compares the bank details on a supplier's quote
-- or pro forma with the details here.
--
-- Needs setup-procurement-1-access.sql first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.supplier_payment_details (
  supplier_id     text primary key references public.master_suppliers(id) on delete cascade,
  terms           text check (terms in ('Account', 'Pro forma')),
  our_account_no  text not null default '',
  bank_name       text not null default '',
  account_holder  text not null default '',
  account_number  text not null default '',
  branch_code     text not null default '',
  updated_by      text,
  updated_by_user uuid default auth.uid(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.supplier_bank_changes (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     text not null,
  action          text not null,
  old_details     jsonb,
  new_details     jsonb,
  changed_by_user uuid default auth.uid(),
  changed_at      timestamptz not null default now()
);

create index if not exists supplier_bank_changes_supplier_idx
  on public.supplier_bank_changes (supplier_id, changed_at desc);

create or replace function public.log_supplier_bank_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into public.supplier_bank_changes (supplier_id, action, old_details, new_details)
  values (coalesce(new.supplier_id, old.supplier_id), lower(tg_op),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end;
$body$;

drop trigger if exists supplier_payment_details_log on public.supplier_payment_details;
create trigger supplier_payment_details_log
  after insert or update or delete on public.supplier_payment_details
  for each row execute function public.log_supplier_bank_change();

alter table public.supplier_payment_details enable row level security;
alter table public.supplier_bank_changes enable row level security;

drop policy if exists "Procurement people read supplier bank" on public.supplier_payment_details;
create policy "Procurement people read supplier bank" on public.supplier_payment_details
  for select to authenticated using (public.can_procure());

drop policy if exists "Admins add supplier bank" on public.supplier_payment_details;
create policy "Admins add supplier bank" on public.supplier_payment_details
  for insert to authenticated with check (public.can_procure() and public.is_admin());

drop policy if exists "Admins change supplier bank" on public.supplier_payment_details;
create policy "Admins change supplier bank" on public.supplier_payment_details
  for update to authenticated
  using (public.can_procure() and public.is_admin())
  with check (public.can_procure() and public.is_admin());

drop policy if exists "Admins remove supplier bank" on public.supplier_payment_details;
create policy "Admins remove supplier bank" on public.supplier_payment_details
  for delete to authenticated using (public.can_procure() and public.is_admin());

drop policy if exists "Admins read bank changes" on public.supplier_bank_changes;
create policy "Admins read bank changes" on public.supplier_bank_changes
  for select to authenticated using (public.is_admin());


-- ============ Check ============

select 'supplier bank details' as step,
       case when exists (select 1 from pg_trigger where tgname = 'supplier_payment_details_log')
            then 'ready - ' || (select count(*) from public.supplier_payment_details) || ' suppliers on file, every change logged'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
