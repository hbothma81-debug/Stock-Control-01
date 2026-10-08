-- CNC module, file 9: a price per bar size of a CNC grade.
-- Heinrich, 8 Oct 2026: each bar size of a grade has its own price (EN8
-- D50 is not EN8 D120), kept exactly as typed, per kg or per metre; the
-- other is worked out from the bar's weight in the app. A size is its OD
-- and ID in mm (ID 0 = solid bar; a pipe by its own OD and ID). A size
-- with no row falls back to the grade's R/kg on CNC Bar Grades, then R30.
-- grade is the CNC Bar Grades name as the app shows it (short name first).
-- Needs file 1. Two pastes: PASTE 1, then PASTE 2. Safe to run twice.

-- ============ PASTE 1: the table ============

create table if not exists public.cnc_bar_prices (
  id         uuid primary key default gen_random_uuid(),
  grade      text not null check (char_length(grade) between 1 and 120),
  od         numeric not null check (od > 0),
  id_mm      numeric not null default 0 check (id_mm >= 0),
  price      numeric not null check (price >= 0),
  unit       text not null default 'R/kg' check (unit in ('R/kg', 'R/m')),
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grade, od, id_mm)
);

drop trigger if exists cnc_bar_prices_set_updated_at on public.cnc_bar_prices;
create trigger cnc_bar_prices_set_updated_at before update on public.cnc_bar_prices
  for each row execute function public.touch_updated_at();

alter table public.cnc_bar_prices enable row level security;

-- ============ PASTE 2: who may read and change ============

drop policy if exists "CNC people can read bar prices" on public.cnc_bar_prices;
create policy "CNC people can read bar prices" on public.cnc_bar_prices for select using (public.cnc_may('view'));
drop policy if exists "CNC editors can add bar prices" on public.cnc_bar_prices;
create policy "CNC editors can add bar prices" on public.cnc_bar_prices for insert with check (public.cnc_may('edit'));
drop policy if exists "CNC editors can change bar prices" on public.cnc_bar_prices;
create policy "CNC editors can change bar prices" on public.cnc_bar_prices for update using (public.cnc_may('edit'));
drop policy if exists "CNC editors can remove bar prices" on public.cnc_bar_prices;
create policy "CNC editors can remove bar prices" on public.cnc_bar_prices for delete using (public.cnc_may('edit'));

select 'cnc bar prices' as step,
       case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cnc_bar_prices')
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cnc_bar_prices') = 4
             and exists (select 1 from pg_trigger where tgname = 'cnc_bar_prices_set_updated_at')
            then 'ready - each bar size can have its own price'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
