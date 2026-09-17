-- Which stages the packer rules (src/jobs/packingFlow.js, rule 1) open on live the moment they are pushed. Reads only.
-- Run on LIVE. One table. A row per job and stage: a per-item stage after the job's taken packer, its Nesting ticked, its Laser still open.
-- 17 Sep 2026: rule 1 also opens once cutting has started (the Laser stage carries started_at), without Take job. This check still
-- lists only jobs whose packer is taken or done; a job opened by cutting alone is not listed here.
with lst as (select value as name, sort_order from public.master_string_lists where list_name = 'jobProcessTypes'),
sp as (select p.*, j.job_number, j.customer, lst.sort_order as rank,
         coalesce(s.worked_in_laser_status, false) as packs, coalesce(s.cuts_made_on, '') as tag
       from public.job_processes p join public.jobs j on j.id = p.job_id
       left join lst on lst.name = p.process_name
       left join public.process_type_settings s on s.process_name = p.process_name
       where j.status = 'in_progress' and p.shortage_id is null),
pk as (select distinct on (job_id) * from sp where packs and (started_at is not null or is_complete) order by job_id, rank),
nest as (select job_id, bool_and(is_complete) as done from sp
         where process_name ~* 'nest' and process_name !~* 'tube' group by job_id),
las as (select job_id, min(rank) filter (where not is_complete) as open_rank from sp
        where process_name ~* 'laser' and process_name !~* 'tube' and process_name !~* 'external' group by job_id),
uncut as (select l.job_id, count(*) as n from public.laser_program_jobs l join public.laser_programs g on g.id = l.program_id
          where l.shortage_id is null and not g.is_cancelled and not g.is_complete group by l.job_id)
select 'opens' as what, sp.job_number || ' · ' || sp.process_name as name,
       concat_ws(' · ', sp.customer, 'packer ' || coalesce(nullif(pk.operator, ''), 'taken'),
         coalesce(u.n, 0) || ' own program(s) still to cut',
         'also waits on: ' || nullif((select string_agg(o.process_name, ', ' order by o.rank) from sp o
           where o.job_id = sp.job_id and not o.is_complete and o.rank < sp.rank and o.id <> pk.id
             and not (o.process_name ~* 'laser' and o.process_name !~* 'tube' and o.process_name !~* 'external')
             and not (o.process_name ~* 'nest' and o.process_name !~* 'tube')), '')) as detail,
       sp.rank as ord
from sp join pk on pk.job_id = sp.job_id
join nest on nest.job_id = sp.job_id and nest.done
join las on las.job_id = sp.job_id and las.open_rank is not null
left join uncut u on u.job_id = sp.job_id
where sp.tracking_mode = 'each' and not sp.is_complete and sp.rank > pk.rank and las.open_rank < pk.rank
  and lower(trim(sp.process_name)) <> 'invoicing'
order by 2;
