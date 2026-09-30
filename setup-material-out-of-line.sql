-- Which materials are written another way than the Material Types list
-- holds them (Heinrich, 30 Sep 2026).
--
-- Found on live, 29 Sep 2026: the list row of Mild Steel already read
-- short name "MS", typed into the old box, which changed the list's own
-- row and nothing else. 77 stock lines, 19 sections and 279 laser programs
-- still said "Mild Steel", while every new row was written "MS". The box
-- cannot mend that: "MS" typed over "MS" is no change.
--
-- What this adds: one function that only counts. For each material on the
-- list, and each place a material is written (material_places(), in
-- setup-material-short-name.sql: the one copy), how many rows are written
-- by another of its names than the one the list holds it by. Stock Manager
-- -> Material Types shows the count on the material's row to an admin,
-- with "Bring in line", which calls set_material_short_name with the short
-- name the list already has: that rewrites every such row, all or none.
--
-- The rule for "this row is that material" is material_where(), the same
-- one the rewrite uses, so what is counted here is what would be changed.
--
-- THIS FILE CHANGES NO DATA, and neither does the function.
-- It runs as the person who called it: somebody who may not read a table
-- is told nothing about it.
--
-- Needs setup-material-short-name.sql first.
-- Run on PRACTICE first, then LIVE. Select nothing before pressing Run.
-- Two pastes: PASTE 1, then PASTE 2 (the check). Safe to run more than once.

-- ============ PASTE 1: the count ============
create or replace function public.material_rows_out_of_line()
returns table (material text, place text, rows_out bigint)
language plpgsql stable security invoker set search_path = public
as $out$
declare
  m record;
  p record;
  c bigint;
begin
  for m in select g.id::text as id, trim(g.name) as name,
                  coalesce(nullif(trim(coalesce(g.short_name, '')), ''), trim(g.name)) as held
           from master_factor_items g where g.list_name = 'grades' order by g.name loop
    for p in select * from material_places() loop
      continue when not exists (select 1 from information_schema.columns k
        where k.table_schema = 'public' and k.table_name = p.tbl and k.column_name = p.col);
      execute format('select count(*) from public.%1$I t, unnest($2) as o(old) where '
        || material_where(p.cond, p.kind), p.tbl, p.col)
      into c using m.held, array(select distinct lower(w) from unnest(array[m.name, m.held]) as w), m.id;
      if c > 0 then
        material := m.name;
        place := p.tbl || '.' || p.col;
        rows_out := c;
        return next;
      end if;
    end loop;
  end loop;
end;
$out$;
grant execute on function public.material_rows_out_of_line() to authenticated;

-- ============ PASTE 2: check ============
-- One row, which should say ready.
select 'function material_rows_out_of_line' as thing,
  case when count(*) = 1 then 'ready' else 'MISSING' end as status
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'material_rows_out_of_line';
