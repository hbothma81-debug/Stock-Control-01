-- CNC module, file 19: the CNC tab's own Materials list (Heinrich 19 Oct 2026: "CNC has its own material types
-- library apart from the stock manager, CNC should stay a separate engine that can function without the main app",
-- answer A; "yes own price"). Until now CNC -> Materials was Stock Manager's CNC Bar Grades (master_factor_items,
-- list cncGrades). From this file on it is cnc_materials: name (what a program and its bar prices are filed under,
-- the grade's short name as the CNC tab showed it), full name, density, its own R/kg and its cutting data.
-- Copied once from today's CNC Bar Grades, with the price every screen used for them: the cheapest of the grade's
-- own price and its supplier prices (src/manager/supplierPrices.js listPrice - mirrored here, once). After this,
-- a price changed in Stock Manager no longer reaches CNC quotes; it is changed on CNC -> Materials.
-- Stock Manager's CNC Bar Grades stay for stock and are not touched. Needs file 1 (cnc_may).
-- Two pastes, in order. Safe to run twice: a material already on the list is never changed. Practice first, then live.

-- ============ PASTE 1: the table and who may read and change it ============

create table if not exists public.cnc_materials (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique check (char_length(name) between 1 and 120),
  full_name        text not null default '',
  density          numeric not null default 7.85 check (density > 0),
  price_per_kg     numeric not null default 0 check (price_per_kg >= 0),
  cutting_material text,
  updated_by       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists cnc_materials_set_updated_at on public.cnc_materials;
create trigger cnc_materials_set_updated_at before update on public.cnc_materials
  for each row execute function public.touch_updated_at();

alter table public.cnc_materials enable row level security;
drop policy if exists "CNC people can read cnc_materials" on public.cnc_materials;
create policy "CNC people can read cnc_materials" on public.cnc_materials for select using (public.cnc_may('view'));
drop policy if exists "CNC editors can add cnc_materials" on public.cnc_materials;
create policy "CNC editors can add cnc_materials" on public.cnc_materials for insert with check (public.cnc_may('edit'));
drop policy if exists "CNC editors can change cnc_materials" on public.cnc_materials;
create policy "CNC editors can change cnc_materials" on public.cnc_materials for update using (public.cnc_may('edit'));
drop policy if exists "Admins can remove cnc_materials" on public.cnc_materials;
create policy "Admins can remove cnc_materials" on public.cnc_materials for delete using (public.cnc_may('admin'));

-- ============ PASTE 2: today's CNC Bar Grades copied in ============

insert into public.cnc_materials (name, full_name, density, price_per_kg, cutting_material, updated_by)
select coalesce(nullif(trim(g.short_name), ''), g.name) as name,
       g.name as full_name,
       case when g.factor > 0 then g.factor else 7.85 end as density,
       coalesce((
         select min(p) from (
           select g.price as p where g.price > 0
           union all
           select sp.price from public.master_supplier_prices sp
            where sp.list_name = 'cncGrades' and lower(trim(sp.name)) = lower(trim(g.name))
              and trim(sp.grade) = '' and sp.price > 0
         ) prices
       ), 0) as price_per_kg,
       nullif(g.cutting_material, '') as cutting_material,
       'copied from CNC Bar Grades'
  from public.master_factor_items g
 where g.list_name = 'cncGrades'
on conflict (name) do nothing;

select name, full_name, density, price_per_kg,
       coalesce(cutting_material, '-- none: pick it on CNC -> Materials') as cutting_data
  from public.cnc_materials order by name;
