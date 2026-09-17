// The Jobs list's Order box.
//
// Run with:   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { sortJobs, isJobOrder, JOB_ORDERS } from "./jobOrder.js";

const jobs = [
  { n: "JOB-0004", created_at: "2026-09-10T08:00:00Z", due_date: null },
  { n: "JOB-0003", created_at: "2026-09-05T08:00:00Z", due_date: "2026-09-30" },
  { n: "JOB-0002", created_at: "2026-09-02T08:00:00Z", due_date: "2026-09-18" },
  { n: "JOB-0001", created_at: "2026-08-20T08:00:00Z", due_date: "2026-09-30" },
];
const numbers = (list) => list.map((j) => j.n);

test("newest first is the default, and what an unknown order falls back to", () => {
  assert.deepEqual(numbers(sortJobs(jobs, "newest")), ["JOB-0004", "JOB-0003", "JOB-0002", "JOB-0001"]);
  assert.deepEqual(numbers(sortJobs(jobs, "nonsense")), ["JOB-0004", "JOB-0003", "JOB-0002", "JOB-0001"]);
  assert.deepEqual(numbers(sortJobs([...jobs].reverse(), undefined)), ["JOB-0004", "JOB-0003", "JOB-0002", "JOB-0001"]);
});

test("oldest first: longest booked in on top", () => {
  assert.deepEqual(numbers(sortJobs(jobs, "oldest")), ["JOB-0001", "JOB-0002", "JOB-0003", "JOB-0004"]);
});

test("due date: soonest first, same day by who was booked in first, no date last", () => {
  assert.deepEqual(numbers(sortJobs(jobs, "due")), ["JOB-0002", "JOB-0001", "JOB-0003", "JOB-0004"]);
});

test("a job with no booked-in date goes last either way, and nothing is lost", () => {
  const odd = [{ n: "X", created_at: null }, ...jobs];
  assert.equal(sortJobs(odd, "oldest").at(-1).n, "X");
  assert.equal(sortJobs(odd, "newest").at(-1).n, "X");
  assert.equal(sortJobs(odd, "due").length, 5);
});

test("the list handed in is left as it was", () => {
  const before = numbers(jobs);
  sortJobs(jobs, "oldest");
  assert.deepEqual(numbers(jobs), before);
  assert.deepEqual(sortJobs(null, "due"), []);
});

test("only the offered orders are orders", () => {
  for (const o of JOB_ORDERS) assert.equal(isJobOrder(o.value), true);
  assert.equal(isJobOrder("anything"), false);
  assert.equal(isJobOrder(null), false);
});
