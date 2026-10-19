// Reads the mailboxes for the Quote requests page: the person's own (their
// Microsoft sign-in, Drawings@ for Heinrich) and the shared ones in
// app_settings (sales@). Runs when the page opens and when Refresh is
// pressed, never on a timer and never with nobody signed in (Heinrich, 19
// Oct 2026: "page open and refresh button").
//
// READS ONLY. It never sends, deletes or moves mail, and never acts on
// what a supplier wrote: mailRules.js decides from addresses, dates,
// subjects and attachment names.
//
// Looks back 14 days in Sent Items (and, in the person's own mailbox, at
// mail a colleague sent with them in Cc), and at the thread of every open
// request.

import { mailReadPass } from "../email/outlook.js";
import { addressBook, addressOf, findExisting, isOurs, nextPrNumber, quoteRequestFrom, threadUpdate } from "./mailRules.js";
import { supplierFor, todayInSA } from "./procurementRules.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const LOOK_BACK_DAYS = 14;
const MAX_PAGES = 6; // 50 a page: 300 mails a folder is two busy weeks
const MESSAGE_FIELDS = "id,internetMessageId,conversationId,subject,bodyPreview,toRecipients,ccRecipients,from,sentDateTime,receivedDateTime";

async function graphList(pass, url) {
  const out = [];
  let next = url;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const res = await fetch(next, { headers: { Authorization: `Bearer ${pass}` } });
    if (!res.ok) {
      let reason = `Microsoft answered ${res.status}`;
      try {
        reason = (await res.json())?.error?.message || reason;
      } catch {
        // the number is all there is
      }
      const err = new Error(reason);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    out.push(...(data.value || []));
    next = data["@odata.nextLink"] || null;
  }
  return out;
}

async function threadOf(pass, base, conversationId) {
  const id = String(conversationId).replace(/'/g, "''");
  const msgs = await graphList(
    pass,
    `${GRAPH}${base}/messages?$filter=${encodeURIComponent(`conversationId eq '${id}'`)}&$select=id,from,subject,sentDateTime,receivedDateTime,hasAttachments&$top=50`
  );
  for (const m of msgs) {
    if (!m.hasAttachments || isOurs(addressOf(m.from))) continue;
    try {
      m.attachments = await graphList(pass, `${GRAPH}${base}/messages/${m.id}/attachments?$select=name`);
    } catch {
      m.attachments = [];
    }
  }
  return msgs;
}

// Adds a request under the next free PR number. Another person may take a
// number at the same moment, or own rows this person cannot see, so a
// taken number moves on to the next one.
async function addRequest(supabase, row, highest) {
  let number = nextPrNumber(highest);
  for (let tries = 0; tries < 20; tries++) {
    const { data, error } = await supabase.from("procurement_requests").insert({ ...row, pr_number: number }).select().single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
    if (/message_idx|request_message_id/.test(error.message || "")) return null; // somebody else just added this mail
    number = nextPrNumber(number);
  }
  throw new Error("Could not find a free PR number.");
}

// rows: the requests already loaded on the page (all this person can see).
// Returns { connected: false } when no Microsoft pass could be had, or
// { connected: true, address, added, moved, problems }.
export async function sweepMailboxes({ supabase, appUserId, userName, interactive, rows, suppliers, customerEmails, sharedMailboxes }) {
  const got = await mailReadPass(appUserId, { interactive });
  if (!got) return { connected: false };
  const { pass, address: me } = got;
  const book = addressBook(suppliers, customerEmails);
  const shared = (sharedMailboxes || []).map((a) => a.toLowerCase()).filter((a) => a && a !== me);
  const since = new Date(Date.now() - LOOK_BACK_DAYS * 86400000).toISOString();
  const known = [...(rows || [])];
  let highest = known.map((r) => r.pr_number).sort().pop() || null;
  const problems = [];
  let added = 0;
  let moved = 0;
  const stamp = () => ({ updated_at: new Date().toISOString(), updated_by: userName });

  const mailboxes = [{ base: "/me", address: me, owner: appUserId }, ...shared.map((a) => ({ base: `/users/${encodeURIComponent(a)}`, address: a, owner: null }))];

  for (const box of mailboxes) {
    let candidates = [];
    try {
      const sentUrl = `${GRAPH}${box.base}/mailFolders/sentitems/messages?$filter=${encodeURIComponent(`sentDateTime ge ${since}`)}&$select=${MESSAGE_FIELDS}&$orderby=sentDateTime desc&$top=50`;
      candidates = (await graphList(pass, sentUrl)).map((m) => ({ m, mailbox: box.address, owner: box.owner }));
      if (box.owner) {
        // A colleague's request with this person in Cc (Gawie from sales@, Cc Heinrich).
        const inboxUrl = `${GRAPH}${box.base}/mailFolders/inbox/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}&$select=${MESSAGE_FIELDS}&$orderby=receivedDateTime desc&$top=50`;
        for (const m of await graphList(pass, inboxUrl)) {
          const sender = addressOf(m.from);
          if (!isOurs(sender) || sender === me) continue;
          if (!(m.ccRecipients || []).some((r) => addressOf(r) === me)) continue;
          const isShared = shared.includes(sender);
          candidates.push({ m: { ...m, sentDateTime: m.sentDateTime || m.receivedDateTime }, mailbox: isShared ? sender : me, owner: isShared ? null : box.owner });
        }
      }
    } catch (err) {
      problems.push(`${box.address}: ${err.status === 403 || err.status === 404 ? "this sign-in cannot open it (ask IT for access to the mailbox)" : err.message}`);
      continue;
    }

    for (const { m, mailbox, owner } of candidates) {
      const request = quoteRequestFrom(m, book);
      if (!request) continue;
      const existing = findExisting(known, m, request.contact_email);
      if (existing) {
        // A request loaded from requests.md: give it its mail, so its thread can be followed.
        if (!existing.request_message_id && existing.mailbox === mailbox) {
          const { data } = await supabase
            .from("procurement_requests")
            .update({ request_message_id: m.internetMessageId, conversation_id: m.conversationId, ...stamp() })
            .eq("id", existing.id)
            .select()
            .single();
          if (data) Object.assign(existing, data);
        }
        continue;
      }
      try {
        const row = await addRequest(
          supabase,
          {
            ...request,
            mailbox,
            owner_id: owner,
            status: "Sent",
            requested_at: m.sentDateTime,
            waiting_since: todayInSA(Date.parse(m.sentDateTime)),
            conversation_id: m.conversationId,
            request_message_id: m.internetMessageId,
            notes: "Found in the mailbox",
            created_by: userName,
            updated_by: userName,
          },
          highest
        );
        if (row) {
          known.push(row);
          highest = row.pr_number > (highest || "") ? row.pr_number : highest;
          added++;
        }
      } catch (err) {
        problems.push(`A request to ${request.contact_email} was not saved: ${err.message}`);
      }
    }

    // Replies and reminders on the open requests from this mailbox.
    for (const row of known.filter((r) => r.mailbox === box.address && r.conversation_id && ["Sent", "Reply"].includes(r.status))) {
      let thread;
      try {
        thread = await threadOf(pass, box.base, row.conversation_id);
      } catch {
        continue; // an old thread id from requests.md Microsoft does not know
      }
      const change = threadUpdate(row, thread, supplierFor(row, suppliers)?.terms || "");
      if (!change) continue;
      const { data, error } = await supabase
        .from("procurement_requests")
        .update({ ...change, ...stamp() })
        .eq("id", row.id)
        .select()
        .single();
      if (error || !data) {
        problems.push(`${row.pr_number} was not updated${error ? `: ${error.message}` : ""}`);
        continue;
      }
      Object.assign(row, data);
      moved++;
    }
  }
  return { connected: true, address: me, added, moved, problems };
}
