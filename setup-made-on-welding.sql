-- Welding as a cut method, so a welded part can be tagged like any other.
--
-- The cut method on a job line and on a stock part is checked against a
-- fixed list, so that nobody can invent "Tube Laser" and "tube laser" as
-- two different things. This adds "welding" to that list.
--
-- Nothing changes on any screen until the app that offers it is pushed,
-- and nothing changes on the floor until a stage is pointed at it (see
-- the note at the bottom). Running this on its own is safe and does
-- nothing visible.
--
-- RUN THIS BEFORE THE APP IS PUSHED. The other way round, choosing
-- Welding on a line is refused by the database and the line will not
-- save.
--
-- Select nothing before pressing Run. Safe to run more than once.
-- Run it on the PRACTICE database first, then on live.


-- ============ 1. The list, on a job's line ============
--
-- Dropped and recreated rather than altered, which is how
-- setup-made-on-tag.sql wrote it and keeps this safe to run twice.

alter table job_quote_items drop constraint if exists job_quote_items_made_on_check;
alter table job_quote_items
  add constraint job_quote_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly', 'welding'));


-- ============ 2. The same list, on the stock part ============
--
-- A line's cut method is remembered on the part it is linked to, so the
-- part's own list has to allow it too or that saving fails instead.

alter table stock_items drop constraint if exists stock_items_made_on_check;
alter table stock_items
  add constraint stock_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly', 'welding'));


-- ============ 3. What a stage may say it cuts ============
--
-- A stage's setting is the same list without "assembly": nothing cuts an
-- assembly. Welding is added, so a stage can be set to "Cuts: Welding"
-- under Stock Manager -> Job Process Types.

do $$
begin
  if to_regclass('public.process_type_settings') is not null then
    alter table process_type_settings drop constraint if exists process_type_settings_cuts_made_on_check;
    alter table process_type_settings
      add constraint process_type_settings_cuts_made_on_check
      check (cuts_made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'welding'));
  end if;
end $$;


-- ============ Check ============
--
-- Both rows should say ready.

select 'job line may be tagged Welding' as thing,
       case when exists (
         select 1 from pg_constraint
         where conname = 'job_quote_items_made_on_check'
           and pg_get_constraintdef(oid) like '%welding%'
       ) then 'ready' else 'MISSING' end as status

union all

select 'stock part may be tagged Welding',
       case when exists (
         select 1 from pg_constraint
         where conname = 'stock_items_made_on_check'
           and pg_get_constraintdef(oid) like '%welding%'
       ) then 'ready' else 'MISSING' end

union all

select 'a stage may be set to Cuts: Welding',
       case when to_regclass('public.process_type_settings') is null then 'no settings table here'
            when exists (
              select 1 from pg_constraint
              where conname = 'process_type_settings_cuts_made_on_check'
                and pg_get_constraintdef(oid) like '%welding%'
            ) then 'ready' else 'MISSING' end

union all

select 'lines tagged Welding so far',
       (select count(*)::text from job_quote_items where made_on = 'welding')

order by 1;


-- ============ Afterwards, and this matters ============
--
-- A PART (a line under another line) is only listed by a stage whose
-- machine matches it. So a part tagged Welding is listed NOWHERE until
-- a stage is set to "Cuts: Welding" under Stock Manager -> Job Process
-- Types. Tag the parts and set the stage in the same sitting.
--
-- Setting the Welding stage to "Cuts: Welding" also changes what else
-- it lists. A stage with a machine set stops listing the job's own
-- lines (the ones that carry the money) and lists only the parts tagged
-- for it. If Welding is where a fabrication's parts come together and
-- become one thing again, that is the wrong way round: leave that stage
-- on "Every item" and put the tag on a separate welding stage instead.
