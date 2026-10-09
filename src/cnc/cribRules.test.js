import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFrom, toTurret, sameLayout, moveStation, putTool, removeTool, cribWarnings } from "./cribRules.js";

const AUTO = { 1: "WNMG", 2: "DNMG", 3: "DR200", 4: null, 5: "S32U", 6: null, 7: "A16Q", 8: "PART" };

test("the program's own crib wins over the engine's pick", () => {
  assert.deepEqual(layoutFrom(null, AUTO), ["WNMG", "DNMG", "DR200", null, "S32U", null, "A16Q", "PART"]);
  assert.deepEqual(layoutFrom({ 1: "WNMG", 8: "PART" }, AUTO), ["WNMG", null, null, null, null, null, null, "PART"]);
  assert.deepEqual(layoutFrom(null, null), [null, null, null, null, null, null, null, null]);
});

test("move up and down swaps neighbours; the ends stay put", () => {
  const l = layoutFrom(null, AUTO);
  assert.deepEqual(moveStation(l, 4, -1).slice(2, 6), ["DR200", "S32U", null, null]);
  assert.deepEqual(moveStation(l, 0, -1), l);
  assert.deepEqual(moveStation(l, 7, 1), l);
});

test("a tool put in a station leaves the one it was in", () => {
  const l = layoutFrom(null, AUTO);
  const moved = putTool(l, 3, "A16Q");
  assert.equal(moved[3], "A16Q");
  assert.equal(moved[6], null);
  assert.deepEqual(removeTool(moved, 3)[3], null);
});

test("the layout as the engine takes it, and whether it changed", () => {
  const l = layoutFrom(null, AUTO);
  assert.deepEqual(toTurret(l), { 1: "WNMG", 2: "DNMG", 3: "DR200", 4: null, 5: "S32U", 6: null, 7: "A16Q", 8: "PART" });
  assert.equal(sameLayout(l, layoutFrom(null, AUTO)), true);
  assert.equal(sameLayout(l, moveStation(l, 1, 1)), false);
});

test("only the engine's warnings about the crib", () => {
  const w = cribWarnings({ warnings: ["Side 1 32MM BORING BAR over its 4xD", "12MM BORING BAR is not on the tool crib - put in the empty T4", "Tool crib: a long tool in T2"], fails: ["CXMU IC807 is not owned - suggest ordering"] });
  assert.deepEqual(w, ["12MM BORING BAR is not on the tool crib - put in the empty T4", "Tool crib: a long tool in T2", "CXMU IC807 is not owned - suggest ordering"]);
});

test("holders: the machine row's, else the LEO 1600's own; kinds go in their holder", async () => {
  const { holdersFrom, holderForKind, toolFits, stationsWith } = await import("./cribRules.js");
  const h = holdersFrom(null);
  assert.equal(h[6], "od");
  assert.equal(stationsWith(h, "bore"), "T3/T4/T5/T7");
  assert.equal(holdersFrom({ 6: "bore", 2: "nonsense" })[6], "bore");
  assert.equal(holdersFrom({ 6: "bore", 2: "nonsense" })[2], "od");
  for (const k of ["bar", "udrill", "hss", "puller"]) assert.equal(holderForKind(k), "bore");
  for (const k of ["od", "groove", "part", "thread"]) assert.equal(holderForKind(k), "od");
  assert.equal(toolFits({ data: { kind: "bar" } }, "od"), false);
  assert.equal(toolFits(null, "od"), true);
});

test("holders: arrows jump to the next station the tool fits", async () => {
  const { holdersFrom, moveToHolder } = await import("./cribRules.js");
  const h = holdersFrom(null);
  const kinds = { WNMG: "od", BAR: "bar", PART: "part" };
  const toolOf = (k) => ({ data: { kind: kinds[k] } });
  const l = ["WNMG", null, "BAR", null, null, null, null, "PART"];
  // T1 down: T2 is the next OD station.
  assert.deepEqual(moveToHolder(l, 0, 1, h, toolOf).slice(0, 2), [null, "WNMG"]);
  // T2 (empty, OD) down skips T3-T5 to T6.
  const m = moveToHolder(["WNMG", null, "BAR", null, null, "X", null, "PART"], 1, 1, h, (k) => (k === "X" ? { data: { kind: "od" } } : toolOf(k)));
  assert.equal(m[1], "X");
  assert.equal(m[5], null);
  // A boring bar in T6 (wrong holder) moves up to T5.
  const w = moveToHolder([null, null, null, null, null, "BAR", null, null], 5, -1, h, toolOf);
  assert.equal(w[4], "BAR");
  // No fitting station further on: nothing moves.
  assert.deepEqual(moveToHolder(l, 7, 1, h, toolOf), l);
});

test("holders: changing one takes off a default tool that no longer fits", async () => {
  const { changeHolder } = await import("./cribRules.js");
  const toolOf = (k) => ({ data: { kind: k === "BAR" ? "bar" : "od" } });
  const data = { name: "LEO", turret: { stations: 8 }, turret_default: { 6: "WNMG", 7: "BAR" } };
  const r = changeHolder(data, 6, "bore", toolOf);
  assert.equal(r.removed, "WNMG");
  assert.equal(r.data.turret_default["6"], null);
  assert.equal(r.data.turret.holders["6"], "bore");
  assert.equal(r.data.turret.stations, 8);
  assert.equal(r.data.turret.holders["1"], "od");
  const k = changeHolder(data, 6, "bore", () => ({ data: { kind: "bar" } }));
  assert.equal(k.removed, null);
});

test("thread pitch: only real changes are kept, back to the model's clears it", async () => {
  const { setThreadPitch, samePitches, pitchChoices, modelPitchOf } = await import("./cribRules.js");
  assert.deepEqual(setThreadPitch(null, "L", 1.5, 2), { L: 1.5 });
  assert.equal(setThreadPitch({ L: 1.5 }, "L", "2", 2), null);
  assert.deepEqual(setThreadPitch({ L: 1.5 }, "0", 1.25, 1.75), { L: 1.5, 0: 1.25 });
  assert.equal(samePitches(null, {}), true);
  assert.equal(samePitches({ L: 1.5 }, { L: "1.5" }), true);
  assert.equal(samePitches({ L: 1.5 }, null), false);
  const tool = { data: { kind: "thread", pitches_owned: [2, 1, 1.5] } };
  assert.deepEqual(pitchChoices(tool, { pitch: 1.5, model_pitch: 2.5 }), [1, 1.5, 2, 2.5]);
  assert.equal(modelPitchOf({ end: "L", pitch: 1.5, model_pitch: 2 }, { L: 1.5 }), 2);
  assert.equal(modelPitchOf({ end: "L", pitch: 2 }, null), 2);
  assert.equal(modelPitchOf({ end: "L", pitch: 1.5 }, { L: 1.5 }), null);
});

test("Duplicate: the next free key and the number on the name", async () => {
  const { copyOfTool } = await import("./toolKinds.js");
  const t = { tool_key: "THREAD", data: { name: "THREAD" } };
  assert.deepEqual(copyOfTool(t, [t]), { toolKey: "THREAD2", name: "THREAD 2" });
  assert.deepEqual(copyOfTool(t, [t, { tool_key: "THREAD2" }]), { toolKey: "THREAD3", name: "THREAD 3" });
});
