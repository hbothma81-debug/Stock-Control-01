-- Sections step 3, part two: Galvanised, and CNC bar requests put back.
--
-- Heinrich, 16 Sep 2026: the material is spelled "Galvanised" and its
-- short name is "Galv". Live's Material Types row said "Galvanized" with
-- no short name, so setup-material-spellings.sql, which looked for
-- "galvanised", changed nothing for it, while 7 laser programs end in
-- "Galvanised". PART 1 renames the list row and gives it the short name.
-- PART 2 writes "Galv" wherever the material is stored, either spelling.
-- PART 3 undoes one thing that file did wrong: it rewrote requisitions
-- without leaving CNC bar lines alone, so a CNC bar request for
-- "Stainless 304" became "SS304", which the CNC Bar Grades list has no
-- row for, and it priced at R0. CNC bar requests get the full name back.
--
-- Data only: no table, column or rule changes. Safe to run twice.
-- Paste PART 1, run, then PART 2, run, then PART 3, run.
-- Practice first, then live.

-- ============ PART 1: the Material Types row ============
update public.master_factor_items set name = 'Galvanised'
where list_name = 'grades' and lower(trim(name)) = 'galvanized'
  and not exists (select 1 from public.master_factor_items g
                  where g.list_name = 'grades' and lower(trim(g.name)) = 'galvanised');
update public.master_factor_items set short_name = 'Galv'
where list_name = 'grades' and lower(trim(name)) = 'galvanised' and coalesce(trim(short_name), '') = '';

-- ============ PART 2: everywhere the material is stored ============
update public.stock_items set grade = 'Galv'
where main_cat not in ('cncBar', 'fasteners') and grade <> 'Galv'
  and lower(trim(grade)) in ('galvanized', 'galvanised', 'galv');
update public.master_factor_items set grade = 'Galv'
where list_name = 'sections' and grade <> 'Galv'
  and lower(trim(grade)) in ('galvanized', 'galvanised', 'galv');
update public.requisitions set item_grade = 'Galv'
where main_cat not in ('cncBar', 'fasteners') and item_grade <> 'Galv'
  and lower(trim(item_grade)) in ('galvanized', 'galvanised', 'galv');
update public.job_cut_items set grade = 'Galv'
where grade <> 'Galv' and lower(trim(grade)) in ('galvanized', 'galvanised', 'galv');
-- Text that ends with the material, e.g. "2mm Galvanised": the last ten
-- letters become Galv. Programs, tube job lines and the tube import's memory.
update public.laser_programs set material = left(trim(material), length(trim(material)) - 10) || 'Galv'
where lower(trim(material)) like '% galvanised' or lower(trim(material)) like '% galvanized';
update public.job_quote_items set material_type = left(trim(material_type), length(trim(material_type)) - 10) || 'Galv'
where lower(trim(material_type)) like '% galvanised' or lower(trim(material_type)) like '% galvanized';
update public.tube_section_aliases set section_name = left(trim(section_name), length(trim(section_name)) - 10) || 'Galv'
where lower(trim(section_name)) like '% galvanised' or lower(trim(section_name)) like '% galvanized';

-- ============ PART 3: CNC bar requests get their full name back ============
update public.requisitions r set item_grade = g.name
from public.master_factor_items g
where r.main_cat = 'cncBar' and g.list_name = 'grades'
  and coalesce(trim(g.short_name), '') <> '' and r.item_grade = g.short_name
  and exists (select 1 from public.master_factor_items c where c.list_name = 'cncGrades' and c.name = g.name);

-- Check: four rows, each should say ready.
select c.thing, case when c.ok then 'ready' else 'MISSING' end as status
from (values
  ('1 Material Types says Galvanised, short name Galv',
    exists (select 1 from public.master_factor_items where list_name = 'grades' and name = 'Galvanised' and short_name = 'Galv')
    and not exists (select 1 from public.master_factor_items where list_name = 'grades' and lower(trim(name)) = 'galvanized')),
  ('2 no plate line, section or request still says it in full',
    not exists (select 1 from public.stock_items where main_cat not in ('cncBar', 'fasteners') and lower(trim(grade)) in ('galvanized', 'galvanised'))
    and not exists (select 1 from public.master_factor_items where list_name = 'sections' and lower(trim(grade)) in ('galvanized', 'galvanised'))
    and not exists (select 1 from public.requisitions where main_cat not in ('cncBar', 'fasteners') and lower(trim(item_grade)) in ('galvanized', 'galvanised'))),
  ('3 no laser program ends in Galvanised',
    not exists (select 1 from public.laser_programs where lower(trim(material)) like '% galvanised' or lower(trim(material)) like '% galvanized')),
  ('4 no CNC bar request carries a short name',
    not exists (select 1 from public.requisitions r join public.master_factor_items g
                  on g.list_name = 'grades' and coalesce(trim(g.short_name), '') <> '' and r.item_grade = g.short_name
                where r.main_cat = 'cncBar'))
) as c(thing, ok)
order by 1;
