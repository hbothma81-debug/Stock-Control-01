import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewVersionError, crashDetails } from "./crashText.js";

test("a file of the old build that is gone reads as a new version, in each browser's words", () => {
  assert.equal(isNewVersionError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/App-abc.js")), true);
  assert.equal(isNewVersionError(new TypeError("Importing a module script failed.")), true);
  assert.equal(isNewVersionError(new TypeError("error loading dynamically imported module")), true);
});

test("an ordinary crash is not a new version", () => {
  assert.equal(isNewVersionError(new TypeError("Cannot read properties of null (reading 'name')")), false);
  assert.equal(isNewVersionError(null), false);
  assert.equal(isNewVersionError(undefined), false);
});

test("details: the error's own words first, then where, cut short", () => {
  const stack = "\n    at QtyProgressControl\n    at div\n    at StockControl\n    at Suspense";
  assert.equal(
    crashDetails(new TypeError("x is null"), stack, 2),
    "TypeError: x is null\nat QtyProgressControl\nat div"
  );
});

test("details: something thrown that is not an error still says what it was", () => {
  assert.equal(crashDetails("plain text", ""), "plain text");
  assert.equal(crashDetails(null, null), "Unknown error");
});
