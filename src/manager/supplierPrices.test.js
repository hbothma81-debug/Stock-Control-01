import test from "node:test";
import assert from "node:assert/strict";
import {
  priceId, pricesFor, isStale, cheapest, setPrice, removePrice, changeSupplier, movePrices, dropPrices,
  priceFromRow, priceToRow, listPrice, sectionLines,
} from "./supplierPrices.js";

const now = new Date("2026-09-21T10:00:00Z");
const add = (list, name, grade, supplierId, price, at = now) =>
  setPrice(list, { listName: "sections", name, grade, supplierId, price, setBy: "H", now: at });

test("two suppliers price the same material, one line each", () => {
  let p = add([], "SHS 50x50x3", "Mild Steel", "s1", 95);
  p = add(p, "SHS 50x50x3", "Mild Steel", "s2", 92);
  assert.equal(pricesFor(p, "sections", "shs 50X50x3 ", "mild steel").length, 2);
  assert.equal(pricesFor(p, "sections", "SHS 50x50x3", "SS304").length, 0);
  assert.equal(pricesFor(p, "grades", "SHS 50x50x3", "Mild Steel").length, 0);
});

test("pricing the same pair again changes the line and restamps it", () => {
  let p = add([], "SHS 50x50x3", "", "s1", 95, new Date("2026-01-01T00:00:00Z"));
  p = add(p, "shs 50x50x3", "", "s1", 99);
  assert.equal(p.length, 1);
  assert.equal(p[0].price, 99);
  assert.equal(p[0].setAt, now.toISOString());
});

test("no supplier or no name adds nothing", () => {
  assert.deepEqual(add([], "SHS", "", "", 5), []);
  assert.deepEqual(add([], " ", "", "s1", 5), []);
});

test("cheapest skips nothing-prices, and takes the newer of two the same", () => {
  let p = add([], "A", "", "s1", 0);
  assert.equal(cheapest(p), null);
  p = add(p, "A", "", "s2", 30, new Date("2026-08-01T00:00:00Z"));
  p = add(p, "A", "", "s3", 25, new Date("2026-02-01T00:00:00Z"));
  p = add(p, "A", "", "s4", 25, new Date("2026-09-01T00:00:00Z"));
  assert.equal(cheapest(p).supplierId, "s4");
});

test("an old price still wins when it is the cheapest", () => {
  let p = add([], "A", "", "s1", 20, new Date("2025-01-01T00:00:00Z"));
  p = add(p, "A", "", "s2", 22);
  assert.equal(cheapest(p).supplierId, "s1");
  assert.equal(isStale(cheapest(p).setAt, now), true);
});

test("red after three months", () => {
  assert.equal(isStale("2026-06-22T00:00:00Z", now), false);
  assert.equal(isStale("2026-06-20T00:00:00Z", now), true);
  assert.equal(isStale("", now), true);
  assert.equal(isStale("rubbish", now), true);
});

test("a line handed to another supplier; refused when that one has a line", () => {
  let p = add([], "A", "", "s1", 20);
  p = add(p, "A", "", "s2", 22);
  const same = changeSupplier(p, priceId("sections", "A", "", "s1"), "s2");
  assert.equal(same, p);
  const moved = changeSupplier(p, priceId("sections", "A", "", "s1"), "s3");
  assert.deepEqual(moved.map((x) => x.supplierId).sort(), ["s2", "s3"]);
  assert.equal(moved.find((x) => x.supplierId === "s3").id, priceId("sections", "A", "", "s3"));
});

test("a renamed size takes every material's prices along", () => {
  let p = add([], "SHS 50x50x3", "Mild Steel", "s1", 95);
  p = add(p, "SHS 50x50x3", "SS304", "s1", 300);
  p = add(p, "SHS 40x40x3", "Mild Steel", "s1", 70);
  const out = movePrices(p, "sections", { name: "SHS 50x50x3" }, { name: "SHS 50x50x4" });
  assert.equal(pricesFor(out, "sections", "SHS 50x50x4", "Mild Steel")[0].price, 95);
  assert.equal(pricesFor(out, "sections", "SHS 50x50x4", "SS304")[0].price, 300);
  assert.equal(pricesFor(out, "sections", "SHS 50x50x3", "SS304").length, 0);
  assert.equal(pricesFor(out, "sections", "SHS 40x40x3", "Mild Steel").length, 1);
  assert.equal(out[0].id, priceId("sections", "SHS 50x50x4", "Mild Steel", "s1"));
});

test("a section moved to another material takes only that material's prices", () => {
  let p = add([], "A", "", "s1", 10);
  p = add(p, "A", "SS304", "s1", 30);
  const out = movePrices(p, "sections", { name: "A", grade: "" }, { grade: "Galv" });
  assert.equal(pricesFor(out, "sections", "A", "Galv")[0].price, 10);
  assert.equal(pricesFor(out, "sections", "A", "SS304")[0].price, 30);
});

test("a move never makes two lines for one supplier", () => {
  let p = add([], "A", "", "s1", 10);
  p = add(p, "B", "", "s1", 12);
  const out = movePrices(p, "sections", { name: "A" }, { name: "B" });
  assert.equal(out.length, 1);
  assert.equal(out[0].price, 12);
});

test("remove one line, drop a material's lines", () => {
  let p = add([], "A", "", "s1", 10);
  p = add(p, "A", "", "s2", 11);
  p = add(p, "A", "SS304", "s1", 30);
  assert.equal(removePrice(p, priceId("sections", "A", "", "s2")).length, 2);
  assert.deepEqual(dropPrices(p, "sections", "A", "").map((x) => x.grade), ["SS304"]);
});

test("the price every screen reads: lowest of the suppliers and the no-supplier price", () => {
  assert.equal(listPrice([], 25), 25);
  assert.equal(listPrice(null, 0), 0);
  let p = add([], "A", "", "s1", 27);
  p = add(p, "A", "", "s2", 24);
  assert.equal(listPrice(p, 0), 24);
  assert.equal(listPrice(p, 30), 24);
  assert.equal(listPrice(p, 20), 20);
  assert.equal(listPrice(add([], "A", "", "s1", 0), 12), 12);
});

test("a section with no lines in its material borrows the no-material ones", () => {
  let p = add([], "A", "", "s1", 10);
  assert.equal(sectionLines(p, "A", "SS304")[0].price, 10);
  p = add(p, "A", "SS304", "s2", 30);
  assert.deepEqual(sectionLines(p, "A", "SS304").map((x) => x.price), [30]);
  assert.deepEqual(sectionLines(p, "A", "").map((x) => x.price), [10]);
});

test("to the table and back", () => {
  const [p] = add([], "A", "SS304", "s1", 12.5);
  assert.deepEqual(priceFromRow(priceToRow(p)), p);
});
