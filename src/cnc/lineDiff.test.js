import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDiff, changeHunks, changeCount, pairPrograms } from "./lineDiff.js";

const OLD = ["%", "O00001027(BUSH)", "G21G40G99G18", "T0101", "G96S150M3", "G0X124.Z0.5", "G71U1.5R0.5", "M30", "%"].join("\n");
const NEW = ["%", "O00001027(BUSH)", "G21G40G99G18", "T0101", "G96S140M3", "G0X124.Z0.5", "G71U1.5R0.5", "G0X200.", "M30", "%"].join("\n");

test("one changed line and one added line", () => {
  const d = lineDiff(OLD, NEW);
  assert.deepEqual(changeCount(d), { removed: 1, added: 2 });
  assert.deepEqual(
    d.filter((x) => x.kind !== "same").map((x) => `${x.kind} ${x.text}`),
    ["del G96S150M3", "add G96S140M3", "add G0X200."]
  );
});

test("line endings are not changes", () => {
  const d = lineDiff(OLD, OLD.replace(/\n/g, "\r\n") + "\r\n");
  assert.deepEqual(changeCount(d), { removed: 0, added: 0 });
  assert.equal(changeHunks(d).length, 0);
});

test("changes come in pieces with two lines either side, and the gap is counted", () => {
  const a = Array.from({ length: 20 }, (_, k) => `N${k}`);
  const b = [...a];
  b[3] = "N3 changed";
  b[15] = "N15 changed";
  const hunks = changeHunks(lineDiff(a.join("\n"), b.join("\n")));
  assert.equal(hunks.length, 2);
  assert.equal(hunks[0].skippedBefore, 1);
  assert.deepEqual(hunks[0].lines.map((l) => l.text), ["N1", "N2", "N3", "N3 changed", "N4", "N5"]);
  assert.equal(hunks[1].skippedBefore, 7);
});

test("changes close together make one piece", () => {
  const a = Array.from({ length: 10 }, (_, k) => `N${k}`);
  const b = [...a];
  b[3] = "x";
  b[6] = "y";
  assert.equal(changeHunks(lineDiff(a.join("\n"), b.join("\n"))).length, 1);
});

test("programs pair by number; a side that came is shown whole", () => {
  const pairs = pairPrograms([{ number: 1027, text: OLD }], [{ number: 1027, text: NEW }, { number: 1028, text: "%\nO00001028\n%" }]);
  assert.deepEqual(pairs.map((p) => p.number), [1027, 1028]);
  assert.equal(pairs[1].before, null);
  assert.deepEqual(changeCount(pairs[1].diff), { removed: 0, added: 3 });
});

test("a program of a few hundred lines compares quickly", () => {
  const a = Array.from({ length: 600 }, (_, k) => `N${k} G1X${k}.`).join("\n");
  const b = a.replace("N300 G1X300.", "N300 G1X301.");
  const t0 = Date.now();
  assert.deepEqual(changeCount(lineDiff(a, b)), { removed: 1, added: 1 });
  assert.ok(Date.now() - t0 < 1000);
});
