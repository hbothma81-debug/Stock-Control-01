import { test } from "node:test";
import assert from "node:assert/strict";
import { toolpathFrames, toolList, toolColour, movePoints, moveWords, TOOL_COLOURS } from "./toolpathGeom.js";

// Shaped like the engine's answer for the practice flanged bush (80 OD,
// 55 long, side 1 from the L end, side 2 from the 0 end), cut down.
const ANSWER = {
  setup: {
    part: { length: 55, max_dia: 80 },
    bar: { dia: 80, id: 0, stock_len_mm: 60 },
    sides: [
      { side: 1, offset: "G54", program_no: 1029, z0_end: 55, grip_mm: 7.5, clamp_dia_mm: 80, z0_note: "Z0 on the z=55 end" },
      { side: 2, offset: "G55", program_no: 1030, z0_end: 0, grip_mm: 22, clamp_dia_mm: 50, z0_note: "Z0 on the z=0 end" },
    ],
  },
  moves: [
    { kind: "G0", side: "L", tool: "WNMG R0.8", pts: [[150, 200], [5, 84]] },
    { kind: "cycle", side: "L", tool: "WNMG R0.8", pts: [[5, 84], [0, 84], [0, -1.6], [5, 84]] },
    { kind: "feed", side: "L", tool: "20MM U-DRILL", pts: [[3, 0], [-30, 0]] },
    { kind: "G0", side: "0", tool: "WNMG R0.8", pts: [[80, 150], [6, 84]] },
    { kind: "cycle", side: "0", tool: "WNMG R0.8", pts: [[6, 84], [0, 84], [0, 26], [6, 84]] },
  ],
  stock: {
    G54: [[-3, [[10.1, 40]]], [-2.9, [[10.1, 40]]], [-2.8, [[10.1, 40]]], [10, [[15.1, 40]]], [10.1, [[15.1, 40]]], [59, []]],
    G55: [[1, [[15.1, 40]]], [13, [[15.1, 24.9]]]],
  },
};

test("one frame per side, each with its own end and its own moves", () => {
  const f = toolpathFrames(ANSWER);
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => [x.side, x.end, x.offset, x.programNo]), [[1, "L", "G54", 1029], [2, "0", "G55", 1030]]);
  assert.deepEqual(f[0].moves.map((m) => m.n), [0, 1, 2]);
  assert.deepEqual(f[1].moves.map((m) => m.n), [3, 4]);
  assert.equal(f[1].moves[0].sideNo, 2);
});

test("the material left is turned into the side's frame and neighbouring slices join", () => {
  const [s1, s2] = toolpathFrames(ANSWER);
  // L-end side: Z = z - 55. Slices -3, -2.9, -2.8 join into one block.
  const first = s1.blocks[0];
  assert.ok(Math.abs(first.z0 - (-58.05)) < 1e-9 && Math.abs(first.z1 - (-57.75)) < 1e-9);
  assert.equal(first.r0, 10.1);
  assert.equal(s1.blocks.length, 2);
  // 0-end side: Z = -z.
  assert.ok(s2.blocks.some((b) => Math.abs(b.z1 - -0.95) < 1e-9));
});

test("the raw bar and the jaws sit at the chuck end", () => {
  const [s1, s2] = toolpathFrames(ANSWER);
  assert.equal(s1.raw.r1, 40);
  assert.ok(s1.raw.z1 - s1.raw.z0 >= 60 - 1e-9);
  assert.equal(s1.jaws.z0, s1.raw.z0);
  assert.equal(s1.jaws.z1, s1.raw.z0 + 7.5);
  assert.equal(s2.jaws.r0, 25);
  assert.ok(s1.view.zMin < s1.raw.z0 && s1.view.zMax > 0);
});

test("tools in the order they first cut, each its own colour", () => {
  const tools = toolList(ANSWER);
  assert.deepEqual(tools, ["WNMG R0.8", "20MM U-DRILL"]);
  assert.equal(toolColour(tools, "20MM U-DRILL"), TOOL_COLOURS[1]);
  assert.equal(toolColour(tools, "nothing"), "#555");
});

test("a move's points are radii, kept inside the frame", () => {
  const [s1] = toolpathFrames(ANSWER);
  const pts = movePoints(ANSWER.moves[0], s1.view);
  assert.equal(pts[0][0], s1.view.zMax);
  assert.equal(pts[0][1], s1.view.rMax);
  assert.deepEqual(pts[1], [5, 42]);
});

test("the player's line", () => {
  const [s1] = toolpathFrames(ANSWER);
  assert.equal(moveWords(s1.moves[2], 5), "Move 3 of 5: side 1 20MM U-DRILL cut");
});

test("an answer with no setup draws nothing rather than failing", () => {
  assert.deepEqual(toolpathFrames({}), []);
  assert.deepEqual(toolList(null), []);
});
