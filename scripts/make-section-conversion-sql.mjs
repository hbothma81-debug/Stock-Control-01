// Writes setup-section-names.sql (sections step 5) from the approved
// conversion list, docs/SECTION-CONVERSION-LIST.md, as answered by
// Heinrich on 16-17 Sep 2026.
//
// The new names and numbers come from src/manager/sectionShapes.js, the
// same code the Stock Manager boxes use, so the converted rows and the
// ones added later can never be spelled two ways.
//
//   node scripts/make-section-conversion-sql.mjs

import { writeFileSync } from "fs";
import { SECTION_SHAPES, buildSection } from "../src/manager/sectionShapes.js";

// old names (any capitals) -> the shape and what goes in its boxes
const LIST = [
  // Square tube
  [["SHS 25X25X1.9"], "SHS", { a: 25, t: 1.9 }],
  [["SHS 30x30x3mm"], "SHS", { a: 30, t: 3 }],
  [["SHS 32x32x2mm"], "SHS", { a: 32, t: 2 }],
  [["SHS 32x32x3mm"], "SHS", { a: 32, t: 3 }],
  [["SHS 38.1x38.1x1.6", "38.10*1.60*3250mm", "38.10*1.60*3300mm"], "SHS", { a: 38.1, t: 1.6 }],
  [["SHS 38.1x38.1x2mm"], "SHS", { a: 38.1, t: 2 }],
  [["SHS 40x40x3mm"], "SHS", { a: 40, t: 3 }],
  [["50x50x1.5", "SHS 50x50x1.5mm"], "SHS", { a: 50, t: 1.5 }],
  [["50x50x2", "SHS 50x50x2mm"], "SHS", { a: 50, t: 2 }],
  [["SHS 50x50x3mm"], "SHS", { a: 50, t: 3 }],
  [["SHS 76x76x2mm", "SHS 76.2x76.2x2mm"], "SHS", { a: 76.2, t: 2 }],
  [["SHS 100x100x2mm"], "SHS", { a: 100, t: 2 }],
  // Rectangular tube
  [["RHS 50x25x2mm"], "RHS", { a: 50, b: 25, t: 2 }],
  [["RHS 60x30x3mm"], "RHS", { a: 60, b: 30, t: 3 }],
  [["RHS 76x38x1.9mm"], "RHS", { a: 76.2, b: 38.1, t: 1.9 }],
  [["RHS 76x50x1.9mm", "76X50X1.9mm"], "RHS", { a: 76.2, b: 50.8, t: 1.9 }],
  [["RHS 76.2x50.8x2mm"], "RHS", { a: 76.2, b: 50.8, t: 2 }],
  [["RHS 76x50x4.5mm"], "RHS", { a: 76.2, b: 50.8, t: 4.5 }],
  [["RHS 80x40x3.6mm"], "RHS", { a: 80, b: 40, t: 3.6 }],
  [["100x50x2", "RHS 100x50x2mm"], "RHS", { a: 100, b: 50, t: 2 }],
  [["RHS 150x50x2mm"], "RHS", { a: 150, b: 50, t: 2 }],
  // Round tube
  [["Round Tube 19mm x 2mm wall"], "CHS", { od: 19.05, t: 2 }],
  [["Round Tube 19.05mm x 1.5mm wall"], "CHS", { od: 19.05, t: 1.5 }],
  [["Round Tube 22.2mm x 1.2mm wall"], "CHS", { od: 22.2, t: 1.2 }],
  [["Round Tube 25mm x 2mm wall"], "CHS", { od: 25, t: 2 }],
  [["Round Tube 34mm x1.5mm wall"], "CHS", { od: 34, t: 1.5 }],
  [["Round Tube 38.1mm X 1.2mm wall"], "CHS", { od: 38.1, t: 1.2 }],
  [["Round Tube 38.1mm x 1.5mm wall"], "CHS", { od: 38.1, t: 1.5 }],
  [["Round Tube 38.1mm x 1.6mm wall"], "CHS", { od: 38.1, t: 1.6 }],
  [["Round Tube 38.1mm x 2mm wall"], "CHS", { od: 38.1, t: 2 }],
  [["Round Tube 38.1mm x 3.18mm wall"], "CHS", { od: 38.1, t: 3.18 }],
  [["Round Tube 41.27mm x 1.2mm wall"], "CHS", { od: 41.27, t: 1.2 }],
  [["Round Tube 42mm x1.5mm wall"], "CHS", { od: 42, t: 1.5 }],
  [["Round Tube 48.4 X 3.5mm wall", "48.4x3.5"], "CHS", { od: 48.4, t: 3.5 }],
  [["GRIT ROUND TUBE 50.8mm x 1.2mm"], "CHS", { od: 50.8, t: 1.2 }],
  [["Round Tube 57mm x 1.5mm wall"], "CHS", { od: 57, t: 1.5 }],
  [["Round Tube 57mm x 1.9mm wall"], "CHS", { od: 57, t: 1.9 }],
  [["Round Tube 63.5mm x 4mm wall"], "CHS", { od: 63.5, t: 4 }],
  [["Round Tube 76.2mm x 2mm wall"], "CHS", { od: 76.2, t: 2 }],
  [["88.9 X 2.5mm", "Round Tube 88.9 X 2.5mm wall"], "CHS", { od: 88.9, t: 2.5 }],
  [["Round Tube 88.9mm x 2mm wall"], "CHS", { od: 88.9, t: 2 }],
  [["Round Tube 152mm x 3mm wall"], "CHS", { od: 152, t: 3 }],
  // Round bar
  ...[5, 6, 8, 10, 12, 16, 20, 30].map((n) => [[`Round Bar ${n}mm`], "RB", { a: n }]),
  // Equal angle
  [["Equal Angle 40x40x3mm"], "EA", { a: 40, t: 3 }],
  [["Equal Angle 50x50x5mm"], "EA", { a: 50, t: 5 }],
  [["Equal Angle 80x80x6mm"], "EA", { a: 80, t: 6 }],
  [["Equal Angle 100x100x8mm"], "EA", { a: 100, t: 8 }],
  // Beams
  [["152x152x37"], "UC", { a: 152, b: 152, kgm: 37 }],
  [["203x203x46"], "UC", { a: 203, b: 203, kgm: 46 }],
  [["254x146x37KG", "254x146x37"], "UB", { a: 254, b: 146, kgm: 37 }],
  [["406x178x54"], "UB", { a: 406, b: 178, kgm: 54 }],
  [["406x178x60"], "UB", { a: 406, b: 178, kgm: 60 }],
  // Pipe
  [["Seamless Pipe NB20 SCH160 26.7 x 5.56", "Seamless Pipe NB20 SCH160 (26.7 x 5.56mm)"], "PIPE", { std: "SCH", sch: "160", nb: 20 }],
  [["Seamless Pipe NB25 SCH40 (33.4x4.55mm)"], "PIPE", { std: "SCH", sch: "80", nb: 25 }],
  [["Seamless Pipe NB40 SCH80 (48.26x5.08mm)"], "PIPE", { std: "SCH", sch: "80", nb: 40 }],
  [["Welded Pipe NB15 Medium (21.7x2.3mm)"], "PIPE", { std: "SANS62", cls: "Medium", nb: 15 }],
  // Channels
  [["80x42x6 Channel BPW"], "CC", { a: 80, b: 42, t: 6 }],
  [["120x55"], "CH", { a: 120, b: 55 }],
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = [];
const seen = new Set();
for (const [olds, key, boxes] of LIST) {
  const shape = SECTION_SHAPES.find((s) => s.key === key);
  const built = buildSection(shape, boxes);
  if (!built) throw new Error(`Cannot build ${key} ${JSON.stringify(boxes)}`);
  for (const old of olds) {
    if (seen.has(old.toLowerCase())) throw new Error(`Listed twice: ${old}`);
    seen.add(old.toLowerCase());
    rows.push(`  (${q(old)}, ${q(built.name)}, ${q(shape.label)}, ${q(JSON.stringify(built.dimensions))}::jsonb)`);
  }
}

// Pastes stay under about 40 lines.
const chunks = [];
for (let i = 0; i < rows.length; i += 34) chunks.push(rows.slice(i, i + 34));

const labelArray = SECTION_SHAPES.map((s) => q(s.label)).join(", ");

let out = `-- Sections step 5: every existing section converted to the new names.
--
-- GENERATED by scripts/make-section-conversion-sql.mjs from the list
-- Heinrich approved (docs/SECTION-CONVERSION-LIST.md, 16-17 Sep 2026).
-- Do not edit by hand: change the script and run it again.
--
-- Renames each section in Stock Manager and every copy of its name:
-- structural stock lines, requisitions (name and label), cut lists,
-- quote and BOM parts, reservations, the usage log, tube section aliases,
-- laser programs and tube job lines (these three start with the section,
-- then the material). Fills in each section's type and numbers, merges
-- the rows that become one (keeping the larger kg/m and R/m), deletes the
-- cut-off "Round Tube 42mm x 1.", adds CH 120x55, and sets the Section
-- Types list to the fixed 18. Old purchase orders are history: untouched.
--
-- Safe to run twice: a second run finds no old names left.
-- Paste each PART on its own, in order: practice first, then live.
-- Best run when nobody has Stock Manager open; refresh the app afterwards.
`;

chunks.forEach((chunk, i) => {
  out += `
-- ============ PART ${i + 1} ============
${i === 0 ? "create table if not exists public.section_rename_map (old text primary key, new text not null, type text not null, dims jsonb not null);\n-- No rules: the app never reads it, only this SQL (run as the owner) does.\nalter table public.section_rename_map enable row level security;\n\n" : ""}insert into public.section_rename_map (old, new, type, dims) values
${chunk.join(",\n")}
on conflict (old) do update set new = excluded.new, type = excluded.type, dims = excluded.dims;
`;
});

const p = chunks.length;
out += `
-- ============ PART ${p + 1} ============
-- The two 38.1 stock lines carried their length in the name.
update public.stock_items set length = 3.25 where main_cat = 'structural' and lower(trim(name)) = '38.10*1.60*3250mm' and coalesce(length, 0) = 0;
update public.stock_items set length = 3.3 where main_cat = 'structural' and lower(trim(name)) = '38.10*1.60*3300mm' and coalesce(length, 0) = 0;

delete from public.master_factor_items where list_name = 'sections' and trim(name) = 'Round Tube 42mm x 1.';

update public.master_factor_items f set name = m.new, type = m.type, dimensions = m.dims
from public.section_rename_map m
where f.list_name = 'sections' and lower(trim(f.name)) = lower(m.old);

insert into public.master_factor_items (id, list_name, name, factor, price, type, grade, dimensions)
select 'sec-' || md5(m.new), 'sections', m.new, 0, 0, m.type, '', m.dims
from (select distinct new, type, dims from public.section_rename_map where new = 'CH 120x55') m
where not exists (select 1 from public.master_factor_items f where f.list_name = 'sections' and f.name = m.new);

-- Rows that became the same size in the same material: keep one.
with ranked as (
  select id,
    row_number() over w as rn,
    max(factor) over (partition by lower(name), lower(coalesce(grade, ''))) as best_factor,
    max(price) over (partition by lower(name), lower(coalesce(grade, ''))) as best_price
  from public.master_factor_items
  where list_name = 'sections'
  window w as (partition by lower(name), lower(coalesce(grade, '')) order by (price > 0) desc, (factor > 0) desc, id)
)
update public.master_factor_items f set factor = r.best_factor, price = r.best_price
from ranked r where f.id = r.id and r.rn = 1 and (f.factor <> r.best_factor or f.price <> r.best_price);

delete from public.master_factor_items f
using (
  select id, row_number() over (partition by lower(name), lower(coalesce(grade, '')) order by (price > 0) desc, (factor > 0) desc, id) as rn
  from public.master_factor_items where list_name = 'sections'
) r
where f.id = r.id and r.rn > 1;

-- ============ PART ${p + 2} ============
update public.stock_items s set name = m.new from public.section_rename_map m
  where s.main_cat = 'structural' and lower(trim(s.name)) = lower(m.old);
update public.requisitions r set item_raw_name = m.new from public.section_rename_map m
  where r.main_cat = 'structural' and lower(trim(r.item_raw_name)) = lower(m.old);
update public.requisitions r set item_label = left(r.item_label, length(r.item_label) - length(m.old)) || m.new
  from public.section_rename_map m
  where r.main_cat = 'structural' and lower(r.item_label) like '% — ' || lower(m.old);
update public.job_cut_items c set section = m.new from public.section_rename_map m where lower(trim(c.section)) = lower(m.old);
update public.quote_parts p set section = m.new from public.section_rename_map m where lower(trim(p.section)) = lower(m.old);
update public.bom_parts b set section = m.new from public.section_rename_map m where lower(trim(b.section)) = lower(m.old);
update public.job_allocations a set item_name = m.new from public.section_rename_map m
  where a.main_cat = 'structural' and lower(trim(a.item_name)) = lower(m.old);
update public.usage_log u set item_name = m.new from public.section_rename_map m
  where u.main_cat = 'structural' and lower(trim(u.item_name)) = lower(m.old);

-- Section, then material: "SHS 50x50x2mm SS304" -> "SHS 50x50x2 SS304".
update public.tube_section_aliases t set section_name = m.new || substr(trim(t.section_name), length(m.old) + 1)
  from public.section_rename_map m
  where lower(trim(t.section_name)) = lower(m.old) or lower(trim(t.section_name)) like lower(m.old) || ' %';
update public.laser_programs l set material = m.new || substr(trim(l.material), length(m.old) + 1)
  from public.section_rename_map m where lower(trim(l.material)) like lower(m.old) || ' %';
update public.job_quote_items j set material_type = m.new || substr(trim(j.material_type), length(m.old) + 1)
  from public.section_rename_map m where lower(trim(j.material_type)) like lower(m.old) || ' %';

-- ============ PART ${p + 3} ============
-- The Section Types list becomes the fixed ${SECTION_SHAPES.length}, in their order.
do $do$
declare
  labels text[] := array[${labelArray}];
  i int;
begin
  delete from public.master_string_lists where list_name = 'sectionTypes' and value <> all (labels);
  for i in 1 .. array_length(labels, 1) loop
    insert into public.master_string_lists (id, list_name, value, sort_order)
    select 'st-' || md5(labels[i]), 'sectionTypes', labels[i], i
    where not exists (select 1 from public.master_string_lists where list_name = 'sectionTypes' and value = labels[i]);
    update public.master_string_lists set sort_order = i where list_name = 'sectionTypes' and value = labels[i];
  end loop;
end $do$;
`;

writeFileSync(new URL("../setup-section-names.sql", import.meta.url), out);
console.log(`Wrote setup-section-names.sql: ${rows.length} old names, ${chunks.length + 3} parts.`);
