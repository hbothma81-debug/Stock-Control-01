// The money figures on the Jobs list: what is on order, and what was
// invoiced in a month. Tested in jobFigures.test.js.
//
// All of it excludes VAT: a job's lines are priced before VAT, and the
// amount typed on Mark as Invoiced is asked for before VAT.
//
// Decided with Heinrich, 17 Sep 2026:
// - "On order" is every job the floor or accounts still has: In Progress
//   and Complete (the Active and To invoice pills). A job with nothing
//   priced counts for nothing, and the figure says how many there are.
// - "Invoiced in <month>" goes by the day Mark as Invoiced was pressed
//   (jobs.invoiced_at), and only while the job still reads Invoiced: the
//   date is never cleared when an admin moves a job back, so the status
//   is tested too. The amount is what accounts typed from the Sage invoice
//   (jobs.invoiced_amount). A job invoiced before that box existed has
//   none, and counts at what it was quoted at; the figure says how many.

// A month is a South African month on every device, wherever it is and
// whatever its clock is set to. A plain toISOString().slice(0, 7) is a
// UTC month, which files 00:00 to 02:00 on the 1st under the month before.
const SA_MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg",
  year: "numeric",
  month: "2-digit",
});

// "2026-09" for a Date or anything new Date() reads; "" for nothing or
// for something it cannot read.
export function monthKeySA(when) {
  if (when == null || when === "") return "";
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return "";
  const parts = SA_MONTH.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
}

// What a job is worth: its quoted lines added up (lineTotals, built by
// fetchJobs from the parent lines), and failing that the Quoted value
// box. Never the two together.
export function jobWorth(job, lineTotals) {
  return (lineTotals && lineTotals[job?.id]) || Number(job?.quoted_value) || 0;
}

// Everything the floor has asked accounts to bill on one job so far.
export function requestedTotalFor(jobId, requests) {
  return (requests || [])
    .filter((r) => r.job_id === jobId)
    .reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
}

// What to offer in the amount box on Mark as Invoiced, so accounts checks
// a number instead of typing one: what was requested, and with no request
// (or requests adding up to nothing) what the job is worth. "" when
// neither gives a number, and the box is then typed.
//
// A job marked before, moved back by an admin and marked again offers the
// amount typed the first time: that one came off a Sage invoice.
export function suggestedInvoiceAmount(job, requests, lineTotals) {
  if (job?.invoiced_amount != null && job.invoiced_amount !== "") return Number(job.invoiced_amount).toFixed(2);
  const amount = requestedTotalFor(job?.id, requests) || jobWorth(job, lineTotals);
  return amount > 0 ? amount.toFixed(2) : "";
}

// The typed amount as a number, or null when it is not one. Nought is an
// amount: a job done under warranty is invoiced at nothing.
export function readInvoiceAmount(text) {
  const s = String(text ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// { total, count, unpriced } over the jobs still with the floor or accounts.
export function onOrderFigure(jobs, lineTotals) {
  const open = (jobs || []).filter((j) => j.status === "in_progress" || j.status === "complete");
  let total = 0;
  let unpriced = 0;
  for (const j of open) {
    const worth = jobWorth(j, lineTotals);
    total += worth;
    if (!(worth > 0)) unpriced += 1;
  }
  return { total, count: open.length, unpriced };
}

// { total, count, jobs } over the invoice requests sent to accounts in that
// South African month: what the floor and the office asked to have billed,
// by the day each request was sent (job_invoice_requests.submitted_at).
// Not the same figure as Invoiced: a request sent on the 30th is often
// invoiced in Sage on the 2nd, and a request's total is frozen when it is
// sent. `jobs` is how many different jobs the requests are for.
export function requestedInMonthFigure(requests, monthKey) {
  const inMonth = (requests || []).filter((r) => monthKey && monthKeySA(r.submitted_at) === monthKey);
  return {
    total: inMonth.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0),
    count: inMonth.length,
    jobs: new Set(inMonth.map((r) => r.job_id)).size,
  };
}

// { total, count, atQuotedValue } over what was invoiced in that South
// African month ("2026-09").
//
// Since 22 Sep 2026 a job can carry several Sage invoices
// (job_sage_invoices, src/jobs/sageInvoices.js). Each of those counts in
// the month it was raised, at its own amount (his answer 5: a job invoiced
// across two months shows in both). A job with any Sage invoice is left
// out of the job-level count below, so it is never counted twice. Jobs
// invoiced before this, with their one number on the job, count as they
// always did.
export function invoicedInMonthFigure(jobs, monthKey, lineTotals, sageInvoices) {
  const shownJobs = new Set((jobs || []).map((j) => j.id));
  const withSage = new Set((sageInvoices || []).map((s) => s.job_id));
  let total = 0;
  let count = 0;
  for (const s of sageInvoices || []) {
    if (!shownJobs.has(s.job_id) || !monthKey || monthKeySA(s.invoiced_at) !== monthKey) continue;
    total += Number(s.amount) || 0;
    count += 1;
  }
  const inMonth = (jobs || []).filter(
    (j) => j.status === "invoiced" && !withSage.has(j.id) && monthKey && monthKeySA(j.invoiced_at) === monthKey
  );
  let atQuotedValue = 0;
  for (const j of inMonth) {
    if (j.invoiced_amount != null && j.invoiced_amount !== "") {
      total += Number(j.invoiced_amount) || 0;
    } else {
      total += jobWorth(j, lineTotals);
      atQuotedValue += 1;
    }
  }
  return { total, count: count + inMonth.length, atQuotedValue };
}
