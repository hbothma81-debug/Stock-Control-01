-- CNC module, file 10: machines and their cutting data (build step 5).
-- Heinrich, 8 Oct 2026: cutting data moves from LEO1600 CUTTING DATA.xlsx
-- into the CNC tab (the app becomes the master); machines are data, only
-- the LEO 1600 for now, with an Add machine button; only admins may change
-- either. Each Excel sheet keeps its own columns: cnc_cutting_sheets holds
-- the header row in order, cnc_cutting_data one row per Excel row, keyed by
-- the header text, which is what the engine reads (agreed with the engine).
-- Reading: the CNC tick. Writing: admins only (cnc_may('admin'), which only
-- an admin passes). Needs file 1. Five pastes, in order. Safe to run twice.

-- ============ PASTE 1: the tables ============

create table if not exists public.cnc_machines (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 1 and 80),
  data       jsonb not null default '{}'::jsonb,
  sort       integer not null default 0,
  data_version bigint not null default 0,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.cnc_machines add column if not exists data_version bigint not null default 0;
create table if not exists public.cnc_cutting_sheets (
  machine_id uuid not null references public.cnc_machines(id) on delete cascade,
  sheet      text not null check (char_length(sheet) between 1 and 60),
  position   integer not null default 0,
  columns    text[] not null default '{}',
  primary key (machine_id, sheet)
);
create table if not exists public.cnc_cutting_data (
  id         uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.cnc_machines(id) on delete cascade,
  sheet      text not null,
  row_no     integer not null,
  data       jsonb not null default '{}'::jsonb,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists cnc_cutting_data_sheet_idx on public.cnc_cutting_data (machine_id, sheet, row_no);
drop trigger if exists cnc_machines_set_updated_at on public.cnc_machines;
create trigger cnc_machines_set_updated_at before update on public.cnc_machines
  for each row execute function public.touch_updated_at();
drop trigger if exists cnc_cutting_data_set_updated_at on public.cnc_cutting_data;
create trigger cnc_cutting_data_set_updated_at before update on public.cnc_cutting_data
  for each row execute function public.touch_updated_at();

-- ============ PASTE 2: a change marker for the engine ============
-- data_version on the machine goes up with every change to its cutting
-- data, so the engine reads one number per call and the rows only when it
-- moved (asked for by the engine, 8 Oct 2026). security definer: it runs
-- for the admin making the change either way, and touches nothing else.

create or replace function public.cnc_bump_cutting_version()
returns trigger
language plpgsql
security definer set search_path = public
as $body$
begin
  update public.cnc_machines set data_version = data_version + 1
   where id = coalesce(case when tg_op = 'DELETE' then old.machine_id else new.machine_id end, old.machine_id);
  return null;
end;
$body$;

drop trigger if exists cnc_cutting_data_bump_version on public.cnc_cutting_data;
create trigger cnc_cutting_data_bump_version after insert or update or delete on public.cnc_cutting_data
  for each row execute function public.cnc_bump_cutting_version();
drop trigger if exists cnc_cutting_sheets_bump_version on public.cnc_cutting_sheets;
create trigger cnc_cutting_sheets_bump_version after insert or update or delete on public.cnc_cutting_sheets
  for each row execute function public.cnc_bump_cutting_version();

-- ============ PASTE 3: who may read and change ============

do $do$
declare t text;
begin
  foreach t in array array['cnc_machines', 'cnc_cutting_sheets', 'cnc_cutting_data'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "CNC people can read %s" on public.%I', t, t);
    execute format('create policy "CNC people can read %s" on public.%I for select using (public.cnc_may(''view''))', t, t);
    execute format('drop policy if exists "Admins can add %s" on public.%I', t, t);
    execute format('create policy "Admins can add %s" on public.%I for insert with check (public.cnc_may(''admin''))', t, t);
    execute format('drop policy if exists "Admins can change %s" on public.%I', t, t);
    execute format('create policy "Admins can change %s" on public.%I for update using (public.cnc_may(''admin''))', t, t);
    execute format('drop policy if exists "Admins can remove %s" on public.%I', t, t);
    execute format('create policy "Admins can remove %s" on public.%I for delete using (public.cnc_may(''admin''))', t, t);
  end loop;
end $do$;

-- ============ PASTE 4: the LEO 1600 (from the engine's machine file) ============

insert into public.cnc_machines (name, data, sort, updated_by)
values ('LEO 1600', (
  '{"_source":"DN data sheet 6.CNC LEO1600\\5.Machine Docs\\LEO 1600_200605.pdf (8-station 25x25 versio' ||
  'n) + CNC_HANDOFF_LEO1600.md + 0.RULES.md. Confirmed 7 Oct 2026.","name":"LEO 1600","maker":"DN Solut' ||
  'ions (Doosan)","control":"Doosan Fanuc i Plus (0i-F Plus), 2 axes X/Z, 1 path","capacity":{"max_turn' ||
  'ing_dia":320,"max_turning_length":303,"recommended_turning_dia":170,"swing_over_bed":470,"swing_over' ||
  '_saddle":300,"bar_capacity_dia":45,"max_workpiece_kg_chuck_work":70,"max_workpiece_kg_shaft_work":15' ||
  '0},"travel":{"x":175,"z":330,"rapid_m_min":30},"spindle":{"max_rpm":4000,"shop_cap_rpm":3500,"power_' ||
  'kw_15min_s3_25":7.5,"power_kw_cont":5.5,"torque_nm_15min":72,"torque_nm_60min":53,"torque_nm_cont":3' ||
  '9,"constant_power_from_rpm":1333,"nose":"A2-5","through_hole_dia":61},"chuck":{"size_inch":6,"dia":1' ||
  '70,"jaws":"soft","option":"8 inch (210)"},"turret":{"stations":8,"type":"BMT65 static, rear, no live' ||
  ' tools","od_tool_size":"25x25","max_boring_bar_dia":32,"id_holder":"H32","boring_sleeves_h40":[10,12' ||
  ',16,20,25,32],"drill_sockets":["MT1","MT2","MT3"],"index_time_s":0.15},"tailstock":{"quill_dia":65,"' ||
  'taper":"MT4","quill_travel":80,"tailstock_travel":320},"coolant":{"pump_bar":1.3,"pump_kw":0.18,"opt' ||
  'ions_bar":[1.5,4.5],"through_tool_to_drills":true},"safe_position":{"x_under_d100":150,"x_over_d100"' ||
  ':200,"z":150},"times":{"puller_pull_s":15,"_note":"bar puller: seconds per pull on the machine (Hein' ||
  'rich 8 Oct) - replaces the simulated estimate"}}'
)::jsonb, 1, 'setup file')
on conflict (name) do nothing;

-- ============ PASTE 5: import a whole workbook, all or nothing ============
-- The CNC tab's Import from Excel hands every sheet in one call: each sheet
-- named is replaced (its header row and its rows, in order); sheets not
-- named are left alone. One save, so a page closed part way leaves the
-- data as it was. Runs as the caller: the admin-only rules above still
-- apply, and anyone else is refused by them.
-- p_sheets: [{"sheet": "TURNING", "position": 1, "columns": [...], "rows": [{...}, ...]}, ...]

create or replace function public.cnc_replace_cutting_data(p_machine uuid, p_sheets jsonb, p_by text)
returns integer
language plpgsql
set search_path = public
as $fn$
declare
  s jsonb;
  n integer := 0;
begin
  if not public.cnc_may('admin') then
    raise exception 'Only an admin can change cutting data' using errcode = 'P0001', hint = 'cnc_not_admin';
  end if;
  for s in select * from jsonb_array_elements(p_sheets) loop
    delete from cnc_cutting_data where machine_id = p_machine and sheet = s->>'sheet';
    insert into cnc_cutting_sheets (machine_id, sheet, position, columns)
    values (p_machine, s->>'sheet', coalesce((s->>'position')::int, 0),
            array(select jsonb_array_elements_text(s->'columns')))
    on conflict (machine_id, sheet) do update set position = excluded.position, columns = excluded.columns;
    insert into cnc_cutting_data (machine_id, sheet, row_no, data, updated_by)
    select p_machine, s->>'sheet', r.ord::int, r.value, coalesce(p_by, '')
      from jsonb_array_elements(s->'rows') with ordinality as r(value, ord);
    get diagnostics n = row_count;
  end loop;
  return (select count(*) from cnc_cutting_data where machine_id = p_machine);
end;
$fn$;

grant execute on function public.cnc_replace_cutting_data(uuid, jsonb, text) to authenticated;

select 'cnc machines and cutting data' as step,
       case when (select count(*) from information_schema.tables where table_schema = 'public'
                   and table_name in ('cnc_machines', 'cnc_cutting_sheets', 'cnc_cutting_data')) = 3
             and (select count(*) from pg_policies where schemaname = 'public'
                   and tablename in ('cnc_machines', 'cnc_cutting_sheets', 'cnc_cutting_data')) = 12
             and exists (select 1 from public.cnc_machines where name = 'LEO 1600')
             and exists (select 1 from pg_trigger where tgname = 'cnc_cutting_data_bump_version')
             and exists (select 1 from pg_proc where proname = 'cnc_replace_cutting_data')
            then 'ready - the LEO 1600 is there; import the cutting data in the CNC tab'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
