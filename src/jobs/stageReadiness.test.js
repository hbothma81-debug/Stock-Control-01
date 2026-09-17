// Ready, Partly ready, Waiting: the sums behind the Production pills and
// the Jobs list's stage filter.
//
// Run with:   npm test
//
// The rules about which stage holds which live in App.jsx and are handed
// in. The stand-ins below are deliberately simple: an earlier unticked
// stage blocks (by `rank`), a stage takes every line not told to skip it,
// and a per-item earlier stage caps a line at what it has counted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { stageReadiness, readinessLabel, readinessGroup, jobGroupAtStage } from "./stageReadiness.js";

const rank = { Laser: 1, Bending: 2, Welding: 3 };
const rules = {
  blockingStages: (process, stages) =>
    stages.filter((p) => !p.is_complete && rank[p.process_name] < rank[process.process_name]),
  stageTakesItem: (name, line) => !line.skip?.includes(name),
  itemFlowLimit: (process, stages, progress, line) => {
    let allowed = Number(line.qty) || 0;
    let waitingOn = null;
    for (const p of stages) {
      if (p.is_complete || rank[p.process_name] >= rank[process.process_name]) continue;
      if (line.skip?.includes(p.process_name)) continue;
      if ((p.tracking_mode || "batch") !== "each") return { allowed: 0, waitingOn: p.process_name };
      const done =
        Number(progress.find((ip) => ip.job_process_id === p.id && ip.job_quote_item_id === line.id)?.qty_complete) || 0;
      if (done < allowed) {
        allowed = done;
        waitingOn = p.process_name;
      }
    }
    return { allowed, waitingOn };
  },
};
const stage = (id, process_name, extra = {}) => ({ id, process_name, is_complete: false, tracking_mode: "batch", ...extra });

test("one tick: ready when nothing blocks, waiting on the earliest blocker", () => {
  const welding = stage("w", "Welding");
  const open = [stage("l", "Laser"), stage("b", "Bending"), welding];
  assert.deepEqual(stageReadiness(welding, { jobProcesses: open, jobQuoteItems: [], jobItemProgress: [] }, rules), {
    isReady: false,
    partlyReady: false,
    readyQty: 0,
    totalQty: 0,
    waitingOn: "Laser",
  });
  const done = [stage("l", "Laser", { is_complete: true }), stage("b", "Bending", { is_complete: true }), welding];
  assert.equal(stageReadiness(welding, { jobProcesses: done, jobQuoteItems: [], jobItemProgress: [] }, rules).isReady, true);
});

test("per item: partly ready when an earlier count has let some through", () => {
  const bending = stage("b", "Bending", { tracking_mode: "each" });
  const welding = stage("w", "Welding", { tracking_mode: "each" });
  const lines = [{ id: "x", qty: 20 }];
  const progress = [{ job_process_id: "b", job_quote_item_id: "x", qty_complete: 6 }];
  const r = stageReadiness(welding, { jobProcesses: [bending, welding], jobQuoteItems: lines, jobItemProgress: progress }, rules);
  assert.deepEqual(r, { isReady: false, partlyReady: true, readyQty: 6, totalQty: 20, waitingOn: "Bending" });
  assert.equal(readinessLabel(r), "Partly ready: 6 of 20");
});

test("per item: what this stage has already counted is not ready work again", () => {
  const bending = stage("b", "Bending", { tracking_mode: "each" });
  const welding = stage("w", "Welding", { tracking_mode: "each" });
  const lines = [{ id: "x", qty: 20 }];
  const progress = [
    { job_process_id: "b", job_quote_item_id: "x", qty_complete: 6 },
    { job_process_id: "w", job_quote_item_id: "x", qty_complete: 6 },
  ];
  const r = stageReadiness(welding, { jobProcesses: [bending, welding], jobQuoteItems: lines, jobItemProgress: progress }, rules);
  assert.equal(r.isReady, false);
  assert.equal(r.partlyReady, false);
  assert.equal(readinessLabel(r), "Waiting: Bending");
});

test("per item: every line held at nought reads Waiting even with no blocker", () => {
  // The earlier stage is on one tick and open, so nothing may go.
  const bending = stage("b", "Bending");
  const welding = stage("w", "Welding", { tracking_mode: "each" });
  const noBlockers = { ...rules, blockingStages: () => [] };
  const r = stageReadiness(
    welding,
    { jobProcesses: [bending, welding], jobQuoteItems: [{ id: "x", qty: 4 }], jobItemProgress: [] },
    noBlockers
  );
  assert.equal(r.isReady, false);
  assert.equal(readinessLabel(r), "Waiting: Bending");
});

test("per item: ready when its own lines are clear, whatever blocks the stage whole", () => {
  // Laser holds only a line this stage never takes.
  const laser = stage("l", "Laser");
  const welding = stage("w", "Welding", { tracking_mode: "each" });
  const lines = [
    { id: "x", qty: 3, skip: ["Laser"] },
    { id: "y", qty: 9, skip: ["Welding"] },
  ];
  const r = stageReadiness(welding, { jobProcesses: [laser, welding], jobQuoteItems: lines, jobItemProgress: [] }, rules);
  assert.deepEqual(r, { isReady: true, partlyReady: false, readyQty: 3, totalQty: 3, waitingOn: "Laser" });
  assert.equal(readinessLabel(r), "Ready");
});

test("per item with nothing left to do goes by its blockers alone", () => {
  const laser = stage("l", "Laser");
  const welding = stage("w", "Welding", { tracking_mode: "each" });
  const progress = [{ job_process_id: "w", job_quote_item_id: "x", qty_complete: 5 }];
  const r = stageReadiness(
    welding,
    { jobProcesses: [laser, welding], jobQuoteItems: [{ id: "x", qty: 5, skip: ["Laser"] }], jobItemProgress: progress },
    rules
  );
  assert.equal(r.isReady, false);
  assert.equal(readinessLabel(r), "Waiting: Laser");
});

test("the words and the pills", () => {
  assert.equal(readinessLabel({ isReady: false, partlyReady: false, waitingOn: null }), "Waiting");
  assert.equal(readinessGroup({ isReady: true }, false), "ready");
  assert.equal(readinessGroup({ isReady: false, partlyReady: true }, false), "ready");
  assert.equal(readinessGroup({ isReady: false, partlyReady: false }, false), "waiting");
  assert.equal(readinessGroup({ isReady: true }, true), "standing");
});

test("a job with the stage open twice takes the best pill, Standing first", () => {
  const ready = { readiness: { isReady: true }, standing: false };
  const waiting = { readiness: { isReady: false, partlyReady: false }, standing: false };
  const standing = { readiness: { isReady: false, partlyReady: false }, standing: true };
  assert.equal(jobGroupAtStage([waiting, ready]), "ready");
  assert.equal(jobGroupAtStage([ready, standing]), "standing");
  assert.equal(jobGroupAtStage([waiting]), "waiting");
});
