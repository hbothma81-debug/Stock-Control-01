// Several Sage invoices on one job, one Sage invoice covering one or more
// invoice requests (Heinrich, 22 Sep 2026: "can be 2 requests and one
// sage"). Tested in sageInvoices.test.js.
//
// A row of job_sage_invoices is what accounts typed on Records ->
// Invoicing when they raised the invoice in Sage: number, amount excluding
// VAT, who, when. A request's sage_invoice_id says which one billed it.
// The job goes Invoiced by itself once every line is billed, every stage
// ticked and every request has its Sage invoice (his answer): the rule for
// the first two is markInvoicedRefusal (markInvoiced.js); this file adds
// the third and everything drawn from the invoices.
//
// Jobs marked Invoiced before this hold their one number on the job and
// have no rows here; nothing in this file changes them.

import { markInvoicedRefusal } from "./markInvoiced.js";

const byDate = (a, b) => String(a?.invoiced_at || "").localeCompare(String(b?.invoiced_at || ""));

export function sageInvoicesOf(jobId, sageInvoices) {
  return (sageInvoices || []).filter((s) => s && s.job_id === jobId).sort(byDate);
}

export function requestsNotYetInvoiced(jobId, requests) {
  return (requests || []).filter((r) => r && r.job_id === jobId && !r.sage_invoice_id);
}

// The requests a Sage invoice billed.
export function requestsOnInvoice(invoiceId, requests) {
  return (requests || []).filter((r) => r && r.sage_invoice_id === invoiceId);
}

// What a new Sage invoice's amount box starts with: the requests it
// covers, added up. Blank when none is ticked.
export function suggestedSageAmount(requestIds, requests) {
  const ids = new Set(requestIds || []);
  const covered = (requests || []).filter((r) => ids.has(r.id));
  if (covered.length === 0) return "";
  return covered.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0).toFixed(2);
}

// "20600, 20612": every Sage number on the job, oldest first, once each.
export function sageNumbersLabel(jobId, sageInvoices) {
  return [...new Set(sageInvoicesOf(jobId, sageInvoices).map((s) => String(s.invoice_number || "").trim()).filter(Boolean))].join(", ");
}

// Null when the job is fully billed and may go Invoiced; otherwise why not.
// quoteItems and processes may be omitted where the screen has not got
// them; then only the requests are judged.
export function notYetFullyInvoiced(job, requests, quoteItems, processes) {
  const left = requestsNotYetInvoiced(job?.id, requests);
  if (left.length) return `${left.length} request${left.length === 1 ? " has" : "s have"} no Sage invoice yet.`;
  if (quoteItems || processes) {
    const refusal = markInvoicedRefusal(job?.job_number, quoteItems || [], processes || []);
    if (refusal) return refusal;
  }
  return null;
}

// The banner on a job billed in part (his answer 3, 22 Sep 2026): shown
// while the job has a Sage invoice and is not Invoiced yet. Null otherwise.
//   "Partly invoiced: 20600 (R 46,857.52) on 2 of 5 requests; 3 requests
//    still to invoice; 8 lines still to bill"
export function partlyInvoicedBanner(job, requests, sageInvoices, quoteItems) {
  if (!job || job.status === "invoiced") return null;
  const invoices = sageInvoicesOf(job.id, sageInvoices);
  if (invoices.length === 0) return null;
  const own = (requests || []).filter((r) => r && r.job_id === job.id);
  const billed = own.filter((r) => r.sage_invoice_id).length;
  // "R 46,857.52": a point for the decimals, as every screen writes money.
  const rand = (n) => `R ${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  const parts = [
    `Partly invoiced: ${invoices.map((s) => `${s.invoice_number}${s.amount != null ? ` (${rand(s.amount)})` : ""}`).join(", ")} on ${billed} of ${own.length} request${own.length === 1 ? "" : "s"}`,
  ];
  const openRequests = own.length - billed;
  if (openRequests > 0) parts.push(`${openRequests} request${openRequests === 1 ? "" : "s"} still to invoice`);
  if (quoteItems) {
    const lines = quoteItems.filter((it) => it && !it.parent_quote_item_id && Number(it.qty) - Number(it.qty_invoiced || 0) > 0).length;
    if (lines > 0) parts.push(`${lines} line${lines === 1 ? "" : "s"} still to bill`);
  }
  return parts.join("; ");
}
