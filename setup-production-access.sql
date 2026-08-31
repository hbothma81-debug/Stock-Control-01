-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds real, enforced access to specific process types (not just the
-- free-text Department label) — this is what gates the new Production tab.

alter table profiles add column if not exists allowed_process_types jsonb not null default '[]'::jsonb;
