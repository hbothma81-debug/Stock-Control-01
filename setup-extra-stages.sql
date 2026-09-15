-- Extra stages per job line: the steps after its first cut, in its own order.
-- A job line and a stock part get extra_stages, a list of stage names such as
-- {"Machining - External","Bending"}: machined first, then bent. Left empty
-- (null) it was never set and the line goes to every such stage; an empty
-- list {} means nothing extra. A stage gets only_marked: switched on, it lists
-- only the lines that name it. Nothing changes on the floor until a stage is
-- switched on. RUN ON BOTH DATABASES BEFORE THE APP THAT USES IT IS PUSHED:
-- the stock screen saves extra_stages on every stock save. Safe to run twice.

alter table job_quote_items add column if not exists extra_stages text[];
alter table stock_items add column if not exists extra_stages text[];

do $do$
begin
  if to_regclass('public.process_type_settings') is not null then
    alter table process_type_settings add column if not exists only_marked boolean not null default false;
  end if;
end $do$;

-- Check: three rows, each should say ready.
select c.thing, case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = c.tbl and column_name = c.col) then 'ready' else 'MISSING' end as status
from (values ('1 a job line keeps its extra stages', 'job_quote_items', 'extra_stages'),
             ('2 a stock part remembers them', 'stock_items', 'extra_stages'),
             ('3 a stage can list only marked lines', 'process_type_settings', 'only_marked')) as c(thing, tbl, col)
order by 1;
