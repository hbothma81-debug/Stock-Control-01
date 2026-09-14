import { test } from "node:test";
import assert from "node:assert/strict";
import { outstandingOf, stockFromStoresGroups } from "./stockFromStores.js";

const stages = [
  { id: "p-laser", process_name: "Laser" },
  { id: "p-weld", process_name: "Welding" },
];
const res = (id, process_id, qty_allocated, qty_used, status = "open") => ({ id, process_id, qty_allocated, qty_used, status });

test("groups: no stage first, then stages in the order given, then a stage no longer on the job", () => {
  const groups = stockFromStoresGroups(
    [res("a", "p-weld", 2, 0), res("b", null, 3, 0), res("c", "p-gone", 1, 0), res("d", "p-laser", 4, 1)],
    stages
  );
  assert.deepEqual(
    groups.map((g) => [g.title, g.rows.map((r) => r.id)]),
    [
      ["For the job, no stage yet", ["b"]],
      ["Laser", ["d"]],
      ["Welding", ["a"]],
      ["Against a stage no longer on this job", ["c"]],
    ]
  );
});

test("handed back is left off; fully used stays", () => {
  const groups = stockFromStoresGroups([res("a", "p-laser", 2, 0, "released"), res("b", "p-laser", 2, 2, "used")], stages);
  assert.deepEqual(groups.map((g) => g.rows.map((r) => r.id)), [["b"]]);
});

test("nothing reserved is no groups at all", () => {
  assert.deepEqual(stockFromStoresGroups([], stages), []);
  assert.deepEqual(stockFromStoresGroups(null, null), []);
});

test("outstanding is reserved less taken, never below nought", () => {
  assert.equal(outstandingOf({ qty_allocated: 5, qty_used: 2 }), 3);
  assert.equal(outstandingOf({ qty_allocated: "2.5", qty_used: "1" }), 1.5);
  assert.equal(outstandingOf({ qty_allocated: 1, qty_used: 3 }), 0);
});
