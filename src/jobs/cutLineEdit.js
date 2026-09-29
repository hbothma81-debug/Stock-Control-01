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

import { DEFAULT_STOCK_M } from "./cutToSize.js";

const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

// Cutting has started on the line: it is locked.
export const cutHasStarted = (line) => Number(line?.qty_cut || 0) > 0;

// What the boxes hold: text, as boxes do.
export const blankDraft = () => ({
  drawingNo: "",
  section: "",
  grade: "",
  cutLengthMm: "",
  qty: "",
  stockLengthM: String(DEFAULT_STOCK_M),
  trimFront: true,
  note: "",
});

export function draftOfLine(line) {
  const text = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    drawingNo: text(line?.drawing_no),
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

// Every size once, A to Z with numbers read as numbers, each with its type
// as a hint: what the Section box offers.
export function sectionChoices(sections) {
  const seen = new Map();
  for (const s of sections || []) {
    const name = String(s?.name || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.set(name.toLowerCase(), { value: name, label: name, hint: String(s?.type || "").trim() });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
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

// Picking a section fills its material in where there is only one, and
// clears a material the new section is not held in.
export function draftWithSection(draft, sections, name) {
  const grades = gradesOfSection(sections, name);
  const kept = grades.find((g) => sameText(g, draft.grade));
  return { ...draft, section: name, grade: kept || (grades.length === 1 ? grades[0] : "") };
}

const wholeNumber = (v) => Number.isInteger(Number(v)) && String(v).trim() !== "";

// Reads the boxes. `was` is the line being changed, or nothing for a new
// line. Gives { ok: true, values } with the columns as the table holds
// them, or { ok: false, why } with words for the person.
export function checkCutDraft(draft, sections, was = null) {
  const typed = String(draft?.section || "").trim();
  if (!typed) return { ok: false, why: "Pick a section first." };
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
