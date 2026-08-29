-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds linking a quoted item to a real Customer Stock item, so price stays
-- in sync both ways and available stock/revision can be shown. Run on top
-- of the earlier setup-jobs*.sql files.

alter table job_quote_items add column if not exists linked_item_id text;
