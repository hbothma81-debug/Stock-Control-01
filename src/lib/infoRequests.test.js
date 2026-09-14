// Info Request rules: how long a job has stood, who is told, and what
// stays on the list after a refresh. Run with:   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { standingFor, infoRequestRecipients, mergeInfoRequests, openRequestsByProcess } from "./infoRequests.js";

const at = (iso) => ({ created_at: iso });
const NOW = Date.parse("2026-09-14T12:00:00Z");

test("standing time reads in minutes, then hours, then days", () => {
  assert.equal(standingFor(at("2026-09-14T11:59:40Z"), NOW), "just now");
  assert.equal(standingFor(at("2026-09-14T11:15:00Z"), NOW), "45 min");
  assert.equal(standingFor(at("2026-09-14T10:00:00Z"), NOW), "2 h");
  assert.equal(standingFor(at("2026-09-14T09:50:00Z"), NOW), "2 h 10 min");
  assert.equal(standingFor(at("2026-09-13T11:00:00Z"), NOW), "1 day");
  assert.equal(standingFor(at("2026-09-11T12:00:00Z"), NOW), "3 days");
});

test("no date is no label, never a made-up age", () => {
  assert.equal(standingFor({}, NOW), "");
  assert.equal(standingFor(null, NOW), "");
});

const profiles = [
  { id: "rep", name: "Johan", is_admin: false },
  { id: "noname", name: "", email: "piet@example.com", is_admin: false },
  { id: "a1", name: "Heinrich", is_admin: true },
  { id: "a2", name: "Boss", is_admin: true },
];

test("the job's sales rep is told, matched by name, case and spaces ignored", () => {
  assert.deepEqual(infoRequestRecipients(" johan ", profiles), ["rep"]);
});

test("a rep with no name on their profile is matched by email", () => {
  assert.deepEqual(infoRequestRecipients("piet@example.com", profiles), ["noname"]);
});

test("no rep, or a rep who does not sign in, tells every admin", () => {
  assert.deepEqual(infoRequestRecipients("", profiles), ["a1", "a2"]);
  assert.deepEqual(infoRequestRecipients("Sipho", profiles), ["a1", "a2"]);
});

test("a refresh drops what was answered or cleared elsewhere, oldest stays first", () => {
  const held = [
    { id: "1", status: "open", created_at: "2026-09-14T08:00:00Z" },
    { id: "2", status: "open", created_at: "2026-09-14T09:00:00Z" },
  ];
  const arrived = [
    { id: "1", status: "answered", created_at: "2026-09-14T08:00:00Z" },
    { id: "3", status: "open", created_at: "2026-09-14T07:00:00Z" },
  ];
  assert.deepEqual(mergeInfoRequests(held, arrived).map((r) => r.id), ["3", "2"]);
});

test("open requests are grouped by stage; closed ones and ones with no stage are left out", () => {
  const map = openRequestsByProcess([
    { id: "1", status: "open", process_id: "p1" },
    { id: "2", status: "open", process_id: "p1" },
    { id: "3", status: "cleared", process_id: "p1" },
    { id: "4", status: "open", process_id: null },
  ]);
  assert.deepEqual(Object.keys(map), ["p1"]);
  assert.deepEqual(map.p1.map((r) => r.id), ["1", "2"]);
});
