-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds three columns the app was built assuming existed, but never
-- actually had matching SQL provided: the "Is a Sales Person" toggle and
-- "Department" picker in User Management, and "Can manage Invoicing".

alter table profiles add column if not exists is_sales_person boolean not null default false;
alter table profiles add column if not exists department text;
alter table profiles add column if not exists can_manage_invoicing boolean not null default false;
