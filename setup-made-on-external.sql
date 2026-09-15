-- Two more cut methods: Laser - external, Machining - external.
-- Adds laser_external and machining_external to the fixed list a job line, a
-- stock part and a stage's "Cuts:" setting are checked against. Welding and
-- assembly stay allowed. Nothing changes on screen until the app offering them
-- is pushed. RUN BEFORE THAT PUSH: practice first, then live. Safe to run twice.
-- setup-made-on-tag.sql and setup-made-on-welding.sql write shorter lists; if
-- either is ever run again, run this one after it.

alter table job_quote_items drop constraint if exists job_quote_items_made_on_check;
alter table job_quote_items add constraint job_quote_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly', 'welding', 'laser_external', 'machining_external'));

alter table stock_items drop constraint if exists stock_items_made_on_check;
alter table stock_items add constraint stock_items_made_on_check
  check (made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'assembly', 'welding', 'laser_external', 'machining_external'));

do $do$
begin
  if to_regclass('public.process_type_settings') is not null then
    alter table process_type_settings drop constraint if exists process_type_settings_cuts_made_on_check;
    alter table process_type_settings add constraint process_type_settings_cuts_made_on_check
      check (cuts_made_on in ('', 'laser', 'tube_laser', 'cnc', 'cut_to_size', 'welding', 'laser_external', 'machining_external'));
  end if;
end $do$;

-- Check: three rows, each should say ready.
select c.thing, case when exists (select 1 from pg_constraint where conname = c.rule
         and pg_get_constraintdef(oid) like '%machining_external%') then 'ready' else 'MISSING' end as status
from (values ('1 a job line may be tagged external', 'job_quote_items_made_on_check'),
             ('2 a stock part may be tagged external', 'stock_items_made_on_check'),
             ('3 a stage may say Cuts: external', 'process_type_settings_cuts_made_on_check')) as c(thing, rule)
order by 1;
