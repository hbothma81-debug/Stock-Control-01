-- Run CHECK-stock-code-backfill.sql first and read what it says. Then
-- run this once in Supabase -> SQL Editor -> New query -> Run.
--
-- The stock code on a job line, as a field of its own.
--
--
-- WHY
--
-- The code is what identifies a part. Two parts can share a
-- description, so the description cannot say which part a line is, and
-- following it picked the wrong one -- that was a real fault on a real
-- job.
--
-- Until now the code was kept on the front of the description, as
-- "ABC123 — Bracket", because there was nowhere else to put it. That
-- worked, but it meant the app had to decide where a code ended and a
-- sentence began, and a description that happens to contain a dash is
-- not a code. A rule like that goes wrong quietly, months later.
--
-- So the code gets its own field. The description goes back to being
-- only a description.
--
--
-- THIS ONE EDITS EXISTING ROWS
--
-- Nearly every other setup script only adds things. This one also
-- rewrites descriptions, so it is not the usual paste-and-forget. Run
-- it on the practice project first and look at a job you know.
--
-- It is still safe to run twice: the backfill only fills a code that is
-- empty, and only trims a description that still starts with its own
-- code.

alter table job_quote_items
  add column if not exists stock_code text not null default '';

create index if not exists job_quote_items_stock_code_idx on job_quote_items (stock_code);

-- 1. Copy the code off the part each line already points at. Nothing is
--    guessed: the line already says which part it is.
update job_quote_items q
set stock_code = s.part_number
from stock_items s
where q.linked_item_id = s.id
  and coalesce(s.part_number, '') <> ''
  and coalesce(q.stock_code, '') = '';

-- 2. Take the code back off the front of the description, now that it
--    has a field of its own. Only where the description really does
--    begin with that exact code, a space, an em dash and a space, so a
--    description that merely contains a dash is untouched.
update job_quote_items
set description = substr(description, length(stock_code) + 4)
where coalesce(stock_code, '') <> ''
  and description like stock_code || ' — %';

-- ============ Check ============
--
-- Three numbers. "lines_with_a_code" should match what the CHECK script
-- said would be filled in, and "still_carrying_the_code_in_the_text"
-- should be 0.
select 'job_quote_items.stock_code' as check_name,
       count(*) as job_lines,
       count(*) filter (where coalesce(stock_code, '') <> '') as lines_with_a_code,
       count(*) filter (where coalesce(stock_code, '') <> '' and description like stock_code || ' — %')
         as still_carrying_the_code_in_the_text
from job_quote_items;
