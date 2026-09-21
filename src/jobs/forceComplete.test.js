// Force complete, the Invoicing warning, and the whole-job urgent button.
//
// Run with:   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mayForceComplete,
  forcedBy,
  stageLabel,
  openStages,
  forceWarningText,
  forceRefusedText,
  forceHistoryText,
  wholeJobUrgent,
} from "./forceComplete.js";

// JOB-0055 as it stood on live, 18 Sep 2026.
const job55 = [
  { id: "n", process_name: "Nesting", is_complete: true },
  { id: "w", process_name: "Welding", is_complete: true },
  { id: "i", process_name: "Invoicing", is_complete: true },
  { id: "rw", process_name: "Welding", is_complete: false, shortage_id: "s1" },
  { id: "rg", process_name: "Grinding/Polishing", is_complete: false, shortage_id: "s1" },
];

test("admins and sales people may force, nobody else", () => {
  assert.equal(mayForceComplete({ isAdmin: true }), true);
  assert.equal(mayForceComplete({ isSalesPerson: true }), true);
  assert.equal(mayForceComplete({ isAdmin: false, isSalesPerson: false }), false);
  assert.equal(mayForceComplete({}), false);
  assert.equal(mayForceComplete(), false);
});

test("a forced stage says so beside the name", () => {
  assert.equal(forcedBy("Gawie Labuschagne"), "Gawie Labuschagne (forced)");
  assert.equal(forcedBy(""), "Someone (forced)");
});

test("a re-cut's stage is told apart from the job's own", () => {
  assert.equal(stageLabel(job55[1]), "Welding");
  assert.equal(stageLabel(job55[3]), "Welding (re-cut)");
});

test("open stages: re-cut runs included, the stage being ticked left out", () => {
  assert.deepEqual(openStages(job55).map((p) => p.id), ["rw", "rg"]);
  const beforeInvoicing = job55.map((p) => (p.id === "i" ? { ...p, is_complete: false } : p));
  assert.deepEqual(openStages(beforeInvoicing).map((p) => p.id), ["i", "rw", "rg"]);
  assert.deepEqual(openStages(beforeInvoicing, { id: "i" }).map((p) => p.id), ["rw", "rg"]);
  assert.deepEqual(openStages(null), []);
});

test("the warning names every open stage and who it will be closed as", () => {
  const text = forceWarningText({ jobNumber: "JOB-0055", open: openStages(job55), actor: "Heinrich" });
  assert.match(text, /JOB-0055 still has 2 stages open/);
  assert.match(text, /• Welding \(re-cut\)\n {2}• Grinding\/Polishing \(re-cut\)/);
  assert.match(text, /"Heinrich \(forced\)"/);
  assert.match(text, /moves to To invoice/);
  assert.match(text, /Mark them all complete\?$/);
  assert.doesNotMatch(text, /invoice request/);
  assert.doesNotMatch(text, /laser/i);
  assert.doesNotMatch(text, /set aside/);
});

test("from the Invoicing tick it says the request goes and Invoicing is ticked", () => {
  const text = forceWarningText({ jobNumber: "JOB-0001", open: [job55[3]], actor: "Mark", withInvoicing: true });
  assert.match(text, /still has 1 stage open/);
  assert.match(text, /marks it complete as "Mark \(forced\)", sends the invoice request and ticks Invoicing/);
  assert.match(text, /Mark it complete\?$/);
});

test("work still on the laser and material still reserved are said, never hidden", () => {
  const text = forceWarningText({
    jobNumber: "JOB-0001",
    open: [{ id: "l", process_name: "Laser", is_complete: false }],
    actor: "Heinrich",
    uncutPrograms: ["P-0412", "P-0415"],
    reserved: ["Flat bar 40x5: 3 still reserved"],
  });
  assert.match(text, /still has program P-0412, P-0415 to cut/);
  assert.match(text, /stays on the laser's screens/);
  assert.match(text, /• Flat bar 40x5: 3 still reserved/);
});

test("somebody who may not force is refused, and told who can", () => {
  const text = forceRefusedText({ jobNumber: "JOB-0055", open: openStages(job55), salesRep: "Gawie Labuschagne" });
  assert.match(text, /Invoicing is not ticked/);
  assert.match(text, /Welding \(re-cut\)/);
  assert.match(text, /ask Gawie Labuschagne or an admin/);
  assert.match(forceRefusedText({ jobNumber: "JOB-1", open: [job55[3]], salesRep: "" }), /the job's sales person or an admin/);
});

test("the History line lists what was closed", () => {
  assert.equal(forceHistoryText(openStages(job55)), "Closed by force: Welding (re-cut), Grinding/Polishing (re-cut)");
});

test("whole job urgent: marks every open stage, unmarks only when all are", () => {
  const stages = [
    { id: "a", is_complete: true, is_urgent: false },
    { id: "b", is_complete: false, is_urgent: true },
    { id: "c", is_complete: false, is_urgent: false },
  ];
  const mark = wholeJobUrgent(stages);
  assert.equal(mark.on, true);
  assert.equal(mark.label, "Mark whole job urgent");
  assert.deepEqual(mark.ids, ["c"]);
  assert.equal(mark.urgentCount, 1);
  assert.equal(mark.openCount, 2);

  const unmark = wholeJobUrgent(stages.map((p) => ({ ...p, is_urgent: true })));
  assert.equal(unmark.on, false);
  assert.equal(unmark.label, "Unmark whole job urgent");
  assert.deepEqual(unmark.ids, ["b", "c"]);
});

test("whole job urgent: no button once nothing is open", () => {
  assert.equal(wholeJobUrgent([{ id: "a", is_complete: true }]), null);
  assert.equal(wholeJobUrgent([]), null);
  assert.equal(wholeJobUrgent(null), null);
});
