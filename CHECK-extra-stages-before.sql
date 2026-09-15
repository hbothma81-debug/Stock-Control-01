-- Extra stages per line (Bending, Drilling, Cut to size): what live holds today. Reads only.
-- Run on LIVE. One table, so the editor shows it all. Open job = not complete, invoiced or cancelled.
with oj as (select id, job_number from public.jobs where coalesce(status, '') not in ('complete', 'invoiced', 'cancelled')),
li as (select q.*, case when q.parent_quote_item_id is not null then 'part'
         when exists (select 1 from public.job_quote_items c where c.parent_quote_item_id = q.id) then 'parent'
         else 'plain line' end as kind
       from public.job_quote_items q join oj on oj.id = q.job_id),
st as (select p.process_name, count(*) filter (where not p.is_complete) as open_n,
         count(*) filter (where not p.is_complete and p.tracking_mode = 'each') as each_n
       from public.job_processes p join oj on oj.id = p.job_id
       where p.shortage_id is null group by p.process_name)
select '1 made-on, open jobs' as what, coalesce(nullif(made_on, ''), 'untagged') as name,
       kind || ': ' || count(*) as detail, 0 as ord
from li group by made_on, kind
union all
select '2 made-on kept on stock', made_on, count(*) || ' stock items', 0
from public.stock_items where coalesce(made_on, '') <> '' group by made_on
union all
select '3 stage', coalesce(st.process_name, s.process_name), concat_ws(' · ',
         'lists: ' || coalesce('Cuts: ' || nullif(s.cuts_made_on, ''), 'every item'),
         coalesce(st.open_n, 0) || ' open on jobs', coalesce(st.each_n, 0) || ' of them per item'), 0
from st full join public.process_type_settings s on s.process_name = st.process_name
union all
select '4 tagged Welding, any job', j.job_number || ' ' || concat_ws(' ', nullif(q.stock_code, ''), q.description),
       case when q.parent_quote_item_id is not null then 'part' else 'line' end || ' · qty ' || q.qty, q.sort_order
from public.job_quote_items q join public.jobs j on j.id = q.job_id where q.made_on = 'welding'
union all
select '5 Cut to size tab, open jobs', oj.job_number, count(*) || ' cut lines', 0
from public.job_cut_items c join oj on oj.id = c.job_id group by oj.job_number
order by 1, 4, 2;
