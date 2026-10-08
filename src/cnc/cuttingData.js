// Cutting data as rows the engine reads: one row per Excel row, keyed by
// the header text. These rules mirror the engine's own spreadsheet reader
// (ERS TURNING APP ers_turning/xlsx.py read_table): the first row is the
// header, each heading trimmed of spaces, a blank heading becomes col0,
// col1 ... by its place; a row with nothing in it is skipped; an empty cell
// is null; numbers stay numbers and text stays text exactly. Change both
// together, or the engine stops finding its columns. No React, no
// database: tested in cuttingData.test.js.

const blank = (v) => v === null || v === undefined || (typeof v === "string" && v === "");

// One sheet read as rows of cells (SheetJS sheet_to_json with header: 1)
// into { columns, rows }.
export function tableFromCells(cells) {
  const lines = (cells || []).filter((r) => Array.isArray(r) && r.some((v) => !blank(v)));
  if (!lines.length) return { columns: [], rows: [] };
  const columns = lines[0].map((h, i) => (blank(h) ? `col${i}` : String(h).trim()));
  const rows = lines.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c, blank(r[i]) ? null : r[i]])));
  return { columns, rows };
}

// A whole workbook ({ name: cells }) as the import sends it, in the
// workbook's sheet order.
export function workbookSheets(sheetNames, cellsOf) {
  return sheetNames
    .map((name, i) => ({ sheet: name, position: i + 1, ...tableFromCells(cellsOf(name)) }))
    .filter((s) => s.columns.length);
}

// A sheet back as rows of cells for Export to Excel.
export function cellsFromTable(columns, rows) {
  return [columns, ...rows.map((r) => columns.map((c) => (r?.[c] === undefined ? null : r[c])))];
}

// A cell as typed in the screen: a number when it reads as one (comma or
// point), otherwise the text; empty is null.
export function readCell(text) {
  const t = String(text ?? "").trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return /^-?\d+([.,]\d+)?$/.test(t) && Number.isFinite(n) ? n : String(text).trim();
}

// What the search box finds: any cell's text.
export function rowMatches(row, columns, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  return columns.some((c) => String(row?.[c] ?? "").toLowerCase().includes(q));
}
