-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Per-job, per-process tracking mode: "batch" (one tick, whole line done)
-- or "each" (a running count against the item's quantity, auto-completing
-- once it reaches the total).

alter table job_processes add column if not exists tracking_mode text not null default 'batch';
alter table job_processes add column if not exists qty_complete numeric not null default 0;
