-- Puts the two tube stages back on the Production tab.
--
-- setup-tube-laser-stages.sql hid them, because on the new Tube Laser
-- tab they are worked elsewhere. But jobs that were already in flight
-- on those stages, tracked by quantity on their Production cards, lost
-- the only place that progress was shown and ticked. This shows the
-- cards again. Take job on Tube Laser Status keeps working: only the
-- hide setting changes.
--
-- Run setup-tube-laser-stages.sql again later to hide them once those
-- jobs are through, or once the Packing screen carries them.
--
-- Select nothing before pressing Run. Safe to run more than once.

update process_type_settings
   set hide_from_production = false,
       updated_at = now()
 where process_name ilike '%tube%'
   and (process_name ilike '%nest%' or process_name ilike '%laser%');

select process_name,
       case when hide_from_production then 'hidden from Production' else 'showing on Production' end as production,
       case when releases_on_start then 'releases the next stages when taken' else '' end as releasing
  from process_type_settings
 where process_name ilike '%tube%'
 order by process_name;
