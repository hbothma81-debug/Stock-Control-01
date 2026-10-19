import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, matchesSearch, supplierFor, todayInSA, workdaysBetween } from "./procurementRules.js";

test("working days skip the weekend", () => {
  assert.equal(workdaysBetween("2026-10-16", "2026-10-19"), 1); // Fri -> Mon
  assert.equal(workdaysBetween("2026-10-15", "2026-10-19"), 2); // Thu -> Mon
  assert.equal(workdaysBetween("2026-10-19", "2026-10-19"), 0);
  assert.equal(workdaysBetween("", "2026-10-19"), null);
});

test("South African date rolls over at 22:00 UTC", () => {
  assert.equal(todayInSA(Date.parse("2026-10-19T21:59:00Z")), "2026-10-19");
  assert.equal(todayInSA(Date.parse("2026-10-19T22:00:00Z")), "2026-10-20");
});

test("a sent request waits, then is due, then is a phone call", () => {
  const sent = { status: "Sent", waiting_since: "2026-10-16", chases: 0 };
  assert.equal(classify(sent, "2026-10-19").pill.label, "SENT 1d");
  assert.equal(classify(sent, "2026-10-19").isOverdue, false);
  const due = classify(sent, "2026-10-20");
  assert.deepEqual([due.group, due.isOverdue, due.action, due.pill.label], ["waiting", true, "remind", "OVERDUE 2d"]);
  const phone = classify({ ...sent, chases: 2 }, "2026-10-20");
  assert.deepEqual([phone.action, phone.pill.label, phone.note], ["phone", "PHONE THEM", "Waiting for quote, chased 2x"]);
});

test("a reply on Account terms is your move; on Pro forma terms the supplier still owes the pro forma", () => {
  const reply = { status: "Reply", waiting_since: "2026-10-15", chases: 0 };
  assert.deepEqual([classify(reply, "2026-10-19", "Account").group, classify(reply, "2026-10-19", "Account").note],
    ["yours", "Quote in: order it"]);
  assert.equal(classify(reply, "2026-10-19", "").note, "Reply in: Account or pro forma?");
  const pf = classify(reply, "2026-10-19", "Pro forma");
  assert.deepEqual([pf.group, pf.isOverdue, pf.note], ["waiting", true, "Quote in, waiting for pro forma"]);
});

test("finished and wrongly picked-up requests sit in their own shut groups", () => {
  assert.equal(classify({ status: "Closed" }, "2026-10-19").group, "done");
  assert.equal(classify({ status: "Received" }, "2026-10-19").group, "done");
  assert.equal(classify({ status: "Ordered" }, "2026-10-19").group, "onOrder");
  assert.equal(classify({ status: "Pro forma" }, "2026-10-19").note, "Pro forma in: pay it");
  assert.equal(classify({ status: "Not a request" }, "2026-10-19").group, "notRequest");
});

test("search needs every word, across number, supplier, item and notes", () => {
  const r = { pr_number: "PR-002", supplier_name: "Eurosteel", item: "50mm 304 SS round bar", notes: "Price comparison" };
  assert.equal(matchesSearch(r, "euro 304"), true);
  assert.equal(matchesSearch(r, "euro 316"), false);
  assert.equal(matchesSearch(r, ""), true);
});

test("supplier found by id first, then by name", () => {
  const list = [{ id: "a", name: "Eurosteel" }, { id: "b", name: "NDE" }];
  assert.equal(supplierFor({ supplier_id: "b", supplier_name: "Eurosteel" }, list).id, "b");
  assert.equal(supplierFor({ supplier_name: " nde " }, list).id, "b");
  assert.equal(supplierFor({ supplier_name: "Nobody" }, list), null);
});
