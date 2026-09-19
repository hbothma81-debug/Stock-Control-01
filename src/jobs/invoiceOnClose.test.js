import { test } from "node:test";
import assert from "node:assert/strict";
import { closingSendsInvoiceRequest, showsRequestInvoiceButton } from "./invoiceOnClose.js";

test("closing the job's own Invoicing stage sends the request, however it is set to count", () => {
  assert.equal(closingSendsInvoiceRequest({ process_name: "Invoicing", tracking_mode: "batch" }), true);
  // JOB-0049 on 18 Sep: Invoicing set to count per item, closed by its counts.
  assert.equal(closingSendsInvoiceRequest({ process_name: "Invoicing", tracking_mode: "each" }), true);
  assert.equal(closingSendsInvoiceRequest({ process_name: "  invoicing " }), true);
});

test("no other stage sends one, nor a re-cut's run, nor nothing at all", () => {
  assert.equal(closingSendsInvoiceRequest({ process_name: "Welding" }), false);
  assert.equal(closingSendsInvoiceRequest({ process_name: "Invoicing - external" }), false);
  assert.equal(closingSendsInvoiceRequest({ process_name: "Invoicing", shortage_id: "s1" }), false);
  assert.equal(closingSendsInvoiceRequest(null), false);
  assert.equal(closingSendsInvoiceRequest({}), false);
});

test("the card shows Request invoice on an open Invoicing stage, per item or not", () => {
  assert.equal(showsRequestInvoiceButton({ process_name: "Invoicing", tracking_mode: "each", is_complete: false }), true);
  assert.equal(showsRequestInvoiceButton({ process_name: "Invoicing", tracking_mode: "batch", is_complete: false }), true);
  // Ticked: the plain tick shows, so it can be un-ticked.
  assert.equal(showsRequestInvoiceButton({ process_name: "Invoicing", is_complete: true }), false);
  assert.equal(showsRequestInvoiceButton({ process_name: "Welding", tracking_mode: "each", is_complete: false }), false);
});
