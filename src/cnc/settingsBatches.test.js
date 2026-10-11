import { test } from "node:test";
import assert from "node:assert/strict";
import { FINISH_BOXES, PROCESS_BOXES, STOCK_BOXES, keepShown, processOf, stockAndProcessPicked } from "./settingsBatches.js";
import { CNC_FIELDS } from "./cncFields.js";

test("every question sits in a batch, so none is silently left out", () => {
  const inBatch = new Set(["stock_type", "holding", ...Object.values(STOCK_BOXES).flat(), ...Object.values(PROCESS_BOXES).flat(), ...FINISH_BOXES]);
  assert.deepEqual(CNC_FIELDS.map((f) => f.key).filter((k) => !inBatch.has(k)), []);
});

test("cut to size is the double-chucked billet; both pullers are bar puller work", () => {
  assert.equal(processOf("double-chucked"), "cut");
  assert.equal(processOf("bar puller"), "puller");
  assert.equal(processOf("magnet puller"), "puller");
  assert.equal(processOf(undefined), "");
});

test("Generate waits for both Stock and Process", () => {
  assert.equal(stockAndProcessPicked({}), false);
  assert.equal(stockAndProcessPicked({ stock_type: "bar" }), false);
  assert.equal(stockAndProcessPicked({ holding: "bar puller" }), false);
  assert.equal(stockAndProcessPicked({ stock_type: "tube", holding: "magnet puller" }), true);
});

test("a box shut by another pick is not sent", () => {
  const form = { stock_type: "bar", bar_dia: "50", bar_id: "30", holding: "double-chucked", grip1: "20", pulls: "63", edge_break: "0.5" };
  assert.deepEqual(keepShown(form), { stock_type: "bar", bar_dia: "50", holding: "double-chucked", grip1: "20", edge_break: "0.5" });
});
