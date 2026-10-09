import { test } from "node:test";
import assert from "node:assert/strict";
import { changeWords, entryHeadline, fieldWords, historyEntries } from "./historyRules.js";

const rows = [
  // newest first, as the database is asked for them
  { seq: 6, kind: "changed", changed_by: "Anna", created_at: "2026-10-08T15:30:00Z", changes: [{ field: "settings.markup_material", from: 60, to: 50 }] },
  { seq: 5, kind: "changed", changed_by: "Pieter", created_at: "2026-10-08T15:03:40Z", changes: [{ field: "price_per_part", from: 304.572, to: 290.1, qty: 20 }, { field: "customer", from: "HPE", to: "BPW" }] },
  { seq: 4, kind: "revision", rev: "F", changed_by: "Pieter", created_at: "2026-10-08T15:03:24Z", changes: [{ field: "source", to: "generated" }, { field: "cycle_s", to: 461 }] },
  { seq: 3, kind: "changed", changed_by: "Pieter", created_at: "2026-10-08T15:03:24Z", changes: [{ field: "status", from: "not_for_machine", to: "ready" }, { field: "fault", from: "bore too deep", to: "" }] },
  { seq: 1, kind: "made", changed_by: "Test", created_at: "2026-10-07T09:00:00Z", changes: [] },
];

test("one save and what the same person did within two minutes are one entry, newest first", () => {
  const e = historyEntries(rows);
  assert.equal(e.length, 3);
  assert.equal(e[0].who, "Anna");
  assert.equal(e[1].who, "Pieter");
  assert.deepEqual(e[1].revs, ["F"]);
  assert.equal(e[1].rows.length, 3);
  assert.equal(e[2].made, true);
});

test("two revisions a minute apart are two entries; a program made with its first revision is one", () => {
  const e = historyEntries([
    { seq: 4, kind: "revision", rev: "B", changed_by: "Test", created_at: "2026-10-08T10:07:00Z", changes: [] },
    { seq: 3, kind: "revision", rev: "A", changed_by: "Test", created_at: "2026-10-08T10:06:30Z", changes: [] },
    { seq: 2, kind: "made", changed_by: "Test", created_at: "2026-10-08T10:06:30Z", changes: [] },
  ]);
  assert.equal(e.length, 2);
  assert.equal(entryHeadline(e[0]), "Rev B saved");
  assert.equal(entryHeadline(e[1]), "Program made · Rev A saved");
});

test("each entry's one line", () => {
  const e = historyEntries(rows);
  assert.equal(entryHeadline(e[0]), "changed material markup");
  assert.match(entryHeadline(e[1]), /^Rev F saved · cost per part R \S+ · changed customer · now ready for the machine$/);
  assert.equal(entryHeadline(e[2]), "Program made");
  assert.ok(!entryHeadline(e[1], { canSeeValue: false }).includes("R "));
});

test("each change in words, old to new", () => {
  assert.equal(changeWords({ field: "customer", from: "HPE", to: "BPW" }), "Customer: HPE → BPW");
  assert.equal(changeWords({ field: "settings.markup_offcut", from: null, to: 40 }), "Offcut markup: 60% (default) → 40%");
  assert.equal(changeWords({ field: "settings.qty", from: 1, to: 20 }), "Batch quantity: 1 → 20");
  assert.equal(changeWords({ field: "status", from: "ready", to: "not_for_machine" }), "Status: Ready for the machine → Not for machine");
  assert.equal(changeWords({ field: "fault", from: "x", to: "" }), "Fault cleared");
  assert.equal(changeWords({ field: "source", to: "machine_copy" }), "Machine copy imported");
  assert.equal(changeWords({ field: "source", to: "edited" }), "Program edited in the app");
  assert.equal(changeWords({ field: "cycle_s", to: 461 }), "Cycle time 7 min 41 s");
  assert.equal(changeWords({ field: "settings.turret", from: null, to: { 1: "WNMG" } }), "Tool crib set by hand");
  assert.equal(changeWords({ field: "settings.turret", from: { 1: "WNMG" }, to: null }), "Tool crib handed back to the automatic pick");
  assert.equal(changeWords({ field: "settings.charge_all_material", from: false, to: true }), "Charge all material to this job: no → yes");
  assert.match(changeWords({ field: "price_per_part", from: 304.572, to: 290.1, qty: 20 }), /^Cost per part: R .+ → R .+ \(batch of 20\)$/);
});

test("money is said only to people who may see Rand values", () => {
  assert.equal(changeWords({ field: "price_per_part", from: 1, to: 2 }, { canSeeValue: false }), "Cost per part changed");
  assert.equal(changeWords({ field: "settings.markup_material", from: 60, to: 50 }, { canSeeValue: false }), "Material markup changed");
  assert.equal(changeWords({ field: "customer", from: "A", to: "B" }, { canSeeValue: false }), "Customer: A → B");
});

test("a questionnaire field uses the Settings tab's own label and words", () => {
  assert.equal(fieldWords("settings.stock_type"), "Stock");
  assert.equal(changeWords({ field: "settings.stock_type", from: "bar", to: "tube" }), "Stock: Solid bar → Tube");
  assert.equal(fieldWords("settings.something_new"), "something new");
});
