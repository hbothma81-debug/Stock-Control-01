-- Where an item is made: step one of the "made on" tag.
--
-- A job's items carry no idea of which machine makes them, so an Each
-- stage lists every item on the job. On a mixed job the tube parts show
-- up under Laser Status and the plate parts under Tube Laser, and each
-- stage waits for parts that will never come to it.
--
-- This adds the three columns that fix that. Nothing reads them yet, so
-- running this changes nothing on any screen. The steps after this one
-- (Stock Manager setting, the job's Items tab, the filter) are what put
-- them to work. The plan is docs/MADE-ON-TAG-PLAN.md.
--
--
-- THE TAG
--
-- Stored as a fixed code, shown as a label, so nobody can create "Tube
-- Laser" and "tube laser" as two different things:
--
--   laser         plate, cut on the 4kw laser
--   tube_laser    tube, cut on the tube laser
--   cnc           machined on the CNC / drilled
--   cut_to_size   sawn to length
--   assembly      not cut here; put together from other things
--   ''            not tagged yet -- behaves exactly as today
--
--
-- WHERE IT LIVES
--
--   job_quote_items.made_on        the tag on a line of a job
--   stock_items.made_on            the tag remembered on the stock part,
--                                  so the next job with that part comes
--                                  in tagged. The shop does a lot of
--                                  rework; the same part keeps coming back.
--   process_type_settings.cuts_made_on
--                                  which tag a stage cuts. Tube Laser
--                                  Nesting and Tube Laser say tube_laser;
--                                  Nesting, Laser and Packer say laser;
--                                  blank means "every item" (bending,
--                                  delivery, invoicing). Set under Stock
--                                  Manager -> Job Process Types once step
--                                  two lands. A setting rather than a
--                                  name, so renaming a stage cannot break
--                                  it.
--
-- Blank everywhere by default, on purpose: nothing changes on the floor
-- until someone tags something.
--
--
-- Select nothing before pressing Run. Safe to run more than once.
-- Run it on the PRACTICE database first, then on live.


-- ============ 1. The tag on a job's line ============

alter table job_quote_items
  add column if not exists made_on text not null default '';


-- ============ 2. The tag remembered on the stock part ============

alter table stock_items
  add column if not exists made_on text not null default '';


-- ============ 3. Which tag a stage cuts ============
--
-- "if exists" because process_type_settings is created by
-- setup-laser-programs.sql, and setup-ALL.sql does not yet include that
-- file. On a database without the table this section simply does
-- nothing rather than stopping the whole script; run
-- setup-laser-programs.sql and then this one again.

alter table if exists process_type_settings
  add column if not exists cuts_made_on text not null default '';


-- ============ 4. Only the five codes, or blank ============
--
-- Belt and braces: the app will only ever write these, but a typo in a
-- future script should be refused rather than stored. Dropped and
-- recreated so the script stays safe to run twice.

alter table job_quote_items drop constraint if exists job_quote_items_made_on_check;
alter table job_quote_items
  add constraint job_quote_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly'));

alter table stock_items drop constraint if exists stock_items_made_on_check;
alter table stock_items
  add constraint stock_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly'));

do $$
begin
  if to_regclass('public.process_type_settings') is not null then
    alter table process_type_settings drop constraint if exists process_type_settings_cuts_made_on_check;
    alter table process_type_settings
      add constraint process_type_settings_cuts_made_on_check
      check (cuts_made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size'));
  end if;
end $$;


-- ============ Check ============
--
-- Three rows, each saying ready. Only two rows means
-- process_type_settings does not exist here yet -- see section 3.
--
-- Read from the database's own list of columns rather than from the
-- tables, so the check cannot fail on a database where one of them is
-- missing.

select table_name || '.' || column_name as column_added,
       'ready' as state
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'job_quote_items' and column_name = 'made_on') or
    (table_name = 'stock_items' and column_name = 'made_on') or
    (table_name = 'process_type_settings' and column_name = 'cuts_made_on')
  )

union all

select 'lines and parts tagged so far',
       (select count(*) filter (where made_on <> '') from job_quote_items)::text || ' job lines, ' ||
       (select count(*) filter (where made_on <> '') from stock_items)::text || ' stock parts'

order by 1;
