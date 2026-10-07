// A finished job with no Invoicing stage is Completed, not To invoice.
//
// Run with:   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLOSED,
  hasInvoicingStage,
  isDoneStatus,
  isClosedWithoutInvoice,
  finishedJobStatus,
  closeFields,
  closedNoticeText,
  completeNoticeText,
  closedHistoryText,
  closedStatusLine,
  finishedAt,
} from "./completeWithoutInvoice.js";

// JOB-0253 on live, 7 Oct 2026: Nesting, Laser, Packer, no Invoicing.
const noInvoicing = [
  { id: "n", process_name: "Nesting", is_complete: true },
  { id: "l", process_name: "Laser", is_complete: true },
  { id: "p", process_name: "Packer", is_complete: true },
];
// JOB-0185: the same with Invoicing ticked.
const withInvoicing = [...noInvoicing, { id: "i", process_name: "Invoicing", is_complete: true }];

test("an Invoicing stage counts only when it is the job's own", () => {
  assert.equal(hasInvoicingStage(withInvoicing), true);
  assert.equal(hasInvoicingStage(noInvoicing), false);
  // A re-cut's catch-up run is never the job's Invoicing.
  assert.equal(hasInvoicingStage([...noInvoicing, { process_name: "Invoicing", is_complete: false, shortage_id: "s" }]), false);
  assert.equal(hasInvoicingStage([]), false);
  assert.equal(hasInvoicingStage(null), false);
});

test("the last tick: To invoice with an Invoicing stage, Completed without one", () => {
  const job = { status: "in_progress" };
  assert.equal(finishedJobStatus(job, withInvoicing), "complete");
  assert.equal(finishedJobStatus(job, noInvoicing), CLOSED);
});

test("not finished, or no stages at all: nothing moves", () => {
  const job = { status: "in_progress" };
  assert.equal(finishedJobStatus(job, [...noInvoicing, { process_name: "Welding", is_complete: false }]), null);
  // A re-cut's open run holds it, as it always did.
  assert.equal(finishedJobStatus(job, [...noInvoicing, { process_name: "Welding", is_complete: false, shortage_id: "s" }]), null);
  assert.equal(finishedJobStatus(job, []), null);
  assert.equal(finishedJobStatus(job, null), null);
});

test("a job accounts already has stays To invoice, Invoicing stage or not", () => {
  assert.equal(finishedJobStatus({ status: "in_progress" }, noInvoicing, { billed: true }), "complete");
  assert.equal(finishedJobStatus({ status: "complete" }, noInvoicing, { billed: true }), null);
});

test("the jobs already waiting under To invoice with no Invoicing stage close too; the rest stay", () => {
  // The 13 on live on 7 Oct 2026.
  assert.equal(finishedJobStatus({ status: "complete" }, noInvoicing), CLOSED);
  // The 11 with Invoicing ticked: accounts' to mark.
  assert.equal(finishedJobStatus({ status: "complete" }, withInvoicing), null);
  // Forward only: invoiced, closed and cancelled jobs are left alone.
  assert.equal(finishedJobStatus({ status: "invoiced" }, noInvoicing), null);
  assert.equal(finishedJobStatus({ status: CLOSED }, noInvoicing), null);
  assert.equal(finishedJobStatus({ status: "cancelled" }, noInvoicing), null);
});

test("the save writes closed_at only where the column exists", () => {
  const now = new Date("2026-10-07T08:00:00Z");
  assert.deepEqual(closeFields({ hasClosedAt: true, now }), { status: CLOSED, closed_at: "2026-10-07T08:00:00.000Z" });
  assert.deepEqual(closeFields({ hasClosedAt: false, now }), { status: CLOSED });
});

test("done means invoiced or closed; closed is told apart", () => {
  assert.equal(isDoneStatus("invoiced"), true);
  assert.equal(isDoneStatus(CLOSED), true);
  assert.equal(isDoneStatus("complete"), false);
  assert.equal(isDoneStatus("in_progress"), false);
  assert.equal(isClosedWithoutInvoice({ status: CLOSED }), true);
  assert.equal(isClosedWithoutInvoice({ status: "invoiced" }), false);
  assert.equal(isClosedWithoutInvoice(null), false);
});

test("the words: the rep is told nothing goes to accounts", () => {
  const job = { job_number: "JOB-0253", customer: "Cash Sale" };
  assert.equal(
    closedNoticeText(job),
    "JOB-0253 (Cash Sale) is finished — every stage done. It has no Invoicing stage, so it is closed as Completed with no invoice."
  );
  assert.equal(completeNoticeText(job), "JOB-0253 (Cash Sale) is finished — every stage done. It is under Invoicing now, ready to bill.");
  assert.match(closedHistoryText(), /no Invoicing stage/);
  assert.match(closedStatusLine({ closed_at: "2026-10-07T08:00:00Z" }), /^Completed on .* — no invoice \(the job has no Invoicing stage\)$/);
  assert.equal(closedStatusLine({}), "Completed — no invoice (the job has no Invoicing stage)");
});

test("when a finished job stopped, for the days chip", () => {
  assert.equal(finishedAt({ status: "invoiced", invoiced_at: "a" }), "a");
  assert.equal(finishedAt({ status: CLOSED, closed_at: "b" }), "b");
  // Closed before the column was there: nothing, and the chip keeps counting.
  assert.equal(finishedAt({ status: CLOSED }), null);
  assert.equal(finishedAt({ status: "complete", invoiced_at: "a" }), null);
});
