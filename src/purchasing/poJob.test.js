// Run with:   npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { jobForPurchaseOrder, mixedJobsWords } from "./poJob.js";

const a = { jobId: "j1", jobNumber: "JOB-0101" };
const b = { jobId: "j2", jobNumber: "JOB-0102" };
const stores = { jobId: "", jobNumber: "" };

test("one job across the requests fills the order", () => {
  assert.deepEqual(jobForPurchaseOrder([a, a]), { job: { id: "j1", job_number: "JOB-0101" }, mixed: [] });
});

test("stores lines beside one job still give that job", () => {
  assert.deepEqual(jobForPurchaseOrder([stores, a, stores]).job, { id: "j1", job_number: "JOB-0101" });
});

test("two jobs leave the box empty and name both", () => {
  const r = jobForPurchaseOrder([a, b, stores]);
  assert.equal(r.job, null);
  assert.deepEqual(r.mixed, ["JOB-0101", "JOB-0102"]);
  assert.match(mixedJobsWords(r.mixed), /2 jobs \(JOB-0101, JOB-0102\)/);
});

test("no job anywhere is empty and says nothing", () => {
  assert.deepEqual(jobForPurchaseOrder([stores, {}]), { job: null, mixed: [] });
  assert.equal(mixedJobsWords([]), "");
});

test("an old row with no job fields is stores", () => {
  assert.equal(jobForPurchaseOrder([{ id: "x" }]).job, null);
});
