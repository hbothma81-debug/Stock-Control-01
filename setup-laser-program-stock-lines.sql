-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- A tube program cut off more than one stock line.
--
-- A program remembers one stock line (stock_item_id), so a nest cut off
-- three full lengths and two offcuts took all five off the full-length
-- line. This adds the list: which stock lines, how many of each, in the
-- order the nester listed them. The lengths come off the shelf in that
-- order as the cut count goes up.
--
--   [{ "stock_item_id": "...", "qty": 3, "length": 6 }, ...]
--
-- Nothing changes on any screen when this runs. It is blank on every
-- existing program and on every program with one stock line, which go
-- on using stock_item_id as before.
--
-- Select nothing before pressing Run. Safe to run more than once.

alter table laser_programs
  add column if not exists stock_lines jsonb;

-- ============ Check ============
--
-- One row. The count is 0 until a program is made with more than one
-- stock line. That is correct, not a problem.
select 'laser_programs.stock_lines' as check_name,
       count(*) filter (where stock_lines is not null) as programs_with_several_lines
from laser_programs;
