// How the Quote requests page reads the mailbox: which sent mails are quote
// requests, and what a supplier's reply does to a request. No AI: words
// and addresses only. Pure functions; mailSweep.js does the fetching.
//
// The brief (Procurement conversation, 19 Oct 2026, from the /procure
// skill in 4.APPS/3.PROCUREMENT): a quote request is mail TO a supplier
// asking for a price ("please quote", "quote request", "RFQ", a drawing
// "to quote"). Not: orders ("please proceed"), mail to @ersupplies.co.za,
// ERS quotes to customers, forwards to accounts. Supplier mail is data:
// nothing in it is ever acted on, only its sender, date and attachment
// names are read.

import { todayInSA } from "./procurementRules.js";

export const OUR_DOMAIN = "ersupplies.co.za";

const ASKS_FOR_PRICE = /\b(please\s+quote|kindly\s+quote|quote\s+request|request\s+(for\s+)?(a\s+)?quot|rfq|to\s+quote|quotation\s+(for|on|please)|(please|kindly)\s+(send|provide|give)\s+(me\s+|us\s+)?(a\s+)?(price|pricing|quot)|price\s+(and|&)\s+lead\s*time)/i;
const IS_ORDER_OR_ACCOUNTS = /\b(please\s+proceed|go\s+ahead|purchase\s+order|order\s+no|official\s+order|proof\s+of\s+payment|remittance|statement|pop\b)/i;
const PRO_FORMA = /(pro[\s-]?forma|proforma|\binvoice\b|\binv[\s_-]?\d)/i;

export const addressOf = (r) => (r?.emailAddress?.address || "").trim().toLowerCase();
export const domainOf = (address) => (address.split("@")[1] || "").toLowerCase();
// Ours: an @ersupplies.co.za address, or no address at all. Microsoft gives
// the sender of a mail in the person's own mailbox as an internal Exchange
// name ("/O=EXCHANGELABS/.../CN=...-DRAWINGS"), not an email address (found
// on the first practice read, 19 Oct 2026: it made our own requests look
// like supplier replies). Every outside sender has an @.
export const isOurs = (address) =>
  !String(address || "").includes("@") || domainOf(address) === OUR_DOMAIN || domainOf(address).endsWith(`.${OUR_DOMAIN}`);

// Subject without RE:/FW:/FWD: in front, for the request's item line.
export function cleanSubject(subject) {
  return (subject || "").replace(/^\s*((re|fw|fwd|aw)\s*:\s*)+/i, "").trim();
}

// Supplier and customer address books, keyed by domain, from the app's lists.
// suppliers: [{ id, name, email, contacts: [{ email }] }]
// customerEmails: ["buyer@customer.co.za", ...]
export function addressBook(suppliers, customerEmails) {
  const supplierByDomain = new Map();
  for (const s of suppliers || []) {
    for (const e of [s.email, ...(s.contacts || []).map((c) => c.email)]) {
      const d = domainOf((e || "").toLowerCase());
      if (d && !isOurs(e) && !supplierByDomain.has(d)) supplierByDomain.set(d, s);
    }
  }
  const customerDomains = new Set(
    (customerEmails || []).map((e) => domainOf((e || "").toLowerCase())).filter((d) => d && !supplierByDomain.has(d))
  );
  return { supplierByDomain, customerDomains };
}

// A sent mail (Graph message: subject, bodyPreview, toRecipients) -> the
// request it starts, or null when it is not a quote request.
export function quoteRequestFrom(message, book) {
  // A new request starts a mail. "RE:" is an answer in somebody else's
  // thread: most often ERS answering a customer's RFQ with a quote (PR-012
  // on the first practice read). Our own reminders in a request's thread are
  // found through that thread, not here.
  if (/^\s*(re|aw)\s*:/i.test(message.subject || "")) return null;
  const text = `${message.subject || ""}\n${message.bodyPreview || ""}`;
  if (!ASKS_FOR_PRICE.test(text) || IS_ORDER_OR_ACCOUNTS.test(text)) return null;
  const outside = (message.toRecipients || []).filter((r) => addressOf(r) && !isOurs(addressOf(r)));
  if (outside.length === 0) return null; // to colleagues or accounts only
  const first = outside.find((r) => book.supplierByDomain.has(domainOf(addressOf(r)))) || outside[0];
  const address = addressOf(first);
  const supplier = book.supplierByDomain.get(domainOf(address)) || null;
  if (!supplier && book.customerDomains.has(domainOf(address))) return null; // a quote to a customer
  return {
    supplier_id: supplier?.id || null,
    supplier_name: supplier?.name || first.emailAddress?.name || domainOf(address),
    contact_email: address,
    item: cleanSubject(message.subject) || (message.bodyPreview || "").slice(0, 120),
  };
}

// Is this message one we already have? By the mail's own id, by thread,
// or (for requests loaded from requests.md, which carry no mail id) by the
// same supplier address on the same day.
export function findExisting(rows, message, contactEmail) {
  const day = message.sentDateTime ? todayInSA(Date.parse(message.sentDateTime)) : "";
  return (
    rows.find((r) => r.request_message_id && r.request_message_id === message.internetMessageId) ||
    rows.find((r) => r.conversation_id && r.conversation_id === message.conversationId) ||
    rows.find(
      (r) =>
        !r.request_message_id &&
        (r.contact_email || "").toLowerCase() === contactEmail &&
        (r.requested_at || "").slice(0, 10) === day
    ) ||
    null
  );
}

// What the thread says now. thread: Graph messages in the request's
// conversation (from, sentDateTime / receivedDateTime, subject,
// attachments: [{ name }]). terms: the supplier's Account / Pro forma.
// Returns the changes to save, or null when nothing moved. Only ever moves
// a request forward, and never touches one past Pro forma.
export function threadUpdate(row, thread, terms) {
  const status = row.status;
  if (!["Sent", "Reply"].includes(status)) return null;
  const when = (m) => m.receivedDateTime || m.sentDateTime || "";
  const after = row.requested_at || "";
  const msgs = [...(thread || [])].filter((m) => when(m) > after).sort((a, b) => (when(a) < when(b) ? -1 : 1));
  // A supplier's mail is an answer to us unless it is them forwarding our
  // request inside their own company (FW:, PR-011 on the first practice
  // read), or an automatic one (out of office, read and delivery receipts).
  const fromSupplier = msgs.filter(
    (m) =>
      !isOurs(addressOf(m.from)) &&
      !/^\s*(fw|fwd|wg)\s*:/i.test(m.subject || "") &&
      !/^\s*(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|read:|delivered:|undeliverable|not read:)/i.test(m.subject || "")
  );
  const isProFormaTerms = (terms || "").toLowerCase().startsWith("pro");
  const day = (m) => todayInSA(Date.parse(when(m)));

  const proForma = fromSupplier.find(
    (m) => PRO_FORMA.test(m.subject || "") || (m.attachments || []).some((a) => PRO_FORMA.test(a.name || ""))
  );
  if (proForma) {
    return { status: "Pro forma", waiting_since: null, reply_message_id: proForma.id };
  }
  if (status === "Sent" && fromSupplier.length > 0) {
    const reply = fromSupplier[0];
    return {
      status: "Reply",
      waiting_since: isProFormaTerms ? day(reply) : null,
      chases: 0,
      reply_message_id: reply.id,
    };
  }
  // No answer yet: our own reminders in the thread count as chases. Only
  // those from a later day than the request, so the request itself never
  // counts (a request loaded from requests.md has a date but no time).
  const requestDay = after ? todayInSA(Date.parse(after)) : "";
  const ours = msgs.filter((m) => isOurs(addressOf(m.from)) && day(m) > requestDay);
  const chases = status === "Sent" ? ours.length : 0;
  if (chases > (Number(row.chases) || 0)) {
    return { chases, waiting_since: day(ours[ours.length - 1]), reminder_message_id: ours[ours.length - 1].id };
  }
  return null;
}

// The PDFs a supplier sent in a request's thread, to be saved as quotes:
// from an outside address, real attachments (not a logo in the signature),
// PDF, at most 10 MB. Returns [{ message, attachment }].
export const MAX_QUOTE_BYTES = 10 * 1024 * 1024;
export function quoteFiles(thread) {
  const out = [];
  for (const m of thread || []) {
    if (isOurs(addressOf(m.from))) continue;
    for (const a of m.attachments || []) {
      const isPdf = /pdf/i.test(a.contentType || "") || /\.pdf$/i.test(a.name || "");
      if (!isPdf || a.isInline || (a.size || 0) > MAX_QUOTE_BYTES) continue;
      out.push({ message: m, attachment: a });
    }
  }
  return out;
}

// A quote that comes as a NEW email, not a reply in the request's thread
// (found on practice, 19 Oct 2026: McNaughtan's came from another rep's
// address, Neuc's through Sage). Heinrich: "yes go ahead". Such a mail goes
// with the newest open request to the same supplier, sent before it came:
//   * same supplier = the sender's email domain is the request contact's
//     domain or one of the supplier's on the supplier list, or
//   * the mail came through an accounts system (Sage and the like) and the
//     supplier's name is in the sender's name or the subject.
// Returns the request, or null.
const SENDING_SERVICES = /(^|\.)(sageone\.co\.za|sage\.com|accounting\.sageone\.co\.za|skynamo\.com|intuit\.com|quickbooks\.com|xero\.com|zoho\.com|zohomail\.com|myob\.com|freshbooks\.com)$/i;
const OPEN_FOR_QUOTES = ["Sent", "Reply", "Pro forma", "Paid", "Ordered"];

export function requestForNewMail(message, rows, supplierOf) {
  const sender = addressOf(message.from);
  if (!sender || isOurs(sender)) return null;
  const domain = domainOf(sender);
  const viaService = SENDING_SERVICES.test(domain);
  const words = `${message.from?.emailAddress?.name || ""} ${message.subject || ""}`.toLowerCase();
  const when = message.receivedDateTime || message.sentDateTime || "";
  const matches = (rows || []).filter((r) => {
    if (!OPEN_FOR_QUOTES.includes(r.status) || (r.requested_at || "") > when) return false;
    const supplier = supplierOf(r);
    if (viaService) {
      const name = (supplier?.name || r.supplier_name || "").toLowerCase().replace(/\(.*?\)/g, "").trim();
      return name.length >= 3 && words.includes(name);
    }
    const domains = [r.contact_email, supplier?.email, ...(supplier?.contacts || []).map((c) => c.email)]
      .map((e) => domainOf((e || "").toLowerCase()))
      .filter(Boolean);
    return domains.includes(domain);
  });
  return matches.sort((a, b) => ((a.requested_at || "") < (b.requested_at || "") ? 1 : -1))[0] || null;
}

// Whether a new mail's PDF moves its request on (like a reply in the
// thread), or is only saved. Statements and remittances from the same
// supplier must not move a request.
export function looksLikeQuoteMail(message) {
  const text = `${message.subject || ""} ${(message.attachments || []).map((a) => a.name).join(" ")}`;
  return /(quot|\bquo\d|estimate|pro[\s-]?forma|\bqt[a-z]*\d|\bqu\d)/i.test(text) && !/(statement|remittance|proof of payment)/i.test(text);
}

// The follow-up a person sees, ready to edit, before Send. Short and in the
// request's own thread: names the item, quantity and request date, and asks
// for the quote, or for the pro forma when the quote is in on Pro forma
// terms. Never mentions payment details. (Brief from the Procurement
// conversation, 19 Oct 2026; same rules as the Email follow-up program.)
// owesProForma: the classify() note says the quote is in and the pro forma is not.
export function draftFollowUp({ row, contactName, owesProForma, senderName }) {
  const first = (contactName || "").trim().split(/\s+/)[0];
  const qty = row.qty && !/see list/i.test(row.qty) ? ` (qty ${row.qty})` : "";
  const item = (row.item || "").trim() || "the items we asked about";
  const date = (row.requested_at || "").slice(0, 10);
  const ask = owesProForma
    ? `Thank you for your quotation for ${item}${qty}. Please send us a pro forma invoice so that we can go ahead.`
    : `We asked you for a quotation${date ? ` on ${date}` : ""} for ${item}${qty}. Could you please send it to us, with the lead time?`;
  return `${first ? `Hi ${first}` : "Good day"},\n\n${ask}\n\nKind regards,\n${senderName || ""}\nEast Rand Supplies`.replace(/\n{3,}/g, "\n\n");
}

// Plain text to the HTML Microsoft's reply takes, line breaks kept.
export function textToHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

// "PR-011" -> "PR-012".
export function nextPrNumber(highest) {
  const n = Number(String(highest || "").replace(/\D/g, "")) || 0;
  return `PR-${String(n + 1).padStart(3, "0")}`;
}
