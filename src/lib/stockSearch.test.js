// Run with:   npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { stockSearchText, searchWords, matchesWords, requisitionSearchText } from "./stockSearch.js";

const plate = { name: "2500x1250", grade: "Mild Steel", thickness: "6mm", supplier: "Macsteel", loc: "Rack B" };

test("words land in different fields, any order", () => {
  const text = stockSearchText(plate);
  assert.ok(matchesWords(text, searchWords("mild steel 6mm")));
  assert.ok(matchesWords(text, searchWords("6mm MILD")));
  assert.ok(matchesWords(text, searchWords("macsteel rack")));
});

test("case does not matter and a missing word fails", () => {
  const text = stockSearchText(plate);
  assert.ok(matchesWords(text, searchWords("MACSTEEL")));
  assert.ok(!matchesWords(text, searchWords("mild steel 8mm")));
});

test("empty search matches everything; extra words count", () => {
  assert.ok(matchesWords(stockSearchText(plate), searchWords("   ")));
  assert.ok(matchesWords(stockSearchText({ name: "100x50x20x3" }, ["Lipped channel"]), searchWords("lipped")));
});

test("blank and missing fields do not break it", () => {
  assert.equal(matchesWords(stockSearchText({}), searchWords("x")), false);
});

test("a requisition is found by its note and job", () => {
  const r = { itemLabel: "Mild Steel — 6mm", supplier: "Macsteel", requestedBy: "Sales", notes: "needed Friday", jobNumber: "JOB-0101" };
  assert.ok(matchesWords(requisitionSearchText(r), searchWords("friday job-0101")));
});
