-- CNC module, file 11: the tools of each machine (build step 5, last part).
-- Heinrich, 8 Oct 2026: one tool list per machine; tools not owned are
-- listed too ("Not owned") and never stop a program from being posted;
-- HSS jobber drills listed, one per size; admins only change. A program's
-- own turret is chosen on its Tool crib tab and kept with its settings; the
-- machine's default turret is turret_default in cnc_machines.data. data =
-- the engine's own tool entry (its TOOLS keys plus the fields each kind
-- needs), so the engine reads this table as it reads the cutting data.
-- Seeded from the engine's data/tools_seed.json. Needs file 10.
-- Five pastes, in order. Safe to run twice.

-- ============ PASTE 1: the table ============

create table if not exists public.cnc_tools (
  id         uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.cnc_machines(id) on delete cascade,
  tool_key   text not null check (char_length(tool_key) between 1 and 60),
  owned      boolean not null default true,
  data       jsonb not null default '{}'::jsonb,
  sort       integer not null default 0,
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  unique (machine_id, tool_key)
);
drop trigger if exists cnc_tools_set_updated_at on public.cnc_tools;
create trigger cnc_tools_set_updated_at before update on public.cnc_tools
  for each row execute function public.touch_updated_at();
-- The engine's change marker moves with the tools too (file 10's function).
drop trigger if exists cnc_tools_bump_version on public.cnc_tools;
create trigger cnc_tools_bump_version after insert or update or delete on public.cnc_tools
  for each row execute function public.cnc_bump_cutting_version();

-- ============ PASTE 2: who may read and change ============

alter table public.cnc_tools enable row level security;
drop policy if exists "CNC people can read cnc_tools" on public.cnc_tools;
create policy "CNC people can read cnc_tools" on public.cnc_tools for select using (public.cnc_may('view'));
drop policy if exists "Admins can add cnc_tools" on public.cnc_tools;
create policy "Admins can add cnc_tools" on public.cnc_tools for insert with check (public.cnc_may('admin'));
drop policy if exists "Admins can change cnc_tools" on public.cnc_tools;
create policy "Admins can change cnc_tools" on public.cnc_tools for update using (public.cnc_may('admin'));
drop policy if exists "Admins can remove cnc_tools" on public.cnc_tools;
create policy "Admins can remove cnc_tools" on public.cnc_tools for delete using (public.cnc_may('admin'));

-- ============ PASTE 3: the LEO 1600's default turret ============

update public.cnc_machines
   set data = data || jsonb_build_object('turret_default', '{"1":"WNMG","2":"DNMG","3":"DR200","4":null,"5":"S32U","6":null,"7":"A16Q","8":"PART"}'::jsonb)
 where name = 'LEO 1600' and not (data ? 'turret_default');

-- ============ PASTE 4: the LEO 1600's tools, first half (from the engine's tools_seed.json) ============

insert into public.cnc_tools (machine_id, tool_key, owned, sort, data, updated_by)
select m.id, t.tool_key, t.owned, t.sort, t.data, 'setup file'
  from public.cnc_machines m
 cross join (values
  ('WNMG', true, 10, '{"name":"WNMG R0.8","kind":"od","long":false,"nose":0.8,"holder":"MWLNR 2525M-08W","insert":"WNMG 080408-M3M IC830","sheet":"TURNING","key":"T1"}'::jsonb),
  ('DNMG', true, 20, '{"name":"DNMG R0.4","kind":"od","long":false,"nose":0.4,"holder":"PDJNR 2525M-11","insert":"DNMG 110404-NF IC907","sheet":"TURNING","key":"T2"}'::jsonb),
  ('DR130', true, 30, '{"name":"13MM U-DRILL","kind":"udrill","long":true,"dia":13,"sheet":"U-DRILL","key":"DR130","home_z":50,"holder":"DR130-039-16-04-3D-N","insert":"AOMT 040204-90DT IC908"}'::jsonb),
  ('DR140', true, 40, '{"name":"14MM U-DRILL","kind":"udrill","long":true,"dia":14,"sheet":"U-DRILL","key":"DR140","home_z":50,"holder":"DR140-042-20-05-3D-N","insert":"SOMX 050204-DT IC908"}'::jsonb),
  ('DR160', true, 50, '{"name":"16MM U-DRILL","kind":"udrill","long":true,"dia":16,"sheet":"U-DRILL","key":"DR160","home_z":50,"holder":"DR160-048-20-05-3D-N","insert":"SOMX 050204-DT IC908"}'::jsonb),
  ('DR200', true, 60, '{"name":"20MM U-DRILL","kind":"udrill","long":true,"dia":20,"sheet":"U-DRILL","key":"DR200","home_z":50,"holder":"DR200-100-25-06-5D-N","insert":"SOMX 060304-DT IC908"}'::jsonb),
  ('A08H', true, 70, '{"name":"8MM BORING BAR","kind":"bar","long":true,"dia":8,"nose":0.4,"sheet":"BORING","key":"A08H","home_z":50,"holder":"A08H SCLXR-06X","insert":"CXMU 060204-F3P IC8150"}'::jsonb),
  ('A12M', true, 80, '{"name":"12MM BORING BAR","kind":"bar","long":true,"dia":12,"nose":0.4,"sheet":"BORING","key":"A12M","home_z":60,"holder":"A12M SCLXR-06X","insert":"CXMU 060204-F3P IC8150"}'::jsonb),
  ('A16Q', true, 90, '{"name":"16MM BORING BAR","kind":"bar","long":true,"dia":16,"nose":0.8,"sheet":"BORING","key":"A16Q","home_z":80,"holder":"A16Q PCLXR-09X","insert":"CXMG 090408-M3P IC8150"}'::jsonb),
  ('S25', true, 100, '{"name":"25MM BORING BAR","kind":"bar","long":true,"dia":25,"nose":0.8,"sheet":"BORING","key":"S25TPCLNR12","home_z":60,"holder":"S25TPCLNR12","insert":"CNMG 120408 MU9420"}'::jsonb),
  ('S32U', true, 110, '{"name":"32MM BORING BAR","kind":"bar","long":true,"dia":32,"nose":0.8,"sheet":"BORING","key":"S32U","home_z":50,"holder":"S32U MWLNL-08W","insert":"WNMG 080408-M3M IC830"}'::jsonb),
  ('PART', true, 120, '{"name":"3MM PARTING","kind":"part","long":false,"sheet":"PART-GROOVE","key":"DGN","width":3.1,"max_dia":36,"holder":"SGTBU 25-6G + DGFH 32-3","insert":"DGN 3102C IC908","op":"T8 parting"}'::jsonb),
  ('PENTA2', true, 130, '{"name":"2MM PENTA GROOVE","kind":"groove","long":false,"holder":"PCHR 25-24","insert":"PENTA 24N200J020 IC908","width":2,"cdx":6,"op":"OD groove 2 mm"}'::jsonb),
  ('PENTA1', true, 140, '{"name":"1MM PENTA GROOVE","kind":"groove","long":false,"holder":"PCHR 25-24","insert":"PENTA 24N100J004 IC908","width":1,"cdx":3.5,"op":"OD groove 1 mm"}'::jsonb),
  ('THREAD', true, 150, '{"name":"THREAD","kind":"thread","long":false,"holder":"SER 2525 M16","insert":"16ER ISO IC908","pitches_owned":[1,1.25,1.5,1.75,2,2.5,3],"pitch_range":[0.5,3]}'::jsonb),
  ('PULLER', true, 160, '{"name":"BAR PULLER","kind":"puller","long":false,"puller":"bar"}'::jsonb),
  ('HSS2', true, 170, '{"name":"2MM HSS DRILL","kind":"hss","long":true,"dia":2,"holder":"ER32 collet","insert":"HSS jobber D2","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS2.5', true, 180, '{"name":"2.5MM HSS DRILL","kind":"hss","long":true,"dia":2.5,"holder":"ER32 collet","insert":"HSS jobber D2.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS3', true, 190, '{"name":"3MM HSS DRILL","kind":"hss","long":true,"dia":3,"holder":"ER32 collet","insert":"HSS jobber D3","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS3.3', true, 200, '{"name":"3.3MM HSS DRILL","kind":"hss","long":true,"dia":3.3,"holder":"ER32 collet","insert":"HSS jobber D3.3","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS3.5', true, 210, '{"name":"3.5MM HSS DRILL","kind":"hss","long":true,"dia":3.5,"holder":"ER32 collet","insert":"HSS jobber D3.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS4', true, 220, '{"name":"4MM HSS DRILL","kind":"hss","long":true,"dia":4,"holder":"ER32 collet","insert":"HSS jobber D4","sheet":"HSS-DRILL","home_z":50}'::jsonb)
 ) as t(tool_key, owned, sort, data)
 where m.name = 'LEO 1600'
on conflict (machine_id, tool_key) do nothing;

-- ============ PASTE 5: the second half, and the check ============

insert into public.cnc_tools (machine_id, tool_key, owned, sort, data, updated_by)
select m.id, t.tool_key, t.owned, t.sort, t.data, 'setup file'
  from public.cnc_machines m
 cross join (values
  ('HSS4.1', true, 230, '{"name":"4.1MM HSS DRILL","kind":"hss","long":true,"dia":4.1,"holder":"ER32 collet","insert":"HSS jobber D4.1","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS4.2', true, 240, '{"name":"4.2MM HSS DRILL","kind":"hss","long":true,"dia":4.2,"holder":"ER32 collet","insert":"HSS jobber D4.2","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS4.5', true, 250, '{"name":"4.5MM HSS DRILL","kind":"hss","long":true,"dia":4.5,"holder":"ER32 collet","insert":"HSS jobber D4.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS5', true, 260, '{"name":"5MM HSS DRILL","kind":"hss","long":true,"dia":5,"holder":"ER32 collet","insert":"HSS jobber D5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS5.5', true, 270, '{"name":"5.5MM HSS DRILL","kind":"hss","long":true,"dia":5.5,"holder":"ER32 collet","insert":"HSS jobber D5.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS6', true, 280, '{"name":"6MM HSS DRILL","kind":"hss","long":true,"dia":6,"holder":"ER32 collet","insert":"HSS jobber D6","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS6.5', true, 290, '{"name":"6.5MM HSS DRILL","kind":"hss","long":true,"dia":6.5,"holder":"ER32 collet","insert":"HSS jobber D6.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS6.8', true, 300, '{"name":"6.8MM HSS DRILL","kind":"hss","long":true,"dia":6.8,"holder":"ER32 collet","insert":"HSS jobber D6.8","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS7', true, 310, '{"name":"7MM HSS DRILL","kind":"hss","long":true,"dia":7,"holder":"ER32 collet","insert":"HSS jobber D7","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS7.5', true, 320, '{"name":"7.5MM HSS DRILL","kind":"hss","long":true,"dia":7.5,"holder":"ER32 collet","insert":"HSS jobber D7.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS8', true, 330, '{"name":"8MM HSS DRILL","kind":"hss","long":true,"dia":8,"holder":"ER32 collet","insert":"HSS jobber D8","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS8.5', true, 340, '{"name":"8.5MM HSS DRILL","kind":"hss","long":true,"dia":8.5,"holder":"ER32 collet","insert":"HSS jobber D8.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS9', true, 350, '{"name":"9MM HSS DRILL","kind":"hss","long":true,"dia":9,"holder":"ER32 collet","insert":"HSS jobber D9","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS9.5', true, 360, '{"name":"9.5MM HSS DRILL","kind":"hss","long":true,"dia":9.5,"holder":"ER32 collet","insert":"HSS jobber D9.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS10', true, 370, '{"name":"10MM HSS DRILL","kind":"hss","long":true,"dia":10,"holder":"ER32 collet","insert":"HSS jobber D10","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS10.2', true, 380, '{"name":"10.2MM HSS DRILL","kind":"hss","long":true,"dia":10.2,"holder":"ER32 collet","insert":"HSS jobber D10.2","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS10.5', true, 390, '{"name":"10.5MM HSS DRILL","kind":"hss","long":true,"dia":10.5,"holder":"ER32 collet","insert":"HSS jobber D10.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS11', true, 400, '{"name":"11MM HSS DRILL","kind":"hss","long":true,"dia":11,"holder":"ER32 collet","insert":"HSS jobber D11","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS11.5', true, 410, '{"name":"11.5MM HSS DRILL","kind":"hss","long":true,"dia":11.5,"holder":"ER32 collet","insert":"HSS jobber D11.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS12', true, 420, '{"name":"12MM HSS DRILL","kind":"hss","long":true,"dia":12,"holder":"ER32 collet","insert":"HSS jobber D12","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS12.5', true, 430, '{"name":"12.5MM HSS DRILL","kind":"hss","long":true,"dia":12.5,"holder":"ER32 collet","insert":"HSS jobber D12.5","sheet":"HSS-DRILL","home_z":50}'::jsonb),
  ('HSS13', true, 440, '{"name":"13MM HSS DRILL","kind":"hss","long":true,"dia":13,"holder":"ER32 collet","insert":"HSS jobber D13","sheet":"HSS-DRILL","home_z":50}'::jsonb)
 ) as t(tool_key, owned, sort, data)
 where m.name = 'LEO 1600'
on conflict (machine_id, tool_key) do nothing;

select 'cnc tools' as step,
       case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cnc_tools')
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cnc_tools') = 4
             and exists (select 1 from pg_trigger where tgname = 'cnc_tools_bump_version')
             and (select count(*) from public.cnc_tools t join public.cnc_machines m on m.id = t.machine_id where m.name = 'LEO 1600') >= 44
             and exists (select 1 from public.cnc_machines where name = 'LEO 1600' and data ? 'turret_default')
            then 'ready - the LEO 1600 has 44 tools and its default turret'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
