-- Which of the laser and shift setup files have been run on THIS database.
--
-- Each setup file adds a table, a column or a function. This looks for
-- one thing each file adds and says whether it is there. It changes
-- nothing -- it only reads.
--
-- Run it on PRACTICE, then on LIVE, and compare. Select nothing before
-- pressing Run. Every row should say "ready". A row saying "MISSING"
-- names the file to run.


with checks (setup_file, looks_for, found) as (
  values
    ('setup-laser-programs.sql',        'table laser_programs',
      exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'laser_programs')),
    ('setup-laser-programs.sql',        'table laser_program_jobs',
      exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'laser_program_jobs')),
    ('setup-laser-programs.sql',        'table laser_program_events',
      exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'laser_program_events')),
    ('setup-laser-status.sql',          'column job_processes.started_at',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_processes' and column_name = 'started_at')),
    ('setup-laser-status.sql',          'column process_type_settings.worked_in_laser_status',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'process_type_settings' and column_name = 'worked_in_laser_status')),
    ('setup-program-repeats.sql',       'column laser_programs.sheets_required',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'laser_programs' and column_name = 'sheets_required')),
    ('setup-program-repeats.sql',       'column laser_programs.sheets_cut',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'laser_programs' and column_name = 'sheets_cut')),
    ('setup-laser-cutting-time.sql',    'column laser_programs.cut_minutes',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'laser_programs' and column_name = 'cut_minutes')),
    ('setup-laser-cutting-time.sql',    'column laser_programs.actual_minutes',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'laser_programs' and column_name = 'actual_minutes')),
    ('setup-shift-laser-flag.sql',      'column shifts.cuts_laser',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shifts' and column_name = 'cuts_laser')),
    ('setup-tube-laser-nesting.sql',    'column job_processes.nesting_name',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_processes' and column_name = 'nesting_name')),
    ('setup-shift-lockout-1-settings.sql', 'table shifts',
      exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'shifts')),
    ('setup-shift-lockout-1-settings.sql', 'table app_settings',
      exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'app_settings')),
    ('setup-shift-lockout-1-settings.sql', 'table shop_closures',
      exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'shop_closures')),
    ('setup-shift-lockout-1-settings.sql', 'column profiles.shift_id',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'shift_id')),
    ('setup-shift-lockout-1-settings.sql', 'column profiles.can_manage_shifts',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'can_manage_shifts')),
    ('setup-shift-lockout-1-settings.sql', 'column shifts.days_off',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shifts' and column_name = 'days_off')),
    ('setup-shift-lockout-2-the-rule.sql', 'function shift_day_window',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'shift_day_window')),
    ('setup-shift-lockout-2-the-rule.sql', 'function shift_verdict',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'shift_verdict')),
    ('setup-shift-lockout-3-requests.sql', 'table shift_access_requests',
      exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'shift_access_requests')),
    ('setup-shift-lockout-3-requests.sql', 'function shift_access',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'shift_access'))
)
select
  setup_file,
  looks_for,
  case when found then 'ready' else 'MISSING - run this file' end as status
from checks
order by (not found) desc, setup_file, looks_for;
