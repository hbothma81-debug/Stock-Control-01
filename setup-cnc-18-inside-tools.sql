-- The inside tools and thread insert packs on the CNC tab's Tools list (Heinrich 17 Oct 2026: "5 start").
-- Until now the engine used its own built-in copies (turnpath data/tools_seed.json): internal grooving
-- (GEPI2), internal threading (16IR, 11IR BSPT), the tap holder, and the UN / W insert packs (qty 0, tpi_owned empty).
-- Copied from that list exactly. Paste AFTER engine 6941026 (inch threads) is live: it knows the insert packs.
-- Safe to run twice: a tool already on the list is never changed (so edits made on the Tools screen stay).
-- Practice first, then live. The version trigger makes the engine re-read its tools.
insert into public.cnc_tools (machine_id, tool_key, owned, sort, data)
select m.id, v.tool_key, v.owned, v.sort, v.data::jsonb
from public.cnc_machines m
cross join (values
  ('GEPI2', true, 75, '{"name":"ID GROOVE 2MM GEPI","kind":"idgroove","long":true,"dia":16.0,"nose":0.1,"holder":"GEHIR 16-14-2-T2.6","insert":"GEPI 2.00-0.10 IC908","width":2.0,"cdx":2.6,"min_bore":16.0,"op":"ID groove 2 mm","home_z":80.0}'),
  ('THREAD_ID16', true, 76, '{"name":"INT THREAD 16IR","kind":"thread_id","long":true,"dia":13.0,"holder":"SIR 0013 M16","insert":"16IR ISO IC908","pitches_owned":[1.0,1.25,1.5,1.75,2.0],"min_bore":16.0,"reach":39.0,"home_z":80.0}'),
  ('THREAD_ID11', true, 77, '{"name":"INT THREAD 11IR BSPT","kind":"thread_id","long":true,"dia":10.0,"holder":"SIR 0010 K11","insert":"11IR BSPT IC908","tpi_owned":[14,19],"min_bore":13.0,"reach":30.0,"home_z":80.0}'),
  ('TAP', true, 78, '{"name":"TAP","kind":"tap","long":true,"dia":20.0,"holder":"ST 20X50 ER32 collet chuck","home_z":80.0}'),
  ('INSERT_UN_EXT', false, 90, '{"name":"INSERTS 16ER UN (60 DEG)","kind":"thread_insert","long":false,"form":"UN","ext":true,"holder":"SER 2525 M16","insert":"16ER n UN IC908","tpi_range":[28,24,20,18,16,14,13,12,11,10,9,8,7,6,5,4.5],"tpi_owned":[]}'),
  ('INSERT_UN_INT', false, 91, '{"name":"INSERTS 16IR UN (60 DEG)","kind":"thread_insert","long":false,"form":"UN","ext":false,"holder":"SIR 0013 M16","insert":"16IR n UN IC908","tpi_range":[28,24,20,18,16,14,13,12,11,10,9,8,7,6,5,4.5],"tpi_owned":[]}'),
  ('INSERT_W_EXT', false, 92, '{"name":"INSERTS 16ER W (55 DEG BSW / BSPP)","kind":"thread_insert","long":false,"form":"W","ext":true,"holder":"SER 2525 M16","insert":"16ER n W IC908","tpi_range":[28,20,19,18,16,14,12,11,10,9,8,7,6,5,4.5],"tpi_owned":[]}'),
  ('INSERT_W_INT', false, 93, '{"name":"INSERTS 16IR W (55 DEG BSW / BSPP)","kind":"thread_insert","long":false,"form":"W","ext":false,"holder":"SIR 0013 M16","insert":"16IR n W IC908","tpi_range":[28,20,19,18,16,14,12,11,10,9,8,7,6,5,4.5],"tpi_owned":[]}')
) as v(tool_key, owned, sort, data)
where m.name = 'LEO 1600'
on conflict (machine_id, tool_key) do nothing;

select t.tool_key, t.owned, t.data->>'kind' as kind, t.data->>'name' as name
from public.cnc_tools t join public.cnc_machines m on m.id = t.machine_id
where m.name = 'LEO 1600' and t.data->>'kind' in ('idgroove', 'thread_id', 'tap', 'thread_insert')
order by t.sort;
