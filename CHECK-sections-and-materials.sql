-- CHECK: where sections and materials have crept in more than once.
--
-- Read-only. It only looks: nothing is changed, added or deleted.
-- Paste it into the SQL editor on LIVE, select nothing, press Run.
-- Safe to run as often as you like, on practice or live.
--
-- One table comes back. The first column says which check a row belongs
-- to, the second names what it found, the third says how many. A check
-- with no rows found nothing wrong. The Totals rows are always there.
--
-- "Same size" means the same numbers once spaces, "mm", "wall" and
-- letters are ignored, within the same kind of section. So
-- "SHS 50x50x3mm" and "SHS 50 x 50 x 3.0" count as the same size, but
-- "SHS 50x50x3" and "Equal Angle 50x50x3" do not.

with
sec as (
  select trim(name) as name,
         coalesce(trim(grade), '') as grade,
         coalesce(trim(type), '') as type,
         regexp_replace(
           regexp_replace(
             regexp_replace(lower(replace(replace(name, '×', 'x'), '*', 'x')), '[^0-9.x]', '', 'g'),
             '(\.[0-9]*[1-9])0+(x|$)', '\1\2', 'g'),
           '\.0+(x|$)', '\1', 'g') as size_key
  from public.master_factor_items
  where list_name = 'sections'
),
mat as (
  select trim(name) as name,
         coalesce(trim(short_name), '') as short_name,
         regexp_replace(lower(name), '[^a-z0-9]', '', 'g') as mat_key
  from public.master_factor_items
  where list_name = 'grades'
),
kinds as (
  select trim(value) as value
  from public.master_string_lists
  where list_name = 'sectionTypes'
),
stk as (
  select trim(name) as name, coalesce(trim(grade), '') as grade
  from public.stock_items
  where main_cat = 'structural'
),
found as (
  select 1 as n, '1. Same section and material entered more than once' as check_name,
         min(type) || ': ' || string_agg(name || ' / ' || coalesce(nullif(grade, ''), 'no material'), '  |  ') as what,
         count(*) as how_many
  from sec group by lower(type), size_key, lower(grade) having count(*) > 1

  union all
  select 2, '2. One size, spelled more than one way',
         min(type) || ': ' || string_agg(distinct name, '  |  '),
         count(distinct lower(name))
  from sec group by lower(type), size_key having count(distinct lower(name)) > 1

  union all
  select 3, '3. Section with no material set',
         coalesce(nullif(type, ''), 'no kind') || ': ' || name, 1
  from sec where grade = ''

  union all
  select 4, '4. Section with no kind (Square Tube, Round Bar ...)',
         name || ' / ' || coalesce(nullif(grade, ''), 'no material'), 1
  from sec where type = ''

  union all
  select 5, '5. Section kind that is not on the Section Types list', type, count(*)
  from sec
  where type <> '' and not exists (select 1 from kinds k where lower(k.value) = lower(sec.type))
  group by type

  union all
  select 6, '6. Section material that is not on the Material Types list', grade, count(*)
  from sec
  where grade <> '' and not exists (select 1 from mat m where lower(m.name) = lower(sec.grade))
  group by grade

  union all
  select 7, '7. Materials that look like the same thing', string_agg(name, '  |  '), count(*)
  from mat group by mat_key having count(*) > 1

  union all
  select 8, '8. Material whose name is another material''s short name',
         m1.name || '  is the short name of  ' || m2.name, 1
  from mat m1
  join mat m2 on m1.name <> m2.name and m2.short_name <> '' and lower(m1.name) = lower(m2.short_name)

  union all
  select 9, '9. Stock line on a section that is not in Sections', name, count(*)
  from stk
  where not exists (select 1 from sec where lower(sec.name) = lower(stk.name))
  group by name

  union all
  select 10, '10. Stock line material that is not on the Material Types list',
         coalesce(nullif(grade, ''), '(blank)'), count(*)
  from stk
  where not exists (
    select 1 from mat m
    where lower(m.name) = lower(stk.grade)
       or (m.short_name <> '' and lower(m.short_name) = lower(stk.grade))
  )
  group by grade

  union all
  select 11, '11. Stock line material written as a short name (Sections uses the full name)', grade, count(*)
  from stk
  where grade <> '' and exists (
    select 1 from mat m
    where m.short_name <> '' and lower(m.short_name) = lower(stk.grade) and lower(m.name) <> lower(stk.grade)
  )
  group by grade

  union all
  select 12, '12. Stock line that finds no price row in Sections',
         name || ' / ' || coalesce(nullif(grade, ''), '(blank)'), count(*)
  from stk
  where not exists (
    select 1 from sec
    where lower(sec.name) = lower(stk.name)
      and (lower(sec.grade) = lower(stk.grade) or sec.grade = '')
  )
  group by name, grade

  union all select 99, 'Totals', 'sections', count(*) from sec
  union all select 99, 'Totals', 'materials', count(*) from mat
  union all select 99, 'Totals', 'section kinds', count(*) from kinds
  union all select 99, 'Totals', 'structural stock lines', count(*) from stk
)
select check_name, what, how_many
from found
order by n, what;
