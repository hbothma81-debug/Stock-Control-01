import { test } from "node:test";
import assert from "node:assert/strict";
import { FINISH_BOXES, PROCESS_BOXES, STOCK_BOXES, keepShown, morePerPull, processOf, stockAndProcessPicked, withAnswer } from "./settingsBatches.js";
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

test("more than one part per pull sets the back end to Part only; one or blank leaves it", () => {
  assert.equal(withAnswer({ back_op: "part+turn" }, "parts_per_pull", "4").back_op, "part only");
  assert.equal(withAnswer({ back_op: "part+turn" }, "parts_per_pull", "1").back_op, "part+turn");
  assert.equal(withAnswer({}, "parts_per_pull", "").back_op, undefined);
  assert.equal(morePerPull({ parts_per_pull: "3" }), true);
  assert.equal(morePerPull({}), false);
});

test("parts per pull is a bar puller answer, not sent for a sawn billet", () => {
  assert.deepEqual(keepShown({ stock_type: "bar", holding: "double-chucked", parts_per_pull: "5" }), { stock_type: "bar", holding: "double-chucked" });
  assert.equal(keepShown({ stock_type: "bar", holding: "magnet puller", parts_per_pull: "5" }).parts_per_pull, "5");
});
