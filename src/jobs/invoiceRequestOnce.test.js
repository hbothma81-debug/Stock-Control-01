import { test } from "node:test";
import assert from "node:assert/strict";
import { makeOneAtATime, stillToSend, invoiceRequestRefusal } from "./invoiceRequestOnce.js";

test("a second request for the same job is refused while the first is under way", async () => {
  const lock = makeOneAtATime();
  let finishFirst;
  const first = lock.run("job-36", () => new Promise((done) => (finishFirst = done)));
  assert.equal(lock.busy("job-36"), true);
  let ran = false;
  await assert.rejects(
    lock.run("job-36", async () => (ran = true)),
    (err) => err.alreadyRunning === true
  );
  assert.equal(ran, false);
  // Another job is nobody's business.
  assert.equal(await lock.run("job-37", async () => "sent"), "sent");
  finishFirst("done");
  assert.equal(await first, "done");
  assert.equal(lock.busy("job-36"), false);
  assert.equal(await lock.run("job-36", async () => "sent later"), "sent later");
});

test("a request that fails lets go, so the retry is not refused", async () => {
  const lock = makeOneAtATime();
  await assert.rejects(lock.run("j", async () => { throw new Error("The invoice request document could not be stored."); }), /could not be stored/);
  assert.equal(lock.busy("j"), false);
  assert.equal(await lock.run("j", async () => "ok"), "ok");
});

const line = (id, qty, invoiced, extra = {}) => ({ id, description: `Line ${id}`, qty, qty_invoiced: invoiced, item_status: "on_floor", ...extra });

test("lines that still read what the press saw go out, on today's numbers", () => {
  const pressed = [{ item: line("a", 6, 0), qty: 6 }, { item: line("b", 10, 4), qty: 2 }];
  const fresh = [line("a", 6, 0), line("b", 10, 4), line("c", 1, 0)];
  const out = stillToSend(pressed, fresh);
  assert.equal(out.ok, true);
  assert.deepEqual(out.items.map((p) => [p.item.id, p.qty]), [["a", 6], ["b", 2]]);
  assert.equal(out.items[1].item, fresh[1]);
});

test("JOB-0036: a list read before another request marked its lines is refused whole", () => {
  // Press 3 gathered seven lines with nothing invoiced; by the time its
  // "OK?" box was answered press 2 had marked them all.
  const pressed = [{ item: line("p26", 2, 0), qty: 2 }, { item: line("p27", 2, 0), qty: 2 }];
  const out = stillToSend(pressed, [line("p26", 2, 2, { item_status: "invoice_requested" }), line("p27", 2, 0)]);
  assert.equal(out.ok, false);
  assert.deepEqual(out.changed, [{ description: "Line p26", asked: 2, left: 0 }]);
});

test("a line gone, sent out to a supplier, or with less left than typed is refused too", () => {
  assert.equal(stillToSend([{ item: line("x", 2, 0), qty: 2 }], []).ok, false);
  assert.equal(stillToSend([{ item: line("x", 2, 0), qty: 2 }], [line("x", 2, 0, { item_status: "out_external" })]).ok, false);
  assert.deepEqual(stillToSend([{ item: line("x", 10, 0), qty: 8 }], [line("x", 10, 5)]).changed, [{ description: "Line x", asked: 8, left: 5 }]);
  // Part of what is left is fine.
  assert.equal(stillToSend([{ item: line("x", 10, 0), qty: 5 }], [line("x", 10, 5)]).ok, true);
});

test("the person is told which it was; any other failure keeps the button's own words", () => {
  assert.match(invoiceRequestRefusal({ alreadyRunning: true }, "JOB-0036"), /JOB-0036 is already being sent/);
  const text = invoiceRequestRefusal({ linesChanged: [{ description: "P-026", asked: 2, left: 0 }] }, "JOB-0036");
  assert.match(text, /Nothing was sent for JOB-0036/);
  assert.match(text, /P-026 \(0 left\)/);
  assert.equal(invoiceRequestRefusal(new Error("network"), "JOB-0036"), null);
});
