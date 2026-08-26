-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds the new "Can raise Purchase Orders" permission to your existing
-- profiles table. Safe to run even if you're not sure — it does nothing
-- if the column already exists.

alter table profiles add column if not exists can_raise_po boolean not null default false;
