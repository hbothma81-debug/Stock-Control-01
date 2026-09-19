// Closing a job's Invoicing stage is what hands the job to accounts, so it
// always sends the invoice request for everything left first, whichever
// way the stage is closed (Heinrich, 18 Sep 2026: "this should be
// automatic").
//
// Until then only the Production card's "Request invoice" button did. A
// plain tick on the job page, and the last count on an Invoicing stage set
// to count per item, closed the stage and completed the job with nothing
// sent: on 18 Sep seven jobs reached Records -> Invoicing reading "No
// invoice request submitted yet", every line still to be requested.
//
// A job with no Invoicing stage gets no request by itself: he does not
// want those invoiced. A shortage's catch-up run is never the job's own
// Invoicing. Un-ticking sends nothing.

// Mirrors isInvoicingStage in App.jsx. Change both together.
const isInvoicing = (name) => String(name || "").trim().toLowerCase() === "invoicing";

// True when closing this stage must send the invoice request first.
export function closingSendsInvoiceRequest(process) {
  return !!process && !process.shortage_id && isInvoicing(process.process_name);
}

// True when the stage's card shows "Request invoice" in place of a tick or
// per-item counts. Invoicing is never counted per item: the request is the
// whole of the work, and counting boxes hid the button.
export function showsRequestInvoiceButton(process) {
  return closingSendsInvoiceRequest(process) && !process.is_complete;
}
