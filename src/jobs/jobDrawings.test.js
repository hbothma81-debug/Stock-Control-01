import { test } from "node:test";
import assert from "node:assert/strict";
import { drawingRows, noDrawingReason, revisionText } from "./jobDrawings.js";

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
