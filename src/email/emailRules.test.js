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
  assert.match(sentLine({ sent_at: "2026-09-21T12:05:00Z", to_addresses: ["me@x.com"], test_mode: true }), /practice: went to the sender only/);
});
