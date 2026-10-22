// The Production tab's Sheet view: filters, sorting, the remembered view.
//
// Run with:   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRows, sortRows, nextSort, readViews, viewFor, VIEW_STORE_KEY } from "./sheetRows.js";

const rows = [
  { key: "a", job: "JOB-0010", customer: "BPW", code: "P-10", description: "Gusset", qty: 5, days: 3 },
  { key: "b", job: "JOB-0002", customer: "HPE", code: "P-2", description: "Corner bracket", qty: 12, days: null },
  { key: "c", job: "JOB-0003", customer: "bpw", code: "", description: "Side bracket", qty: 1, days: 9 },
];
const keys = (list) => list.map((r) => r.key).join("");

test("filters find text anywhere in their column, case ignored", () => {
  assert.equal(keys(filterRows(rows, { customer: "BpW" })), "ac");
  assert.equal(keys(filterRows(rows, { description: "bracket", customer: "hpe" })), "b");
  assert.equal(keys(filterRows(rows, { code: "  " })), "abc");
  assert.equal(keys(filterRows(rows, {})), "abc");
});

test("sorting reads numbers as numbers and P-2 before P-10", () => {
  assert.equal(keys(sortRows(rows, "code", "asc")), "bac");
  assert.equal(keys(sortRows(rows, "job", "asc")), "bca");
  assert.equal(keys(sortRows(rows, "qty", "desc")), "bac");
});

test("blanks go last whichever way round", () => {
  assert.equal(keys(sortRows(rows, "days", "asc")), "acb");
  assert.equal(keys(sortRows(rows, "days", "desc")), "cab");
});

test("no sort keeps the cards' order", () => {
  assert.equal(keys(sortRows(rows, null)), "abc");
});

test("a heading goes A to Z, Z to A, then back", () => {
  assert.deepEqual(nextSort(null, "job"), { key: "job", dir: "asc" });
  assert.deepEqual(nextSort({ key: "job", dir: "asc" }, "job"), { key: "job", dir: "desc" });
  assert.equal(nextSort({ key: "job", dir: "desc" }, "job"), null);
  assert.deepEqual(nextSort({ key: "job", dir: "desc" }, "code"), { key: "code", dir: "asc" });
});

test("the view is remembered per department, Cards by default", () => {
  const store = { [VIEW_STORE_KEY]: JSON.stringify({ welding: "sheet" }) };
  const storage = { getItem: (k) => store[k] ?? null };
  const views = readViews(storage);
  assert.equal(viewFor(views, "welding"), "sheet");
  assert.equal(viewFor(views, "Bending"), "cards");
  assert.deepEqual(readViews({ getItem: () => "not json" }), {});
  assert.deepEqual(readViews(null), {});
});
