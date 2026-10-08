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
