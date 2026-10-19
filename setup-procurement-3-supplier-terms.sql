-- Procurement page, step 3 of the SQL: each supplier's terms and our account no.
--
-- Two new boxes on every supplier in Stock Manager -> Suppliers:
--   * account_no: the account number the supplier gave ERS (EAS007 at
--     Eurosteel, COD037 at McNaughtan). It prints on every purchase order,
--     so it sits on the supplier list itself, which everyone who raises a
--     PO can read.
--   * terms: Account (ERS orders on the quote) or Pro forma (ERS pays up
--     front, so a pro forma invoice is needed). The Procurement page's
--     reminders ask for a pro forma only on Pro forma terms.
--
-- NO BANK DETAILS. Heinrich's decision, 19 Oct 2026: supplier banking
-- stays with accounts, never in the app. Earlier versions of this file,
-- run on practice only, made a separate supplier_payment_details table
-- (first with bank columns and a change log); this one takes all of that
-- away again, and drops that table only while it holds no rows.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.master_suppliers add column if not exists account_no text not null default '';
alter table public.master_suppliers add column if not exists terms text;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'master_suppliers_terms_check') then
    alter table public.master_suppliers add constraint master_suppliers_terms_check
      check (terms in ('Account', 'Pro forma'));
  end if;
end $do$;

-- Undo the earlier versions where they ran (practice). Every step on that
-- table sits inside the check that it exists: "drop trigger if exists ... on
-- a table" still fails on a database that never had the table (live, 19 Oct).
do $do$
begin
  if to_regclass('public.supplier_payment_details') is not null then
    drop trigger if exists supplier_payment_details_log on public.supplier_payment_details;
  end if;
end $do$;
drop function if exists public.log_supplier_bank_change();
drop table if exists public.supplier_bank_changes;

do $do$
begin
  if to_regclass('public.supplier_payment_details') is not null then
    if exists (select 1 from public.supplier_payment_details) then
      raise notice 'supplier_payment_details still holds rows: left in place, tell Claude';
    else
      drop table public.supplier_payment_details;
    end if;
  end if;
end $do$;


-- ============ Check ============

select 'supplier terms and account no' as step,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'master_suppliers' and column_name = 'account_no')
             and exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'master_suppliers' and column_name = 'terms')
             and to_regclass('public.supplier_payment_details') is null
             and to_regclass('public.supplier_bank_changes') is null
            then 'ready - ' || (select count(*) from public.master_suppliers where account_no <> '')
                 || ' suppliers with an account no, no bank details kept'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
