-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds per-process priority flagging and shortage tracking for the
-- Production tab.

alter table job_processes add column if not exists is_urgent boolean not null default false;
alter table job_processes add column if not exists has_shortage boolean not null default false;
alter table job_processes add column if not exists shortage_note text;
alter table job_processes add column if not exists shortage_flagged_by text;
alter table job_processes add column if not exists shortage_flagged_at timestamptz;
