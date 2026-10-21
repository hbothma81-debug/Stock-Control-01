-- A job's own drawings (Heinrich, 21 Oct 2026). Run on PRACTICE first.
-- Safe to run more than once. Changes no rows.
--
-- drawings.job_id / quote_item_id: a drawing kept for one job only (no
-- line's stock code in its name, or a DXF and the like, which never
-- becomes a part's revision), and the job line it is for when its name
-- matched one. Still a row in the drawings table, so nothing is lost.
--
-- job_drawings: what one job does with a drawing, without touching the
-- library ("delete should never remove anything from the library").
--   drawing_key  part:<part number>, id:<drawing id> or item:<stock id>
--   hidden       taken off this job (Put back undoes it)
--   stages       kept for choosing a drawing's stages (step 4)

alter table public.drawings
  add column if not exists job_id uuid references public.jobs(id) on delete set null;
alter table public.drawings
  add column if not exists quote_item_id uuid references public.job_quote_items(id) on delete set null;
create index if not exists drawings_job_id_idx on public.drawings (job_id) where job_id is not null;

create table if not exists public.job_drawings (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  drawing_key text not null,
  hidden      boolean not null default false,
  stages      text[],
  updated_by  text,
  updated_at  timestamptz not null default now(),
  unique (job_id, drawing_key)
);
alter table public.job_drawings enable row level security;

drop policy if exists "Signed in reads job drawings" on public.job_drawings;
create policy "Signed in reads job drawings" on public.job_drawings for select to authenticated using (true);
drop policy if exists "Signed in adds job drawings" on public.job_drawings;
create policy "Signed in adds job drawings" on public.job_drawings for insert to authenticated with check (true);
drop policy if exists "Signed in changes job drawings" on public.job_drawings;
create policy "Signed in changes job drawings" on public.job_drawings for update to authenticated using (true) with check (true);

-- ============ Check ============
select 'job drawings' as step,
       case when to_regclass('public.job_drawings') is not null
             and exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'drawings' and column_name = 'quote_item_id')
            then 'ready'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
