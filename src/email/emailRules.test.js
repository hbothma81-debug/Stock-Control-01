import test from "node:test";
import assert from "node:assert/strict";
import {
  goesToSelf,
  splitAddresses,
  isEmail,
  checkAddresses,
  knownAddresses,
  poEmailDefaults,
  actualRecipients,
  graphMessage,
  sentLine,
  lastSentTo,
  invoiceEmailDefaults,
  deliveryNoteEmailDefaults,
} from "./emailRules.js";

test("only the live site sends to the real people", () => {
  assert.equal(goesToSelf("stock-control-01.vercel.app"), false);
  assert.equal(goesToSelf("Stock-Control-01.vercel.app"), false);
  assert.equal(goesToSelf("localhost"), true);
  assert.equal(goesToSelf("stock-control-01-git-x.vercel.app"), true);
  assert.equal(goesToSelf(""), true);
  assert.equal(goesToSelf(undefined), true);
});

test("addresses split on commas, semicolons, spaces and new lines", () => {
  assert.deepEqual(splitAddresses("a@b.co.za; c@d.com,e@f.org\n g@h.net"), ["a@b.co.za", "c@d.com", "e@f.org", "g@h.net"]);
  assert.deepEqual(splitAddresses("  "), []);
  assert.deepEqual(splitAddresses(null), []);
});

test("what counts as an address", () => {
  assert.ok(isEmail("orders@supplier.co.za"));
  assert.ok(isEmail("first.last+po@sub.domain.com"));
  assert.ok(!isEmail("orders@supplier"));
  assert.ok(!isEmail("orders supplier.co.za"));
  assert.ok(!isEmail("@supplier.co.za"));
  assert.ok(!isEmail("Name <a@b.com>"));
});

test("a box of addresses: each once, the unreadable ones named", () => {
  const { list, bad } = checkAddresses("a@b.com; A@B.com, nonsense, c@d.com");
  assert.deepEqual(list, ["a@b.com", "c@d.com"]);
  assert.deepEqual(bad, ["nonsense"]);
});

test("known addresses: the company first, then contacts, no blanks or repeats", () => {
  const supplier = {
    name: "Steel Co",
    email: "sales@steel.co.za",
    contacts: [
      { name: "Anna", email: "anna@steel.co.za" },
      { name: "No Mail", email: "" },
      { name: "Same", email: "SALES@steel.co.za" },
    ],
  };
  assert.deepEqual(knownAddresses(supplier), [
    { name: "Steel Co", email: "sales@steel.co.za" },
    { name: "Anna", email: "anna@steel.co.za" },
  ]);
  assert.deepEqual(knownAddresses(null), []);
  assert.deepEqual(knownAddresses({ name: "X", email: "", contacts: [{ name: "B", email: "b@x.com" }] }), [{ name: "B", email: "b@x.com" }]);
});

test("a purchase order's email opens filled in", () => {
  const d = poEmailDefaults({
    po: { poNumber: "PO-0123", deliveryDate: "2026-09-30", reference: "JOB-0042" },
    supplier: { name: "Steel Co", email: "sales@steel.co.za", contacts: [] },
    company: { name: "East Rand Supplies", phone: "011 000 0000" },
    senderName: "Heinrich",
  });
  assert.equal(d.to, "sales@steel.co.za");
  assert.equal(d.subject, "Purchase Order PO-0123 - East Rand Supplies");
  assert.match(d.body, /purchase order PO-0123/);
  assert.match(d.body, /Delivery required by: 2026-09-30/);
  assert.match(d.body, /Reference: JOB-0042/);
  assert.match(d.body, /Kind regards,\nHeinrich\nEast Rand Supplies\n011 000 0000$/);
});

test("a supplier with no address leaves To empty, and nothing blank is printed", () => {
  const d = poEmailDefaults({ po: { poNumber: "PO-1" }, supplier: undefined, company: {}, senderName: "" });
  assert.equal(d.to, "");
  assert.equal(d.subject, "Purchase Order PO-1");
  assert.ok(!/Delivery required/.test(d.body));
  assert.ok(!/undefined|null/.test(d.body));
  assert.match(d.body, /Kind regards,$/);
});

test("on practice the email goes to the sender alone", () => {
  assert.deepEqual(actualRecipients({ to: ["a@b.com"], cc: ["c@d.com"], toSelf: true, ownAddress: "me@ers.co.za" }), { to: ["me@ers.co.za"], cc: [] });
  assert.deepEqual(actualRecipients({ to: ["a@b.com"], cc: ["c@d.com"], toSelf: false, ownAddress: "me@ers.co.za" }), { to: ["a@b.com"], cc: ["c@d.com"] });
});

test("the message as Microsoft wants it", () => {
  const m = graphMessage({
    to: ["a@b.com"],
    cc: [],
    subject: "S",
    body: "B",
    attachment: { fileName: "PO-1.pdf", base64: "QUJD" },
  });
  assert.equal(m.saveToSentItems, true);
  assert.deepEqual(m.message.toRecipients, [{ emailAddress: { address: "a@b.com" } }]);
  assert.deepEqual(m.message.ccRecipients, []);
  assert.equal(m.message.body.contentType, "Text");
  assert.deepEqual(m.message.attachments, [
    { "@odata.type": "#microsoft.graph.fileAttachment", name: "PO-1.pdf", contentType: "application/pdf", contentBytes: "QUJD" },
  ]);
  assert.equal(graphMessage({ to: ["a@b.com"], subject: "S", body: "B" }).message.attachments, undefined);
});

test("the line on the card, in South African time", () => {
  const line = sentLine({ sent_at: "2026-09-21T12:05:00Z", to_addresses: ["a@b.com", "c@d.com"], sent_by: "Heinrich" });
  assert.match(line, /^Emailed 21 Sep 14:05 to a@b\.com, c@d\.com by Heinrich$/);
  assert.match(sentLine({ sent_at: "2026-09-21T12:05:00Z", to_addresses: ["me@x.com"], test_mode: true }), /practice: it went to the sender only/);
});

test("where this customer's last invoice went", () => {
  assert.deepEqual(lastSentTo([]), []);
  assert.deepEqual(lastSentTo(null), []);
  assert.deepEqual(
    lastSentTo([
      { sent_at: "2026-09-01T08:00:00Z", to_addresses: ["old@cust.co.za"] },
      { sent_at: "2026-09-20T08:00:00Z", to_addresses: ["creditors@cust.co.za", "second@cust.co.za"] },
      { sent_at: "2026-09-10T08:00:00Z", to_addresses: ["middle@cust.co.za"] },
    ]),
    ["creditors@cust.co.za", "second@cust.co.za"]
  );
  assert.deepEqual(lastSentTo([{ sent_at: "2026-09-20T08:00:00Z", to_addresses: ["not an address", "ok@cust.co.za"] }]), ["ok@cust.co.za"]);
});

test("a Sage invoice's email: the first time To is empty and the contacts are offered", () => {
  const d = invoiceEmailDefaults({
    job: { job_number: "JOB-0042", invoice_number: "20616", customer_po: "4500123", customer: "Greenzone" },
    contacts: [
      { name: "Buyer", email: "buyer@greenzone.co.za" },
      { name: "No address", email: "" },
    ],
    lastTo: [],
    salesRep: { name: "Mark", email: "mark@ersupplies.co.za" },
    ownAddress: "accounts@ersupplies.co.za",
    company: { name: "East Rand Supplies", phone: "011 000 0000" },
    senderName: "Chante",
  });
  assert.equal(d.to, "");
  assert.equal(d.cc, "");
  assert.deepEqual(d.suggestions, [{ name: "Buyer", email: "buyer@greenzone.co.za" }]);
  assert.deepEqual(d.ccSuggestions, [{ name: "Mark", email: "mark@ersupplies.co.za" }]);
  assert.equal(d.subject, "Invoice 20616 - your order 4500123 - JOB-0042 - East Rand Supplies");
  assert.match(d.body, /our invoice 20616\./);
  assert.match(d.body, /Your order number: 4500123/);
  assert.match(d.body, /Our reference: JOB-0042/);
  assert.match(d.body, /Kind regards,\nChante\nEast Rand Supplies\n011 000 0000$/);
});

test("a Sage invoice's email: next time To is where the last one went", () => {
  const d = invoiceEmailDefaults({
    job: { job_number: "JOB-0050", invoice_number: "20700", customer_po: "" },
    contacts: [{ name: "Buyer", email: "buyer@greenzone.co.za" }],
    lastTo: ["creditors@greenzone.co.za"],
    salesRep: null,
    company: { name: "East Rand Supplies" },
    senderName: "Chante",
  });
  assert.equal(d.to, "creditors@greenzone.co.za");
  assert.equal(d.subject, "Invoice 20700 - JOB-0050 - East Rand Supplies");
  assert.ok(!/order number/.test(d.body));
  assert.deepEqual(d.ccSuggestions, []);
});

test("a Sage invoice's email: no invoice number yet, and the rep who is sending is not offered to himself", () => {
  const d = invoiceEmailDefaults({
    job: { job_number: "JOB-0007", invoice_number: null, customer_po: null },
    contacts: [],
    lastTo: [],
    salesRep: { name: "Mark", email: "Mark@ERSupplies.co.za" },
    ownAddress: "mark@ersupplies.co.za",
    company: {},
    senderName: "Mark",
  });
  assert.equal(d.subject, "Invoice for JOB-0007");
  assert.match(d.body, /Please find our invoice attached\./);
  assert.ok(!/undefined|null/.test(d.body + d.subject));
  assert.deepEqual(d.ccSuggestions, []);
  assert.deepEqual(d.suggestions, []);
});

test("a customer's delivery note: To empty the first time, the order number in the subject, no item list", () => {
  const d = deliveryNoteEmailDefaults({
    note: { delivery_note_number: "DN-0042", direction: "to_customer", recipient_name: "Greenzone" },
    job: { job_number: "JOB-0088", customer_po: "18074", customer: "Greenzone" },
    supplier: undefined,
    contacts: [{ name: "Stores", email: "stores@greenzone.co.za" }],
    lastTo: [],
    salesRep: { name: "Mark", email: "mark@ersupplies.co.za" },
    ownAddress: "drawings@ersupplies.co.za",
    company: { name: "East Rand Supplies", phone: "011 000 0000" },
    senderName: "Heinrich",
  });
  assert.equal(d.to, "");
  assert.deepEqual(d.suggestions, [{ name: "Stores", email: "stores@greenzone.co.za" }]);
  assert.deepEqual(d.ccSuggestions, [{ name: "Mark", email: "mark@ersupplies.co.za" }]);
  assert.equal(d.subject, "Delivery note DN-0042 - your order 18074 - JOB-0088 - East Rand Supplies");
  assert.match(d.body, /our delivery note DN-0042\.\nYour order number: 18074\nOur reference: JOB-0088/);
  assert.match(d.body, /Kind regards,\nHeinrich\nEast Rand Supplies\n011 000 0000$/);
});

test("a customer's delivery note: next time To is where their last delivery note went", () => {
  const d = deliveryNoteEmailDefaults({
    note: { delivery_note_number: "DN-0050", direction: "to_customer" },
    job: { job_number: "JOB-0090", customer_po: "" },
    contacts: [],
    lastTo: ["stores@greenzone.co.za", "buyer@greenzone.co.za"],
    company: {},
    senderName: "Heinrich",
  });
  assert.equal(d.to, "stores@greenzone.co.za; buyer@greenzone.co.za");
  assert.equal(d.subject, "Delivery note DN-0050 - JOB-0090");
  assert.ok(!/order number/.test(d.body));
});

test("a supplier's delivery note: their saved address, no customer order number, and the last address wins once there is one", () => {
  const supplier = { name: "Coaters", email: "jobs@coaters.co.za", contacts: [{ name: "Piet", email: "piet@coaters.co.za" }] };
  const job = { job_number: "JOB-0088", customer_po: "18074" };
  const first = deliveryNoteEmailDefaults({ note: { delivery_note_number: "DN-0043", direction: "to_supplier" }, job, supplier, contacts: [{ name: "Wrong", email: "customer@x.co.za" }], lastTo: [], company: { name: "East Rand Supplies" }, senderName: "Heinrich" });
  assert.equal(first.to, "jobs@coaters.co.za");
  assert.deepEqual(first.suggestions.map((s) => s.email), ["jobs@coaters.co.za", "piet@coaters.co.za"]);
  assert.equal(first.subject, "Delivery note DN-0043 - JOB-0088 - East Rand Supplies");
  assert.match(first.body, /for the work sent to you\./);
  assert.ok(!/18074/.test(first.subject + first.body));
  const later = deliveryNoteEmailDefaults({ note: { delivery_note_number: "DN-0044", direction: "to_supplier" }, job, supplier, lastTo: ["piet@coaters.co.za"], company: {}, senderName: "Heinrich" });
  assert.equal(later.to, "piet@coaters.co.za");
});

test("a delivery note whose job is gone still gets a window, with nothing blank printed", () => {
  const d = deliveryNoteEmailDefaults({ note: { delivery_note_number: "DN-0001", direction: "to_customer" }, job: undefined, contacts: undefined, lastTo: undefined, company: undefined, senderName: "" });
  assert.equal(d.subject, "Delivery note DN-0001");
  assert.ok(!/undefined|null/.test(d.subject + d.body));
  assert.equal(d.to, "");
});
