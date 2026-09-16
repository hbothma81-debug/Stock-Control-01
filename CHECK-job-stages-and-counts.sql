-- A job's stages, programs, and what every per-item stage has counted on each line and part. Reads only.
-- Run on LIVE. Change the job number on the next line. One table, so the editor shows it all.
with j as (select * from public.jobs where job_number = 'JOB-0068'),
st as (select p.*, coalesce(s.cuts_made_on, '') as tag, coalesce(s.releases_on_start, false) as ros,
         coalesce(s.worked_in_laser_status, false) as packs
       from public.job_processes p join j on j.id = p.job_id
       left join public.process_type_settings s on s.process_name = p.process_name),
li as (select q.*, par.description as parent_name,
         exists (select 1 from public.job_quote_items c where c.parent_quote_item_id = q.id) as has_parts
       from public.job_quote_items q join j on j.id = q.job_id
       left join public.job_quote_items par on par.id = q.parent_quote_item_id)
select '1 job' as what, j.job_number as name, concat_ws(' · ', j.status, j.customer) as detail, 0 as ord from j
union all
select '2 stage', st.process_name || case when st.shortage_id is not null then ' (re-cut)' else '' end,
       concat_ws(' · ', case when st.is_complete then 'DONE' when st.ros and st.started_at is not null then 'open, released (started)' else 'OPEN' end,
         st.tracking_mode, 'lists: ' || coalesce('Cuts: ' || nullif(st.tag, ''), 'every item'),
         case when st.ros then 'releases on start' end, case when st.packs then 'packing stage' end,
         'taken by ' || nullif(st.operator, '')), coalesce(st.sort_order, 0)
from st
union all
select '3 program', pg.program_number::text, concat_ws(' · ', pg.machine, pg.material, pg.sheets_cut || ' of ' || pg.sheets_required || ' cut',
         case when pg.is_complete then 'finished' else 'NOT FINISHED' end, case when pg.is_cancelled then 'cancelled' end,
         case when l.shortage_id is not null then 're-cut' end), 0
from public.laser_program_jobs l join j on j.id = l.job_id join public.laser_programs pg on pg.id = l.program_id
union all
select '4 line', case when li.parent_quote_item_id is not null then '   part of ' || coalesce(li.parent_name, '?') || ': ' else '' end
         || concat_ws(' ', nullif(li.stock_code, ''), li.description),
       concat_ws(' · ', 'qty ' || li.qty, 'made on ' || coalesce(nullif(li.made_on, ''), 'untagged'), case when li.has_parts then 'has parts' end,
         (select string_agg(st.process_name || ' ' || coalesce(ip.qty_complete, 0) || '/' || li.qty, ', ' order by st.sort_order)
            from st left join public.job_process_item_progress ip on ip.job_process_id = st.id and ip.job_quote_item_id = li.id
           where st.tracking_mode = 'each' and st.shortage_id is null
             and case when li.parent_quote_item_id is not null then st.tag <> '' and (li.made_on = '' or li.made_on = st.tag)
                      when li.has_parts then st.tag = ''
                      else st.tag = '' or li.made_on = '' or li.made_on = st.tag end)),
       coalesce(li.sort_order, 0)
from li
order by 1, 4, 2;
