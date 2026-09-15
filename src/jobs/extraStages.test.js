import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extraStagesOf,
  markedStageTakes,
  routePosition,
  comesBeforeForLine,
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
