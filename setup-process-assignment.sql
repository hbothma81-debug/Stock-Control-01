-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- 1. A real connection from a process to an actual person, not just a
--    name typed in a text box — this is what makes a genuine "assigned to
--    you" notification possible, and gives each process someone
--    accountable for completing it.
alter table job_processes add column if not exists assigned_to uuid references profiles(id) on delete set null;

-- 2. Notifications were only ever built for sales people (targeted by
--    name, via sales_rep). A process can be assigned to anyone — floor
--    staff, not just sales — so notifications need a real recipient
--    column, not a role-specific one. The existing sales_rep column and
--    everything that already uses it is untouched; this is additive.
alter table job_notifications add column if not exists recipient_id uuid references profiles(id) on delete cascade;
