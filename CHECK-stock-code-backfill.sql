-- Run this FIRST, before setup-job-line-stock-code.sql.
--
-- It changes nothing. It only shows what that script would do, so the
-- numbers can be looked at before any row is touched.
--
-- Paste the whole file into Supabase -> SQL Editor -> Run. Four results
-- come back, one under the other.

-- 1. How many job lines there are, and how many point at a stock part.
--    Only the ones that point at a part can be given a code.
select 'job lines' as what,
       count(*) as total,
       count(*) filter (where coalesce(linked_item_id, '') <> '') as pointing_at_a_part
from job_quote_items;

-- 2. The codes that would be filled in. Every one of these is copied
--    straight off the part the line already points at, so there is
--    nothing to guess.
select 'codes that would be filled in' as what,
       count(*) as lines
from job_quote_items q
join stock_items s on s.id = q.linked_item_id
where coalesce(s.part_number, '') <> '';

-- 3. The descriptions that would have the code taken off the front.
--    A row only counts here if its description really does begin with
--    that exact code followed by a space, an em dash and a space --
--    "ABC123 — Bracket". Anything else is left alone, so a description
--    like "Bracket — left hand" cannot be caught by it.
select 'descriptions that would be trimmed' as what,
       count(*) as lines
from job_quote_items q
join stock_items s on s.id = q.linked_item_id
where coalesce(s.part_number, '') <> ''
  and q.description like s.part_number || ' — %';

-- 4. Twenty of them, before and after, to read with your own eyes.
select s.part_number as code_it_would_get,
       q.description as description_now,
       case
         when q.description like s.part_number || ' — %'
           then substr(q.description, length(s.part_number) + 4)
         else q.description
       end as description_after
from job_quote_items q
join stock_items s on s.id = q.linked_item_id
where coalesce(s.part_number, '') <> ''
order by q.job_id, q.sort_order
limit 20;
