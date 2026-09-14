-- Why one job is stuck on packing. Reads only. Run on LIVE.
-- Change the job number on the next line. One table, so the editor shows it all.
with j as (select * from public.jobs where job_number = 'JOB-0078'),
st as (select p.*, coalesce(s.cuts_made_on, '') as tag, coalesce(s.worked_in_laser_status, false) as packs
       from public.job_processes p join j on j.id = p.job_id
       left join public.process_type_settings s on s.process_name = p.process_name),
li as (select q.*, exists (select 1 from public.job_quote_items c where c.parent_quote_item_id = q.id) as has_parts
       from public.job_quote_items q join j on j.id = q.job_id)
select '1 job' as what, j.job_number as name, concat_ws(' · ', j.status, j.customer) as detail, 0 as ord from j
union all
select '2 stage', st.process_name, concat_ws(' · ',
         case when st.is_complete then 'DONE by ' || coalesce(st.completed_by, '?') else 'open' end,
         st.tracking_mode, 'machine: ' || coalesce(nullif(st.tag, ''), 'none'),
         case when st.packs then 'PACKING STAGE' end, 'taken by ' || nullif(st.operator, ''),
         case when st.shortage_id is not null then 're-cut' end), coalesce(st.sort_order, 0)
from st
union all
select '3 line', coalesce(nullif(li.stock_code, ''), '—') || ' ' || li.description, concat_ws(' · ',
         'qty ' || li.qty, 'made on ' || coalesce(nullif(li.made_on, ''), 'untagged'),
         case when li.parent_quote_item_id is not null then 'part' when li.has_parts then 'parent' end,
         st.process_name || ' counts it: ' || case
           when li.parent_quote_item_id is not null then st.tag <> '' and (li.made_on = '' or li.made_on = st.tag)
           when li.has_parts then st.tag = ''
           when st.tag = '' then true
           else li.made_on = '' or li.made_on = st.tag end,
         'packed ' || coalesce(ip.qty_complete, 0)), li.sort_order
from li left join st on st.packs and st.shortage_id is null
left join public.job_process_item_progress ip on ip.job_process_id = st.id and ip.job_quote_item_id = li.id
union all
select '4 program', pg.program_number, concat_ws(' · ', pg.machine, pg.material,
         pg.sheets_cut || ' of ' || pg.sheets_required || ' cut', case when pg.is_complete then 'finished' end,
         case when pg.is_cancelled then 'CANCELLED' end, case when l.shortage_id is not null then 're-cut' end), 0
from public.laser_program_jobs l join j on j.id = l.job_id join public.laser_programs pg on pg.id = l.program_id
order by 1, 4, 2;
