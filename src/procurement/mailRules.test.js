import { test } from "node:test";
import assert from "node:assert/strict";
import { addressBook, cleanSubject, draftFollowUp, findExisting, nextPrNumber, quoteFiles, quoteRequestFrom, textToHtml, threadUpdate } from "./mailRules.js";

const to = (address, name = "") => ({ emailAddress: { address, name } });
const book = addressBook(
  [{ id: "s1", name: "Eurosteel", email: "sales@eurosteel.co.za", contacts: [{ email: "TashS@eurosteel.co.za" }] }],
  ["buyer@bigcustomer.co.za", "orders@eurosteel.co.za"]
);

test("a price request to a known supplier becomes a request on that supplier", () => {
  const r = quoteRequestFrom({ subject: "FW: Please quote 50mm 304 round bar", bodyPreview: "Hi Tash", toRecipients: [to("TashS@eurosteel.co.za")] }, book);
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

// The three faults of the first practice read, 19 Oct 2026, as they came.
const exchangeName = "/O=EXCHANGELABS/OU=EXCHANGE ADMINISTRATIVE GROUP (FYDIBOHF23SPDLT)/CN=RECIPIENTS/CN=402A68C5207D44A99B111DD3B825CE01-DRAWINGS";

test("our own request, sent under Exchange's internal name, is not a supplier reply (PR-010)", () => {
  const seeded = { status: "Sent", requested_at: "2026-10-19T00:00:00+00:00", chases: 0 };
  const own = { id: "o1", from: to(exchangeName), subject: "Quote request – 304 stainless fittings (300 lb)", receivedDateTime: "2026-10-19T08:15:00Z" };
  assert.equal(threadUpdate(seeded, [own], ""), null);
});

test("the supplier forwarding our request inside their company is not an answer (PR-011)", () => {
  const seeded = { status: "Sent", requested_at: "2026-10-19T00:00:00+00:00", chases: 0 };
  const thread = [
    { id: "o1", from: to(exchangeName), subject: "Quote request - 4x heavy duty castors 1500kg", receivedDateTime: "2026-10-19T11:06:00Z" },
    { id: "f1", from: to("roland@nationalcastors.co.za"), subject: "FW: Quote request - 4x heavy duty castors 1500kg", receivedDateTime: "2026-10-19T11:42:29Z" },
  ];
  assert.equal(threadUpdate(seeded, thread, "Pro forma"), null);
  assert.equal(threadUpdate(seeded, [{ ...thread[1], subject: "Automatic reply: Quote request" }], ""), null);
});

test("answering a customer's RFQ is not a new request (PR-012)", () => {
  assert.equal(quoteRequestFrom({ subject: "RE: RFQ", bodyPreview: "Please find our quotation attached", toRecipients: [to("johanb@bwie.co.za", "Johan Burger")] }, book), null);
});

test("the follow-up names item, qty and date, and asks for the quote or the pro forma", () => {
  const row = { item: "Gas strut, series 4100", qty: "2", requested_at: "2026-10-15T00:00:00+00:00" };
  const quote = draftFollowUp({ row, contactName: "Shovan Bezuidenhout", owesProForma: false, senderName: "Heinrich" });
  assert.match(quote, /^Hi Shovan,/);
  assert.match(quote, /quotation on 2026-10-15 for Gas strut, series 4100 \(qty 2\)/);
  assert.match(quote, /Kind regards,\nHeinrich\nEast Rand Supplies$/);
  const pf = draftFollowUp({ row: { ...row, qty: "see list" }, contactName: "", owesProForma: true, senderName: "Heinrich" });
  assert.match(pf, /^Good day,/);
  assert.match(pf, /pro forma invoice/);
  assert.doesNotMatch(pf, /qty|bank|account/i);
  assert.equal(textToHtml("a < b\nc & d"), "a &lt; b<br>c &amp; d");
});

test("only a supplier's real PDF attachments are saved as quotes", () => {
  const thread = [
    { id: "o", from: to(exchangeName), attachments: [{ name: "Drawing.pdf", contentType: "application/pdf" }] },
    { id: "s", from: to("tashs@eurosteel.co.za"), attachments: [
      { name: "Quote EJB449418.pdf", contentType: "application/pdf", size: 120000 },
      { name: "logo.png", contentType: "image/png", isInline: true },
      { name: "signature.pdf", contentType: "application/pdf", isInline: true },
      { name: "Huge.pdf", contentType: "application/pdf", size: 11 * 1024 * 1024 },
    ] },
  ];
  assert.deepEqual(quoteFiles(thread).map((x) => x.attachment.name), ["Quote EJB449418.pdf"]);
});

test("PR numbers count on", () => {
  assert.equal(nextPrNumber("PR-011"), "PR-012");
  assert.equal(nextPrNumber(null), "PR-001");
});
