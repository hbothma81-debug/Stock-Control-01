import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewVersionError, crashDetails, crashTitle, crashPlace } from "./crashText.js";

test("title: the job and stage first, then the piece", () => {
  assert.equal(crashTitle("the count box", "JOB-0068, Bending"), "JOB-0068, Bending: the count box could not be shown");
});

test("title: a piece with no job starts with a capital and keeps its own", () => {
  assert.equal(crashTitle("the cut list"), "The cut list could not be shown");
  assert.equal(crashTitle("Laser Status", ""), "Laser Status could not be shown");
});

test("title: nothing named is the whole app's message", () => {
  assert.equal(crashTitle(), "Something went wrong on this screen");
  assert.equal(crashTitle("", "JOB-0068"), "Something went wrong on this screen");
});

test("place: job then stage, either may be missing", () => {
  assert.equal(crashPlace({ job_number: "JOB-0068" }, { process_name: "Bending" }), "JOB-0068, Bending");
  assert.equal(crashPlace({ job_number: "JOB-0068" }, null), "JOB-0068");
  assert.equal(crashPlace(null, { process_name: "Bending" }), "Bending");
  assert.equal(crashPlace(null, null), "");
  assert.equal(crashPlace({}, {}), "");
});

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
