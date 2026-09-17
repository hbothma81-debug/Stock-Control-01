import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extraStagesOf,
  markedStageTakes,
  jobIsMarked,
  routePosition,
  comesBeforeForLine,
  orderedByLines,
  routeText,
  renameInList,
  moveInList,
} from "./extraStages.js";

// A factory flow shaped like live's, with Machining - External placed after
// Bending on purpose: the parts below must still go the way each one says.
const FLOW = ["Nesting", "Laser", "Packer", "Laser - External", "Bending", "Drilling", "Machining - External", "Welding", "Invoicing"];
const CUTS = { Nesting: "laser", Laser: "laser", Packer: "laser", "Laser - External": "laser_external", "Machining - External": "machining_external" };
const ctx = { flowRank: (n) => FLOW.indexOf(n), cutsMadeOn: (n) => CUTS[n] || "" };
const before = (line, a, b) => comesBeforeForLine(line, a, b, ctx);

const partA = { made_on: "laser", extra_stages: ["Machining - External", "Bending"] }; // cut, machine, bend
const partB = { made_on: "laser", extra_stages: ["Bending", "Machining - External"] }; // cut, bend, machine
const partC = { made_on: "machining_external", extra_stages: ["Bending"] }; // from the supplier, then bent
const never = { made_on: "laser", extra_stages: null };
const nothing = { made_on: "laser", extra_stages: [] };

test("a list never set is null; an empty list is a real answer", () => {
  assert.equal(extraStagesOf(never), null);
  assert.deepEqual(extraStagesOf(nothing), []);
  assert.equal(extraStagesOf({}), null);
});

test("a marked-only stage takes what names it, what was never set, and its own first step", () => {
  assert.equal(markedStageTakes("Bending", "", partA), true);
  assert.equal(markedStageTakes("Drilling", "", partA), false);
  assert.equal(markedStageTakes("bending ", "", partA), true, "names match with case and spaces ignored");
  assert.equal(markedStageTakes("Bending", "", never), true, "never set goes everywhere");
  assert.equal(markedStageTakes("Bending", "", nothing), false, "nothing extra goes nowhere extra");
  assert.equal(markedStageTakes("Machining - External", "machining_external", { made_on: "machining_external", extra_stages: [] }), true);
});

test("route positions: first step 0, then the list in order", () => {
  assert.equal(routePosition(partA, "Laser", "laser"), 0);
  assert.equal(routePosition(partA, "Machining - External", "machining_external"), 1);
  assert.equal(routePosition(partA, "Bending", ""), 2);
  assert.equal(routePosition(partA, "Welding", ""), null);
  assert.equal(routePosition(never, "Bending", ""), null);
});

test("cut, machine, bend: Bending waits for machining, machining does not wait for Bending", () => {
  assert.equal(before(partA, "Machining - External", "Bending"), true);
  assert.equal(before(partA, "Bending", "Machining - External"), false);
  assert.equal(before(partA, "Laser", "Machining - External"), true);
});

test("cut, bend, machine: the other way round, on the same flow", () => {
  assert.equal(before(partB, "Bending", "Machining - External"), true);
  assert.equal(before(partB, "Machining - External", "Bending"), false);
});

test("from the machining supplier, then bent: the first step beats the flow", () => {
  assert.equal(before(partC, "Machining - External", "Bending"), true);
  assert.equal(before(partC, "Bending", "Machining - External"), false);
});

test("two stages at the same first step keep the factory order (Nesting, Laser, Packer)", () => {
  assert.equal(before(partA, "Nesting", "Packer"), true);
  assert.equal(before(partA, "Packer", "Nesting"), false);
});

test("a stage off the line's route is ordered by the flow, as today", () => {
  assert.equal(before(partA, "Machining - External", "Welding"), true);
  assert.equal(before(partA, "Welding", "Bending"), false);
  assert.equal(before(never, "Bending", "Machining - External"), true);
  assert.equal(before(never, "Machining - External", "Bending"), false);
});

test("the route prints with plain > and nothing blank", () => {
  assert.equal(routeText("Laser", partA), "Laser > Machining - External > Bending");
  assert.equal(routeText("", partC), "Bending");
  assert.equal(routeText("Laser", never), "Laser");
  assert.equal(routeText("", nothing), "");
  assert.doesNotMatch(routeText("Laser", partA), /[^\x20-\x7e]/, "only characters the PDF font has");
});

test("a stage rename rewrites the lists and leaves never-set alone", () => {
  assert.deepEqual(renameInList(["Machine/Drilling/CNC", "Bending"], "machine/drilling/cnc", "CNC Lathe"), ["CNC Lathe", "Bending"]);
  assert.equal(renameInList(null, "Bending", "Folding"), null);
  assert.deepEqual(renameInList([], "Bending", "Folding"), []);
});

test("moving a stage swaps it with its neighbour and refuses the ends", () => {
  assert.deepEqual(moveInList(["Bending", "Drilling", "Machining - External"], 1, -1), ["Drilling", "Bending", "Machining - External"]);
  assert.deepEqual(moveInList(["Bending", "Drilling"], 0, -1), ["Bending", "Drilling"]);
  assert.deepEqual(moveInList(["Bending", "Drilling"], 1, 1), ["Bending", "Drilling"]);
});

// Review, 16 Sep 2026, fixed 17 Sep. A line from the machining supplier whose
// list was never set: machined first, then bent, whatever the flow says.
test("a first step beats the flow against an extra stage even where the list was never set", () => {
  const marked = { ...ctx, isMarked: (n) => n === "Bending" || n === "Machining - External" || n === "Drilling" };
  const fromSupplier = { made_on: "machining_external", extra_stages: null };
  assert.equal(comesBeforeForLine(fromSupplier, "Machining - External", "Bending", marked), true, "machined before it is bent");
  assert.equal(comesBeforeForLine(fromSupplier, "Bending", "Machining - External", marked), false, "machining does not wait for Bending");
  assert.equal(comesBeforeForLine(never, "Laser", "Bending", marked), true, "a laser part is cut before it is bent, as the flow says");
  assert.equal(comesBeforeForLine(never, "Bending", "Laser", marked), false);
  assert.equal(comesBeforeForLine(never, "Nesting", "Laser", marked), true, "two first steps keep the factory order");
  assert.equal(comesBeforeForLine(never, "Bending", "Drilling", marked), true, "two extra stages on a never-set line keep the factory order");
  // With no extra stage in the pair, or no isMarked at all, nothing changes.
  assert.equal(comesBeforeForLine(fromSupplier, "Welding", "Machining - External", { ...ctx, isMarked: () => false }), false);
  assert.equal(before(fromSupplier, "Bending", "Machining - External"), true, "without isMarked the flow decides, as before");
});

test("two extra stages are ordered by their lines only when both count per item", () => {
  const isMarked = (n) => n === "Bending" || n === "Machining - External";
  const st = (process_name, tracking_mode) => ({ process_name, tracking_mode });
  assert.equal(orderedByLines(st("Bending", "each"), st("Machining - External", "each"), isMarked), true);
  assert.equal(orderedByLines(st("Bending", "batch"), st("Machining - External", "each"), isMarked), false, "one tick keeps the factory order");
  assert.equal(orderedByLines(st("Bending", "each"), st("Machining - External"), isMarked), false, "no mode means one tick");
  assert.equal(orderedByLines(st("Bending", "each"), st("Welding", "each"), isMarked), false, "Welding is not an extra stage");
});

// 17 Sep 2026: the Then box switches a stage on the first time a line names
// it, so switching one on must change nothing for lines nobody has set.
test("a machine stage used as an extra stage keeps to its own and untagged lines until a line names it", () => {
  const laserNeverSet = { made_on: "laser", extra_stages: null };
  const untaggedNeverSet = { made_on: "", extra_stages: null };
  assert.equal(markedStageTakes("CNC Lathe", "cnc", laserNeverSet), false, "an unset laser part does not land in front of the lathe");
  assert.equal(markedStageTakes("CNC Lathe", "cnc", untaggedNeverSet), true, "an untagged line still does, as before the switch");
  assert.equal(markedStageTakes("CNC Lathe", "cnc", { made_on: "cnc", extra_stages: null }), true, "its own lines, as before");
  assert.equal(markedStageTakes("CNC Lathe", "cnc", { made_on: "laser", extra_stages: ["Bending", "CNC Lathe"] }), true, "a laser part that names it");
  assert.equal(markedStageTakes("CNC Lathe", "cnc", { made_on: "laser", extra_stages: [] }), false);
  assert.equal(markedStageTakes("Bending", "", laserNeverSet), true, "a stage with no machine still takes every unset line");
});

// Heinrich, 17 Sep 2026: he marks the lines that need a stage; the rest need
// nothing. JOB-0068: 16 marked Bending, 26 Drilling, 36 left unset.
test("once any line on the job is marked, the unset lines go to no extra stage", () => {
  const bend = { made_on: "laser", extra_stages: ["Bending"] };
  const drill = { made_on: "laser", extra_stages: ["Drilling"] };
  const unset = { made_on: "laser", extra_stages: null };
  assert.equal(jobIsMarked([unset, unset]), false, "a job nobody has marked");
  assert.equal(jobIsMarked([unset, bend]), true);
  assert.equal(jobIsMarked([unset, { made_on: "laser", extra_stages: [] }]), true, "nothing extra is an answer too");
  assert.equal(jobIsMarked(null), false);
  const marked = { jobMarked: true };
  assert.equal(markedStageTakes("Bending", "", unset, marked), false, "the unset line leaves Bending");
  assert.equal(markedStageTakes("Drilling", "", unset, marked), false);
  assert.equal(markedStageTakes("Bending", "", bend, marked), true);
  assert.equal(markedStageTakes("Bending", "", drill, marked), false);
  assert.equal(markedStageTakes("Bending", "", unset, { jobMarked: false }), true, "a job nobody has marked keeps every line");
  assert.equal(markedStageTakes("Bending", "", unset), true, "and so does a caller that does not say");
  // A stage with its own machine keeps its own and untagged lines either way.
  assert.equal(markedStageTakes("Machining - External", "machining_external", { made_on: "machining_external", extra_stages: null }, marked), true);
  assert.equal(markedStageTakes("CNC Lathe", "cnc", { made_on: "", extra_stages: null }, marked), true, "an untagged line is about the cut method, not the Then box");
});
