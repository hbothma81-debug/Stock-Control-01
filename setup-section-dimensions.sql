-- Sections step 4: a section's numbers, kept apart from its name.
--
-- Stock Manager -> Sections now builds a section from fixed boxes per
-- type (SHS: size and wall) and writes the name from them. The numbers
-- are kept here too, so kg/m can be worked out later (step 6) without
-- reading them back out of the name.
--
-- One column, empty for every existing row until step 5 converts them.
-- Other lists in this table (materials, sizes) never use it.
-- Safe to run twice. Practice first, then live, BEFORE the app code that
-- writes it is pushed: a save naming a column that is not there fails.

alter table public.master_factor_items
  add column if not exists dimensions jsonb;
