import { test } from "node:test";
import assert from "node:assert/strict";
import { drawingRows, fileStem, jobOnlyPartNumber, matchFileToLine, matchFileToPart, noDrawingReason, revisionText } from "./jobDrawings.js";

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

test("a line's drawing kept on the job counts when its part has none", () => {
  const { withDrawing, withoutDrawing } = drawingRows(jobLines.slice(0, 2), codeOf, {}, () => [], { 2: { id: "j" } });
  assert.deepEqual(withDrawing.map((r) => r.line.id), ["2"]);
  assert.deepEqual(withoutDrawing.map((r) => r.line.id), ["1"]);
});

test("a file goes to the longest part number in its name", () => {
  const parts = ["P-1", "P-10", "ERS-1001"];
  assert.equal(matchFileToPart("P-10 Rev B.pdf", parts), "P-10");
  assert.equal(matchFileToPart("p1.dxf", parts), "P-1");
  assert.equal(matchFileToPart("ers_1001-revC.PDF", parts), "ERS-1001");
  assert.equal(matchFileToPart("GA layout.pdf", parts), null);
});

test("two part numbers of the same length in one name: no guess", () => {
  assert.equal(matchFileToPart("A-11 and B-22.pdf", ["A-11", "B-22"]), null);
  assert.equal(matchFileToPart("A-11.pdf", ["A-11", " A-11 "]), "A-11");
});

test("the extension is not part of the name", () => {
  assert.equal(fileStem("GA layout.v2.pdf"), "GA layout.v2");
  assert.equal(matchFileToPart("X.PDF", ["PDF"]), null);
  assert.equal(jobOnlyPartNumber("JOB-0012", "GA layout.pdf"), "JOB-0012-GA layout");
});

const lines = [
  { id: "a", description: "Bracket", part: "P-10" },
  { id: "b", description: "Plate", part: "P-2" },
  { id: "c", description: "Free line", part: "" },
  { id: "d", description: "Gusset", part: "P-3" },
];
const drawings = { "P-10": { id: "d10" }, "P-2": { id: "d2" } };

test("lines split by whether their part has a current drawing, numbers read as numbers", () => {
  const { withDrawing, withoutDrawing } = drawingRows(lines, (l) => l.part, drawings, () => ["Laser"]);
  assert.deepEqual(withDrawing.map((r) => r.line.id), ["b", "a"]);
  assert.deepEqual(withoutDrawing.map((r) => r.line.id), ["c", "d"]);
  assert.deepEqual(withDrawing[0].stages, ["Laser"]);
});

test("a part number with spaces round it still finds its drawing", () => {
  const { withDrawing } = drawingRows([{ id: "x", part: " P-2 " }], (l) => l.part, drawings, () => []);
  assert.equal(withDrawing[0].drawing.id, "d2");
});

test("the reason a line has none", () => {
  assert.equal(noDrawingReason({ partNumber: "" }), "Not linked to a stock part");
  assert.equal(noDrawingReason({ partNumber: "P-3" }), "No drawing on file for P-3");
});

test("revision words", () => {
  assert.equal(revisionText({ internal_revision: 2, customer_revision: "B" }), "Our rev 2, customer rev B");
  assert.equal(revisionText({ internal_revision: 1 }), "Our rev 1");
  assert.equal(revisionText(null), "");
});
