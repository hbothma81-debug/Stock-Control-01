-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Optional free-text notes per process, per job — shown on the
-- Production tab, across every process type.

alter table job_processes add column if not exists notes text;
