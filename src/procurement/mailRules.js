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
export const isOurs = (address) => domainOf(address) === OUR_DOMAIN || domainOf(address).endsWith(`.${OUR_DOMAIN}`);

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
  const fromSupplier = msgs.filter((m) => addressOf(m.from) && !isOurs(addressOf(m.from)));
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

// "PR-011" -> "PR-012".
export function nextPrNumber(highest) {
  const n = Number(String(highest || "").replace(/\D/g, "")) || 0;
  return `PR-${String(n + 1).padStart(3, "0")}`;
}
