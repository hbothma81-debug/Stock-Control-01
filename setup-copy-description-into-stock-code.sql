-- Copy a job line's description into its stock code, where the
-- description IS the code.
--
-- On jobs whose lines came in from a drawing list, the description is a
-- code: "VLM_INT-PVR P-002" describes nothing, it names a part. Until
-- today there was no code field, so that is where it had to go. This
-- copies it across. The description is left exactly as it is, so
-- nothing is lost and the line reads the same on paper -- it simply
-- gains a code as well.
--
--
-- IT ONLY TOUCHES THE JOBS YOU NAME
--
-- Not every description is a code. "Ranger Single Recovery Bumper" is a
-- real description and must not become a code, and no rule can tell the
-- two apart reliably -- "PLATE - 80x70x30" is a description and "PP3
-- 0000 040 0C" is a code, and they look alike to a computer.
--
-- So this asks you which jobs. Run the first query, read the sample of
-- each job, then put the job numbers into the list further down.
--
-- Run it twice and nothing happens the second time: it only fills a
-- code that is empty.

-- ============ 1. Which jobs, and what their lines look like ============
--
-- Every job that still has lines with no code, with three of its
-- descriptions so you can see at a glance whether that job's lines are
-- codes or prose.
select j.job_number,
       j.customer,
       count(*) as lines_with_no_code,
       string_agg(q.description, '  |  ' order by q.sort_order) filter (where q.rn <= 3) as first_three
from (
  select q.*, row_number() over (partition by q.job_id order by q.sort_order) as rn
  from job_quote_items q
  where coalesce(q.stock_code, '') = ''
    and coalesce(trim(q.description), '') <> ''
) q
join jobs j on j.id = q.job_id
group by j.job_number, j.customer
order by j.job_number desc;

-- ============ 2. The copy ============
--
-- Put the job numbers in the list below, in quotes, separated by
-- commas. Nothing outside this list is touched. Leaving it as it is
-- changes nothing at all, which is deliberate: running this file by
-- accident does nothing.

update job_quote_items q
set stock_code = trim(q.description)
from jobs j
where j.id = q.job_id
  and coalesce(q.stock_code, '') = ''
  and coalesce(trim(q.description), '') <> ''
  and j.job_number in (
    -- ↓↓↓ PUT THE JOB NUMBERS HERE ↓↓↓
    --   e.g.   'JOB-0089', 'JOB-0090'
    ''
    -- ↑↑↑ PUT THE JOB NUMBERS HERE ↑↑↑
  );

-- ============ 3. Check ============
--
-- What those jobs look like now. Every line should show the same text
-- twice, once as the code and once as the description, which is right:
-- the code is the code, and the description was only ever holding it.
select j.job_number,
       q.stock_code,
       q.description,
       q.qty
from job_quote_items q
join jobs j on j.id = q.job_id
where j.job_number in (
    -- ↓↓↓ THE SAME JOB NUMBERS AGAIN ↓↓↓
    ''
    -- ↑↑↑ THE SAME JOB NUMBERS AGAIN ↑↑↑
  )
order by j.job_number desc, q.sort_order
limit 40;
