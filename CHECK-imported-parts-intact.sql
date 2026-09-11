-- Are the imported parts still whole?
--
-- Run after setup-job-line-stock-code.sql, on whichever project you ran
-- that on. It changes nothing; it only counts and shows.
--
-- What it is looking for: that script rewrote descriptions, so the
-- question is whether anything that came in from a spreadsheet lost
-- text, or lost the line it hangs under. Imported parts are the child
-- lines -- the ones with a parent above them.
--
-- Paste the whole file into Supabase -> SQL Editor -> Run. Five results
-- come back, one under the other.

-- 1. The shape of the table. "parts" are imported or hand-added child
--    lines; "own lines" are the ones that get invoiced.
select 'all job lines' as what, count(*) as lines from job_quote_items
union all
select 'parts (under another line)', count(*) from job_quote_items where parent_quote_item_id is not null
union all
select 'own lines', count(*) from job_quote_items where parent_quote_item_id is null;

-- 2. THE ONE THAT MATTERS. Any line whose description is now empty has
--    lost its text. This must be 0. If it is not, say so before doing
--    anything else -- it is recoverable from a backup, and only from
--    a backup.
select 'lines with no description at all' as what,
       count(*) as must_be_zero
from job_quote_items
where coalesce(trim(description), '') = '';

-- 3. Parts whose parent has gone. Also must be 0: a part with no line
--    above it shows nowhere on the job.
select 'parts whose parent line is missing' as what,
       count(*) as must_be_zero
from job_quote_items c
where c.parent_quote_item_id is not null
  and not exists (select 1 from job_quote_items p where p.id = c.parent_quote_item_id);

-- 4. Parts with nothing to cut: no quantity, or a length of zero where a
--    length was expected. Not necessarily wrong -- some parts carry no
--    length -- but a sudden pile of them would mean the import broke.
select 'parts with no quantity' as what, count(*) as lines
from job_quote_items where parent_quote_item_id is not null and coalesce(qty, 0) = 0
union all
select 'parts with a length', count(*)
from job_quote_items where parent_quote_item_id is not null and coalesce(length_mm, 0) > 0;

-- 5. Thirty parts as they stand, newest jobs first, to read with your
--    own eyes. Description, quantity and length should all look like
--    what the spreadsheet said.
select j.job_number,
       p.description as parent_line,
       c.stock_code as part_code,
       c.description as part_description,
       c.qty,
       c.length_mm
from job_quote_items c
join job_quote_items p on p.id = c.parent_quote_item_id
join jobs j on j.id = c.job_id
where c.parent_quote_item_id is not null
order by j.job_number desc, c.sort_order
limit 30;
