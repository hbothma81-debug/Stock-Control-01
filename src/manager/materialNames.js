// A material's two names, and what changing the short one does. No
// database and no screen in here, so it can be tested: npm test.
//
// The rule (Heinrich, 16 Sep 2026): a material is STORED by its short
// name where Stock Manager's Material Types list gives it one (SS304,
// Galv), otherwise by its full name. Every picker offers the stored name.
//
// Changing a short name therefore changes what is written on every stock
// line, section, requisition, cut line, laser program and job line of that
// material. That is done in the database, all of it or none of it:
// set_material_short_name in setup-material-short-name.sql, whose list of
// places (material_places) is the one copy. PLACES below only puts words
// to those places for the person: a place added there is added here.
// Until 29 Sep 2026 the box changed the list's own row and nothing else,
// so everything still saying the old name stopped matching.
//
// Paper that leaves the building prints the FULL name (his answer, 29 Sep
// 2026): a purchase order says "Mild Steel", whatever the screens call it.

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const clean = (v) => String(v ?? "").trim();

// The name a material is stored and shown by.
export const storedName = (material) => clean(material?.shortName) || clean(material?.name);

// The material a piece of text names, by either of its names.
export function materialNamed(materials, text) {
  const t = clean(text);
  if (!t) return null;
  return (materials || []).find((m) => same(m?.name, t) || (clean(m?.shortName) && same(m.shortName, t))) || null;
}

// For paper going out: the full name of what is stored. Text that names
// no material on the list comes back as it is.
export function fullNameOf(materials, text) {
  const m = materialNamed(materials, text);
  return m ? clean(m.name) : clean(text);
}

// A line that starts with its material, as a requisition's label does
// ("MS — SHS 50x50x3"), with the material in full: "Mild Steel — SHS
// 50x50x3". Anything else comes back as it is.
const DASH = " — ";
export function withFullMaterial(materials, text) {
  const t = String(text ?? "");
  const at = t.indexOf(DASH);
  if (at <= 0) return t;
  const m = materialNamed(materials, t.slice(0, at));
  return m ? clean(m.name) + t.slice(at) : t;
}

// Why a short name cannot be given, in words, or nothing when it can.
// Mirrors the refusals of set_material_short_name: change both.
export function shortNameRefusal(materials, name, short) {
  const material = (materials || []).find((m) => same(m?.name, name));
  if (!material) return `There is no material called "${clean(name)}" on the Material Types list.`;
  const next = clean(short) || clean(material.name);
  const taken = (materials || []).find((m) => m !== material && (same(m?.name, next) || (clean(m?.shortName) && same(m.shortName, next))));
  if (taken) return `"${next}" is already the name or the short name of ${clean(taken.name)}. Two materials cannot be written the same way.`;
  if (next.includes(DASH.trim())) return "A short name cannot have a long dash in it: the dash is what separates a material from its size.";
  return null;
}

// Whether the box changed anything at all.
export const shortNameChanged = (material, short) => clean(short) !== clean(material?.shortName);

// What the person is asked before anything is changed.
export function renameQuestion(material, short) {
  const was = storedName(material);
  const now = clean(short) || clean(material?.name);
  const full = clean(material?.name);
  return (
    `Write ${full} as "${now}" everywhere?\n\n` +
    `Every stock line, section, requisition, cut list line, laser program and job line that says "${was}" will say "${now}". ` +
    `All of it changes together, or none of it.\n\n` +
    `Not changed: CNC bar and fasteners, purchase orders already raised, documents already printed. ` +
    `New purchase orders go on printing "${full}" in full.\n\n` +
    `Do this when the floor has stopped. Every other tablet and computer must reload the app afterwards: one left open can write "${was}" back.`
  );
}

// The places, in the words of the screen. Keys are material_places()'s
// own: table.column.
const PLACES = [
  ["stock_items.grade", "stock line"],
  ["master_factor_items.grade", "section"],
  ["requisitions.item_grade", "requisition"],
  ["job_cut_items.grade", "cut list line"],
  ["laser_programs.material", "laser program"],
  ["job_quote_items.material_type", "tube job line"],
  ["tube_section_aliases.section_name", "tube import name"],
  ["quote_parts.grade", "quote part"],
  ["bom_parts.grade", "BOM part"],
];
// Counted under another place already: a requisition's label goes with
// its material, a quote part's second column with its first.
const COUNTED_ELSEWHERE = ["requisitions.item_label", "quote_parts.material"];

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// What was done, from the database's own answer.
export function renameSummary(result) {
  const changed = result?.changed || {};
  const parts = PLACES.filter(([key]) => Number(changed[key]) > 0).map(([key, word]) => plural(Number(changed[key]), word));
  for (const [key, n] of Object.entries(changed)) {
    if (Number(n) > 0 && !PLACES.some(([k]) => k === key) && !COUNTED_ELSEWHERE.includes(key)) parts.push(`${n} in ${key}`);
  }
  const head = `${clean(result?.material)} is now written "${clean(result?.now)}".`;
  if (parts.length === 0) return `${head} Nothing else held the old name.`;
  return `${head} Changed: ${parts.join(", ")}.`;
}

// ---- Rows written another way than the list holds the material ----
//
// Found on live, 29 Sep 2026: Mild Steel's row already read short name
// "MS", typed into the old box, which changed the list's row and nothing
// else. Hundreds of rows still said "Mild Steel" while new ones were
// written "MS", and the box could not mend it: "MS" over "MS" is no change.
// So the database counts such rows (material_rows_out_of_line,
// setup-material-out-of-line.sql: the rename's own rule for "this row is
// that material"), the material's row says so to an admin, and "Bring in
// line" hands set_material_short_name the short name the list already has.

// The database's answer, a row per material and place, as one entry per
// material: { total, parts: ["77 stock lines", ...] }. A requisition's
// label is counted with its material, not twice.
export function outOfLineByMaterial(rows) {
  const found = new Map();
  for (const r of rows || []) {
    const n = Number(r?.rows_out);
    const name = clean(r?.material).toLowerCase();
    if (!name || !(n > 0) || COUNTED_ELSEWHERE.includes(r.place)) continue;
    const held = found.get(name) || { total: 0, counts: {} };
    held.total += n;
    held.counts[r.place] = (held.counts[r.place] || 0) + n;
    found.set(name, held);
  }
  for (const held of found.values()) {
    held.parts = PLACES.filter(([key]) => held.counts[key] > 0).map(([key, word]) => plural(held.counts[key], word));
    for (const [key, n] of Object.entries(held.counts)) if (!PLACES.some(([k]) => k === key)) held.parts.push(`${n} in ${key}`);
  }
  return found;
}

// What one material's row is out of line by, or nothing.
export const outOfLineFor = (byMaterial, material) => byMaterial?.get(clean(material?.name).toLowerCase()) || null;

// The line on the material's row.
export function outOfLineWords(material, held) {
  return `${plural(held.total, "row")} ${held.total === 1 ? "is" : "are"} not written "${storedName(material)}": ${held.parts.join(", ")}.`;
}

// What the person is asked before the rows are brought in line.
export function bringInLineQuestion(material, held) {
  const now = storedName(material);
  const full = clean(material?.name);
  return (
    `Write every row of ${full} as "${now}"?\n\n` +
    `${held.parts.join(", ")} ${held.total === 1 ? "is" : "are"} written another way and will say "${now}". ` +
    `All of it changes together, or none of it.\n\n` +
    `Not changed: CNC bar and fasteners, purchase orders already raised, documents already printed.\n\n` +
    `Do this when the floor has stopped. Every other tablet and computer must reload the app afterwards: one left open can write the old name back.`
  );
}

// What the person is told when the database says no. `hint` is the tag
// the function raises with; a database that has no such function answers
// PGRST202.
export function renameRefusalWords(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  if (error?.code === "PGRST202" || /could not find the function/i.test(text)) {
    return "The database has not been updated for changing a short name yet (setup-material-short-name.sql). Nothing was changed.";
  }
  if (error?.hint === "material_rows_refused") {
    return `${clean(error.message)}\n\nThe database did not let this login change every place the material is written. Nothing was changed. An admin has to do this.`;
  }
  if (["material_name_taken", "material_not_found", "material_not_allowed"].includes(error?.hint)) {
    return `${clean(error.message)} Nothing was changed.`;
  }
  return "The short name could not be changed: check your connection and try again. Nothing was changed.";
}
