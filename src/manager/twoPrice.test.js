import test from "node:test";
import assert from "node:assert/strict";
import { readPrice, bothPrices, showPrice } from "./twoPrice.js";

test("readPrice takes a point, a comma and spaces", () => {
  assert.equal(readPrice("125"), 125);
  assert.equal(readPrice("0.85"), 0.85);
  assert.equal(readPrice("0,85"), 0.85);
  assert.equal(readPrice("1 250,50"), 1250.5);
  assert.equal(readPrice("12."), 12);
  assert.equal(readPrice(".5"), 0.5);
});

test("readPrice: empty clears, rubbish is refused", () => {
  assert.equal(readPrice(""), 0);
  assert.equal(readPrice("  "), 0);
  assert.equal(readPrice("abc"), null);
  assert.equal(readPrice("1.2.3"), null);
  assert.equal(readPrice("-5"), null);
  assert.equal(readPrice("."), null);
  assert.equal(readPrice("1e3"), null);
});

test("a typed R/kg gives the R/m, and reads back as typed", () => {
  const p = bothPrices("kg", 25, 4.37);
  assert.equal(p.perKg, 25);
  assert.equal(p.perUnit, 109.25);
  assert.equal(showPrice(p.perUnit / 4.37), "25.00");
});

test("a typed R/sheet stored as R/kg reads back as typed", () => {
  const w = 188.4;
  const p = bothPrices("unit", 1500, w);
  assert.equal(p.perUnit, 1500);
  assert.equal(showPrice(p.perKg * w), "1500.00");
});

test("no weight: the other side is null, never zero", () => {
  assert.deepEqual(bothPrices("unit", 80, 0), { perUnit: 80, perKg: null });
  assert.deepEqual(bothPrices("kg", 25, null), { perKg: 25, perUnit: null });
});

test("showPrice: two decimals, blank for none", () => {
  assert.equal(showPrice(109.25), "109.25");
  assert.equal(showPrice(25.000000000000004), "25.00");
  assert.equal(showPrice(0), "");
  assert.equal(showPrice(undefined), "");
});
