-- Procurement page, step 3 of the SQL: each supplier's terms and our account no.
--
-- Terms are Account (ERS orders on the quote) or Pro forma (ERS pays up
-- front, so a pro forma invoice is needed). Our account no is the number
-- the supplier knows ERS by. People with the Procurement tick read them;
-- only an admin who also has the tick changes them.
--
-- NO BANK DETAILS. Heinrich's decision, 19 Oct 2026: supplier banking
-- stays with accounts, never in the app, because a bank number kept here
-- is one more thing a fraudster can change. An earlier version of this
-- file (setup-procurement-3-supplier-bank.sql, run on practice only) made
-- bank columns and a bank change log; this file takes them away again.
--
-- Needs setup-procurement-1-access.sql first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.supplier_payment_details (
  supplier_id     text primary key references public.master_suppliers(id) on delete cascade,
  terms           text check (terms in ('Account', 'Pro forma')),
  our_account_no  text not null default '',
  updated_by      text,
  updated_by_user uuid default auth.uid(),
  updated_at      timestamptz not null default now()
);

-- Undo the earlier bank version where it ran (practice).
drop trigger if exists supplier_payment_details_log on public.supplier_payment_details;
drop function if exists public.log_supplier_bank_change();
drop table if exists public.supplier_bank_changes;
alter table public.supplier_payment_details drop column if exists bank_name;
alter table public.supplier_payment_details drop column if exists account_holder;
alter table public.supplier_payment_details drop column if exists account_number;
alter table public.supplier_payment_details drop column if exists branch_code;

alter table public.supplier_payment_details enable row level security;

drop policy if exists "Procurement people read supplier bank" on public.supplier_payment_details;
drop policy if exists "Admins add supplier bank" on public.supplier_payment_details;
drop policy if exists "Admins change supplier bank" on public.supplier_payment_details;
drop policy if exists "Admins remove supplier bank" on public.supplier_payment_details;

drop policy if exists "Procurement people read supplier terms" on public.supplier_payment_details;
create policy "Procurement people read supplier terms" on public.supplier_payment_details
  for select to authenticated using (public.can_procure());

drop policy if exists "Admins add supplier terms" on public.supplier_payment_details;
create policy "Admins add supplier terms" on public.supplier_payment_details
  for insert to authenticated with check (public.can_procure() and public.is_admin());

drop policy if exists "Admins change supplier terms" on public.supplier_payment_details;
create policy "Admins change supplier terms" on public.supplier_payment_details
  for update to authenticated
  using (public.can_procure() and public.is_admin())
  with check (public.can_procure() and public.is_admin());

drop policy if exists "Admins remove supplier terms" on public.supplier_payment_details;
create policy "Admins remove supplier terms" on public.supplier_payment_details
  for delete to authenticated using (public.can_procure() and public.is_admin());


-- ============ Check ============

select 'supplier terms' as step,
       case when exists (select 1 from information_schema.tables where table_schema = 'public'
                         and table_name = 'supplier_payment_details')
             and not exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'supplier_payment_details' and column_name = 'account_number')
             and not exists (select 1 from information_schema.tables where table_schema = 'public'
                         and table_name = 'supplier_bank_changes')
            then 'ready - ' || (select count(*) from public.supplier_payment_details) || ' suppliers with terms, no bank details kept'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
