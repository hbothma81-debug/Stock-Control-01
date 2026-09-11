-- Why those codes found no part.
--
-- The last check looked for a part number belonging to the same
-- customer as the job, spelt exactly the same. Everything that came
-- back in its fourth result is plainly a code, so either those parts
-- are not in Customer Stock at all, or they are there and something
-- about the match is too strict -- the customer on the job differing
-- from the customer on the part, or the spacing differing.
--
-- This tells the two apart. It changes nothing.
--
-- Paste the whole file into Supabase -> SQL Editor -> Run. Four results.

-- A code with its spaces and punctuation taken out, so "VLM_INT-PVR
-- P-002" and "VLM_INT-PVR  P002" come out the same. Used only for
-- looking, never for writing.
-- (Written inline rather than as a function so nothing is left behind.)

-- 1. The three possibilities, counted.
with no_code as (
  select q.id, q.description, j.customer as job_customer
  from job_quote_items q
  join jobs j on j.id = q.job_id
  where coalesce(q.stock_code, '') = ''
    and coalesce(trim(q.description), '') <> ''
)
select 'no code at all' as what, count(*) as lines from no_code
union all
select 'matches a part number, same customer', count(*)
from no_code n
where exists (
  select 1 from stock_items s
  where s.main_cat = 'custom'
    and lower(trim(s.customer)) = lower(trim(n.job_customer))
    and lower(trim(s.part_number)) = lower(trim(n.description))
)
union all
select 'matches a part number, but a DIFFERENT customer', count(*)
from no_code n
where exists (
  select 1 from stock_items s
  where s.main_cat = 'custom'
    and lower(trim(s.part_number)) = lower(trim(n.description))
    and lower(trim(s.customer)) <> lower(trim(n.job_customer))
)
union all
select 'matches only once spacing is ignored', count(*)
from no_code n
where exists (
  select 1 from stock_items s
  where s.main_cat = 'custom'
    and regexp_replace(lower(s.part_number), '[^a-z0-9]', '', 'g')
      = regexp_replace(lower(n.description), '[^a-z0-9]', '', 'g')
)
union all
select 'matches nothing anywhere, even ignoring spacing', count(*)
from no_code n
where not exists (
  select 1 from stock_items s
  where s.main_cat = 'custom'
    and regexp_replace(lower(s.part_number), '[^a-z0-9]', '', 'g')
      = regexp_replace(lower(n.description), '[^a-z0-9]', '', 'g')
);

-- 2. Where the customer is the difference: the job says one thing, the
--    part says another. Twenty to read.
select j.job_number,
       j.customer as customer_on_the_job,
       s.customer as customer_on_the_part,
       q.description as the_code
from job_quote_items q
join jobs j on j.id = q.job_id
join stock_items s
  on s.main_cat = 'custom'
 and lower(trim(s.part_number)) = lower(trim(q.description))
where coalesce(q.stock_code, '') = ''
  and lower(trim(s.customer)) <> lower(trim(j.customer))
order by j.job_number desc
limit 20;

-- 3. Where the spelling is the difference: same code, written
--    differently. Twenty to read.
select j.job_number,
       q.description as on_the_job_line,
       s.part_number as in_customer_stock,
       s.customer as part_customer
from job_quote_items q
join jobs j on j.id = q.job_id
join stock_items s
  on s.main_cat = 'custom'
 and regexp_replace(lower(s.part_number), '[^a-z0-9]', '', 'g')
   = regexp_replace(lower(q.description), '[^a-z0-9]', '', 'g')
 and lower(trim(s.part_number)) <> lower(trim(q.description))
where coalesce(q.stock_code, '') = ''
order by j.job_number desc
limit 20;

-- 4. How many parts that customer has in stock at all, for the jobs in
--    question. If this is near nothing, the parts were never entered
--    and the answer is to enter them, not to match them.
select j.job_number,
       j.customer,
       count(distinct q.id) as job_lines_with_no_code,
       (select count(*) from stock_items s
        where s.main_cat = 'custom' and lower(trim(s.customer)) = lower(trim(j.customer)))
         as parts_this_customer_has_in_stock
from job_quote_items q
join jobs j on j.id = q.job_id
where coalesce(q.stock_code, '') = ''
  and coalesce(trim(q.description), '') <> ''
group by j.job_number, j.customer
order by j.job_number desc
limit 20;
