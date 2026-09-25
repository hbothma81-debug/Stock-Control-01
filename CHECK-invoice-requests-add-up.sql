-- Which jobs' invoice requests do not add up to their lines. Reads only.
--
-- Two sums per job: what the lines say was requested (qty_invoiced x
-- unit_price over the job's own lines, parts under a line left out) and
-- what its request documents say (total_amount added up). They should be
-- equal. A line whose log rows do not add up to its qty_invoiced is listed
-- too. These are the traces a request that died part way leaves behind
-- (JOB-0088, JOB-0036, JOB-0014). A job listed here is put right by a
-- FIX-*.sql for that job, never by hand.
--
-- Early jobs invoiced before requests existed (JOB-0002, 0003, 0005) show
-- as "lines say R x, 0 request(s) say R 0": known, nothing to do.
--
-- One table; the last row says how many jobs add up. Select nothing
-- before pressing Run.

with lines as (
  select q.job_id, q.id, q.description,
         coalesce(q.qty_invoiced, 0) as requested_qty,
         coalesce(q.qty_invoiced, 0) * coalesce(q.unit_price, 0) as requested_value,
         (select coalesce(sum(l.qty_added), 0) from job_quote_item_invoices l where l.quote_item_id = q.id) as logged_qty
    from job_quote_items q
   where q.parent_quote_item_id is null
),
per_job as (
  select j.job_number, j.status,
         round(coalesce((select sum(requested_value) from lines where lines.job_id = j.id), 0), 2) as lines_say,
         round(coalesce((select sum(r.total_amount) from job_invoice_requests r where r.job_id = j.id), 0), 2) as requests_say,
         (select count(*) from job_invoice_requests r where r.job_id = j.id) as requests
    from jobs j
)
select 'job does not add up' as what, job_number as job, status as detail,
       'lines say R ' || lines_say || ', ' || requests || ' request(s) say R ' || requests_say as note
  from per_job
 where lines_say <> requests_say
union all
select 'line log disagrees', j.job_number, l.description,
       'requested ' || l.requested_qty || ', log says ' || l.logged_qty
  from lines l join jobs j on j.id = l.job_id
 where l.requested_qty <> l.logged_qty
union all
select 'adds up', count(*)::text || ' job(s) with requests', '', ''
  from per_job
 where lines_say = requests_say and requests > 0
order by 1, 2;
