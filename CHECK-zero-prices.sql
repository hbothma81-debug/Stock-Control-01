-- Which material rates have no price.
--
-- READ ONLY. Changes nothing.
--
-- Worth running because of the bug fixed on 3 September: switching the
-- price toggle to a unit it could not convert to wrote a zero straight
-- over the rate. Anyone who pressed R/kg on a section with no kg/m set,
-- or R/m on a bar with no diameter, wiped that rate for every item using
-- it. It gave no error, so nobody would have known.
--
-- Not every zero here came from that. A material added but never priced
-- looks exactly the same. This is a list to look down, not a fault list.
--
-- What matters is that a zero rate makes anything using it value at
-- nothing, so stock value and job costing are quietly wrong until it is
-- filled in.
--
-- Select nothing before pressing Run.


select case list_name
         when 'sections'  then 'Section'
         when 'grades'    then 'Material Type'
         when 'cncGrades' then 'CNC Bar Grade'
         else list_name
       end as list,
       name,
       coalesce(factor, 0) as weight_factor,
       case when coalesce(factor, 0) = 0
            then 'no weight set either - cannot be priced by weight'
            else '' end as note
from master_factor_items
where list_name in ('sections', 'grades', 'cncGrades')
  and coalesce(price, 0) = 0
order by list_name, name;


-- Nothing returned means every material has a rate, and the bug never
-- caught anything of yours.
