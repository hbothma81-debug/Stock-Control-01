// Adding and changing a line on a job's cut list: the rules. No database
// and no screen in here, so they can be tested: npm test. The maths of the
// list itself (bars, offcuts) is cutToSize.js.
//
// Heinrich, 29 Sep 2026:
//   - A line already on the list is changed with a pencil, Save and
//     Cancel. Until then every line was a row of open boxes that saved on
//     the way out of each box, which nobody took for editable.
//   - Once a piece of a line has been cut, NOTHING on it may change, the
//     quantity included, and it cannot be removed. More of the same is a
//     new line.
//   - The section and its material are picked from Stock Manager's
//     Sections list, never typed: a section spelt its own way has no
//     weight, no price and matches no stock on the floor. A size that is
//     not on the list is made from its type's boxes (New size).
//   - A line saved before this rule keeps a section that is not on the
//     list for as long as its section is left alone.
//   - The section's TYPE and its SIZE are two boxes, never one ("section
//     type and size should not be the same pillbox"): the type first
//     (Pipe, Square Tube), then the material, then a size of that type,
//     in the order of the New stock item form. The first build had one
//     box over every size of every type, and a pipe was lost in it. The
//     type is for finding the size only: the line saves the size's name
//     and its material, as it always did.

import { DEFAULT_STOCK_M } from "./cutToSize.js";
import { SECTION_SHAPES, shapeForType } from "../manager/sectionShapes.js";

const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

// Cutting has started on the line: it is locked.
export const cutHasStarted = (line) => Number(line?.qty_cut || 0) > 0;

// What the boxes hold: text, as boxes do. `sectionType` is never saved.
export const blankDraft = () => ({
  drawingNo: "",
  sectionType: "",
  section: "",
  grade: "",
  cutLengthMm: "",
  qty: "",
  stockLengthM: String(DEFAULT_STOCK_M),
  trimFront: true,
  note: "",
});

export function draftOfLine(line, sections) {
  const text = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    drawingNo: text(line?.drawing_no),
    sectionType: typeOfSection(sections, line?.section),
    section: text(line?.section),
    grade: text(line?.grade),
    cutLengthMm: text(line?.cut_length_mm),
    qty: text(line?.qty),
    stockLengthM: text(line?.stock_length_m ?? DEFAULT_STOCK_M),
    trimFront: line?.trim_front !== false,
    note: text(line?.note),
  };
}

// The section as the list spells it, or null when it is not on the list.
export function sectionOnList(sections, name) {
  const hit = (sections || []).find((s) => sameText(s?.name, name) && String(s?.name || "").trim());
  return hit ? String(hit.name).trim() : null;
}

// Sizes filed under no type at all are found under this.
export const NO_TYPE = "No type";

// The type a Sections row files under: its shape's own word where its
// type is one of the fixed ones or an old word for one ("Seamless Pipe"
// is Pipe), else the row's own word, else NO_TYPE.
function typeOfRow(row) {
  const word = String(row?.type || "").trim();
  if (!word) return NO_TYPE;
  return shapeForType(word)?.label || word;
}

// The type of a size on the list, or "" for one that is not on it. A size
// has a row per material, and one of them may have lost its type: the
// first row that has one speaks for the size.
export function typeOfSection(sections, name) {
  const rows = (sections || []).filter((s) => String(s?.name || "").trim() && sameText(s?.name, name));
  if (rows.length === 0) return "";
  return typeOfRow(rows.find((r) => String(r?.type || "").trim()) || rows[0]);
}

// Every size on the list once, with its type and the materials it is held
// in: one pass over the list, however long it grows.
function sizesOnList(sections) {
  const sizes = new Map();
  for (const row of sections || []) {
    const name = String(row?.name || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!sizes.has(key)) sizes.set(key, { name, type: "", grades: [] });
    const size = sizes.get(key);
    if (!size.type && String(row?.type || "").trim()) size.type = typeOfRow(row);
    const grade = String(row?.grade || "").trim();
    if (grade && !size.grades.some((g) => sameText(g, grade))) size.grades.push(grade);
  }
  for (const size of sizes.values()) if (!size.type) size.type = NO_TYPE;
  return [...sizes.values()];
}

// What the Section type box offers: the fixed types in Stock Manager's
// order, then any other word a size on the list is filed under, then
// NO_TYPE where a size has none.
export function typeChoices(sections) {
  const out = SECTION_SHAPES.map((s) => ({ value: s.label, label: s.label, hint: s.key }));
  const seen = new Set(out.map((o) => o.value.toLowerCase()));
  const others = [];
  let untyped = false;
  for (const size of sizesOnList(sections)) {
    if (size.type === NO_TYPE) untyped = true;
    else if (!seen.has(size.type.toLowerCase())) {
      seen.add(size.type.toLowerCase());
      others.push(size.type);
    }
  }
  for (const type of others.sort(byName)) out.push({ value: type, label: type, hint: "" });
  if (untyped) out.push({ value: NO_TYPE, label: NO_TYPE, hint: "sizes filed under no type" });
  return out;
}

// What the Size box offers: the sizes of one type, each once, A to Z with
// numbers read as numbers. With a material picked, only the sizes held in
// it: a size in a material it is not held in is made with New size.
export function sizeChoices(sections, type, grade) {
  if (!String(type || "").trim()) return [];
  const material = String(grade || "").trim();
  return sizesOnList(sections)
    .filter((size) => sameText(size.type, type))
    .filter((size) => !material || size.grades.some((g) => sameText(g, material)))
    .map((size) => size.name)
    .sort(byName);
}

// What the Material box offers: Stock Manager's Material Types, each by
// the name the Sections list holds it under (its short name where it has
// one). Without them, the materials the list's sizes are held in.
export function materialChoices(materials, sections) {
  const out = [];
  const add = (name) => {
    const n = String(name || "").trim();
    if (n && !out.some((g) => sameText(g, n))) out.push(n);
  };
  for (const m of materials || []) add(m?.shortName || m?.name);
  if (out.length === 0) for (const s of sections || []) add(s?.grade);
  return out.sort(byName);
}

// The materials a size is held in, each once, in the list's order.
export function gradesOfSection(sections, name) {
  const out = [];
  for (const s of sections || []) {
    if (!sameText(s?.name, name)) continue;
    const grade = String(s?.grade || "").trim();
    if (grade && !out.some((g) => sameText(g, grade))) out.push(grade);
  }
  return out;
}

// A material under the name the Sections list holds it by. The list keeps
// a material by its short name where it has one ("MS"); a line saved
// before that may carry the long one ("Mild Steel"), which is the same
// steel and must not read as a stranger. `materials` is Stock Manager's
// Material Types: [{ name, shortName }]. Anything else comes back as it is.
export function materialAsListed(materials, sections, sectionName, grade) {
  const typed = String(grade || "").trim();
  if (!typed) return "";
  const held = gradesOfSection(sections, sectionName);
  const direct = held.find((g) => sameText(g, typed));
  if (direct) return direct;
  const material = (materials || []).find((m) => sameText(m?.name, typed) || sameText(m?.shortName, typed));
  if (!material) return typed;
  return held.find((g) => sameText(g, material.shortName) || sameText(g, material.name)) || typed;
}

// Another type: its sizes are other sizes, so the size goes. The material
// stays, it is the same steel.
export function draftWithType(draft, type) {
  if (sameText(draft?.sectionType, type)) return { ...draft, sectionType: type };
  return { ...draft, sectionType: type, section: "" };
}

// Another material: the size stays where it is held in that material too,
// and goes where it is not (the Size box then lists the ones that are).
// A size from before the rule, not on the list at all, is left alone.
export function draftWithMaterial(draft, sections, grade) {
  const size = String(draft?.section || "").trim();
  const keeps =
    !size ||
    !String(grade || "").trim() ||
    !sectionOnList(sections, size) ||
    gradesOfSection(sections, size).some((g) => sameText(g, grade));
  return { ...draft, grade, section: keeps ? draft.section : "" };
}

// Picking a size fills its material in where there is only one, clears a
// material the size is not held in, and sets the type where none was.
export function draftWithSection(draft, sections, name) {
  const grades = gradesOfSection(sections, name);
  const kept = grades.find((g) => sameText(g, draft.grade));
  return {
    ...draft,
    sectionType: draft?.sectionType || typeOfSection(sections, name),
    section: name,
    grade: kept || (grades.length === 1 ? grades[0] : ""),
  };
}

const wholeNumber = (v) => Number.isInteger(Number(v)) && String(v).trim() !== "";

// Reads the boxes. `was` is the line being changed, or nothing for a new
// line. Gives { ok: true, values } with the columns as the table holds
// them, or { ok: false, why } with words for the person.
export function checkCutDraft(draft, sections, was = null) {
  const typed = String(draft?.section || "").trim();
  if (!typed) {
    return { ok: false, why: String(draft?.sectionType || "").trim() ? "Pick the size." : "Pick the section type, then the size." };
  }
  const keepsSection = !!was && sameText(was.section, typed);
  const listed = sectionOnList(sections, typed);
  if (!listed && !keepsSection) {
    return { ok: false, why: `${typed} is not on the Sections list. Pick one from the list, or make it with New size.` };
  }
  const section = listed || String(was.section).trim();

  const grades = listed ? gradesOfSection(sections, listed) : [];
  const typedGrade = String(draft?.grade || "").trim();
  const keepsGrade = keepsSection && sameText(was.grade, typedGrade);
  let grade = typedGrade;
  if (!keepsGrade) {
    if (grades.length > 0) {
      const hit = grades.find((g) => sameText(g, typedGrade));
      if (!hit) return { ok: false, why: `Pick the material for ${section}: ${grades.join(", ")}.` };
      grade = hit;
    } else if (typedGrade) {
      return { ok: false, why: `${section} is on the Sections list with no material, so none can be picked for it here.` };
    }
  }

  if (!(Number(draft?.cutLengthMm) > 0)) return { ok: false, why: "Give the cut length, in millimetres." };
  if (!(Number(draft?.qty) > 0) || !wholeNumber(draft?.qty)) return { ok: false, why: "How many? A whole number of pieces." };
  if (!(Number(draft?.stockLengthM) > 0)) return { ok: false, why: "Give the stock length, in metres." };

  return {
    ok: true,
    values: {
      drawing_no: String(draft?.drawingNo || "").trim(),
      section,
      grade,
      cut_length_mm: Number(draft.cutLengthMm),
      qty: Number(draft.qty),
      stock_length_m: Number(draft.stockLengthM),
      trim_front: !!draft?.trimFront,
      note: String(draft?.note || "").trim(),
    },
  };
}

const NUMBERS = ["cut_length_mm", "qty", "stock_length_m"];
const shown = (v) => (String(v ?? "").trim() === "" ? "nothing" : String(v).trim());

// What a save would change on a line: the columns, and the same in words
// for the job's History. Nothing changed gives an empty patch.
export function cutLineChanges(line, values) {
  const patch = {};
  const words = [];
  const say = {
    drawing_no: (a, b) => `drawing no ${shown(a)} to ${shown(b)}`,
    section: (a, b) => `section ${shown(a)} to ${shown(b)}`,
    grade: (a, b) => `material ${shown(a)} to ${shown(b)}`,
    cut_length_mm: (a, b) => `cut length ${Number(a)} to ${Number(b)} mm`,
    qty: (a, b) => `quantity ${Number(a)} to ${Number(b)}`,
    stock_length_m: (a, b) => `stock length ${Number(a)} to ${Number(b)} m`,
    note: (a, b) => `note ${shown(a)} to ${shown(b)}`,
  };
  for (const field of Object.keys(say)) {
    if (!(field in values)) continue;
    const before = line?.[field];
    const after = values[field];
    const same = NUMBERS.includes(field) ? Number(before) === Number(after) : String(before ?? "").trim() === String(after ?? "").trim();
    if (same) continue;
    patch[field] = after;
    words.push(say[field](before, after));
  }
  if ("trim_front" in values && (line?.trim_front !== false) !== !!values.trim_front) {
    patch.trim_front = !!values.trim_front;
    words.push(values.trim_front ? "front trim on" : "front trim off");
  }
  return { patch, words };
}

// Does the change move the line to another pile of bars? Bars set aside
// for the old pile stay set aside: the person is told.
export const changesMaterial = (patch) => ["section", "grade", "stock_length_m"].some((f) => f in (patch || {}));

// Another line on the job still draws on the pile this line was on.
export function pileStillUsed(lines, line) {
  return (lines || []).some(
    (l) =>
      l.id !== line.id &&
      sameText(l.section, line.section) &&
      sameText(l.grade, line.grade) &&
      Number(l.stock_length_m) === Number(line.stock_length_m)
  );
}
