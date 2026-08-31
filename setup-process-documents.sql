-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Lets a document uploaded from the Production tab be tagged with which
-- process it came from (e.g. Nesting), so it can be shown on that
-- process's card specifically.

alter table job_documents add column if not exists process_name text;

-- Flags the original quote file uploaded at job creation, so it can be
-- restricted to sales people only — everyone else sees the rest of a
-- job's documents as normal, just not this one.
alter table job_documents add column if not exists is_quote_file boolean not null default false;
