-- Where every shortage actually is, and why it is still open.
--
-- A shortage is meant to go: flagged -> nested -> cut. But two different
-- parts of the app decide when it becomes "cut", and they do not agree:
--
--   Marking the program cut on the Cutting tab      -> sets it to cut
--   Ticking any catch-up stage in Production        -> sets it to cut ONLY
--                                                      if every catch-up
--                                                      stage is done, and
--                                                      otherwise pushes it
--                                                      back to nested
--
-- So a shortage can be resolved by the laser and then un-resolved by the
-- next person who ticks a stage on it. While it sits at "nested" the app
-- labels it "On its way -- needs cutting", which is wrong once its program
-- has already been cut.
--
-- This shows the real position of each one. It changes nothing.
--
-- Run it on the LIVE database. Select nothing before pressing Run.


with on_program as (
  select l.shortage_id,
         count(*)                                   as programs,
         count(*) filter (where p.is_complete)      as programs_cut,
         string_agg(p.program_number, ', ')         as program_numbers
  from public.laser_program_jobs l
  join public.laser_programs p on p.id = l.program_id
  where l.shortage_id is not null
    and not p.is_cancelled
  group by l.shortage_id
),
catch_up as (
  select shortage_id,
         count(*)                              as stages,
         count(*) filter (where is_complete)   as stages_done,
         string_agg(process_name, ', ') filter (where not is_complete) as still_open
  from public.job_processes
  where shortage_id is not null
  group by shortage_id
)

select s.job_number,
       s.customer,
       s.status,
       coalesce(op.program_numbers, '(not on a program)')                   as programs,
       coalesce(op.programs_cut, 0)::text || ' of ' ||
         coalesce(op.programs, 0)::text || ' cut'                           as cutting,
       coalesce(cu.stages_done, 0)::text || ' of ' ||
         coalesce(cu.stages, 0)::text || ' stages done'                     as catch_up,
       coalesce(cu.still_open, '-')                                         as waiting_on,

       -- What is actually true, said plainly.
       case
         when s.status = 'cut'
           then 'resolved'
         when coalesce(op.programs, 0) = 0
           then 'never put on a program'
         when coalesce(op.programs_cut, 0) < coalesce(op.programs, 0)
           then 'genuinely still waiting to be cut'
         when coalesce(cu.stages, 0) = 0
           then 'CUT ALREADY - nothing is holding it, it should be resolved'
         when coalesce(cu.stages_done, 0) < coalesce(cu.stages, 0)
           then 'CUT ALREADY - held open by the catch-up stages above'
         else 'CUT ALREADY - and every stage is done, it should be resolved'
       end                                                                  as what_is_really_going_on,

       s.flagged_by,
       s.created_at::date as flagged_on
from public.shortages s
left join on_program op on op.shortage_id = s.id
left join catch_up   cu on cu.shortage_id = s.id
order by (s.status = 'cut'), s.created_at desc;
