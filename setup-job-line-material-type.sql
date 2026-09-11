-- Run this once in Supabase -> SQL Editor -> New query, then Run.
--
-- The material a tube job line is cut from, in words.
--
-- On a line made on the tube laser, the sales person sets the section
-- and grade the part is cut from, e.g. "SHS 50x50x3mm 304". When a tube
-- nesting report is imported, each section in it is matched to the job
-- lines of that same material, so the import knows which lines a
-- section's program is for without being asked.
--
-- Words, not a stock line's id, on purpose. A part is cut from a
-- section and grade; which length the nester takes it from is decided on
-- the day. An id names one shelf row of one length, so it would miss
-- whenever the nester picks another length of the same material.
--
-- THIS MIRRORS THE APP. The words are made by one function in the app,
-- materialText in src/laser/stockOptions.js, which already writes
-- laser_programs.material and tube_section_aliases.section_name. The
-- database does not check them. Change that function and all three move
-- together; change the wording anywhere else and the match stops.
--
-- Blank on every existing line, which reads correctly as "not said".
-- Nothing on any screen changes when this runs.
--
-- Safe to run more than once. It only adds a column; no row is changed.

alter table job_quote_items
  add column if not exists material_type text not null default '';

create index if not exists job_quote_items_material_type_idx on job_quote_items (material_type);

-- ============ Check ============
--
-- One row. "lines_with_a_material" is 0 until somebody sets one on a
-- tube line. That is correct, not a problem.
select 'job_quote_items.material_type' as check_name,
       count(*) as job_lines,
       count(*) filter (where coalesce(material_type, '') <> '') as lines_with_a_material
from job_quote_items;
