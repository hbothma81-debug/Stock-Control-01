-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- Which stock line a laser program cuts from.
--
-- Picking the section on a tube program already sets those lengths aside
-- for the job (job_allocations). What was missing is the program
-- remembering which shelf line it was: the program only kept the section
-- as text ("50x50x3 MS"), and that same text can belong to a 6m line and
-- a 13m line, so it cannot tell them apart.
--
-- With this, raising the cut count on a program takes that many lengths
-- off the shelf and off the job's reservation, and undoing a cut puts
-- them back. One on the count is one length.
--
-- Nothing changes on any screen when this runs. It is blank on every
-- existing program, which reads as "no stock was set aside for this
-- one" -- true of every program made before now. Those keep working:
-- cutting them warns that nothing came off the shelf and carries on.
--
-- stock_items.id is text, not uuid, and there is no foreign key on
-- purpose: a stock line can be retired or split (a cut length becomes
-- its own shorter row) and a finished program should not vanish or
-- block because of it. The same reason job_allocations keeps item_id
-- loose.
--
-- Select nothing before pressing Run. Safe to run more than once.

alter table laser_programs
  add column if not exists stock_item_id text;

create index if not exists laser_programs_stock_item_idx on laser_programs (stock_item_id);

-- ============ Check ============
--
-- One row. The count is how many programs are tied to a stock line,
-- which is 0 until the next tube program is made. That is correct, not
-- a problem.
select 'laser_programs.stock_item_id' as check_name,
       count(*) filter (where stock_item_id is not null) as programs_linked_to_stock
from laser_programs;
