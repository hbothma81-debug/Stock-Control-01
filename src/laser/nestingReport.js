// Reads the tube nesting software's spreadsheet export into what the
// Tube Laser tab needs to make programs.
//
// The export comes in two flavours, "simple" (Part Info, Tube Info,
// Nesting List) and "detailed" (those plus Nesting Summary and Time
// Estimates). Both carry the Nesting List sheet, and that is the only one
// read here. Its shape, as rows of cells:
//
//   Nesting List
//          | Section:Round tube R19.05mm | Tube Count:25 | Part Count:150
//   Nesting Name | Qty | Parts per tube | Tube Length(mm) | ...
//   Round tube R19.05mm_Nest 1 | 8 | 6 | 6010.00 | ...
//   ID | Part Name | Qty | Identical parts per tube | Part Length(mm)
//   2  | SSD-7-HOLE-POST THRU | 6 | 6 | 1000.00
//   Round tube R19.05mm_Nest 2 | 1 | 6 | ...
//   ...
//          | Section:Square tube Width50.8mm X R3mm | Tube Count:5 | ...
//
// A program is one section: its tube count is the lengths to cut, and its
// nests are kept for the operator's notes. The file name is the job's
// reference and becomes the nesting name.
//
// Pure: takes the sheet's rows as arrays of cells, returns plain objects,
// throws a plain-English Error when the sheet is not what it should be.
// No spreadsheet library in here, so it can be tested in a second.

export const NESTING_LIST_SHEET = "Nesting List";
export const PART_INFO_SHEET = "Part Info";

const text = (c) => (c == null ? "" : String(c).trim());
const num = (c) => {
  const n = Number(text(c));
  return Number.isFinite(n) ? n : null;
};

// "Section:Round tube R19.05mm" -> "Round tube R19.05mm"; null if the
// cell is not a section header.
function sectionOf(cell) {
  const m = /^Section:\s*(.+)$/i.exec(text(cell));
  return m ? m[1].trim() : null;
}

// "Tube Count:25" -> 25; null if absent.
function tubeCountOf(cell) {
  const m = /^Tube Count:\s*(\d+)/i.exec(text(cell));
  return m ? Number(m[1]) : null;
}

// Finds a sheet by name, tolerant of the double space the software
// puts in "Nesting  Summary" and of case.
export function findSheet(sheetNames, name) {
  const want = String(name).replace(/\s+/g, "").toLowerCase();
  return (sheetNames || []).find((n) => String(n).replace(/\s+/g, "").toLowerCase() === want) || null;
}
export function findNestingListSheet(sheetNames) {
  return findSheet(sheetNames, NESTING_LIST_SHEET);
}

// The Part Info sheet: every part on the report with its total quantity
// and its length, grouped by section. This is what goes on the job as
// the parts under the parent line.
//
//   Part Info
//          | Section:Round tube R19.05mm | Part Type:2 | Part Count:150
//   ID | Part Name | Qty | Part Length(mm) | Contour Qty | ...
//   1  | SSD-5-HOLE-POST THRU | 100/100 | 1000.00 | ...
//
// Qty reads "100/100": nested of required. The second is what the job
// needs; the first is how many the software placed, and a report where
// they differ is refused rather than guessed at.
export function parsePartInfo(rows) {
  const sections = [];
  let section = null;
  let inParts = false;
  for (const raw of rows || []) {
    const r = Array.isArray(raw) ? raw : [];
    const a = text(r[0]);
    const b = text(r[1]);
    const secName = sectionOf(b) || (a && sectionOf(a));
    if (secName) {
      const count = r.map((c) => {
        const m = /^Part Count:\s*(\d+)/i.exec(text(c));
        return m ? Number(m[1]) : null;
      }).find((n) => n != null);
      section = { reportSection: secName, partCount: count ?? null, parts: [] };
      sections.push(section);
      inParts = false;
      continue;
    }
    if (!section) continue;
    if (/^ID$/i.test(a) && /^Part Name$/i.test(b)) {
      inParts = true;
      continue;
    }
    if (inParts && b && num(a) != null) {
      const q = text(r[2]);
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(q);
      const placed = m ? Number(m[1]) : num(q);
      const needed = m ? Number(m[2]) : num(q);
      if (needed == null) continue;
      if (placed !== needed) {
        throw new Error(`"${b}" is ${placed} of ${needed} nested. Finish the nesting in the software before importing.`);
      }
      section.parts.push({ name: b, qty: needed, length: num(r[3]) });
    }
  }
  if (sections.length === 0) throw new Error("No parts found on the Part Info sheet.");
  for (const s of sections) {
    const total = s.parts.reduce((n, p) => n + p.qty, 0);
    if (s.partCount == null) s.partCount = total;
    if (s.partCount !== total) {
      throw new Error(`"${s.reportSection}" says ${s.partCount} parts, but its lines add up to ${total}. Check the export.`);
    }
  }
  return { sections };
}

// The parts typed by hand when nothing was imported: one per line,
// "name, qty, length". Length may be left off. Blank lines are skipped;
// a line that cannot be read is an error naming it.
export function parseTypedParts(textBlock) {
  const parts = [];
  const lines = String(textBlock || "").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const bits = t.split(/\s*[,;\t]\s*/);
    const name = (bits[0] || "").trim();
    const qty = Number(bits[1]);
    const length = bits[2] != null && bits[2] !== "" ? Number(String(bits[2]).replace(/mm$/i, "")) : null;
    if (!name || !Number.isFinite(qty) || qty <= 0 || (length != null && !Number.isFinite(length))) {
      throw new Error(`Could not read "${t}". Write each part as: name, qty, length`);
    }
    parts.push({ name, qty, length });
  }
  return parts;
}

export function parseNestingList(rows) {
  const sections = [];
  let section = null;
  let nest = null;
  let inParts = false;

  for (const raw of rows || []) {
    const r = Array.isArray(raw) ? raw : [];
    const a = text(r[0]);
    const b = text(r[1]);

    // A section header: the name sits in the second cell, the first is
    // blank. Tube Count may follow in the third or fourth cell.
    const secName = sectionOf(b) || (a && sectionOf(a));
    if (secName) {
      const count = r.map(tubeCountOf).find((n) => n != null);
      section = { reportSection: secName, tubes: count ?? null, nests: [] };
      sections.push(section);
      nest = null;
      inParts = false;
      continue;
    }
    if (!section) continue;

    // Column headers, both kinds.
    if (/^Nesting Name$/i.test(a)) {
      inParts = false;
      continue;
    }
    if (/^ID$/i.test(a) && /^Part Name$/i.test(b)) {
      inParts = true;
      continue;
    }

    // A nest row: a name, then how many tubes it is cut on. It follows
    // the previous nest's part list with no header between, so it is
    // told apart from a part row by its name: a part row starts with an
    // ID number, a nest row with the section's wording and "Nest N".
    if (a && num(a) == null && num(b) != null && /nest/i.test(a)) {
      nest = {
        name: a,
        qty: Math.max(0, Math.round(num(b))),
        partsPerTube: num(r[2]),
        parts: [],
      };
      section.nests.push(nest);
      inParts = false;
      continue;
    }

    // A part row under the nest: id, name, qty on this nest.
    if (inParts && nest && b && num(a) != null) {
      nest.parts.push({ name: b, qty: num(r[2]) ?? 0, length: num(r[4]) });
      continue;
    }
  }

  if (sections.length === 0) {
    throw new Error("No sections found. Is this the Nesting List from the tube software?");
  }
  for (const s of sections) {
    // The header's Tube Count is what the software says; the nests are
    // what it shows. They should agree, and when the header is missing
    // the nests decide.
    const fromNests = s.nests.reduce((n, x) => n + (x.qty || 0), 0);
    if (s.tubes == null) s.tubes = fromNests;
    if (s.nests.length === 0) {
      throw new Error(`"${s.reportSection}" has no nests under it.`);
    }
    if (s.tubes !== fromNests) {
      throw new Error(
        `"${s.reportSection}" says ${s.tubes} tubes, but its nests add up to ${fromNests}. Check the export.`
      );
    }
    if (s.tubes < 1) throw new Error(`"${s.reportSection}" has no tubes to cut.`);
  }
  return { sections };
}

// The operator's note on a program: which nests it is, and how many
// tubes each. "Nest 1 × 8 tubes, Nest 2 × 1 tube, Nest 3 × 16 tubes".
export function nestsNote(section) {
  return (section.nests || [])
    .map((n) => {
      const short = (n.name.match(/nest\s*\d+/i) || [n.name])[0];
      return `${short} × ${n.qty} ${n.qty === 1 ? "tube" : "tubes"}`;
    })
    .join(", ");
}

// The file name without its extension: the job's reference, which is
// what the nester calls the whole breakdown.
export function referenceFromFileName(name) {
  return String(name || "").replace(/\.[^.]+$/, "").trim();
}
