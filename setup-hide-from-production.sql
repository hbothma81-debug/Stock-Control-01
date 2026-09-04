-- Take Nesting and Laser off the Production tab.
--
-- They now live in the Laser 4kw tab, with everything their Production
-- cards used to carry. Two places showing the same work is two places to
-- tick it, and two places to forget.
--
--
-- WHY A THIRD SETTING
--
-- There is already worked_in_laser_status, but it means something
-- narrower: this is the packing stage, worked on the Laser Status screen.
-- Laser Status uses it to find the packer's stage on a job. Setting it on
-- Nesting and Laser as well would have Laser Status pick up whichever it
-- found first, and the packer's job would land on the wrong stage.
--
-- So "has no box on Production" is its own tick:
--
--   hide_from_production    no box of its own on the Production tab,
--                           because this stage is worked somewhere else
--
-- Nothing is deleted and no stage is removed from any job. The work still
-- exists, still gates what comes after it, and still shows on the job's
-- process checklist. It is only the Production tab that stops listing it.
--
-- Rename Nesting, Laser or Packer afterwards and the setting follows,
-- because it is a setting on the process type rather than a name written
-- into the code.
--
--
-- Select nothing before pressing Run. Safe to run more than once.


alter table process_type_settings
  add column if not exists hide_from_production boolean not null default false;


-- Packer was already worked elsewhere; Nesting and Laser join it.
--
-- Named exactly as they appear in Job Process Types. If your shop calls
-- them something else, change the three names below to match before you
-- run this -- Stock Manager -> Job Process Types is the list.

insert into process_type_settings (process_name, hide_from_production)
values ('Nesting', true), ('Laser', true), ('Packer', true)
on conflict (process_name) do update
  set hide_from_production = true,
      updated_at = now();


-- ============ Check ============
--
-- Three rows, all saying hidden. Anything missing here means the name in
-- this file does not match the name in your Job Process Types list.

select process_name,
       case when hide_from_production then 'hidden from Production' else 'PROBLEM - still showing' end as production,
       case when worked_in_laser_status then 'worked in Laser Status' else '' end as packing,
       case when releases_on_start then 'releases the next stage when started' else '' end as releasing
from process_type_settings
order by process_name;
