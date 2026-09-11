-- CHECK: how fasteners have been entered so far.
--
-- Read-only. It only looks: nothing is changed, added or deleted.
-- Paste it into the SQL editor on LIVE, select nothing, press Run.
-- Safe to run as often as you like, on practice or live.
--
-- One table comes back. The first column says which check a row belongs
-- to, the second names what it found, the third says how many stock
-- lines. A check with no rows found nothing. The "In use" rows always
-- show, so you can see every type, grade, finish and size typed so far.

with
lists as (
  select list_name, trim(value) as value
  from public.master_string_lists
  where list_name in ('fastenerCategories', 'fastenerGrades', 'fastenerFinishes')
),
f as (
  select trim(name) as name,
         trim(part_number) as part_number,
         coalesce(trim(fastener_type), '') as ftype,
         coalesce(trim(diameter), '') as dia,
         coalesce(length, 0) as len,
         coalesce(trim(fastener_grade), '') as fgrade,
         coalesce(trim(finish), '') as finish,
         coalesce(trim(grade), '') as material,
         regexp_replace(lower(coalesce(fastener_type, '')), '[^a-z0-9]|s$', '', 'g') as type_key
  from public.stock_items
  where main_cat = 'fasteners'
),
found as (
  select 1 as n, '1. Same fastener entered more than once' as check_name,
         min(name) || '  /  ' || coalesce(nullif(min(fgrade), ''), 'no grade') || '  /  ' ||
           coalesce(nullif(min(finish), ''), 'no finish') || '  /  ' || coalesce(nullif(min(material), ''), 'no material') ||
           '  :  ' || string_agg(nullif(part_number, ''), ', ') as what,
         count(*) as how_many
  from f
  group by type_key, dia, len, lower(fgrade), lower(finish), lower(material)
  having count(*) > 1

  union all
  select 2, '2. One type, spelled more than one way', string_agg(distinct ftype, '  |  '), count(*)
  from f group by type_key having count(distinct ftype) > 1

  union all
  select 3, '3. Type not on the Fastener Types list', coalesce(nullif(ftype, ''), '(blank)'), count(*)
  from f
  where not exists (select 1 from lists l where l.list_name = 'fastenerCategories' and lower(l.value) = lower(f.ftype))
  group by ftype

  union all
  select 4, '4. Grade not on the Fastener Grades list', fgrade, count(*)
  from f
  where fgrade <> ''
    and not exists (select 1 from lists l where l.list_name = 'fastenerGrades' and lower(l.value) = lower(f.fgrade))
  group by fgrade

  union all
  select 5, '5. Finish not on the Fastener Finishes list', finish, count(*)
  from f
  where finish <> ''
    and not exists (select 1 from lists l where l.list_name = 'fastenerFinishes' and lower(l.value) = lower(f.finish))
  group by finish

  union all
  select 6, '6. Missing a detail', 'no grade', count(*) from f where fgrade = '' having count(*) > 0
  union all
  select 6, '6. Missing a detail', 'no finish', count(*) from f where finish = '' having count(*) > 0
  union all
  select 6, '6. Missing a detail', 'no material', count(*) from f where material = '' having count(*) > 0
  union all
  select 6, '6. Missing a detail', 'no length (fine for nuts and washers)', count(*) from f where len = 0 having count(*) > 0

  union all
  select 7, '7. Diameter that is not a whole metric size', dia, count(*)
  from f
  where dia !~ '^(3|4|5|6|8|10|12|14|16|18|20|22|24|27|30|33|36|39|42|45|48)$'
  group by dia

  union all
  select 8, '8. Filed under Stores as "Fasteners" instead', trim(name), 1
  from public.stock_items
  where main_cat = 'stores' and trim(customer) = 'Fasteners'

  union all
  select 20, 'In use: types', coalesce(nullif(ftype, ''), '(blank)'), count(*) from f group by ftype
  union all
  select 21, 'In use: grades', coalesce(nullif(fgrade, ''), '(blank)'), count(*) from f group by fgrade
  union all
  select 22, 'In use: finishes', coalesce(nullif(finish, ''), '(blank)'), count(*) from f group by finish
  union all
  select 23, 'In use: materials', coalesce(nullif(material, ''), '(blank)'), count(*) from f group by material
  union all
  select 24, 'In use: diameters', coalesce(nullif(dia, ''), '(blank)'), count(*) from f group by dia

  union all select 99, 'Totals', 'fastener stock lines', count(*) from f
  union all select 99, 'Totals', 'types on the list', count(*) from lists where list_name = 'fastenerCategories'
  union all select 99, 'Totals', 'grades on the list', count(*) from lists where list_name = 'fastenerGrades'
  union all select 99, 'Totals', 'finishes on the list', count(*) from lists where list_name = 'fastenerFinishes'
)
select check_name, what, how_many
from found
order by n, what;
