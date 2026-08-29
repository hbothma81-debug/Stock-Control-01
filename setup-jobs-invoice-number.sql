-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds the real invoice number captured when a job is marked invoiced.

alter table jobs add column if not exists invoice_number text;
