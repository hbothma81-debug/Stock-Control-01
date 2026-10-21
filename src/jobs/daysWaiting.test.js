// Days a stage has waited at its department, for the Production cards.
//
// Run with:   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { waitingSince, daysWaiting, daysWaitingText } from "./daysWaiting.js";

const job = { id: "j", created_at: "2026-10-01T08:00:00Z" };
const now = Date.parse("2026-10-21T09:00:00Z");
const stages = [
  { id: "n", process_name: "Nesting", sort_order: 0, is_complete: true, completed_at: "2026-10-05T10:00:00Z" },
  { id: "l", process_name: "Laser", sort_order: 1, is_complete: true, completed_at: "2026-10-15T10:00:00Z" },
  { id: "b", process_name: "Bending", sort_order: 2, is_complete: false },
  { id: "w", process_name: "Welding", sort_order: 3, is_complete: false },
];

test("counts from the latest finish above it", () => {
  assert.equal(waitingSince(stages[2], stages, job), Date.parse("2026-10-15T10:00:00Z"));
  assert.equal(daysWaiting(stages[2], stages, job, null, now), 5);
});

test("a stage below an open one still counts from the last finish above it", () => {
  assert.equal(daysWaiting(stages[3], stages, job, null, now), 5);
});

test("the first stage counts from the job booked in", () => {
  const open = { ...stages[0], is_complete: false };
  assert.equal(daysWaiting(open, [open], job, null, now), 20);
});

test("a stage below it never counts", () => {
  const done = [...stages, { id: "x", sort_order: 5, is_complete: true, completed_at: "2026-10-20T10:00:00Z" }];
  assert.equal(daysWaiting(stages[2], done, job, null, now), 5);
});

test("a re-cut's run counts only its own stages, from the shortage flagged", () => {
  const shortage = { id: "s1", created_at: "2026-10-19T08:00:00Z" };
  const recut = { id: "r", process_name: "Welding", sort_order: 9, shortage_id: "s1", is_complete: false };
  assert.equal(daysWaiting(recut, [...stages, recut], job, shortage, now), 2);
  const recutLaser = { id: "rl", sort_order: 8, shortage_id: "s1", is_complete: true, completed_at: "2026-10-20T08:00:00Z" };
  assert.equal(daysWaiting(recut, [...stages, recut, recutLaser], job, shortage, now), 1);
});

test("nothing to count from says nothing", () => {
  assert.equal(daysWaiting(stages[2], [], {}, null, now), null);
  assert.equal(daysWaitingText(null), "");
});

test("words", () => {
  assert.equal(daysWaitingText(0), "Waiting since today");
  assert.equal(daysWaitingText(1), "1 day waiting");
  assert.equal(daysWaitingText(6), "6 days waiting");
});
