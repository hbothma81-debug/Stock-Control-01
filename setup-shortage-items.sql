-- Lets one shortage cover several missing parts.
--
-- A shortage was one description and one quantity. In practice someone
-- packing a job finds three different parts short at the same time, off
-- the same nest, to be re-cut together -- that is one shortage with three
-- lines, not three shortages.
--
-- items holds [{ "description": "...", "qty": 2 }, ...].
--
-- description and qty stay, holding the first line, so anything already
-- reading them keeps working and existing shortages need no conversion.
-- Where items is empty, those two are the shortage.
--
-- The existing board_number column now holds the SigmaNest job number --
-- the name is historical. Not renamed on purpose: the live app writes
-- board_number, and renaming it would break every running browser between
-- this migration and the new code going out.
--
-- Safe to run more than once.

alter table shortages
  add column if not exists items jsonb not null default '[]'::jsonb;

-- Check: outstanding shortages and how many lines each carries.
select job_number, description, qty, jsonb_array_length(items) as extra_lines, status
from shortages
where status <> 'cut'
order by created_at desc;
