import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ownPackingStage,
  nestingDone,
  laserWorkDone,
  packerReleases,
  packingCarriedFrom,
  packingRaises,
  packingIsFull,
  stageCoversPacking,
  countedAfterPacking,
} from "./packingFlow.js";

// A flow shaped like live's, with the name rules App.jsx uses: plate nesting
// is /nest/ without "tube"; the program laser is /laser/ without "tube" or
// "external"; tube stages have "tube" with /laser|nest/; Packer is the
// packing stage by setting, not by name.
const FLOW = ["Nesting", "Laser", "Tube Laser Nesting", "Tube Laser", "Packer", "Laser - External", "Bending", "Drilling", "Welding", "Invoicing"];
const CUTS = { Nesting: "laser", Laser: "laser", Packer: "laser", "Laser - External": "laser_external", "Tube Laser": "tube_laser", "Tube Laser Nesting": "tube_laser" };
const ctx = {
  flowRank: (n) => {
    const i = FLOW.indexOf(n);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  },
  isNestingStage: (n) => /nest/i.test(n) && !/tube/i.test(n),
  isLaserCutStage: (n) => /laser/i.test(n) && !/tube/i.test(n) && !/external/i.test(n),
  isPackingStage: (n) => n === "Packer",
  isTubeStage: (n) => /tube/i.test(n) && /laser|nest/i.test(n),
  cutsMadeOn: (n) => CUTS[n] || "",
  stageIsCleared: (p) => !!p.is_complete || (p.process_name === "Packer" && !!p.started_at),
  neverRelease: (n) => n.toLowerCase() === "invoicing",
};

const stage = (id, name, extra = {}) => ({ id, process_name: name, shortage_id: null, is_complete: false, started_at: null, tracking_mode: "batch", ...extra });
// JOB-0068 as Heinrich described it: nested, 4 programs still to cut, the
// packer has taken it, Bending counts per item.
const job68 = ({ taken = true, nested = true, bendingMode = "each" } = {}) => [
  stage("n", "Nesting", { is_complete: nested }),
  stage("l", "Laser"),
  stage("p", "Packer", { tracking_mode: "each", started_at: taken ? "2026-09-16T08:00:00Z" : null }),
  stage("x", "Laser - External", { tracking_mode: "each" }),
  stage("b", "Bending", { tracking_mode: bendingMode }),
  stage("d", "Drilling", { tracking_mode: "each" }),
  stage("w", "Welding"),
  stage("i", "Invoicing", { tracking_mode: "each" }),
];
const by = (list, id) => list.find((s) => s.id === id);

test("the job's own packer, nesting done, laser work done", () => {
  const s = job68();
  assert.equal(ownPackingStage(s, ctx).id, "p");
  assert.equal(nestingDone(s, ctx), true);
  assert.equal(nestingDone(job68({ nested: false }), ctx), false);
  assert.equal(nestingDone(s.filter((x) => x.id !== "n"), ctx), false, "no Nesting stage is not 'nothing more to nest'");
  assert.equal(laserWorkDone(s, ctx), false, "Laser still open");
  assert.equal(laserWorkDone(s.map((x) => (x.id === "l" ? { ...x, is_complete: true } : x)), ctx), true);
});

test("rule 1: a taken packer and nesting done release Laser for a per-item Bending", () => {
  const s = job68();
  assert.equal(packerReleases(by(s, "l"), by(s, "b"), s, ctx), true);
  assert.equal(packerReleases(by(s, "l"), by(s, "d"), s, ctx), true, "any per-item stage after the packer");
});

test("rule 1: never Nesting, never another stage, never before the packer", () => {
  const s = job68({ nested: false }).map((x) => (x.id === "n" ? x : x));
  assert.equal(packerReleases(by(s, "n"), by(s, "b"), s, ctx), false, "Nesting is never released");
  const t = job68();
  assert.equal(packerReleases(by(t, "x"), by(t, "b"), t, ctx), false, "Laser - External still holds");
  assert.equal(packerReleases(by(t, "p"), by(t, "b"), t, ctx), false, "the packer itself is not released");
  assert.equal(packerReleases(by(t, "l"), by(t, "p"), t, ctx), false, "the packer still waits for Laser");
});

test("rule 1: nothing released while more may be nested, or before the packer is taken", () => {
  const notNested = job68({ nested: false });
  assert.equal(packerReleases(by(notNested, "l"), by(notNested, "b"), notNested, ctx), false);
  const notTaken = job68({ taken: false });
  assert.equal(packerReleases(by(notTaken, "l"), by(notTaken, "b"), notTaken, ctx), false);
});

test("rule 1: never a stage on one tick, never Invoicing, never a re-cut, never with no packer", () => {
  const batch = job68({ bendingMode: "batch" });
  assert.equal(packerReleases(by(batch, "l"), by(batch, "b"), batch, ctx), false, "one tick could be ticked done with parts still on the laser");
  const s = job68();
  assert.equal(packerReleases(by(s, "l"), by(s, "i"), s, ctx), false, "Invoicing is never released");
  const recut = [...s, stage("rl", "Laser", { shortage_id: "s1" }), stage("rp", "Packer", { shortage_id: "s1", started_at: "x" }), stage("rb", "Bending", { shortage_id: "s1", tracking_mode: "each" })];
  assert.equal(packerReleases(by(recut, "rl"), by(recut, "rb"), recut, ctx), false, "a re-cut keeps today's behaviour");
  const noPacker = s.filter((x) => x.id !== "p");
  assert.equal(packerReleases(by(noPacker, "l"), by(noPacker, "b"), noPacker, ctx), false);
  const orphan = [...s, stage("o", "Old stage", { tracking_mode: "each" })];
  assert.equal(packerReleases(by(orphan, "l"), by(orphan, "o"), orphan, ctx), false, "a stage no longer in the flow is not 'after the packer'");
});

test("rule 2: counts carry only from own-run stages after the packer with no machine", () => {
  const s = job68();
  assert.equal(packingCarriedFrom(by(s, "b"), s, ctx).id, "p");
  assert.equal(packingCarriedFrom(by(s, "w"), s, ctx).id, "p", "Welding too, whatever its mode");
  assert.equal(packingCarriedFrom(by(s, "x"), s, ctx), null, "Laser - External has a machine");
  assert.equal(packingCarriedFrom(by(s, "l"), s, ctx), null, "the laser is before packing");
  const tube = [...s, stage("t", "Tube Laser", { tracking_mode: "each" })];
  assert.equal(packingCarriedFrom(by(tube, "t"), tube, ctx), null, "the tube laser never reaches the plate packer");
  const recut = [...s, stage("rb", "Bending", { shortage_id: "s1" })];
  assert.equal(packingCarriedFrom(by(recut, "rb"), recut, ctx), null);
  const packed = s.map((x) => (x.id === "p" ? { ...x, is_complete: true } : x));
  assert.equal(packingCarriedFrom(by(packed, "b"), packed, ctx), null, "nothing to carry into a finished packer");
});

// Lines: a plain laser bracket, and a bumper (3 off) whose parts are 6
// plates and 12 gussets. The packer takes the parts and plain laser lines,
// never the bumper itself, nor an outside-supplier plate.
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
  assert.deepEqual(packingRaises({ line: bracket, newDone: 15, jobItems, packingTakes, progress: new Map() }), [{ itemId: "br", qty: 10 }]);
});

test("rule 2: a line with parts raises its parts in proportion", () => {
  assert.deepEqual(packingRaises({ line: bumper, newDone: 1, jobItems, packingTakes, progress: new Map([["gu", 4]]) }), [{ itemId: "pl", qty: 2 }]);
  assert.deepEqual(packingRaises({ line: bumper, newDone: 3, jobItems, packingTakes, progress: new Map() }), [
    { itemId: "pl", qty: 6 },
    { itemId: "gu", qty: 12 },
  ]);
  assert.deepEqual(packingRaises({ line: outside, newDone: 4, jobItems, packingTakes, progress: new Map() }), []);
});

test("rule 2: packing is full only when every line it handles is counted", () => {
  assert.equal(packingIsFull({ jobItems, packingTakes, progress: new Map([["br", 10], ["pl", 6], ["gu", 12]]) }), true);
  assert.equal(packingIsFull({ jobItems, packingTakes, progress: new Map([["br", 10], ["pl", 6], ["gu", 11]]) }), false);
  assert.equal(packingIsFull({ jobItems, packingTakes: () => false, progress: new Map() }), false);
});

test("rule 2: a whole stage covers packing when it takes every packer line or its parent", () => {
  assert.equal(stageCoversPacking({ jobItems, packingTakes, stageTakes: (it) => !it.parent_quote_item_id }), true);
  assert.equal(stageCoversPacking({ jobItems, packingTakes, stageTakes: (it) => it.id === "br" }), false);
});

test("the packer's row: the highest count carried from each later stage, by name", () => {
  const s = job68();
  const progress = [
    { job_process_id: "b", job_quote_item_id: "br", qty_complete: 6 },
    { job_process_id: "d", job_quote_item_id: "br", qty_complete: 8 },
    { job_process_id: "x", job_quote_item_id: "ou", qty_complete: 4 },
    { job_process_id: "p", job_quote_item_id: "br", qty_complete: 3 },
  ];
  assert.deepEqual(countedAfterPacking(s, progress, ctx), { br: { qty: 8, stage: "Drilling" } });
});
