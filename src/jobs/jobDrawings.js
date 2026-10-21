// The job page's Drawings tab: which line has which drawing, and where
// the line goes on the floor (Heinrich, 21 Oct 2026).
//
// A line's drawing is the drawings library's current one for the line's
// part number: the linked stock part's, else the line's own stock code
// (linePartNumber in App.jsx, which the Production card's Drawings block
// uses too, so the two screens agree). The library is never copied onto the
// job, so a new revision shows here the moment it is uploaded.

// Only a PDF becomes a part's drawing in the library, shown on the floor.
// A DXF or any other file stays on the job it was dropped on, next to its
// line's PDF, and nowhere else (Heinrich, 21 Oct 2026: "they should not
// show up in other places only in that job under drawings for now").
export const isLibraryFile = (fileName) => /\.pdf$/i.test(String(fileName || "").trim());

// What a job remembers about one of its drawings, by this key
// (job_drawings.drawing_key, setup-drawings-job.sql).
export const partKey = (partNumber) => `part:${String(partNumber || "").trim()}`;
export const rowKey = (drawing) => `id:${drawing.id}`;
export const itemKey = (itemId) => `item:${itemId}`;

// Where a drawing is kept, in the words of the tab's Kept in column.
export const KEPT_IN = { library: "Library", job: "This job only", item: "On the stock part" };

const compareText = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
const KIND_ORDER = { library: 0, item: 1, job: 2 };

// Every drawing the job's Drawings tab lists, one row per file.
//   lines            the job's quote items, parts included
//   partNumberOf     a line's part number (linked stock part's, else its code)
//   libraryByPart    { [part number]: current library drawing }
//   jobRows          current drawings kept for this job (drawings.job_id)
//   attachmentOf     a line's stock part attachment: { itemId, name } or null
//   stagesOf         stage names a line goes to, in flow order
//   hiddenKeys       keys taken off this job
// Returns { rows, withoutDrawing, removed }. A row: { key, kind, line,
// partNumber, name, drawing, itemId, stages, onFloor }. withoutDrawing:
// { line, partNumber } for each line with nothing showing. removed: rows
// taken off the job, for Put back.
export function jobDrawingList({ lines, partNumberOf, libraryByPart, jobRows, attachmentOf, stagesOf, hiddenKeys }) {
  const hidden = new Set(hiddenKeys || []);
  const all = [];
  const seen = new Set();
  const add = (row) => {
    if (seen.has(row.key)) return;
    seen.add(row.key);
    all.push(row);
  };
  const lineIds = new Set((lines || []).map((l) => l.id));
  const lineHas = new Map();
  for (const line of lines || []) {
    const partNumber = (partNumberOf(line) || "").trim();
    const stages = stagesOf(line);
    const mine = [];
    const library = partNumber ? libraryByPart[partNumber] : null;
    if (library) mine.push({ key: partKey(partNumber), kind: "library", name: library.file_name || partNumber, drawing: library, onFloor: true });
    const attachment = attachmentOf(line);
    if (attachment) mine.push({ key: itemKey(attachment.itemId), kind: "item", name: attachment.name, itemId: attachment.itemId, onFloor: false });
    for (const d of jobRows || []) {
      if (d.quote_item_id !== line.id) continue;
      mine.push({ key: rowKey(d), kind: "job", name: d.file_name || d.part_number, drawing: d, onFloor: isLibraryFile(d.file_name) });
    }
    for (const r of mine) add({ ...r, line, partNumber, stages: r.onFloor ? stages : [] });
    lineHas.set(line.id, mine.some((r) => !hidden.has(r.key)));
  }
  // Kept for the job with no line (or a line since removed): every stage
  // when it is a PDF, the job page only otherwise.
  for (const d of jobRows || []) {
    if (d.quote_item_id && lineIds.has(d.quote_item_id)) continue;
    const onFloor = isLibraryFile(d.file_name);
    add({ key: rowKey(d), kind: "job", line: null, partNumber: d.part_number, name: d.file_name || d.part_number, drawing: d, stages: [], onFloor, everyStage: onFloor });
  }
  // Lines A to Z by description, as the job's Items tab reads; then the
  // job's own files with no line.
  const order = (a, b) =>
    (a.line ? 0 : 1) - (b.line ? 0 : 1) ||
    compareText(a.line?.description, b.line?.description) ||
    compareText(a.partNumber, b.partNumber) ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    compareText(a.name, b.name);
  all.sort(order);
  const withoutDrawing = (lines || [])
    .filter((l) => !lineHas.get(l.id))
    .map((line) => ({ line, partNumber: (partNumberOf(line) || "").trim() }))
    .sort((a, b) => compareText(a.line.description, b.line.description) || compareText(a.partNumber, b.partNumber));
  return {
    rows: all.filter((r) => !hidden.has(r.key)),
    withoutDrawing,
    removed: all.filter((r) => hidden.has(r.key)),
  };
}

// Why a line has no drawing, in the words the tab shows.
export function noDrawingReason(row) {
  return row.partNumber ? `No drawing on file for ${row.partNumber}` : "No stock code, and no file named after it";
}

// Upper case, letters and digits only: "ers-1001 rev_B" and "ERS1001REVB"
// are the same to the matcher.
const squash = (text) => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// The file's name without its extension.
export function fileStem(fileName) {
  return String(fileName || "").replace(/\.[^.]*$/, "").trim();
}

// Which of the job's part numbers a dropped file is for: the longest part
// number found inside its name, so "P-10.pdf" is P-10 and not P-1. Two
// different part numbers of that same longest length both found is not a
// guess this makes: null, and the person picks.
export function matchFileToPart(fileName, partNumbers) {
  const stem = squash(fileStem(fileName));
  let best = null;
  let tie = false;
  for (const pn of new Set((partNumbers || []).map((p) => (p || "").trim()).filter(Boolean))) {
    const code = squash(pn);
    if (!code || !stem.includes(code)) continue;
    if (!best || code.length > squash(best).length) {
      best = pn;
      tie = false;
    } else if (code.length === squash(best).length && code !== squash(best)) {
      tie = true;
    }
  }
  return tie ? null : best;
}

// Which job line a dropped file is for (Heinrich, 21 Oct 2026: "if the
// file name matches the description or stock code they should
// automatically be linked"). The part number first, by matchFileToPart;
// failing that the description: the whole description found in the name
// (four letters or more, so "Lug" finds nothing by accident), the longest
// one winning and a tie not guessed. null: no line, This job only.
export function matchFileToLine(fileName, lines, partNumberOf) {
  const part = matchFileToPart(fileName, (lines || []).map(partNumberOf));
  if (part) return (lines || []).find((l) => (partNumberOf(l) || "").trim() === part) || null;
  const stem = squash(fileStem(fileName));
  let best = null;
  let tie = false;
  for (const line of lines || []) {
    const words = squash(line.description);
    if (words.length < 4 || !stem.includes(words)) continue;
    const bestWords = best ? squash(best.description) : "";
    if (!best || words.length > bestWords.length) {
      best = line;
      tie = false;
    } else if (words.length === bestWords.length && words !== bestWords) {
      tie = true;
    }
  }
  return tie ? null : best;
}

// The part number a drawing kept for one job is filed under: the job
// number, then the file's whole name, so the same file dropped on the
// same job again is a new revision of it, and a part's PDF and DXF of
// the same name stay two files.
export function jobOnlyPartNumber(jobNumber, fileName) {
  return `${jobNumber}-${String(fileName || "").trim()}`;
}

// "Our rev 2, customer rev B", or the one there is.
export function revisionText(drawing) {
  if (!drawing) return "";
  const ours = drawing.internal_revision != null ? `Our rev ${drawing.internal_revision}` : "";
  const theirs = drawing.customer_revision ? `customer rev ${drawing.customer_revision}` : "";
  return [ours, theirs].filter(Boolean).join(", ");
}
