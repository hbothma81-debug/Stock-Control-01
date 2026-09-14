-- Two things a shortage could not say.
--
-- 1. What happened, in the flagger's own words. The four-way reason
--    (short, damaged, lost, other) cannot tell a nester whether the parts
--    are really missing or only not cut yet. reason_note holds the words;
--    the flag form asks for them.
-- 2. That it was raised by mistake. A cancelled shortage keeps its row,
--    status 'cancelled', with who, when and why -- like a cancelled laser
--    program, the record stays readable. status has no check rule.
--
-- Run on PRACTICE first, then LIVE. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.shortages add column if not exists reason_note text not null default '';
alter table public.shortages add column if not exists cancelled_by text not null default '';
alter table public.shortages add column if not exists cancelled_at timestamptz;
alter table public.shortages add column if not exists cancel_reason text not null default '';


-- ============ Check ============
-- "rules" should list only shortages_lane_is_plate_or_tube.

select 'shortage reason and cancel' as step,
       case when (select count(*) from information_schema.columns
                  where table_schema = 'public' and table_name = 'shortages'
                    and column_name in ('reason_note', 'cancelled_by',
                                        'cancelled_at', 'cancel_reason')) = 4
            then 'ready — a shortage can carry the words and be cancelled'
            else 'SOMETHING IS MISSING - tell Claude' end as result,
       (select string_agg(conname, ', ') from pg_constraint
         where conrelid = 'public.shortages'::regclass and contype = 'c') as rules;
