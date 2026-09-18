// The search box on the Jobs page and the Production tab.
//
// Run with:   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { jobMatchesSearch, poMatchesSearch, poLabel } from "./jobSearch.js";

const job = {
  job_number: "JOB-0068",
  laser_job_reference: "SN-20417",
  customer: "Bell Equipment",
  sales_rep: "Anja",
  customer_po: "PO 4500 123/A",
};

test("nothing typed finds every job", () => {
  assert.equal(jobMatchesSearch(job, ""), true);
  assert.equal(jobMatchesSearch(job, "   "), true);
  assert.equal(jobMatchesSearch({}, ""), true);
});

test("the four things it always found, part of a word, capitals ignored", () => {
  assert.equal(jobMatchesSearch(job, "0068"), true);
  assert.equal(jobMatchesSearch(job, "sn-204"), true);
  assert.equal(jobMatchesSearch(job, "bell"), true);
  assert.equal(jobMatchesSearch(job, "ANJA"), true);
  assert.equal(jobMatchesSearch(job, "  bell  "), true);
  assert.equal(jobMatchesSearch(job, "komatsu"), false);
});

test("the customer's PO number finds the job", () => {
  assert.equal(jobMatchesSearch(job, "4500"), true);
  assert.equal(jobMatchesSearch(job, "po 4500"), true);
  assert.equal(jobMatchesSearch(job, "123/a"), true);
  assert.equal(jobMatchesSearch(job, "9999"), false);
});

test("a PO is found however its spaces, dashes and strokes were typed", () => {
  assert.equal(jobMatchesSearch(job, "4500123"), true);
  assert.equal(jobMatchesSearch(job, "PO4500-123"), true);
  assert.equal(jobMatchesSearch(job, "4500 123 a"), true);
  assert.equal(jobMatchesSearch({ ...job, customer_po: "4500123" }, "4500 123"), true);
});

test("PO typed in front of the number, none on the job", () => {
  const plain = { ...job, customer_po: "4500 123/A" };
  assert.equal(jobMatchesSearch(plain, "PO 4500123"), true);
  assert.equal(jobMatchesSearch(plain, "po4500-123"), true);
  assert.equal(jobMatchesSearch(plain, "P.O. 4500"), true);
  assert.equal(jobMatchesSearch(plain, "po 9999"), false);
  // Only in front of a number: "por" is somebody typing a customer's name.
  assert.equal(poMatchesSearch({ customer_po: "R-77" }, "por"), false);
  assert.equal(poMatchesSearch({ customer_po: "R-77" }, "po"), false);
});

test("punctuation alone finds no PO", () => {
  assert.equal(poMatchesSearch(job, "-"), false);
  assert.equal(poMatchesSearch(job, "//"), false);
  // A stroke that really is in the PO still finds it as typed.
  assert.equal(poMatchesSearch(job, "/"), true);
});

test("a job with no PO is never found by one, and never crashes", () => {
  const noPo = { ...job, customer_po: null };
  assert.equal(poMatchesSearch(noPo, "4500"), false);
  assert.equal(jobMatchesSearch(noPo, "4500"), false);
  assert.equal(jobMatchesSearch(noPo, "bell"), true);
  assert.equal(poMatchesSearch(undefined, "4500"), false);
  // A re-cut row whose job is no longer in the list carries two fields only.
  assert.equal(jobMatchesSearch({ job_number: "JOB-0011", customer: "Bell" }, "bell"), true);
  assert.equal(jobMatchesSearch({ job_number: "JOB-0011", customer: "Bell" }, "4500"), false);
});

test("the row label says PO once, whatever was typed on the job", () => {
  assert.equal(poLabel({ customer_po: "4500123" }), "PO 4500123");
  assert.equal(poLabel({ customer_po: " 4500123 " }), "PO 4500123");
  assert.equal(poLabel({ customer_po: "PO-4500123" }), "PO-4500123");
  assert.equal(poLabel({ customer_po: "po 77" }), "po 77");
  assert.equal(poLabel({ customer_po: "P.O. 77" }), "P.O. 77");
  assert.equal(poLabel({ customer_po: "PO4500" }), "PO4500");
  // A PO that only starts with those two letters is not one already said.
  assert.equal(poLabel({ customer_po: "POL-889" }), "PO POL-889");
  assert.equal(poLabel({ customer_po: "" }), "");
  assert.equal(poLabel({}), "");
  assert.equal(poLabel({ customer_po: 4500123 }), "PO 4500123");
});

test("the row label shows only while the typed text is in the PO", () => {
  assert.equal(poMatchesSearch(job, "4500"), true);
  assert.equal(poMatchesSearch(job, "bell"), false);
  assert.equal(poMatchesSearch(job, ""), false);
  // A number held as a number on the row, not text.
  assert.equal(poMatchesSearch({ customer_po: 4500123 }, "00123"), true);
});
