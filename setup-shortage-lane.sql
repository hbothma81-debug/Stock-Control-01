-- Which laser a shortage belongs to.
--
-- A shortage did not know whether its parts are plate or tube, so the
-- red "Shortages needing nesting" block was drawn on both nesting
-- departments and every flagged shortage appeared twice. Once nested,
-- a mixed job got a catch-up stage for BOTH nesting stages, so the
-- re-cut showed up under both departments as work.
--
-- One column. 'plate' or 'tube', set when the shortage is flagged --
-- worked out from the job when it has only one kind of nesting stage,
-- asked for with two buttons when it has both. Left empty on shortages
-- flagged before this existed; those still show under both, marked.
--
-- The tube laser tab being built next to Laser 4kw should read this
-- column to find its own re-cuts, rather than inventing a second way.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.shortages
  add column if not exists lane text;

do $do$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'shortages_lane_is_plate_or_tube') then
    alter table public.shortages
      add constraint shortages_lane_is_plate_or_tube
      check (lane is null or lane in ('plate', 'tube'));
  end if;
end $do$;


-- ============ Check ============

select 'shortage lane' as step,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'shortages'
                           and column_name = 'lane')
            then 'ready — a shortage can say which laser it belongs to'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
