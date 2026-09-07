-- Stop/Report, notes, and a sheet name on a laser program.
--
-- Three things the cutting screen could not do:
--
--   1. The operator had one button, Mark cut. If anything was wrong he
--      had to leave the app and find somebody.
--   2. There was nowhere to write a note about a program.
--   3. Prince names nothing about the sheet, so the operator has a
--      program number and a thickness and nothing else to find it by.
--
-- Notes and reports both go in the event log that already exists
-- (laser_program_events), so a program keeps its whole history. What is
-- added here is the *current* state, so both screens can show it without
-- reading the whole log.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


-- ============ The new fields ============
--
-- reported_at doubles as the flag: a program with a date here is
-- currently stopped. Clearing the report clears the date. One fact in
-- one place, rather than a separate true/false that can drift out of
-- step with the rest.

alter table public.laser_programs
  add column if not exists sheet_name              text,
  add column if not exists reported_reason         text,
  add column if not exists reported_offcut_length  numeric,
  add column if not exists reported_offcut_width   numeric,
  add column if not exists reported_plate          text,
  add column if not exists reported_by             text,
  add column if not exists reported_at             timestamptz;


-- ============ Check ============
--
-- Expect seven rows, all saying ready.

select 'laser_programs.' || c.name as field,
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'laser_programs'
           and column_name = c.name
       ) then 'ready' else 'MISSING' end as status

from (values
  ('sheet_name'),
  ('reported_reason'),
  ('reported_offcut_length'),
  ('reported_offcut_width'),
  ('reported_plate'),
  ('reported_by'),
  ('reported_at')
) as c(name)

order by field;
