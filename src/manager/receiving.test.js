import test from "node:test";
import assert from "node:assert/strict";
import { sameSpec, averagePaid, rateFromLinePrice, landDelivery } from "./receiving.js";

const shs = (over) => ({ id: "a", mainCat: "structural", name: "SHS 50x50x3", grade: "MS", trackLength: true, length: 6, qty: 10, supplier: "Macsteel", paidPrice: 92, loc: "Rack 1", ...over });

test("his example: 10 at R92 plus 5 at R98 is R94", () => {
  assert.equal(averagePaid(10, 92, 5, 98), 94);
});

test("an empty or unpriced row takes the new price; no new price leaves it", () => {
  assert.equal(averagePaid(0, 92, 5, 98), 98);
  assert.equal(averagePaid(10, null, 5, 98), 98);
  assert.equal(averagePaid(-3, 92, 5, 98), 98);
  assert.equal(averagePaid(10, 92, 5, 0), 92);
  assert.equal(averagePaid(10, null, 5, 0), null);
  assert.equal(averagePaid(3, 10, 1, 10.555), 10.14);
});

test("same item: size, material and length, never the supplier", () => {
  assert.equal(sameSpec(shs(), shs({ id: "b", supplier: "NJR", name: "shs 50X50x3 " })), true);
  assert.equal(sameSpec(shs(), shs({ length: 3 })), false);
  assert.equal(sameSpec(shs(), shs({ grade: "SS304" })), false);
  const plate = { mainCat: "plate", grade: "MS", size: "2500x1250", thickness: "3mm" };
  assert.equal(sameSpec(plate, { ...plate, stockType: "full" }), true);
  assert.equal(sameSpec(plate, { ...plate, stockType: "offcut" }), false);
  const bar = { mainCat: "cncBar", grade: "EN8", diameter: "25", length: 3000 };
  assert.equal(sameSpec(bar, { ...bar, diameter: 25 }), true);
  assert.equal(sameSpec({ mainCat: "stores", name: "Gloves" }, { mainCat: "stores", name: "Gloves" }), false);
});

test("a PO line price worked back to the list's units", () => {
  assert.equal(rateFromLinePrice(shs(), 552), 92);
  assert.equal(rateFromLinePrice(shs({ trackLength: false }), 92), 92);
  assert.equal(rateFromLinePrice({ mainCat: "plate" }, 1800, 72), 25);
  assert.equal(rateFromLinePrice({ mainCat: "plate" }, 1800, 0), 0);
  assert.equal(rateFromLinePrice(shs(), 0), 0);
});

test("delivered by the row's own supplier: same row, averaged", () => {
  const out = landDelivery([shs()], { itemId: "a", qty: 5, supplier: "macsteel", rate: 98, newId: "n" });
  assert.equal(out.targetId, "a");
  assert.deepEqual([out.items[0].qty, out.items[0].paidPrice, out.items.length], [15, 94, 1]);
});

test("delivered by another supplier: their row, or a new one", () => {
  const theirs = shs({ id: "b", supplier: "NJR", qty: 0, paidPrice: 90, loc: "Rack 2" });
  let out = landDelivery([shs(), theirs], { itemId: "a", qty: 5, supplier: "NJR", rate: 88, newId: "n" });
  assert.equal(out.targetId, "b");
  assert.deepEqual([out.items[0].qty, out.items[1].qty, out.items[1].paidPrice], [10, 5, 88]);

  out = landDelivery([shs()], { itemId: "a", qty: 5, supplier: "NJR", rate: 88, newId: "n" });
  assert.equal(out.targetId, "n");
  assert.deepEqual(out.items[0], shs());
  assert.deepEqual(
    [out.items[1].id, out.items[1].supplier, out.items[1].qty, out.items[1].paidPrice, out.items[1].loc, out.items[1].name],
    ["n", "NJR", 5, 88, "", "SHS 50x50x3"]
  );
});

test("a row with no supplier: taken over when empty, left alone with stock on it", () => {
  let out = landDelivery([shs({ supplier: "", qty: 0, paidPrice: null })], { itemId: "a", qty: 5, supplier: "NJR", rate: 88, newId: "n" });
  assert.deepEqual([out.targetId, out.items.length, out.items[0].supplier, out.items[0].qty, out.items[0].paidPrice], ["a", 1, "NJR", 5, 88]);
  out = landDelivery([shs({ supplier: "" })], { itemId: "a", qty: 5, supplier: "NJR", rate: 88, newId: "n" });
  assert.deepEqual([out.targetId, out.items.length, out.items[0].supplier, out.items[0].qty], ["n", 2, "", 10]);
});

test("no supplier named, stores, or no paid price column: the old way", () => {
  let out = landDelivery([shs()], { itemId: "a", qty: 5, supplier: "", rate: 98, newId: "n" });
  assert.deepEqual([out.targetId, out.items[0].qty, out.items[0].paidPrice], ["a", 15, 94]);
  const gloves = { id: "g", mainCat: "stores", name: "Gloves", qty: 2, supplier: "A", value: 30 };
  out = landDelivery([gloves], { itemId: "g", qty: 3, supplier: "B", rate: 99, newId: "n" });
  assert.deepEqual(out.items, [{ ...gloves, qty: 5 }]);
  out = landDelivery([shs()], { itemId: "a", qty: 5, supplier: "Macsteel", rate: 98, newId: "n", keepPaid: false });
  assert.deepEqual([out.items[0].qty, out.items[0].paidPrice], [15, 92]);
  out = landDelivery([shs()], { itemId: "zz", qty: 5, supplier: "NJR", newId: "n" });
  assert.equal(out.targetId, null);
});
