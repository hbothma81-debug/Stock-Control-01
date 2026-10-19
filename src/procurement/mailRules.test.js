import { test } from "node:test";
import assert from "node:assert/strict";
import { addressBook, cleanSubject, findExisting, nextPrNumber, quoteRequestFrom, threadUpdate } from "./mailRules.js";

const to = (address, name = "") => ({ emailAddress: { address, name } });
const book = addressBook(
  [{ id: "s1", name: "Eurosteel", email: "sales@eurosteel.co.za", contacts: [{ email: "TashS@eurosteel.co.za" }] }],
  ["buyer@bigcustomer.co.za", "orders@eurosteel.co.za"]
);

test("a price request to a known supplier becomes a request on that supplier", () => {
  const r = quoteRequestFrom({ subject: "RE: Please quote 50mm 304 round bar", bodyPreview: "Hi Tash", toRecipients: [to("TashS@eurosteel.co.za")] }, book);
  assert.deepEqual(r, { supplier_id: "s1", supplier_name: "Eurosteel", contact_email: "tashs@eurosteel.co.za", item: "Please quote 50mm 304 round bar" });
});

test("a price request to a new supplier keeps the recipient's name", () => {
  const r = quoteRequestFrom({ subject: "Nozzles", bodyPreview: "Please send us a quotation for 26 off", toRecipients: [to("sales1@monitorspray.co.za", "Monitor Spray")] }, book);
  assert.equal(r.supplier_id, null);
  assert.equal(r.supplier_name, "Monitor Spray");
});

test("orders, internal mail and quotes to customers are not requests", () => {
  assert.equal(quoteRequestFrom({ subject: "Please quote", bodyPreview: "please proceed with the order", toRecipients: [to("a@eurosteel.co.za")] }, book), null);
  assert.equal(quoteRequestFrom({ subject: "Please quote", toRecipients: [to("accounts@ersupplies.co.za")] }, book), null);
  assert.equal(quoteRequestFrom({ subject: "Quotation for brackets please", toRecipients: [to("buyer@bigcustomer.co.za")] }, book), null);
  assert.equal(quoteRequestFrom({ subject: "Drawings attached", bodyPreview: "see attached", toRecipients: [to("a@eurosteel.co.za")] }, book), null);
});

test("subjects lose their RE: and FW:", () => {
  assert.equal(cleanSubject("RE: FW: Quote request castors"), "Quote request castors");
});

test("an already known mail is found by id, thread, or address and day", () => {
  const rows = [
    { pr_number: "PR-001", request_message_id: "<a@x>", conversation_id: "c1", contact_email: "x@y.co.za", requested_at: "2026-10-15T00:00:00+00:00" },
    { pr_number: "PR-002", request_message_id: null, conversation_id: "old", contact_email: "tashs@eurosteel.co.za", requested_at: "2026-10-15T00:00:00+00:00" },
  ];
  assert.equal(findExisting(rows, { internetMessageId: "<a@x>" }, "")?.pr_number, "PR-001");
  assert.equal(findExisting(rows, { internetMessageId: "<b@x>", conversationId: "c1" }, "")?.pr_number, "PR-001");
  assert.equal(findExisting(rows, { internetMessageId: "<c@x>", conversationId: "new", sentDateTime: "2026-10-15T09:12:00Z" }, "tashs@eurosteel.co.za")?.pr_number, "PR-002");
  assert.equal(findExisting(rows, { internetMessageId: "<d@x>", conversationId: "new", sentDateTime: "2026-10-16T09:12:00Z" }, "tashs@eurosteel.co.za"), null);
});

const sent = { status: "Sent", requested_at: "2026-10-15T07:00:00Z", chases: 0 };
const fromSupplier = (when, extra = {}) => ({ id: `s-${when}`, from: to("tashs@eurosteel.co.za"), receivedDateTime: when, subject: "RE: quote", ...extra });
const fromUs = (when) => ({ id: `u-${when}`, from: to("drawings@ersupplies.co.za"), sentDateTime: when, subject: "RE: quote" });

test("a supplier's quote moves Sent to Reply; on Pro forma terms we then wait for the pro forma", () => {
  assert.deepEqual(threadUpdate(sent, [fromSupplier("2026-10-16T08:00:00Z")], "Account"),
    { status: "Reply", waiting_since: null, chases: 0, reply_message_id: "s-2026-10-16T08:00:00Z" });
  assert.equal(threadUpdate(sent, [fromSupplier("2026-10-16T08:00:00Z")], "Pro forma").waiting_since, "2026-10-16");
});

test("a pro forma or invoice attached moves it to Pro forma", () => {
  const pf = fromSupplier("2026-10-17T08:00:00Z", { attachments: [{ name: "Pro Forma 1234.pdf" }] });
  assert.equal(threadUpdate(sent, [pf], "Pro forma").status, "Pro forma");
  assert.equal(threadUpdate({ ...sent, status: "Reply" }, [fromSupplier("2026-10-16T08:00:00Z"), pf], "Pro forma").status, "Pro forma");
  assert.equal(threadUpdate(sent, [fromSupplier("2026-10-17T08:00:00Z", { subject: "Proforma invoice PF-88" })], "").status, "Pro forma");
});

test("our reminders on later days are chases; the request itself is not", () => {
  const seeded = { status: "Sent", requested_at: "2026-10-15T00:00:00+00:00", chases: 0 };
  assert.equal(threadUpdate(seeded, [fromUs("2026-10-15T09:00:00Z")], ""), null);
  assert.deepEqual(threadUpdate(seeded, [fromUs("2026-10-15T09:00:00Z"), fromUs("2026-10-19T09:00:00Z")], ""),
    { chases: 1, waiting_since: "2026-10-19", reminder_message_id: "u-2026-10-19T09:00:00Z" });
});

test("nothing moves past Pro forma, and nothing moves without news", () => {
  assert.equal(threadUpdate({ ...sent, status: "Ordered" }, [fromSupplier("2026-10-16T08:00:00Z")], ""), null);
  assert.equal(threadUpdate(sent, [], ""), null);
});

test("PR numbers count on", () => {
  assert.equal(nextPrNumber("PR-011"), "PR-012");
  assert.equal(nextPrNumber(null), "PR-001");
});
