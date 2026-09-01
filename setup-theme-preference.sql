-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Lets each person pick their own color theme (dark, medium, or light),
-- saved with their login so it's remembered wherever they sign in.

alter table profiles add column if not exists theme text not null default 'dark';
