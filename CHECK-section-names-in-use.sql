-- CHECK: every section, and every place its name is copied to.
--
-- Read-only. Nothing is changed. Paste on LIVE, select nothing, Run.
-- For sections step 5 (converting every name to the new shorthand): this
-- is the list the conversion is written from, so nothing is missed.
--
-- One table. A "section" row is one entry in Stock Manager -> Sections,
-- with how many rows elsewhere carry its name. A "not a section" row is a
-- name found elsewhere that matches no section at all.
-- Laser programs and tube job lines hold the section followed by the
-- material ("SHS 50x50x3mm SS304"), so they count when they start with it.

with
sec as (
  select name, coalesce(type, '') as type, coalesce(grade, '') as grade, factor, price, dimensions is not null as from_boxes
  from public.master_factor_items where list_name = 'sections'
),
uses as (
  select 'stock' as place, name as v from public.stock_items where main_cat = 'structural'
  union all select 'requisitions', item_raw_name from public.requisitions where main_cat = 'structural'
  union all select 'cut lists', section from public.job_cut_items
  union all select 'quote parts', section from public.quote_parts
  union all select 'bom parts', section from public.bom_parts
  union all select 'tube aliases', section_name from public.tube_section_aliases
  union all select 'reservations', item_name from public.job_allocations where main_cat = 'structural'
),
starts as (
  select 'laser programs' as place, material as v from public.laser_programs
  union all select 'tube job lines', material_type from public.job_quote_items
),
names as (select distinct lower(trim(name)) as k, trim(name) as name from sec)
select 'section' as kind, s.type, s.name, s.grade,
  s.factor as kg_m, s.price as r_m, s.from_boxes,
  (select string_agg(place || ' ' || n, ', ' order by place) from (
     select place, count(*) n from uses u where lower(trim(u.v)) = lower(trim(s.name)) group by place
     union all
     select place, count(*) from starts t where lower(trim(t.v)) like lower(trim(s.name)) || ' %' group by place
   ) c) as used_in
from sec s
union all
select 'not a section', '', v, '', null, null, null, place || ' ' || count(*)
from (select place, trim(v) as v from uses where trim(coalesce(v, '')) <> '') u
where not exists (select 1 from names n where n.k = lower(u.v))
group by place, v
order by kind desc, type, name, grade;
