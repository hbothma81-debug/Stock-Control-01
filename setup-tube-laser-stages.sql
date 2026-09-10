-- The tube laser's two stages, set up the way the plate laser's are.
--
-- Three settings on a stage have no tick box in the app; they are set
-- here, the same as setup-hide-from-production.sql did for Nesting,
-- Laser and Packer:
--
--   hide_from_production   the stage has no box on the Production tab,
--                          because it is worked on the Tube Laser tab
--   releases_on_start      the stages after it open as soon as somebody
--                          takes the job on Tube Laser Status, so welding
--                          can start while packing carries on
--
-- The stages are found by name, by the same rule the app uses: the
-- nesting stage has "tube" and "nest" in its name; the cutting stage
-- has "tube" and "laser" but not "nest". So it does not matter whether
-- the list says "Tube Laser" or "tube laser operator".
--
-- Nothing is deleted and no stage is removed from any job. Only the
-- Production tab stops listing the two, and the Take job button starts
-- doing its work.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


-- ============ 1. The nesting stage: off Production ============

insert into process_type_settings (process_name, hide_from_production)
select value, true
from master_string_lists
where list_name = 'jobProcessTypes'
  and value ilike '%tube%'
  and value ilike '%nest%'
on conflict (process_name) do update
  set hide_from_production = true,
      updated_at = now();


-- ============ 2. The cutting stage: off Production, releases on Take ============

insert into process_type_settings (process_name, hide_from_production, releases_on_start)
select value, true, true
from master_string_lists
where list_name = 'jobProcessTypes'
  and value ilike '%tube%'
  and value ilike '%laser%'
  and value not ilike '%nest%'
on conflict (process_name) do update
  set hide_from_production = true,
      releases_on_start = true,
      updated_at = now();


-- ============ Check ============
--
-- Every tube stage in your flow, and what is set on it. The nesting
-- stage should say hidden; the cutting stage should say hidden and
-- releases. A tube stage missing from this list has a name the rule
-- cannot see: it needs "tube" in it, and "nest" or "laser".

select value as stage,
       case when s.hide_from_production then 'hidden from Production' else 'PROBLEM - still on Production' end as production,
       case when s.releases_on_start then 'releases the next stages when taken' else '' end as releasing
from master_string_lists m
left join process_type_settings s on s.process_name = m.value
where m.list_name = 'jobProcessTypes'
  and m.value ilike '%tube%'
order by m.sort_order, m.value;
