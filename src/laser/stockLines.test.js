import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStockLines, totalLengths, stockLinesOf, stockMoves, stockLinesText } from "./stockLines.js";

const opt = (id, length) => ({ value: id, item: { id, length } });
const lines = [
  { stock_item_id: "full", qty: 3, length: 6 },
  { stock_item_id: "off1", qty: 2, length: 2.4 },
  { stock_item_id: "off2", qty: 1, length: 1.8 },
];

test("the form's rows become the list, empty rows left out", () => {
  const made = buildStockLines([
    { option: opt("full", 6), qty: "3" },
    { option: null, qty: "4" },
    { option: opt("off1", 2.4), qty: "" },
    { option: opt("off2", 1.8), qty: "1" },
  ]);
  assert.deepEqual(made, [
    { stock_item_id: "full", qty: 3, length: 6 },
    { stock_item_id: "off2", qty: 1, length: 1.8 },
  ]);
  assert.equal(totalLengths(made), 4);
});

test("the same stock line picked twice is added up", () => {
  const made = buildStockLines([
    { option: opt("full", 6), qty: 2 },
    { option: opt("off1", 2.4), qty: 1 },
    { option: opt("full", 6), qty: 1 },
  ]);
  assert.deepEqual(made.map((l) => [l.stock_item_id, l.qty]), [["full", 3], ["off1", 1]]);
});

test("a program without a list reads as none", () => {
  assert.deepEqual(stockLinesOf({}), []);
  assert.deepEqual(stockLinesOf({ stock_lines: null }), []);
  assert.deepEqual(stockLinesOf({ stock_lines: "x" }), []);
  assert.deepEqual(stockLinesOf({ stock_lines: [{ qty: 2 }, { stock_item_id: "a", qty: 0 }] }), []);
  assert.equal(stockLinesOf({ stock_lines: lines }).length, 3);
});

test("cuts come off in the order listed", () => {
  assert.deepEqual(stockMoves(lines, 0, 1), [{ stock_item_id: "full", delta: 1 }]);
  assert.deepEqual(stockMoves(lines, 0, 3), [{ stock_item_id: "full", delta: 3 }]);
  assert.deepEqual(stockMoves(lines, 3, 4), [{ stock_item_id: "off1", delta: 1 }]);
  assert.deepEqual(stockMoves(lines, 5, 6), [{ stock_item_id: "off2", delta: 1 }]);
});

test("one press across several lines moves each by its share", () => {
  assert.deepEqual(stockMoves(lines, 2, 6), [
    { stock_item_id: "full", delta: 1 },
    { stock_item_id: "off1", delta: 2 },
    { stock_item_id: "off2", delta: 1 },
  ]);
  assert.deepEqual(stockMoves(lines, 0, 6), [
    { stock_item_id: "full", delta: 3 },
    { stock_item_id: "off1", delta: 2 },
    { stock_item_id: "off2", delta: 1 },
  ]);
});

test("an undo puts back what that cut took, last cut first", () => {
  assert.deepEqual(stockMoves(lines, 4, 3), [{ stock_item_id: "off1", delta: -1 }]);
  assert.deepEqual(stockMoves(lines, 6, 2), [
    { stock_item_id: "off2", delta: -1 },
    { stock_item_id: "off1", delta: -2 },
    { stock_item_id: "full", delta: -1 },
  ]);
});

test("out and back again leaves every line where it was", () => {
  const sum = {};
  for (const [a, b] of [[0, 4], [4, 1], [1, 6], [6, 0]]) {
    for (const m of stockMoves(lines, a, b)) sum[m.stock_item_id] = (sum[m.stock_item_id] || 0) + m.delta;
  }
  assert.deepEqual(sum, { full: 0, off1: 0, off2: 0 });
});

test("a cut past the end of the list comes off the last line", () => {
  assert.deepEqual(stockMoves(lines, 6, 8), [{ stock_item_id: "off2", delta: 2 }]);
  assert.deepEqual(stockMoves(lines, 5, 8), [{ stock_item_id: "off2", delta: 3 }]);
});

test("nothing moves with no list or no change", () => {
  assert.deepEqual(stockMoves([], 0, 3), []);
  assert.deepEqual(stockMoves(null, 0, 3), []);
  assert.deepEqual(stockMoves(lines, 2, 2), []);
});

test("the card's words", () => {
  assert.equal(stockLinesText(lines), "3 × 6m + 2 × 2.4m + 1 × 1.8m");
  assert.equal(stockLinesText([]), "");
  assert.equal(stockLinesText([{ stock_item_id: "a", qty: 2, length: null }]), "2 × length not given");
});
