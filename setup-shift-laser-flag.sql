-- Which shifts the laser cuts on.
--
-- The laser operator works different hours from the rest of the factory,
-- so the shop has factory shifts and laser shifts side by side in Time
-- Manager. The laser screens -- the counter on Cutting and the Shifts
-- report -- were reading every shift, and a program cut while two shifts
-- overlapped was counted under both.
--
-- One tick per shift: the laser cuts on this one. The laser screens read
-- only ticked shifts. With nothing ticked they carry on reading every
-- shift, as before, and say so, so nothing goes blank the day this runs.
--
-- The lockout does not read this. A person is held to their own shift's
-- hours whether the laser cuts on it or not.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.


alter table public.shifts
  add column if not exists cuts_laser boolean not null default false;


-- What you should see: every shift, with the tick off until somebody
-- sets it under Stock Manager → Time Manager.
select name, cuts_laser
from public.shifts
order by name;
