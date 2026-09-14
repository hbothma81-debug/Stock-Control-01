-- CHECK: every place a material name is written, and which spelling it uses.
--
-- Read-only. It only looks: nothing is changed, added or deleted.
-- Paste it into the SQL editor on LIVE, select nothing, press Run.
--
-- One table comes back. "place" is the table and column; "value" is what
-- is written there; "how_many" is how many rows say it; "reads_as" says
-- whether that is a material's full name, its short name, or neither.
-- The first rows (place "0. Material Types list") are the list itself.
-- Laser programs and job lines hold the material inside longer text
-- ("3mm MS", "SHS 50x50x3mm 304"), so their last word is what is judged.
-- Old purchase orders are left out on purpose: they are history.

with
mat as (
  select trim(name) as full_name, coalesce(trim(short_name), '') as short_name
  from public.master_factor_items where list_name = 'grades'
),
vals as (
  select 'stock_items.grade (' || main_cat || ')' as place, grade as v, false as words from public.stock_items
  union all select 'sections (Stock Manager)', grade, false from public.master_factor_items where list_name = 'sections'
  union all select 'requisitions.item_grade', item_grade, false from public.requisitions
  union all select 'job_cut_items.grade', grade, false from public.job_cut_items
  union all select 'quote_parts.grade', grade, false from public.quote_parts
  union all select 'quote_parts.material', material, false from public.quote_parts
  union all select 'bom_parts.grade', grade, false from public.bom_parts
  union all select 'laser_programs.material', material, true from public.laser_programs
  union all select 'job_quote_items.material_type', material_type, true from public.job_quote_items
),
counted as (
  select place, trim(v) as v, words, count(*) as how_many
  from vals where trim(coalesce(v, '')) <> ''
  group by place, trim(v), words
)
select '0. Material Types list' as place,
       full_name as value,
       null::bigint as how_many,
       'short name: ' || coalesce(nullif(short_name, ''), '(none)') as reads_as
from mat
union all
select c.place, c.v, c.how_many,
  coalesce(
    (select case when m.short_name = '' or lower(m.full_name) = lower(m.short_name) then 'full name = short name: ' || m.full_name
                 when (not c.words and lower(c.v) = lower(m.full_name))
                   or (c.words and lower(c.v) like '% ' || lower(m.full_name)) then 'FULL name of ' || m.full_name
                 else 'short name of ' || m.full_name end
     from mat m
     where (not c.words and (lower(c.v) = lower(m.full_name) or lower(c.v) = lower(m.short_name)))
        or (c.words and (lower(c.v) like '% ' || lower(m.full_name) or (m.short_name <> '' and lower(c.v) like '% ' || lower(m.short_name))))
     order by length(m.full_name) desc
     limit 1),
    'NOT on the Material Types list') as reads_as
from counted c
order by place, value;
