// A finished job with no Invoicing stage is Completed, not To invoice.
// Tested in completeWithoutInvoice.test.js.
//
// Heinrich, 7 Oct 2026: "inside a job I did not mark invoice as part of
// the job, I marked force complete and the job is now under to invoice.
// the job will not be invoiced because it was additional to an existing
// job. if invoice is not selected the job should just complete on its own
// and skip invoicing."
//
// Until then the last tick on any job set it to `complete`, which the Jobs
// page shows as To invoice and Records -> Invoicing lists as Outstanding,
// and only Mark as Invoiced moved it on. A job with no Invoicing stage was
// never going to be marked, so it sat under To invoice for good: 13 of the
// 24 jobs there on live that day. His 19 Sep answer already stood in
// invoiceOnClose.js (such a job gets no request by itself); this is the
// other half of it.
//
// The job's status becomes `closed`: finished and nothing to bill. It is
// a status of its own so that "invoiced" keeps meaning invoiced (the
// Invoiced month box, Records -> Invoicing, the Sage rules all read it)
// and the Jobs page's Completed pill shows both. `closed_at` is when
// (setup-jobs-closed-at.sql); on a database without the column the status
// is written alone.
//
// A job that has been asked for an invoice is never closed this way, even
// with no Invoicing stage: a request sent from the Items tab, or a Sage
// invoice recorded, means accounts has it, so it stays To invoice.

import { closingSendsInvoiceRequest } from "./invoiceOnClose.js";

// Status words, so no screen spells them twice.
export const CLOSED = "closed";

export function hasInvoicingStage(stages) {
  return (stages || []).some((p) => closingSendsInvoiceRequest(p));
}

// Finished and reading Invoiced or Closed: off the floor for good.
export function isDoneStatus(status) {
  return status === "invoiced" || status === CLOSED;
}

export function isClosedWithoutInvoice(job) {
  return job?.status === CLOSED;
}

// What a finished job should read. `stages` are every stage on the job,
// re-cut runs included; `billed` says whether accounts already has it
// (any invoice request, or any Sage invoice).
//   - null: the job is not finished, or is already where it belongs;
//   - "complete": finished, to be invoiced (To invoice);
//   - "closed": finished, nothing to invoice (Completed).
// A job In Progress moves to either; a job already Complete moves only to
// closed, and only when nothing was ever asked of accounts: that is the 13
// jobs that were waiting on live, and it is forward only, like the rest of
// the completion rule.
export function finishedJobStatus(job, stages, { billed = false } = {}) {
  const all = stages || [];
  if (all.length === 0 || !all.every((p) => p.is_complete)) return null;
  const toInvoice = hasInvoicingStage(all) || billed;
  if (job?.status === "in_progress") return toInvoice ? "complete" : CLOSED;
  if (job?.status === "complete") return toInvoice ? null : CLOSED;
  return null;
}

// The columns to write. `hasClosedAt` says whether the row read from the
// database carries the column (a key the table lacks refuses the save).
export function closeFields({ hasClosedAt = false, now = new Date() } = {}) {
  return hasClosedAt ? { status: CLOSED, closed_at: now.toISOString() } : { status: CLOSED };
}

// The notice to the sales rep. It says plainly that nothing goes to
// accounts, so a job that should have had an Invoicing stage is caught
// here and not months later.
export function closedNoticeText(job) {
  return (
    `${job?.job_number || "A job"} (${job?.customer || "no customer"}) is finished — every stage done. ` +
    `It has no Invoicing stage, so it is closed as Completed with no invoice.`
  );
}

export function completeNoticeText(job) {
  return `${job?.job_number || "A job"} (${job?.customer || "no customer"}) is finished — every stage done. It is under Invoicing now, ready to bill.`;
}

// One line for the job's History.
export function closedHistoryText() {
  return "Completed with no invoice: every stage done and the job has no Invoicing stage";
}

// What the job page's Overview says under Status.
export function closedStatusLine(job) {
  const when = job?.closed_at ? new Date(job.closed_at) : null;
  const day = when && !Number.isNaN(when.getTime()) ? ` on ${when.toLocaleDateString()}` : "";
  return `Completed${day} — no invoice (the job has no Invoicing stage)`;
}

// The moment a finished job stopped, for the Jobs list's days chip.
export function finishedAt(job) {
  if (job?.status === "invoiced" && job.invoiced_at) return job.invoiced_at;
  if (job?.status === CLOSED && job.closed_at) return job.closed_at;
  return null;
}
