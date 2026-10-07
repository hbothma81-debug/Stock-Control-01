-- A request for stock remembers which job it is for (Heinrich, 7 Oct 2026).
--
-- Two columns on requisitions, the same pair purchase_orders already has
-- (setup-po-job-link.sql): the job's id, and its number kept beside it so
-- the list can show it without a lookup. Empty means the request is for
-- Stores, not a job. The Request stock basket writes them; the list shows
-- the job on each line; the PO builder will carry it onto the PO's job
-- box, which Receiving already reads to set the delivery aside.
--
-- Run on PRACTICE first, then LIVE. Select nothing before pressing Run.
-- Safe to run more than once. The app only writes these columns once it
-- has seen them on a loaded row, so the code can go live before or after.

alter table public.requisitions add column if not exists job_id text not null default '';
alter table public.requisitions add column if not exists job_number text not null default '';

create index if not exists requisitions_job_id_idx on public.requisitions (job_id);
