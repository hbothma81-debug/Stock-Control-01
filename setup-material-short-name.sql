-- A material's short name, changed in Stock Manager, goes everywhere the
-- material is written (decided 16 Sep 2026, built 29 Sep 2026).
--
-- The rule since 16 Sep: a material is STORED by its short name where the
-- Material Types list gives it one (SS304, Galv), otherwise by its full
-- name. Until now, typing a short name in changed the list's own row and
-- nothing else, so every stock line, section, requisition and job line
-- still saying the old name stopped matching. Heinrich wants Mild Steel
-- to read "MS" (29 Sep 2026); this is what makes that one change on a
-- screen and not a rewrite by hand.
--
-- What this adds: four functions, no table, no column, no rule.
--
--   material_places()         the list of where a material is written.
--                             One copy: a new place is added here.
--   material_where()          how a row of a place is known to hold a
--                             material, and no other whose name ends the
--                             same way.
--   material_rewrite_place()  rewrites one of those places, and stops
--                             everything if a row it should have changed
--                             is still written the old way.
--   set_material_short_name(name, short)
--                             saves the short name on the Material Types
--                             row and rewrites every place, all of it or
--                             none of it. An empty short name takes it
--                             away: the material goes back to its full
--                             name everywhere.
--
-- THIS FILE CHANGES NO DATA. Nothing is renamed by running it. A material
-- is renamed when somebody changes its short name under Stock Manager ->
-- Material Types, which asks first.
--
-- Left alone, on purpose: CNC bar and fasteners (their own material
-- lists), purchase orders already raised and documents already printed
-- (history), supplier prices (filed under the full name, which does not
-- change), and the material's full name itself.
--
-- The functions run as the person who called them, so the database's own
-- rules on who may change what still apply. A place that person may not
-- change stops the whole rename with nothing changed.
--
-- Run on PRACTICE first, then LIVE. Select nothing before pressing Run.
-- Five pastes, each run before the next is pasted: PASTE 1 to PASTE 5.
-- Safe to run more than once.

-- ============ PASTE 1: where a material is written ============
-- kind: 'whole' the column holds the material and nothing else;
--       'tail'  the text ends with it: "3mm Mild Steel";
--       'head'  the text starts with it: "Mild Steel — 50x50x2".
create or replace function public.material_places()
returns table (tbl text, col text, cond text, kind text)
language sql immutable
as $places$
  values
    ('stock_items',          'grade',         'main_cat not in (''cncBar'', ''fasteners'')', 'whole'),
    ('master_factor_items',  'grade',         'list_name = ''sections''',                    'whole'),
    ('requisitions',         'item_grade',    'main_cat not in (''cncBar'', ''fasteners'')', 'whole'),
    ('requisitions',         'item_label',    'main_cat not in (''cncBar'', ''fasteners'')', 'head'),
    ('job_cut_items',        'grade',         'true',                                        'whole'),
    ('quote_parts',          'grade',         'true',                                        'whole'),
    ('quote_parts',          'material',      'true',                                        'whole'),
    ('bom_parts',            'grade',         'true',                                        'whole'),
    ('laser_programs',       'material',      'true',                                        'tail'),
    ('job_quote_items',      'material_type', 'true',                                        'tail'),
    ('tube_section_aliases', 'section_name',  'true',                                        'tail')
$places$;
grant execute on function public.material_places() to authenticated;

-- ============ PASTE 2: how a row is known to hold the material ============
-- Gives the condition as text, for a statement over table t and the old
-- spellings o(old). $1 is the new name, $3 the material's own id. A text
-- that ends or starts with a LONGER material's name ("Galvanised Mild
-- Steel") is that other material, and is left alone.
create or replace function public.material_where(p_cond text, p_kind text)
returns text
language plpgsql immutable
as $where$
declare
  v_match text := case p_kind
    when 'whole' then 'lower(trim(t.%2$I)) = o.old'
    when 'tail' then 'right(lower(trim(t.%2$I)), length(o.old) + 1) = '' '' || o.old'
    else 'left(lower(trim(t.%2$I)), length(o.old) + 3) = o.old || '' — ''' end;
begin
  return '(' || p_cond || ') and ' || v_match || ' and ' ||
    case p_kind when 'whole' then 't.%2$I'
                when 'tail' then 'right(trim(t.%2$I), length(o.old))'
                else 'left(trim(t.%2$I), length(o.old))' end || ' is distinct from $1' ||
    case when p_kind = 'whole' then ' and $3 is not null' else
      ' and not exists (select 1 from public.master_factor_items g, unnest(array[g.name, g.short_name]) as w(word)
          where g.list_name = ''grades'' and g.id::text <> $3 and length(trim(coalesce(w.word, ''''))) > length(o.old)
            and ' || replace(v_match, 'o.old', 'lower(trim(w.word))') || ')' end;
end;
$where$;
grant execute on function public.material_where(text, text) to authenticated;

-- ============ PASTE 3: one place rewritten ============
-- p_olds: every way the material may be written today, in small letters.
create or replace function public.material_rewrite_place(
  p_tbl text, p_col text, p_cond text, p_kind text, p_new text, p_olds text[], p_material text)
returns bigint
language plpgsql security invoker set search_path = public
as $place$
declare
  v_where text := material_where(p_cond, p_kind);
  n bigint;
  still bigint;
begin
  -- Only the places on the list: this builds its statement from what it
  -- is handed, and is handed nothing else.
  if not exists (select 1 from material_places() x
                 where x.tbl = p_tbl and x.col = p_col and x.cond = p_cond and x.kind = p_kind) then
    raise exception '%.% is not a place a material is written.', p_tbl, p_col
      using errcode = 'P0001', hint = 'material_place_unknown';
  end if;
  execute format('update public.%1$I t set %2$I = ' ||
    case p_kind when 'whole' then '$1'
                when 'tail' then 'left(trim(t.%2$I), length(trim(t.%2$I)) - length(o.old)) || $1'
                else '$1 || substr(trim(t.%2$I), length(o.old) + 1)' end ||
    ' from unnest($2) as o(old) where ' || v_where, p_tbl, p_col)
  using p_new, p_olds, p_material;
  get diagnostics n = row_count;
  -- A place this person may not change answers no error and no row.
  execute format('select count(*) from public.%1$I t, unnest($2) as o(old) where ' || v_where, p_tbl, p_col)
  into still using p_new, p_olds, p_material;
  if still > 0 then
    raise exception '% row(s) of % could not be changed, so nothing was.', still, p_tbl
      using errcode = 'P0001', hint = 'material_rows_refused';
  end if;
  return n;
end;
$place$;
grant execute on function public.material_rewrite_place(text, text, text, text, text, text[], text) to authenticated;

-- ============ PASTE 4: the rename ============
create or replace function public.set_material_short_name(p_name text, p_short text)
returns jsonb
language plpgsql security invoker set search_path = public
as $body$
declare
  m record;
  p record;
  v_short text := nullif(trim(coalesce(p_short, '')), '');
  v_new text;
  v_olds text[];
  n bigint;
  changed jsonb := '{}'::jsonb;
begin
  select id::text as id, trim(name) as name, nullif(trim(coalesce(short_name, '')), '') as short_name into m
  from master_factor_items
  where list_name = 'grades' and lower(trim(name)) = lower(trim(coalesce(p_name, ''))) for update;
  if not found then
    raise exception 'There is no material called "%" on the Material Types list.', p_name
      using errcode = 'P0001', hint = 'material_not_found';
  end if;
  v_new := coalesce(v_short, m.name);
  if exists (select 1 from master_factor_items g where g.list_name = 'grades' and g.id::text <> m.id
               and lower(v_new) in (lower(trim(g.name)), lower(trim(coalesce(g.short_name, ''))))) then
    raise exception '"%" is already the name or the short name of another material.', v_new
      using errcode = 'P0001', hint = 'material_name_taken';
  end if;
  update master_factor_items set short_name = v_short where id::text = m.id;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'The Material Types list could not be changed by this person.'
      using errcode = 'P0001', hint = 'material_not_allowed';
  end if;
  select array_agg(distinct lower(w)) into v_olds
  from unnest(array[m.name, m.short_name, v_new]) as w where w is not null;
  for p in select * from material_places() loop
    continue when not exists (select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = p.tbl and c.column_name = p.col);
    n := material_rewrite_place(p.tbl, p.col, p.cond, p.kind, v_new, v_olds, m.id);
    if n > 0 then changed := changed || jsonb_build_object(p.tbl || '.' || p.col, n); end if;
  end loop;
  return jsonb_build_object('material', m.name, 'was', coalesce(m.short_name, m.name), 'now', v_new, 'changed', changed);
end;
$body$;
grant execute on function public.set_material_short_name(text, text) to authenticated;

-- ============ PASTE 5: check ============
-- One row, which should say ready.
select 'the four functions of setup-material-short-name.sql' as thing,
  case when count(*) = 4 then 'ready' else 'MISSING: ' || (4 - count(*)) || ' of 4' end as status
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('material_places', 'material_where', 'material_rewrite_place', 'set_material_short_name');
