-- The 13 jobs that closed themselves on live on 7 Oct 2026, before
-- jobs.closed_at existed (setup-jobs-closed-at.sql was pasted after the
-- push), carry no closed date, so their days chip on the Jobs list keeps
-- counting. This stamps them with the day they closed.
--
-- Touches only jobs reading 'closed' with no date, and only those 13 by
-- number; does nothing once they have one. Ends by showing the result.

update jobs
set closed_at = '2026-10-07 07:05:00+02'
where status = 'closed'
  and closed_at is null
  and job_number in (
    'JOB-0059', 'JOB-0063', 'JOB-0110', 'JOB-0158', 'JOB-0189', 'JOB-0190',
    'JOB-0197', 'JOB-0198', 'JOB-0199', 'JOB-0202', 'JOB-0225', 'JOB-0228',
    'JOB-0253');

select job_number, customer, status, closed_at
from jobs
where status = 'closed'
order by job_number;
