import { test } from "node:test";
import assert from "node:assert/strict";
import { kgPerMetre, barSizeOf, sizeLabel, findBarPrice, bothUnits, materialPricing, sameSize } from "./pricing.js";

test("weight per metre of round bar and tube", () => {
  assert.equal(Math.round(kgPerMetre(50, 0, 7.85) * 1000) / 1000, 15.413);
  assert.equal(Math.round(kgPerMetre(114.3, 92.04, 7.85) * 100) / 100, 28.32);
  assert.equal(kgPerMetre(0), 0);
  assert.equal(kgPerMetre(50, 60), 0);
});

test("the bar size: the engine's pick first, then what was typed", () => {
  assert.deepEqual(barSizeOf({ bar_dia: 60 }, { bar_dia: 114.3, bar_id: 92.04 }), { od: 114.3, id: 92.04 });
  assert.deepEqual(barSizeOf({ bar_dia: 60 }, null), { od: 60, id: 0 });
  assert.equal(barSizeOf({}, null), null);
  assert.ok(sameSize({ od: 50, id: 0 }, { od: 50.001, id: 0 }));
});

test("bar sizes in shop words", () => {
  const pipes = [{ nps: "4", nb: 100, od: 114.3, schedules: [{ sch: "120", id: 92.04 }] }];
  assert.equal(sizeLabel({ od: 114.3, id: 92.04 }, pipes), "100NB SCH120");
  assert.equal(sizeLabel({ od: 50, id: 0 }, pipes), "D50");
  assert.equal(sizeLabel({ od: 71, id: 50 }), "D71 x 50");
});

const ROWS = [
  { grade: "EN8", od: 50, id_mm: 0, price: 520, unit: "R/m" },
  { grade: "EN8", od: 120, id_mm: 0, price: 34, unit: "R/kg" },
];

test("a grade's price for one bar size, case ignored", () => {
  assert.equal(findBarPrice(ROWS, "en8", { od: 50, id: 0 }).price, 520);
  assert.equal(findBarPrice(ROWS, "EN8", { od: 60, id: 0 }), null);
  assert.equal(findBarPrice(ROWS, "EN19", { od: 50, id: 0 }), null);
});

test("both units from the one typed", () => {
  const kgm = kgPerMetre(50, 0, 7.85);
  assert.deepEqual(bothUnits(520, "R/m", kgm), { perM: 520, perKg: 33.74 });
  assert.deepEqual(bothUnits(34, "R/kg", kgm), { perKg: 34, perM: 524.06 });
  assert.deepEqual(bothUnits(0, "R/kg", kgm), { perKg: null, perM: null });
});

test("what the engine is sent, by the way the program is priced", () => {
  const kgm = kgPerMetre(50, 0, 7.85);
  const size = findBarPrice(ROWS, "EN8", { od: 50, id: 0 });
  assert.deepEqual(materialPricing({ priceBy: "m", sizeRow: size, gradePrice: 30, kgm }).send, { material_price: 520, price_unit: "R/m" });
  assert.deepEqual(materialPricing({ priceBy: "kg", sizeRow: size, gradePrice: 30, kgm }).send, { material_price: 33.74, price_unit: "R/kg" });
  assert.deepEqual(materialPricing({ priceBy: "kg", sizeRow: null, gradePrice: 30, kgm }).send, { material_price: 30, price_unit: "R/kg" });
  assert.match(materialPricing({ priceBy: "kg", sizeRow: null, gradePrice: 30, kgm }).from, /grade's R\/kg/);
  assert.deepEqual(materialPricing({ priceBy: "m", sizeRow: null, gradePrice: 0, kgm }).send, {});
  assert.deepEqual(materialPricing({ priceBy: "piece", piecePrice: 85, sizeRow: size, gradePrice: 30, kgm }).send, { material_price: 85, price_unit: "billet" });
  assert.deepEqual(materialPricing({ priceBy: "piece", piecePrice: 0 }).send, {});
  assert.deepEqual(materialPricing({ priceBy: "m", sizeRow: null, gradePrice: 30, kgm: 0 }).send, {});
});
