import { test } from "node:test";
import assert from "node:assert/strict";
import { linesLeftToInvoice, stagesStillOpen, markInvoicedRefusal } from "./markInvoiced.js";

const done = { description: "Full", qty: 10, qty_invoiced: 10 };
const half = { description: "TRUSS P-005", qty: 1176, qty_invoiced: 200 };
const part = { description: "A part", qty: 5, qty_invoiced: 0, parent_quote_item_id: "line" };

test("a fully invoiced job with every stage ticked may be marked", () => {
  assert.equal(markInvoicedRefusal("JOB-0001", [done], [{ process_name: "Invoicing", is_complete: true }]), null);
  assert.equal(markInvoicedRefusal("JOB-0001", [], []), null);
});

test("a partly invoiced line refuses, and says how far it got", () => {
  const msg = markInvoicedRefusal("JOB-0014", [done, half], []);
  assert.match(msg, /JOB-0014 cannot be marked Invoiced yet/);
  assert.match(msg, /1 line is not fully invoiced/);
  assert.match(msg, /TRUSS P-005: 200 of 1176 invoiced/);
  assert.doesNotMatch(msg, /Full/);
});

test("an open stage refuses; a re-cut's run does not count", () => {
  const stages = [
    { process_name: "Bending", is_complete: false },
    { process_name: "Welding", is_complete: false, shortage_id: "s1" },
    { process_name: "Laser", is_complete: true },
  ];
  assert.deepEqual(stagesStillOpen(stages).map((p) => p.process_name), ["Bending"]);
  const msg = markInvoicedRefusal("JOB-0014", [done], stages);
  assert.match(msg, /1 stage is still open: Bending\./);
  assert.doesNotMatch(msg, /Welding/);
});

test("parts under a line are never counted; a supplier line still is", () => {
  assert.deepEqual(linesLeftToInvoice([done, part]), []);
  const out = { description: "Out", qty: 3, qty_invoiced: 0, item_status: "out_external" };
  assert.equal(linesLeftToInvoice([out]).length, 1);
  assert.equal(linesLeftToInvoice([{ description: "Blank", qty: 2 }]).length, 1);
});

test("more than five lines are summed up", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ description: `L${i}`, qty: 2, qty_invoiced: 1 }));
  const msg = markInvoicedRefusal("JOB-0014", many, []);
  assert.match(msg, /8 lines are not fully invoiced/);
  assert.match(msg, /and 3 more/);
});
