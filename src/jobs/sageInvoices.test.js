import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sageInvoicesOf, requestsNotYetInvoiced, requestsOnInvoice, suggestedSageAmount,
  sageNumbersLabel, notYetFullyInvoiced, partlyInvoicedBanner,
} from "./sageInvoices.js";

const job = { id: "j1", job_number: "JOB-0014", status: "in_progress" };
const requests = [
  { id: "r1", job_id: "j1", total_amount: 100, sage_invoice_id: "s1" },
  { id: "r2", job_id: "j1", total_amount: 50, sage_invoice_id: "s1" },
  { id: "r3", job_id: "j1", total_amount: 25.5, sage_invoice_id: null },
  { id: "r9", job_id: "other", total_amount: 9, sage_invoice_id: null },
];
const invoices = [
  { id: "s2", job_id: "j1", invoice_number: "20612", amount: 7, invoiced_at: "2026-09-20T08:00:00Z" },
  { id: "s1", job_id: "j1", invoice_number: "20600", amount: 150, invoiced_at: "2026-09-18T08:00:00Z" },
  { id: "s5", job_id: "other", invoice_number: "1", invoiced_at: "2026-09-01T08:00:00Z" },
];

test("one Sage invoice covers two requests; the third waits", () => {
  assert.deepEqual(requestsOnInvoice("s1", requests).map((r) => r.id), ["r1", "r2"]);
  assert.deepEqual(requestsNotYetInvoiced("j1", requests).map((r) => r.id), ["r3"]);
  assert.deepEqual(sageInvoicesOf("j1", invoices).map((s) => s.invoice_number), ["20600", "20612"]);
  assert.equal(sageNumbersLabel("j1", invoices), "20600, 20612");
  assert.equal(sageNumbersLabel("none", invoices), "");
});

test("the amount box starts with the ticked requests added up", () => {
  assert.equal(suggestedSageAmount(["r1", "r2"], requests), "150.00");
  assert.equal(suggestedSageAmount(["r3"], requests), "25.50");
  assert.equal(suggestedSageAmount([], requests), "");
});

test("fully invoiced needs every request billed, every line and stage done", () => {
  assert.match(notYetFullyInvoiced(job, requests), /1 request has no Sage invoice yet/);
  const all = requests.map((r) => (r.id === "r3" ? { ...r, sage_invoice_id: "s2" } : r));
  assert.equal(notYetFullyInvoiced(job, all), null);
  assert.match(notYetFullyInvoiced(job, all, [{ description: "L", qty: 2, qty_invoiced: 1 }], []), /not fully invoiced/);
  assert.match(notYetFullyInvoiced(job, all, [], [{ process_name: "Bending", is_complete: false }]), /Bending/);
  assert.equal(notYetFullyInvoiced(job, all, [{ description: "L", qty: 2, qty_invoiced: 2 }], [{ process_name: "Bending", is_complete: true }]), null);
});

test("the partly invoiced banner", () => {
  const text = partlyInvoicedBanner(job, requests, invoices, [
    { description: "A", qty: 10, qty_invoiced: 4 },
    { description: "B", qty: 10, qty_invoiced: 10 },
    { description: "part", qty: 5, qty_invoiced: 0, parent_quote_item_id: "A" },
  ]);
  assert.equal(text, "Partly invoiced: 20600 (R 150.00), 20612 (R 7.00) on 2 of 3 requests; 1 request still to invoice; 1 line still to bill");
  assert.equal(partlyInvoicedBanner(job, requests, invoices), "Partly invoiced: 20600 (R 150.00), 20612 (R 7.00) on 2 of 3 requests; 1 request still to invoice");
  assert.equal(partlyInvoicedBanner({ ...job, status: "invoiced" }, requests, invoices), null);
  assert.equal(partlyInvoicedBanner({ id: "none", status: "in_progress" }, requests, invoices), null);
  assert.equal(partlyInvoicedBanner(null, requests, invoices), null);
});
