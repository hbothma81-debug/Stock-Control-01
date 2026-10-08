import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MARKUP, markupOf, materialSplit, sellingPrice } from "./markup.js";

// Practice O1029 (D80 bar, batch of 20) and O1031 (bar puller, 70) as the
// engine priced them on 8 Oct 2026.
const O1029 = {
  qty: 20, price_per_part: 304.572, batch_total: 6091.433, one_off_price: 874.572,
  material_per_part: 91.825, one_off_material: 91.825, machining_per_part: 182.746, first_off: 600,
  wastage: { finished_cost: 29.73, chips_cost: 60.259, kerf_cost: 1.5, offcut_share_cost: 0.337 },
};
const O1031 = {
  qty: 70, price_per_part: 28.619, batch_total: 2003.311, one_off_price: 828.272,
  material_per_part: 2.703, one_off_material: 63.07,
  wastage: { finished_cost: 1.89, chips_cost: 0.035, kerf_cost: 0.196, offcut_share_cost: 0.582 },
};

test("60% unless the program has its own; 0 is a markup", () => {
  assert.equal(DEFAULT_MARKUP, 60);
  assert.equal(markupOf({}, "material"), 60);
  assert.equal(markupOf(null, "offcut"), 60);
  assert.equal(markupOf({ markup_material: 0 }, "material"), 0);
  assert.equal(markupOf({ markup_offcut: 35 }, "offcut"), 35);
  assert.equal(markupOf({ markup_offcut: -5 }, "offcut"), 60);
});

test("material is the part, its chips and saw cut; the offcut is the rest", () => {
  const s = materialSplit(O1031);
  assert.deepEqual(s.perPart, { material: 2.12, offcut: 0.58 });
  // A 1-off pays the whole puller bar: nearly all of it offcut.
  assert.deepEqual(s.oneOff, { material: 2.12, offcut: 60.95 });
});

test("bought per piece: no wastage block, all material, no offcut", () => {
  const s = materialSplit({ material_per_part: 120, price_per_part: 300 });
  assert.deepEqual(s.perPart, { material: 120, offcut: 0 });
});

test("the selling price adds the markups to the engine's cost and nothing else", () => {
  const p = sellingPrice(O1029, {});
  assert.equal(p.perPart.cost, 304.57);
  assert.equal(p.perPart.material, 91.49);
  assert.equal(p.perPart.offcut, 0.34);
  assert.equal(p.perPart.materialSell, 146.38);
  assert.equal(p.perPart.atCost, 212.74);
  assert.equal(p.perPart.sell, 359.66);
  assert.equal(Math.round((p.perPart.materialSell + p.perPart.offcutSell + p.perPart.atCost) * 100) / 100, p.perPart.sell);
  assert.equal(p.batch.sell, 7193.23);
  assert.equal(p.batch.offcut, 6.72);
  assert.equal(p.oneOff.sell, 929.67);
});

test("each markup on its own part", () => {
  const p = sellingPrice(O1031, { markup_material: 0, markup_offcut: 100 });
  assert.equal(p.perPart.sell, 29.2);
  assert.equal(p.oneOff.sell, 889.22);
  assert.deepEqual(p.markups, { material: 0, offcut: 100 });
});

test("no price yet: nothing", () => {
  assert.equal(sellingPrice(null, {}), null);
  assert.equal(sellingPrice({ qty: 3 }, {}), null);
});
