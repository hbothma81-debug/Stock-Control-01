import { test } from "node:test";
import assert from "node:assert/strict";
import { invoicingMatchesSearch, invoicingMatchesPicks, dayKeySA, inDayRange } from "./invoicingSearch.js";

const job = {
  job_number: "JOB-0088",
  laser_job_reference: "SN-31654",
  customer: "STAINLESS STEEL DESIGN C C",
  sales_rep: "Heinrich",
  customer_po: "4500 123",
  invoice_number: "INV-20616",
  description: "Hole posts, through and end",
  invoiced_by: "Chanté",
};

test("nothing typed finds everything", () => {
  assert.equal(invoicingMatchesSearch(job, ""), true);
  assert.equal(invoicingMatchesSearch(job, "   "), true);
});

test("finds a job the way the Jobs page does, customer PO included", () => {
  for (const q of ["job-0088", "31654", "stainless", "heinrich", "4500123", "PO 4500123", "4500 1"]) {
    assert.equal(invoicingMatchesSearch(job, q), true, q);
  }
  assert.equal(invoicingMatchesSearch(job, "9999"), false);
});

test("finds by what only this screen has", () => {
  assert.equal(invoicingMatchesSearch(job, "20616"), true);
  assert.equal(invoicingMatchesSearch(job, "hole posts"), true);
  assert.equal(invoicingMatchesSearch(job, "chant"), true);
  assert.equal(invoicingMatchesSearch(job, "DN-0042", { deliveryNotes: ["DN-0041", "DN-0042"] }), true);
  assert.equal(invoicingMatchesSearch(job, "DN-0043", { deliveryNotes: ["DN-0041", "DN-0042"] }), false);
  const requests = [{ file_name: "Invoice-Request-JOB-0088-1789797528920.pdf", submitted_by: "Mark Bezuidenhout" }];
  assert.equal(invoicingMatchesSearch(job, "bezuid", { requests }), true);
  assert.equal(invoicingMatchesSearch(job, "1789797", { requests }), true);
});

test("a request whose job is gone is still found by its own words", () => {
  const requests = [{ file_name: "Invoice-Request-JOB-0001-1.pdf", submitted_by: "Test" }];
  assert.equal(invoicingMatchesSearch(undefined, "job-0001", { requests }), true);
  assert.equal(invoicingMatchesSearch(undefined, "job-0002", { requests }), false);
  assert.equal(invoicingMatchesSearch(undefined, ""), true);
});

test("the Customer and Sales rep boxes", () => {
  assert.equal(invoicingMatchesPicks(job, {}), true);
  assert.equal(invoicingMatchesPicks(job, { customer: "STAINLESS STEEL DESIGN C C", salesRep: "Heinrich" }), true);
  assert.equal(invoicingMatchesPicks(job, { customer: "HPE" }), false);
  assert.equal(invoicingMatchesPicks(job, { salesRep: "Mark" }), false);
  assert.equal(invoicingMatchesPicks(undefined, { customer: "HPE" }), false);
  assert.equal(invoicingMatchesPicks(undefined, {}), true);
});

test("days are South African days", () => {
  // 23:30 UTC on the 4th is 01:30 on the 5th in Johannesburg.
  assert.equal(dayKeySA("2026-09-04T23:30:00Z"), "2026-09-05");
  assert.equal(dayKeySA("2026-09-05T10:00:00+02:00"), "2026-09-05");
  assert.equal(dayKeySA(null), "");
  assert.equal(dayKeySA("rubbish"), "");
});

test("From and To include both days, and a row with no date fails a picked range", () => {
  const when = "2026-09-04T23:30:00Z"; // the 5th, here
  assert.equal(inDayRange(when, "", ""), true);
  assert.equal(inDayRange(when, "2026-09-05", "2026-09-05"), true);
  assert.equal(inDayRange(when, "2026-09-06", ""), false);
  assert.equal(inDayRange(when, "", "2026-09-04"), false);
  assert.equal(inDayRange(when, "2026-09-01", "2026-09-30"), true);
  assert.equal(inDayRange(null, "", ""), true);
  assert.equal(inDayRange(null, "2026-09-01", ""), false);
});
