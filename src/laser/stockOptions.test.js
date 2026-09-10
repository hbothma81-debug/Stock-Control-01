import { test } from "node:test";
import assert from "node:assert/strict";
import { stockOptions, materialText, optionForMaterial } from "./stockOptions.js";

const items = [
  { id: "a", mainCat: "structural", name: "SHS 50x50x3mm", grade: "MS", length: 6, qty: 12 },
  { id: "b", mainCat: "structural", name: "SHS 50x50x3mm", grade: "304", length: 6, qty: 4 },
  { id: "c", mainCat: "structural", name: "RHS 50x25x2mm", grade: "MS", length: "", qty: 0 },
  { id: "p", mainCat: "plate", name: "3mm MS", grade: "MS", qty: 9 },
];

test("only structural stock, one option per line, grade and length in the label", () => {
  const o = stockOptions(items, [], "job1");
  assert.equal(o.length, 3);
  // Alphabetical when nothing is set aside: RHS before SHS, 304 before MS.
  assert.deepEqual(o.map((x) => x.value), ["c", "b", "a"]);
  const a = o.find((x) => x.value === "a");
  assert.equal(a.label, "SHS 50x50x3mm · MS · 6m · 12 available");
  assert.equal(a.material, "SHS 50x50x3mm MS");
});

test("reserved for other jobs comes off what is available", () => {
  const allocations = [
    { item_id: "a", job_id: "other", qty_allocated: 5, qty_used: 2, status: "open" },
    { item_id: "a", job_id: "other", qty_allocated: 3, qty_used: 0, status: "released" },
  ];
  const a = stockOptions(items, allocations, "job1").find((x) => x.value === "a");
  assert.equal(a.available, 9);
  assert.equal(a.setAside, 0);
});

test("set aside for this job is shown apart and sorts first", () => {
  const allocations = [{ item_id: "b", job_id: "job1", qty_allocated: 3, qty_used: 1, status: "open" }];
  const o = stockOptions(items, allocations, "job1");
  assert.equal(o[0].value, "b");
  assert.equal(o[0].setAside, 2);
  assert.equal(o[0].available, 2);
  assert.equal(o[0].label, "SHS 50x50x3mm · 304 · 6m · 2 set aside for this job, 2 more available");
});

test("nothing in stock still lists, saying 0 available", () => {
  const c = stockOptions(items, [], "job1").find((x) => x.value === "c");
  assert.equal(c.available, 0);
  assert.equal(c.label, "RHS 50x25x2mm · MS · 0 available");
  assert.equal(c.hint, "none");
});

test("a stored material line finds its stock option again", () => {
  const o = stockOptions(items, [], "job1");
  assert.equal(optionForMaterial(o, "SHS 50x50x3mm 304").value, "b");
  assert.equal(optionForMaterial(o, "shs 50x50x3mm ms").value, "a");
  assert.equal(optionForMaterial(o, "nothing like it"), null);
  assert.equal(materialText({ name: " RHS 50x25x2mm ", grade: "" }), "RHS 50x25x2mm");
});
