import { test } from "node:test";
import assert from "node:assert/strict";
import { tableFromCells, workbookSheets, cellsFromTable, readCell, rowMatches } from "./cuttingData.js";

const TURNING = [
  ["Tool", "Insert", "Material", " G96 Vc m/min ", null, "fn mm/rev"],
  ["T1", "WNMG 080408-M3M IC830", "EN1A", 200, "x", 0.25],
  [null, null, null, null, null, null],
  ["T1", "WNMG 080408-M3M IC830", "EN8", 140, null],
];

test("a sheet reads as the engine reads it: trimmed headings, colN for a blank one, empty rows skipped", () => {
  const t = tableFromCells(TURNING);
  assert.deepEqual(t.columns, ["Tool", "Insert", "Material", "G96 Vc m/min", "col4", "fn mm/rev"]);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows[0], { Tool: "T1", Insert: "WNMG 080408-M3M IC830", Material: "EN1A", "G96 Vc m/min": 200, col4: "x", "fn mm/rev": 0.25 });
  assert.equal(t.rows[1]["fn mm/rev"], null);
  assert.equal(t.rows[1].col4, null);
});

test("a whole workbook, in sheet order, empty sheets left out", () => {
  const book = { TURNING, EMPTY: [], NOTES: [["Topic", "Note"], ["G50", "Per tool and material"]] };
  const s = workbookSheets(["TURNING", "EMPTY", "NOTES"], (n) => book[n]);
  assert.deepEqual(s.map((x) => [x.sheet, x.position, x.rows.length]), [["TURNING", 1, 2], ["NOTES", 3, 1]]);
});

test("export gives the same cells back", () => {
  const t = tableFromCells(TURNING);
  const cells = cellsFromTable(t.columns, t.rows);
  assert.deepEqual(cells[0], t.columns);
  assert.deepEqual(tableFromCells(cells), t);
});

test("a typed cell: numbers become numbers, a comma reads as the point", () => {
  assert.equal(readCell("140"), 140);
  assert.equal(readCell("0,25"), 0.25);
  assert.equal(readCell(""), null);
  assert.equal(readCell("rough G71/G72"), "rough G71/G72");
  assert.equal(readCell("3.1 wide"), "3.1 wide");
});

test("the search finds any cell", () => {
  const t = tableFromCells(TURNING);
  assert.equal(rowMatches(t.rows[1], t.columns, "en8"), true);
  assert.equal(rowMatches(t.rows[1], t.columns, "ss304"), false);
  assert.equal(rowMatches(t.rows[1], t.columns, ""), true);
});
