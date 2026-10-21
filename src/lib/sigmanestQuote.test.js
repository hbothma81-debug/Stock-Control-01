import { test } from "node:test";
import assert from "node:assert/strict";
import { sigmaNestNumber } from "./sigmanestQuote.js";

test("the word JOB is dropped from a SigmaNest number", () => {
  assert.equal(sigmaNestNumber("JOB-31728"), "31728");
  assert.equal(sigmaNestNumber("JOB 31728"), "31728");
  assert.equal(sigmaNestNumber(" job-31728 "), "31728");
  assert.equal(sigmaNestNumber("31728"), "31728");
  assert.equal(sigmaNestNumber(""), "");
  assert.equal(sigmaNestNumber(null), "");
});
