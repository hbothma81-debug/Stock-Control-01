-- Adds the missing short_name column to master_factor_items. grades is the
-- only one of the three factor lists (sections, grades, cncGrades) that
-- ever had a short name field in the app — it was simply never added to
-- this table when it was first created, so every short name entered was
-- silently discarded on save: it only ever existed in memory, gone the
-- moment anything refreshed from the database.
-- Safe to run again if already applied.

alter table master_factor_items add column if not exists short_name text;
