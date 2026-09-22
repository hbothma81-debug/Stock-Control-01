// What the bar at the top of Records -> Invoicing finds and narrows by
// (Heinrich, 18-19 Sep 2026: "a search bar and filters for all relevant
// info including PO numbers from customers"). Tested in
// invoicingSearch.test.js.
//
// One bar works on all three pills (Outstanding, Invoiced, All requests),
// so they cannot come to disagree. The typed text finds a job the way the
// Jobs page does (src/jobs/jobSearch.js: job number, SigmaNest number,
// customer, sales rep, and the customer's PO with spaces and dashes
// ignored), plus what only this screen has: the Sage invoice number, the
// job description, delivery note numbers, the request document's name, and
// who submitted or invoiced it.
//
// From and To go by each pill's own date: Outstanding by when its first
// request was sent, Invoiced by the day it was invoiced, All requests by
// the day the request was sent. Days are South African days: a request
// sent at 01:00 on the 5th is on the 5th, not the 4th it is in UTC.
//
// Searches what the screen already holds; nothing is loaded for it.

import { jobMatchesSearch } from "./jobSearch.js";

const lower = (value) => String(value ?? "").toLowerCase();

// True when the typed text finds the job or anything filed against it.
//   extra.deliveryNotes   delivery note numbers on the job
//   extra.requests        the job's invoice requests (file_name, submitted_by)
//   extra.sageInvoices    the job's Sage invoices (invoice_number, invoiced_by)
export function invoicingMatchesSearch(job, query, extra = {}) {
  const q = lower(query).trim();
  if (!q) return true;
  if (job && jobMatchesSearch(job, q)) return true;
  const texts = [
    job?.invoice_number,
    job?.description,
    job?.invoiced_by,
    ...(extra.deliveryNotes || []),
    ...(extra.requests || []).flatMap((r) => [r?.file_name, r?.submitted_by]),
    ...(extra.sageInvoices || []).flatMap((s) => [s?.invoice_number, s?.invoiced_by]),
  ];
  return texts.some((t) => lower(t).includes(q));
}

// The Customer and Sales rep boxes. An empty box lets everything through.
export function invoicingMatchesPicks(job, { customer = "", salesRep = "" } = {}) {
  if (customer && job?.customer !== customer) return false;
  if (salesRep && job?.sales_rep !== salesRep) return false;
  return true;
}

// The South African day a moment falls on, as "2026-09-05", which is also
// what a date box holds. Blank for no date or one that cannot be read.
export function dayKeySA(when) {
  if (!when) return "";
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// True when the moment falls between the From and To days, both included.
// With no dates picked everything passes; with one picked, a row with no
// date of its own (an Outstanding job nobody has requested yet) does not.
export function inDayRange(when, from, to) {
  if (!from && !to) return true;
  const day = dayKeySA(when);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
