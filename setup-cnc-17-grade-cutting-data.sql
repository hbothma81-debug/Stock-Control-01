-- Each CNC Bar Grade linked to its cutting data (Heinrich 17 Oct 2026: "cutting data and material should be linked").
-- One new column; the CNC tab's Materials list picks it (src/cnc/gradeLink.js) and the engine uses it first (turnpath 6462442).
-- Links the grades whose names the engine's name table already knows (turnpath data/material_names.json, copied below).
-- A grade it can't match stays empty: red on CNC -> Materials, not offered for a program until picked.
-- Safe to run twice: a grade already linked is never changed. Practice first, then live.
alter table master_factor_items add column if not exists cutting_material text;

with names(k, code) as (values
  ('070M20','EN3A'), ('070M55','EN9'), ('080M40','EN8'), ('1045','EN8'), ('230M07','EN1A'), ('300WA','EN3A'), ('303','SS303'), ('304','SS304'),
  ('304L','SS304'), ('316','SS316'), ('316L','SS316'), ('3CR12','3CR12'), ('4140','EN19'), ('431','SS431'), ('4340','EN24'), ('6061','6082'),
  ('6063','6082'), ('6082','6082'), ('655M13','EN36'), ('709M40','EN19'), ('817M40','EN24'), ('A106','A106'), ('A53','A106'), ('ACETAL','HDPE'),
  ('AL6082','6082'), ('ALUMINIUM','6082'), ('ALUMINIUM6061','6082'), ('ALUMINIUM6063','6082'), ('ALUMINIUM6082','6082'), ('BMS','EN3A'), ('BRASS','CZ121'), ('BRIGHTMILDSTEEL','EN3A'),
  ('BRONZE','PB1'), ('CZ121','CZ121'), ('DELRIN','HDPE'), ('EN19','EN19'), ('EN19T','EN19'), ('EN1A','EN1A'), ('EN1ALEADED','EN1A'), ('EN1APB','EN1A'),
  ('EN21','EN21'), ('EN24','EN24'), ('EN24T','EN24'), ('EN36','EN36'), ('EN3A','EN3A'), ('EN3B','EN3A'), ('EN8','EN8'), ('EN9','EN9'),
  ('GUNMETAL','LG2'), ('HDPE','HDPE'), ('LEADEDGUNMETAL','LG2'), ('LG2','LG2'), ('MILDSTEEL','EN3A'), ('MS','EN3A'), ('NYLON','HDPE'), ('PB1','PB1'),
  ('PB2','PB1'), ('PHOSPHORBRONZE','PB1'), ('PIPE','A106'), ('POM','HDPE'), ('PTFE','HDPE'), ('SS303','SS303'), ('SS304','SS304'), ('SS316','SS316'),
  ('SS431','SS431'), ('STAINLESS303','SS303'), ('STAINLESS304','SS304'), ('STAINLESS316','SS316'), ('STAINLESS431','SS431'), ('UHMW','HDPE'), ('UHMWPE','HDPE')
), grade_keys as (
  -- the engine's three tries: the whole name, the name without its (brackets), what is in the brackets
  select id,
    upper(regexp_replace(name, '[^A-Za-z0-9]', '', 'g')) as k1,
    upper(regexp_replace(regexp_replace(name, '\(.*?\)', '', 'g'), '[^A-Za-z0-9]', '', 'g')) as k2,
    upper(regexp_replace(coalesce(substring(name from '\((.*)\)'), ''), '[^A-Za-z0-9]', '', 'g')) as k3
  from master_factor_items
  where list_name = 'cncGrades' and cutting_material is null
), linked as (
  select g.id, coalesce((select code from names where k = g.k1), (select code from names where k = g.k2),
                        (select code from names where k = g.k3 and g.k3 <> '')) as code
  from grade_keys g
)
update master_factor_items f set cutting_material = l.code
from linked l
where f.id = l.id and l.code is not null;

select name, coalesce(cutting_material, '-- none: pick it on CNC -> Materials') as cutting_data
from master_factor_items where list_name = 'cncGrades' order by name;
