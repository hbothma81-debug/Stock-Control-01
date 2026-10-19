// What each quote request needs, for the Procurement page.
//
// MIRRORS 4.APPS/3.PROCUREMENT/.claude/skills/procure-panel/hooks/logic.ts
// (the Procurement panel in Claude Code, built by the "Email follow-up
// program" conversation). Same rules, same words: a reminder is due 2
// working days after the ball went into the supplier's court, and after 2
// chases the answer is a phone call. Change one, change the other.
//
// Pure functions, no React and no database, so the tests can run them.

export const REMIND_AFTER_WORKDAYS = 2;
export const MAX_CHASES = 2;

// Open work first; the order the pills appear in on the page.
export const GROUPS = [
  { key: "yours", label: "Your move", startOpen: true },
  { key: "waiting", label: "Waiting on supplier", startOpen: true },
  { key: "onOrder", label: "Paid or ordered", startOpen: true },
  { key: "done", label: "Done", startOpen: false },
  { key: "notRequest", label: "Not a request", startOpen: false },
];

// Mon-Fri days after `from` up to and including `today`, both YYYY-MM-DD.
export function workdaysBetween(from, today) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  let days = 0;
  for (let t = start + 86400000; t <= end; t += 86400000) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

// Today in South Africa (UTC+2, no daylight saving) as YYYY-MM-DD.
export function todayInSA(nowMs) {
  return new Date(nowMs + 2 * 3600000).toISOString().slice(0, 10);
}

// One database row (procurement_requests) plus the supplier's terms from
// the supplier list, if the request names a supplier on it.
// Returns { group, days, isOverdue, action, note, pill: { label, tone } }.
// tone is "grey", "blue", "amber", "green" or "red", as on the panel.
export function classify(request, today, supplierTerms = "") {
  const status = (request.status || "").toLowerCase();
  const terms = supplierTerms || "";
  const isProForma = terms.toLowerCase().startsWith("pro");
  const chases = Number(request.chases) || 0;
  const base = { days: null, isOverdue: false, action: null, note: "" };

  if (status === "not a request") {
    return { ...base, group: "notRequest", note: "Not a quote request", pill: { label: "NOT A REQUEST", tone: "grey" } };
  }
  if (status === "received" || status === "closed") {
    return { ...base, group: "done", note: request.status, pill: { label: request.status.toUpperCase(), tone: "grey" } };
  }
  if (status === "paid" || status === "ordered") {
    return { ...base, group: "onOrder", note: request.status, pill: { label: request.status.toUpperCase(), tone: "grey" } };
  }
  if (status === "pro forma") {
    return { ...base, group: "yours", note: "Pro forma in: pay it", pill: { label: "PRO FORMA IN", tone: "green" } };
  }
  if (status === "draft") {
    const days = request.requested_at ? workdaysBetween(request.requested_at.slice(0, 10), today) : null;
    return { ...base, group: "yours", days, note: "Draft not sent yet", pill: { label: "DRAFT", tone: "grey" } };
  }
  if (status === "reply" && !isProForma) {
    const note = terms ? "Quote in: order it" : "Reply in: Account or pro forma?";
    return { ...base, group: "yours", note, pill: { label: "QUOTE IN", tone: "green" } };
  }

  // Sent, or Reply on pro forma terms: the supplier owes us something.
  const days = request.waiting_since ? workdaysBetween(request.waiting_since, today) : null;
  const isOverdue = days !== null && days >= REMIND_AFTER_WORKDAYS;
  const action = !isOverdue ? null : chases >= MAX_CHASES ? "phone" : "remind";
  const owed = status === "reply" ? "pro forma" : "quote";
  const chased = chases > 0 ? `, chased ${chases}x` : "";
  const age = days === null ? "" : ` ${days}d`;
  const pill =
    action === "phone"
      ? { label: "PHONE THEM", tone: "red" }
      : isOverdue
        ? { label: `OVERDUE${age}`, tone: "amber" }
        : status === "reply"
          ? { label: "QUOTE IN", tone: "green" }
          : { label: `SENT${age}`, tone: "blue" };
  const note = status === "reply" ? `Quote in, waiting for pro forma${chased}` : `Waiting for ${owed}${chased}`;
  return { ...base, group: "waiting", days, isOverdue, action, note, pill };
}

// Every word typed must appear somewhere on the request.
export function matchesSearch(request, query) {
  const words = (query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const text = [request.pr_number, request.supplier_name, request.item, request.old_quote, request.notes, request.contact_email]
    .join(" ")
    .toLowerCase();
  return words.every((word) => text.includes(word));
}

// Which supplier on the app's list a request belongs to: by id when the
// request has one, otherwise by name, capitals and spaces ignored.
export function supplierFor(request, suppliers) {
  const list = suppliers || [];
  if (request.supplier_id) {
    const byId = list.find((s) => s.id === request.supplier_id);
    if (byId) return byId;
  }
  const name = (request.supplier_name || "").trim().toLowerCase();
  return name ? list.find((s) => (s.name || "").trim().toLowerCase() === name) || null : null;
}
