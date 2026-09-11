-- Job lines whose description is really a stock code.
--
-- Until today there was no code field, so an imported part came in with
-- its code in the description -- "03.163.99.38.9" is a code, not a
-- description of anything. Now that the code has a column, those can be
-- put right.
--
-- This changes nothing. It only counts and shows, so the numbers can be
-- read before anything is moved.
--
-- Paste the whole file into Supabase -> SQL Editor -> Run. Four results.

-- 1. Lines with no code yet. These are the ones worth looking at.
select 'lines with no stock code' as what, count(*) as lines
from job_quote_items
where coalesce(stock_code, '') = ''
union all
select 'of those, parts under another line', count(*)
from job_quote_items
where coalesce(stock_code, '') = '' and parent_quote_item_id is not null;

-- 2. The confident ones: the description is, exactly, a part number
--    already in that customer's stock. These can be given their code AND
--    linked to the part, with no guessing at all.
select 'description matches a part number in that customer''s stock' as what,
       count(*) as lines
from job_quote_items q
join jobs j on j.id = q.job_id
join stock_items s
  on s.main_cat = 'custom'
 and lower(trim(s.customer)) = lower(trim(j.customer))
 and lower(trim(s.part_number)) = lower(trim(q.description))
where coalesce(q.stock_code, '') = ''
  and coalesce(trim(q.description), '') <> '';

-- 3. Thirty of those, to read. "would_link_to" is the part it would be
--    attached to, and "description_would_become" is that part's name.
select j.job_number,
       q.description as description_now,
       s.part_number as code_it_would_get,
       s.name as description_would_become,
       s.customer as would_link_to
from job_quote_items q
join jobs j on j.id = q.job_id
join stock_items s
  on s.main_cat = 'custom'
 and lower(trim(s.customer)) = lower(trim(j.customer))
 and lower(trim(s.part_number)) = lower(trim(q.description))
where coalesce(q.stock_code, '') = ''
  and coalesce(trim(q.description), '') <> ''
order by j.job_number desc, q.sort_order
limit 30;

-- 4. The rest: no code, and the description matches no part number this
--    customer has. Some will be real descriptions ("Ranger Single
--    Recovery Bumper") and want leaving alone; others will be codes for
--    parts nobody has entered into Customer Stock yet. Thirty to read,
--    so the difference can be seen before deciding anything.
select j.job_number,
       q.description as description_now,
       case when q.parent_quote_item_id is null then 'own line' else 'part' end as kind,
       q.qty
from job_quote_items q
join jobs j on j.id = q.job_id
where coalesce(q.stock_code, '') = ''
  and coalesce(trim(q.description), '') <> ''
  and not exists (
    select 1 from stock_items s
    where s.main_cat = 'custom'
      and lower(trim(s.customer)) = lower(trim(j.customer))
      and lower(trim(s.part_number)) = lower(trim(q.description))
  )
order by j.job_number desc, q.sort_order
limit 30;
