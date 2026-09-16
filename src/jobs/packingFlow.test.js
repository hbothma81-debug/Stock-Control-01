import { test } from "node:test";
import assert from "node:assert/strict";
import { packingStageFor, packerReleases, packingRaises, packingIsFull, stageCoversPacking } from "./packingFlow.js";

// A flow shaped like live's: plate Nesting, Laser, Packer, then Laser -
// External and Bending, Welding; the tube stages in their own lane.
const FLOW = ["Nesting", "Laser", "Tube Laser", "Packer", "Laser - External", "Bending", "Welding", "Invoicing"];
const isPlate = (n) => n === "Nesting" || n === "Laser";
const isTube = (n) => n === "Tube Laser";
const ctx = {
  flowRank: (n) => FLOW.indexOf(n),
  isPlateLaserStage: isPlate,
  isPackingStage: (n) => n === "Packer",
  inOtherLane: (a, b) => (isTube(a) && (isPlate(b) || b === "Packer")) || ((isPlate(a) || a === "Packer") && isTube(b)),
  stageIsCleared: (p) => !!p.is_complete || (p.process_name === "Packer" && !!p.started_at),
};

const stage = (id, name, extra = {}) => ({ id, process_name: name, shortage_id: null, is_complete: false, started_at: null, ...extra });
const job68 = (packerTaken) => [
  stage("n", "Nesting", { is_complete: true }),
  stage("l", "Laser"),
  stage("p", "Packer", packerTaken ? { started_at: "2026-09-16T08:00:00Z" } : {}),
  stage("x", "Laser - External"),
  stage("b", "Bending"),
  stage("w", "Welding"),
];
const find = (list, id) => list.find((s) => s.id === id);

test("the packing stage for a later stage is the job's plate packer", () => {
  const stages = job68(true);
  assert.equal(packingStageFor(find(stages, "b"), stages, ctx).id, "p");
  assert.equal(packingStageFor(find(stages, "l"), stages, ctx), null, "Laser comes before the packer");
  assert.equal(packingStageFor(find(stages, "p"), stages, ctx), null, "the packer is not its own packer");
});

test("rule 1: once the packer is taken, Laser and Nesting stop holding Bending", () => {
  const stages = job68(true);
  const bending = find(stages, "b");
  assert.equal(packerReleases(find(stages, "l"), bending, stages, ctx), true);
  assert.equal(packerReleases(find(stages, "n"), bending, stages, ctx), true);
  assert.equal(packerReleases(find(stages, "x"), bending, stages, ctx), false, "Laser - External still holds");
  assert.equal(packerReleases(find(stages, "l"), find(stages, "w"), stages, ctx), true, "any stage after the packer");
});

test("rule 1: a packer nobody has taken releases nothing, and the packer still waits for Laser", () => {
  const stages = job68(false);
  assert.equal(packerReleases(find(stages, "l"), find(stages, "b"), stages, ctx), false);
  const taken = job68(true);
  assert.equal(packerReleases(find(taken, "l"), find(taken, "p"), taken, ctx), false);
});

test("rule 1: a job with no packer, a re-cut's own run, and the tube lane are untouched", () => {
  const noPacker = job68(true).filter((s) => s.id !== "p");
  assert.equal(packerReleases(find(noPacker, "l"), find(noPacker, "b"), noPacker, ctx), false);
  // A re-cut run: its catch-up Laser is released only by the re-cut's own packer.
  const recut = [
    ...job68(true),
    stage("rl", "Laser", { shortage_id: "s1" }),
    stage("rp", "Packer", { shortage_id: "s1" }),
    stage("rb", "Bending", { shortage_id: "s1" }),
  ];
  assert.equal(packerReleases(find(recut, "rl"), find(recut, "rb"), recut, ctx), false, "its packer is not taken");
  assert.equal(packerReleases(find(recut, "l"), find(recut, "rb"), recut, ctx), false, "the job's Laser is another run");
  const tube = [...job68(true), stage("t", "Tube Laser")];
  assert.equal(packerReleases(find(tube, "t"), find(tube, "b"), tube, ctx), false, "a tube stage is not a plate laser stage");
});

// Lines: a plain laser bracket, and a bumper (3 off) whose parts are 6
// plates and 12 gussets, both cut on the plate laser. The packer takes the
// parts and plain laser lines, never the bumper itself.
const bracket = { id: "br", qty: 10 };
const bumper = { id: "bu", qty: 3 };
const plate = { id: "pl", qty: 6, parent_quote_item_id: "bu" };
const gusset = { id: "gu", qty: 12, parent_quote_item_id: "bu" };
const outside = { id: "ou", qty: 4 };
const jobItems = [bracket, bumper, plate, gusset, outside];
const packingTakes = (it) => it.id !== "bu" && it.id !== "ou";

test("rule 2: a bend counted raises the packer's count to match, never lowers it", () => {
  assert.deepEqual(packingRaises({ line: bracket, newDone: 7, jobItems, packingTakes, progress: new Map([["br", 5]]) }), [{ itemId: "br", qty: 7 }]);
  assert.deepEqual(packingRaises({ line: bracket, newDone: 4, jobItems, packingTakes, progress: new Map([["br", 5]]) }), []);
  assert.deepEqual(packingRaises({ line: bracket, newDone: 15, jobItems, packingTakes, progress: new Map() }), [{ itemId: "br", qty: 10 }], "capped at the line's quantity");
});

test("rule 2: a line with parts raises its parts in proportion", () => {
  assert.deepEqual(
    packingRaises({ line: bumper, newDone: 1, jobItems, packingTakes, progress: new Map([["gu", 4]]) }),
    [{ itemId: "pl", qty: 2 }],
    "one bumper of three: 2 of 6 plates; gussets already at 4 of the 4 needed"
  );
  assert.deepEqual(packingRaises({ line: bumper, newDone: 3, jobItems, packingTakes, progress: new Map() }), [
    { itemId: "pl", qty: 6 },
    { itemId: "gu", qty: 12 },
  ]);
  assert.deepEqual(packingRaises({ line: outside, newDone: 4, jobItems, packingTakes, progress: new Map() }), [], "the packer does not handle it");
});

test("rule 2: packing is full only when every line it handles is counted", () => {
  const full = new Map([["br", 10], ["pl", 6], ["gu", 12]]);
  assert.equal(packingIsFull({ jobItems, packingTakes, progress: full }), true);
  assert.equal(packingIsFull({ jobItems, packingTakes, progress: new Map([["br", 10], ["pl", 6], ["gu", 11]]) }), false);
  assert.equal(packingIsFull({ jobItems, packingTakes: () => false, progress: full }), false, "a packer with nothing is never finished by this");
});

test("rule 2: a whole tick covers packing when the stage takes every packer line or its parent", () => {
  const bendingTakes = (it) => !it.parent_quote_item_id; // every line, parents not parts
  assert.equal(stageCoversPacking({ jobItems, packingTakes, stageTakes: bendingTakes }), true);
  const drillingTakes = (it) => it.id === "br"; // one line only
  assert.equal(stageCoversPacking({ jobItems, packingTakes, stageTakes: drillingTakes }), false);
  assert.equal(stageCoversPacking({ jobItems, packingTakes: () => false, stageTakes: bendingTakes }), false);
});
