// The rules for emailing a document from the app: who it goes to, what it
// says, and what is handed to Microsoft. No browser, no database and no
// Microsoft library in here, so it can all be tested (emailRules.test.js).
// The sign-in and the sending are in outlook.js; the window is
// SendEmailButton.jsx.

// The only addresses where an email really goes to the supplier or the
// customer. Anywhere else (the practice copy on localhost, a Vercel
// preview) every email goes to the sender's own mailbox instead, so a
// test can never reach a real supplier.
export const LIVE_HOSTS = ["stock-control-01.vercel.app"];

export function goesToSelf(hostname) {
  return !LIVE_HOSTS.includes(String(hostname || "").toLowerCase());
}

// One request to Microsoft may be 4 MB, and a file grows by a third when
// it is packed into the message. 3 MB of file is Microsoft's own limit
// for an attachment sent this way.
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

// "a@b.co.za; c@d.com" or one per line, commas, semicolons or spaces.
export function splitAddresses(text) {
  return String(text || "")
    .split(/[\s,;]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

export function isEmail(address) {
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(String(address || ""));
}

// The addresses in a box, each one once (capitals ignored), and the ones
// that cannot be an address.
export function checkAddresses(text) {
  const seen = new Set();
  const list = [];
  const bad = [];
  for (const a of splitAddresses(text)) {
    if (!isEmail(a)) {
      bad.push(a);
      continue;
    }
    const key = a.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(a);
  }
  return { list, bad };
}

// Everybody the app knows at a supplier or customer who has an address:
// the company's own first, then its contact people.
export function knownAddresses(party) {
  const out = [];
  const seen = new Set();
  const add = (name, email) => {
    const clean = String(email || "").trim();
    if (!isEmail(clean) || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());
    out.push({ name: String(name || "").trim(), email: clean });
  };
  if (party) {
    add(party.name, party.email);
    for (const c of party.contacts || []) add(c.name, c.email);
  }
  return out;
}

function signOff(senderName, company) {
  return ["Kind regards,", senderName, company?.name, company?.phone].filter((l) => String(l || "").trim()).join("\n");
}

// What the send window opens with for a purchase order. Everything can be
// changed in the window before it goes.
export function poEmailDefaults({ po, supplier, company, senderName }) {
  const known = knownAddresses(supplier);
  const lines = ["Good day,", "", `Please find attached our purchase order ${po.poNumber}.`];
  if (po.deliveryDate) lines.push(`Delivery required by: ${po.deliveryDate}`);
  if (po.reference) lines.push(`Reference: ${po.reference}`);
  lines.push("", "Please confirm receipt of this order.", "", signOff(senderName, company));
  return {
    to: known[0]?.email || "",
    cc: "",
    subject: `Purchase Order ${po.poNumber}${company?.name ? ` - ${company.name}` : ""}`,
    body: lines.join("\n"),
    suggestions: known,
  };
}

// Where this customer's last invoice went, from their sent_emails rows
// (any order): the To addresses of the newest one. Nothing yet gives [].
export function lastSentTo(rows) {
  const newest = [...(rows || [])].sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0];
  return (newest?.to_addresses || []).filter(isEmail);
}

// What the send window opens with for the invoice accounts uploaded from
// Sage. The app does not know which of a customer's contacts gets the
// invoices (often a creditors address, not the buyer), so To starts with
// wherever this customer's last invoice went; the first time it is empty
// and the contacts are one-press buttons. The sales rep is offered for Cc
// by a button, never put there unasked (Heinrich, 21 Sep 2026).
export function invoiceEmailDefaults({ job, contacts, lastTo, salesRep, ownAddress, company, senderName }) {
  const known = knownAddresses({ name: "", email: "", contacts });
  const to = (lastTo || []).filter(isEmail);
  const number = String(job.invoice_number || "").trim();
  const po = String(job.customer_po || "").trim();
  const subject = [
    number ? `Invoice ${number}` : `Invoice for ${job.job_number}`,
    po ? `your order ${po}` : "",
    number ? job.job_number : "",
    company?.name || "",
  ]
    .filter(Boolean)
    .join(" - ");
  const lines = ["Good day,", "", number ? `Please find attached our invoice ${number}.` : "Please find our invoice attached."];
  if (po) lines.push(`Your order number: ${po}`);
  lines.push(`Our reference: ${job.job_number}`);
  lines.push("", signOff(senderName, company));
  const rep = salesRep && isEmail(salesRep.email) && String(salesRep.email).toLowerCase() !== String(ownAddress || "").toLowerCase() ? [{ name: salesRep.name || "Sales rep", email: salesRep.email }] : [];
  return { to: to.join("; "), cc: "", subject, body: lines.join("\n"), suggestions: known, ccSuggestions: rep };
}

// Who the email really goes to. On the practice copy that is the sender
// alone, whatever the boxes say.
export function actualRecipients({ to, cc, toSelf, ownAddress }) {
  if (toSelf) return { to: [ownAddress].filter(Boolean), cc: [] };
  return { to, cc };
}

// The message in the shape Microsoft Graph's sendMail asks for.
export function graphMessage({ to, cc, subject, body, attachment }) {
  const recipient = (address) => ({ emailAddress: { address } });
  const message = {
    subject,
    body: { contentType: "Text", content: body },
    toRecipients: to.map(recipient),
    ccRecipients: (cc || []).map(recipient),
  };
  if (attachment) {
    message.attachments = [
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: attachment.fileName,
        contentType: attachment.contentType || "application/pdf",
        contentBytes: attachment.base64,
      },
    ];
  }
  return { message, saveToSentItems: true };
}

// "Emailed 21 Sep, 14:05 to orders@supplier.co.za by Heinrich", in South
// African time whatever the device is set to.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The month is written here, not by the device: one browser says "Sep"
// and the next "Sept".
export function whenSA(iso) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("day")} ${MONTHS[Number(get("month")) - 1] || ""} ${get("hour")}:${get("minute")}`;
}

export function sentLine(row) {
  const when = whenSA(row.sent_at);
  const to = (row.to_addresses || []).join(", ") || "nobody";
  return `Emailed ${when} to ${to}${row.sent_by ? ` by ${row.sent_by}` : ""}${row.test_mode ? " (practice: it went to the sender only)" : ""}`;
}
