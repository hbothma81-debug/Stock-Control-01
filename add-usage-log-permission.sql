-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds the "Can view Usage Log" permission. Safe to run even if you're not
-- sure — it does nothing if the column already exists.

alter table profiles add column if not exists can_view_usage_log boolean not null default false;
