import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ownPackingStage,
  nestingDone,
  laserWorkDone,
  cuttingStarted,
  packerReleases,
  tickWaitsForLaser,
  tubeLaneReleases,
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

// JOB-0014 as Heinrich described it on 17 Sep 2026: cutting has started,
// nobody has pressed Take job, and Bending must open.
test("rule 1: cutting started opens the stages after the packer without Take job", () => {
  const cutting = (list) => list.map((x) => (x.id === "l" ? { ...x, started_at: "2026-09-17T06:00:00Z" } : x));
  assert.equal(cuttingStarted(job68({ taken: false }), ctx), false, "no sheet cut yet");
  const s = cutting(job68({ taken: false }));
  assert.equal(cuttingStarted(s, ctx), true);
  assert.equal(packerReleases(by(s, "l"), by(s, "b"), s, ctx), true, "Laser no longer holds Bending");
  assert.equal(packerReleases(by(s, "p"), by(s, "b"), s, ctx), true, "nor does a packer nobody has taken");
  assert.equal(packerReleases(by(s, "p"), by(s, "d"), s, ctx), true, "any per-item stage after the packer");
  assert.equal(packerReleases(by(s, "x"), by(s, "b"), s, ctx), false, "Laser - External still holds");
  assert.equal(packerReleases(by(s, "l"), by(s, "p"), s, ctx), false, "the packer still waits for Laser");
  assert.equal(packerReleases(by(s, "p"), by(s, "i"), s, ctx), false, "never Invoicing");
  const batch = cutting(job68({ taken: false, bendingMode: "batch" }));
  assert.equal(packerReleases(by(batch, "l"), by(batch, "b"), batch, ctx), true, "a stage on one tick opens too (choice A)");
  assert.equal(packerReleases(by(batch, "p"), by(batch, "b"), batch, ctx), true);
  const notNested = cutting(job68({ taken: false, nested: false }));
  assert.equal(packerReleases(by(notNested, "l"), by(notNested, "b"), notNested, ctx), false, "Nesting must be ticked first");
  assert.equal(packerReleases(by(notNested, "p"), by(notNested, "b"), notNested, ctx), false);
  const laserDone = job68({ taken: false }).map((x) => (x.id === "l" ? { ...x, is_complete: true } : x));
  assert.equal(packerReleases(by(laserDone, "p"), by(laserDone, "b"), laserDone, ctx), true, "a finished Laser has started");
  const recut = [...s, stage("rp", "Packer", { shortage_id: "s1" }), stage("rb", "Bending", { shortage_id: "s1", tracking_mode: "each" })];
  assert.equal(packerReleases(by(recut, "rp"), by(recut, "rb"), recut, ctx), false, "a re-cut keeps today's behaviour");
});

// Choice A, Heinrich 17 Sep 2026: a one-tick stage opens early like any
// other, so work can start; its Complete tick waits for the laser.
test("rule 3: a one-tick stage after the packer is not ticked Complete while the laser has work", () => {
  const s = job68({ bendingMode: "batch" });
  assert.equal(tickWaitsForLaser(by(s, "b"), s, ctx), true, "Bending on one tick, Laser open");
  assert.equal(tickWaitsForLaser(by(s, "w"), s, ctx), true, "Welding on one tick too");
  assert.equal(tickWaitsForLaser(by(s, "d"), s, ctx), false, "a per-item stage closes by its counts");
  assert.equal(tickWaitsForLaser(by(s, "i"), { ...s }, ctx), false);
  const invoicingOnOneTick = s.map((x) => (x.id === "i" ? { ...x, tracking_mode: "batch" } : x));
  assert.equal(tickWaitsForLaser(by(invoicingOnOneTick, "i"), invoicingOnOneTick, ctx), false, "Invoicing was never opened early");
  const externalOnOneTick = s.map((x) => (x.id === "x" ? { ...x, tracking_mode: "batch" } : x));
  assert.equal(tickWaitsForLaser(by(externalOnOneTick, "x"), externalOnOneTick, ctx), false, "a stage with its own machine finishes on its own");
  assert.equal(tickWaitsForLaser(by(s, "p"), s, ctx), false, "the packer has its own hold");
  assert.equal(tickWaitsForLaser(by(s, "l"), s, ctx), false);
  const laserDone = s.map((x) => (x.id === "l" ? { ...x, is_complete: true } : x));
  assert.equal(tickWaitsForLaser(by(laserDone, "b"), laserDone, ctx), false, "nothing left to cut");
  const notNested = job68({ bendingMode: "batch", nested: false }).map((x) => (x.id === "l" ? { ...x, is_complete: true } : x));
  assert.equal(tickWaitsForLaser(by(notNested, "b"), notNested, ctx), true, "Nesting still open counts as laser work");
  const noPacker = s.filter((x) => x.id !== "p");
  assert.equal(tickWaitsForLaser(by(noPacker, "b"), noPacker, ctx), false, "a job with no plate packer is left alone");
  const recut = [...s, stage("rb", "Bending", { shortage_id: "s1" })];
  assert.equal(tickWaitsForLaser(by(recut, "rb"), recut, ctx), false, "a re-cut's run is left alone");
});

test("rule 1: one tick opens too; never Invoicing, never a re-cut, never with no packer", () => {
  const batch = job68({ bendingMode: "batch" });
  assert.equal(packerReleases(by(batch, "l"), by(batch, "b"), batch, ctx), true, "one tick opens early; its Complete tick waits (rule 3)");
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

test("rule 2: a stage with 'laser' in its name never carries, even left on every item", () => {
  const blankExternal = { ...ctx, cutsMadeOn: (n) => (n === "Laser - External" ? "" : ctx.cutsMadeOn(n)), isAnyLaserStage: (n) => /laser/i.test(n) };
  const s = job68();
  assert.equal(packingCarriedFrom(by(s, "x"), s, blankExternal), null);
  assert.equal(packingCarriedFrom(by(s, "b"), s, blankExternal).id, "p");
});

test("the packer's row: a count on a line with parts is shown on its parts", () => {
  const s = job68();
  const progress = [{ job_process_id: "b", job_quote_item_id: "bu", qty_complete: 1 }];
  assert.deepEqual(countedAfterPacking(s, progress, ctx, { jobItems, packingTakes }), {
    pl: { qty: 2, stage: "Bending" },
    gu: { qty: 4, stage: "Bending" },
  });
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

// JOB-0094 as it stood on live, 17 Sep 2026: plate cutting started, the tube
// nester still busy, Bending on one tick waiting for Tube Laser Nesting.
test("the tube side: once the plate laser is cutting, a tube stage does not hold the stages after both lasers", () => {
  const mixed = ({ cutting = true, nested = true, bendingMode = "batch" } = {}) => [
    stage("tn", "Tube Laser Nesting"),
    stage("n", "Nesting", { is_complete: nested }),
    stage("l", "Laser", { started_at: cutting ? "2026-09-17T06:00:00Z" : null }),
    stage("t", "Tube Laser"),
    stage("p", "Packer"),
    stage("b", "Bending", { tracking_mode: bendingMode }),
    stage("i", "Invoicing"),
  ];
  const s = mixed();
  assert.equal(tubeLaneReleases(by(s, "tn"), by(s, "b"), s, ctx), true, "Tube Laser Nesting no longer holds Bending");
  assert.equal(tubeLaneReleases(by(s, "t"), by(s, "b"), s, ctx), true, "nor the Tube Laser stage");
  assert.equal(tubeLaneReleases(by(s, "tn"), by(s, "t"), s, ctx), false, "the tube laser still waits for its own nesting");
  assert.equal(tubeLaneReleases(by(s, "tn"), by(s, "p"), s, ctx), false, "the plate packer is not a stage after both lasers");
  assert.equal(tubeLaneReleases(by(s, "tn"), by(s, "i"), s, ctx), false, "never Invoicing");
  assert.equal(tubeLaneReleases(by(s, "n"), by(s, "b"), s, ctx), false, "only tube stages are released here");
  const each = mixed({ bendingMode: "each" });
  assert.equal(tubeLaneReleases(by(each, "tn"), by(each, "b"), each, ctx), true, "per item too: its tube lines stay capped by itemFlowLimit");
  const notCutting = mixed({ cutting: false });
  assert.equal(tubeLaneReleases(by(notCutting, "tn"), by(notCutting, "b"), notCutting, ctx), false, "nothing has started");
  const notNested = mixed({ nested: false });
  assert.equal(tubeLaneReleases(by(notNested, "tn"), by(notNested, "b"), notNested, ctx), false, "Nesting must be ticked first");
  // Rule 3 waits for both lasers: the plate work done, the tube laser still open.
  const plateDone = s.map((x) => (x.id === "l" ? { ...x, is_complete: true } : x));
  assert.equal(tickWaitsForLaser(by(plateDone, "b"), plateDone, ctx), true, "the tube laser still has work");
  const allDone = plateDone.map((x) => (x.id === "tn" || x.id === "t" ? { ...x, is_complete: true } : x));
  assert.equal(tickWaitsForLaser(by(allDone, "b"), allDone, ctx), false);
});
