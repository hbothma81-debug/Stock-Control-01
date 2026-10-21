import { test } from "node:test";
import assert from "node:assert/strict";
import { rand } from "./money.js";

test("rand shows R, a space, thousands commas and cents", () => {
  assert.equal(rand(1234.5), "R 1,234.50");
  assert.equal(rand(0), "R 0.00");
  assert.equal(rand("12"), "R 12.00");
  assert.equal(rand(1234567.891), "R 1,234,567.89");
});

test("rand shows nothing for a missing or nonsense value", () => {
  assert.equal(rand(null), "");
  assert.equal(rand(""), "");
  assert.equal(rand("abc"), "");
});
