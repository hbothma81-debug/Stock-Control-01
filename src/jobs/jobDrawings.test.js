import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fileStem,
  isLibraryFile,
  jobDrawingList,
  jobOnlyPartNumber,
  matchFileToLine,
  matchFileToPart,
  noDrawingReason,
  revisionText,
} from "./jobDrawings.js";

const jobLines = [
  { id: "1", description: "Base plate", code: "ERS-1001" },
  { id: "2", description: "Base plate stiffener", code: "" },
  { id: "3", description: "Lug", code: "" },
  { id: "4", description: "Side panel L", code: "" },
  { id: "5", description: "Side panel R", code: "" },
];
const codeOf = (l) => l.code;

test("a file goes to a line by its stock code first", () => {
  assert.equal(matchFileToLine("ERS-1001 Rev A.pdf", jobLines, codeOf).id, "1");
});

test("then by the whole description in its name, the longest winning", () => {
  assert.equal(matchFileToLine("base plate.dxf", jobLines, codeOf).id, "1");
  assert.equal(matchFileToLine("Base Plate Stiffener rev2.pdf", jobLines, codeOf).id, "2");
});

test("short descriptions and ties are not guessed", () => {
  assert.equal(matchFileToLine("Lug.pdf", jobLines, codeOf), null);
  assert.equal(matchFileToLine("Side panel L and Side panel R.pdf", jobLines, codeOf), null);
  assert.equal(matchFileToLine("GA layout.pdf", jobLines, codeOf), null);
});

test("a file goes to the longest part number in its name", () => {
  const parts = ["P-1", "P-10", "ERS-1001"];
  assert.equal(matchFileToPart("P-10 Rev B.pdf", parts), "P-10");
  assert.equal(matchFileToPart("p1.dxf", parts), "P-1");
  assert.equal(matchFileToPart("ers_1001-revC.PDF", parts), "ERS-1001");
  assert.equal(matchFileToPart("A-11 and B-22.pdf", ["A-11", "B-22"]), null);
});

test("names: the extension is not part of the match, but is part of a job file's name", () => {
  assert.equal(fileStem("GA layout.v2.pdf"), "GA layout.v2");
  assert.equal(matchFileToPart("X.PDF", ["PDF"]), null);
  assert.equal(jobOnlyPartNumber("JOB-0012", "GA layout.pdf"), "JOB-0012-GA layout.pdf");
  assert.notEqual(jobOnlyPartNumber("JOB-0012", "P1.pdf"), jobOnlyPartNumber("JOB-0012", "P1.dxf"));
});

test("only a PDF goes to the library and the floor", () => {
  assert.equal(isLibraryFile("a.PDF"), true);
  assert.equal(isLibraryFile("a.dxf"), false);
  assert.equal(isLibraryFile("a.xlsx"), false);
});

const list = (over = {}) =>
  jobDrawingList({
    lines: jobLines.slice(0, 3),
    partNumberOf: codeOf,
    libraryByPart: { "ERS-1001": { id: "L1", file_name: "ERS-1001.pdf" } },
    jobRows: [
      { id: "J1", part_number: "JOB-1-ERS-1001.dxf", file_name: "ERS-1001.dxf", quote_item_id: "1" },
      { id: "J2", part_number: "JOB-1-Base plate stiffener.pdf", file_name: "Base plate stiffener.pdf", quote_item_id: "2" },
      { id: "J3", part_number: "JOB-1-GA.pdf", file_name: "GA.pdf", quote_item_id: null },
      { id: "J4", part_number: "JOB-1-notes.xlsx", file_name: "notes.xlsx", quote_item_id: null },
    ],
    attachmentOf: (l) => (l.id === "3" ? { itemId: "S9", name: "Lug sketch.pdf" } : null),
    stagesOf: () => ["Laser", "Bending"],
    hiddenKeys: [],
    ...over,
  });

test("one row per file, each saying where it is kept and whether the floor sees it", () => {
  const { rows, withoutDrawing } = list();
  assert.deepEqual(
    rows.map((r) => [r.key, r.kind, r.line?.id ?? null, r.onFloor]),
    [
      ["part:ERS-1001", "library", "1", true],
      ["id:J1", "job", "1", false],
      ["id:J2", "job", "2", true],
      ["item:S9", "item", "3", false],
      ["id:J3", "job", null, true],
      ["id:J4", "job", null, false],
    ]
  );
  assert.deepEqual(rows[1].stages, []);
  assert.deepEqual(rows[2].stages, ["Laser", "Bending"]);
  assert.equal(rows[4].everyStage, true);
  assert.equal(withoutDrawing.length, 0);
});

test("a file taken off the job moves to removed, and its line may then have none", () => {
  const { rows, withoutDrawing, removed } = list({ hiddenKeys: ["id:J2"] });
  assert.equal(rows.some((r) => r.key === "id:J2"), false);
  assert.deepEqual(removed.map((r) => r.key), ["id:J2"]);
  assert.deepEqual(withoutDrawing.map((r) => r.line.id), ["2"]);
});

test("the reason a line has none", () => {
  assert.equal(noDrawingReason({ partNumber: "" }), "No stock code, and no file named after it");
  assert.equal(noDrawingReason({ partNumber: "P-3" }), "No drawing on file for P-3");
});

test("revision words", () => {
  assert.equal(revisionText({ internal_revision: 2, customer_revision: "B" }), "Our rev 2, customer rev B");
  assert.equal(revisionText({ internal_revision: 1 }), "Our rev 1");
  assert.equal(revisionText(null), "");
});
