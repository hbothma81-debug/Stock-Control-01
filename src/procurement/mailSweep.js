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
import { addressBook, addressOf, findExisting, isOurs, looksLikeDrawing, looksLikeQuoteMail, newestFiles, nextPrNumber, quoteFiles, quoteRequestFrom, requestForNewMail, threadUpdate } from "./mailRules.js";
import { supplierFor, todayInSA } from "./procurementRules.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const LOOK_BACK_DAYS = 14;
const MAX_PAGES = 6; // 50 a page: 300 mails a folder is two busy weeks
const MESSAGE_FIELDS = "id,internetMessageId,conversationId,subject,bodyPreview,toRecipients,ccRecipients,from,sentDateTime,receivedDateTime,hasAttachments";

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
    `${GRAPH}${base}/messages?$filter=${encodeURIComponent(`conversationId eq '${id}'`)}&$select=id,internetMessageId,from,subject,sentDateTime,receivedDateTime,hasAttachments,bodyPreview,webLink&$top=50`
  );
  for (const m of msgs) {
    if (!m.hasAttachments || isOurs(addressOf(m.from))) continue;
    try {
      m.attachments = await graphList(pass, `${GRAPH}${base}/messages/${m.id}/attachments?$select=id,name,contentType,size,isInline`);
    } catch {
      m.attachments = [];
    }
  }
  return msgs;
}

// Saves one supplier PDF: the file into the private supplier-quotes store,
// a line into supplier_quotes. Returns the saved line, or null when it was
// already there.
async function saveQuote(supabase, pass, base, row, message, attachment, userName) {
  const res = await fetch(`${GRAPH}${base}/messages/${message.id}/attachments/${attachment.id}`, {
    headers: { Authorization: `Bearer ${pass}` },
  });
  if (!res.ok) throw new Error(`the file did not download (${res.status})`);
  const { contentBytes } = await res.json();
  const bytes = Uint8Array.from(atob(contentBytes || ""), (ch) => ch.charCodeAt(0));
  const safeName = (attachment.name || "quote.pdf").replace(/[^\w.\- ]+/g, "_");
  const path = `${row.pr_number || "no-pr"}/${Date.now()}-${safeName}`;
  const up = await supabase.storage.from("supplier-quotes").upload(path, new Blob([bytes], { type: "application/pdf" }), {
    contentType: "application/pdf",
  });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from("supplier_quotes")
    .insert({
      request_id: row.id,
      pr_number: row.pr_number,
      supplier_id: row.supplier_id || null,
      supplier_name: row.supplier_name || "",
      mailbox: row.mailbox,
      message_id: message.internetMessageId || message.id,
      file_name: attachment.name || safeName,
      storage_path: path,
      file_size: attachment.size || bytes.length,
      received_at: message.receivedDateTime || message.sentDateTime || null,
      created_by: userName,
      // A drawing or catalogue is kept with the request but never sent to
      // Claude: saved as already read, "not a quote" (mailRules).
      ...(looksLikeDrawing(attachment.name)
        ? { read_status: "read", doc_type: "other", lines: [], read_note: "Not sent to Claude: the file name says it is a drawing or catalogue." }
        : {}),
    })
    .select()
    .single();
  if (error) {
    // Somebody else saved the same file a moment ago: drop this copy.
    await supabase.storage.from("supplier-quotes").remove([path]);
    if (error.code === "23505") return null;
    throw error;
  }
  return data;
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

// Runs work(item) for every item, at most `size` at a time. Microsoft
// answers a busy shared mailbox in about 10 seconds a request (sales@, 20
// Oct 2026), so one after the other took minutes.
async function inPool(items, size, work) {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  });
  await Promise.all(runners);
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
  const newQuotes = [];
  // Each request's latest reply from the supplier: the first lines and the
  // link to it in Outlook, shown on a reply that came with no PDF (Heinrich,
  // 20 Oct 2026: "text is fine"). Kept on the page only, never saved.
  const replies = {};
  const stamp = () => ({ updated_at: new Date().toISOString(), updated_by: userName });

  // Signed in to Microsoft AS a shared mailbox (sales@ with its own password,
  // as the sales staff do; Heinrich, 20 Oct 2026): what it finds is shared,
  // not this one person's.
  const meIsShared = (sharedMailboxes || []).some((a) => a.toLowerCase() === me);
  const mailboxes = [
    { base: "/me", address: me, owner: meIsShared ? null : appUserId },
    ...shared.map((a) => ({ base: `/users/${encodeURIComponent(a)}`, address: a, owner: null })),
  ];

  await Promise.all(mailboxes.map(async (box) => {
    let candidates = [];
    let inbox = [];
    try {
      // Sent Items and the inbox at the same time. A shared mailbox's inbox
      // only for mail with attachments (quotes that come as a new mail); a
      // person's own inbox whole, for the colleague's requests they are Cc'd on.
      const sentUrl = `${GRAPH}${box.base}/mailFolders/sentitems/messages?$filter=${encodeURIComponent(`sentDateTime ge ${since}`)}&$select=${MESSAGE_FIELDS}&$orderby=sentDateTime desc&$top=50`;
      const inboxFilter = box.owner ? `receivedDateTime ge ${since}` : `receivedDateTime ge ${since} and hasAttachments eq true`;
      const inboxUrl = `${GRAPH}${box.base}/mailFolders/inbox/messages?$filter=${encodeURIComponent(inboxFilter)}&$select=${MESSAGE_FIELDS}&$orderby=receivedDateTime desc&$top=50`;
      const [sent, received] = await Promise.all([graphList(pass, sentUrl), graphList(pass, inboxUrl)]);
      candidates = sent.map((m) => ({ m, mailbox: box.address, owner: box.owner }));
      inbox = received;
      if (box.owner) {
        // A colleague's request with this person in Cc (Gawie from sales@, Cc Heinrich).
        for (const m of inbox) {
          const sender = addressOf(m.from);
          if (!isOurs(sender) || sender === me) continue;
          if (!(m.ccRecipients || []).some((r) => addressOf(r) === me)) continue;
          const isShared = shared.includes(sender);
          candidates.push({ m: { ...m, sentDateTime: m.sentDateTime || m.receivedDateTime }, mailbox: isShared ? sender : me, owner: isShared ? null : box.owner });
        }
      }
    } catch (err) {
      problems.push(`${box.address}: ${err.status === 403 || err.status === 404 ? "this sign-in cannot open it (ask IT for access to the mailbox)" : err.message}`);
      return;
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

    // Replies, reminders and the supplier's PDFs on this mailbox's requests.
    // Finished ones too (Closed, Received: only their PDFs are saved, so a
    // supplier's quote history is whole; threadUpdate leaves them as they
    // are). Only what the page loaded: open work and 90 days of finished.
    const ofThisBox = known.filter((r) => r.mailbox === box.address && r.status !== "Not a request" && r.status !== "Draft");
    const live = ofThisBox.filter((r) => r.conversation_id);
    // What each request already has, so a file is saved once, the latest
    // copy (newestFiles).
    const had = new Map();
    if (ofThisBox.length) {
      const { data } = await supabase.from("supplier_quotes").select("request_id, file_name, file_size, received_at").in("request_id", ofThisBox.map((r) => r.id));
      for (const q of data || []) had.set(q.request_id, [...(had.get(q.request_id) || []), q]);
    }
    const saveNewest = async (row, candidates) => {
      let savedAny = false;
      for (const { message, attachment } of newestFiles(candidates, had.get(row.id))) {
        try {
          const saved = await saveQuote(supabase, pass, box.base, row, message, attachment, userName);
          had.set(row.id, [...(had.get(row.id) || []), { file_name: attachment.name, file_size: attachment.size, received_at: message.receivedDateTime || message.sentDateTime }]);
          if (saved) {
            newQuotes.push(saved);
            savedAny = true;
          }
        } catch (err) {
          problems.push(`${row.pr_number}: ${attachment.name} was not saved: ${err.message}`);
        }
      }
      return savedAny;
    };
    await inPool(live, 4, async (row) => {
      let thread;
      try {
        thread = await threadOf(pass, box.base, row.conversation_id);
      } catch {
        return; // an old thread id from requests.md Microsoft does not know
      }
      await saveNewest(row, quoteFiles(thread));
      const theirs = thread
        .filter((m) => !isOurs(addressOf(m.from)))
        .sort((a, b) => (String(a.receivedDateTime || a.sentDateTime) < String(b.receivedDateTime || b.sentDateTime) ? 1 : -1))[0];
      if (theirs) replies[row.id] = { text: theirs.bodyPreview || "", link: theirs.webLink || "", at: theirs.receivedDateTime || theirs.sentDateTime || "" };
      const change = threadUpdate(row, thread, supplierFor(row, suppliers)?.terms || "");
      if (!change) return;
      const { data, error } = await supabase
        .from("procurement_requests")
        .update({ ...change, ...stamp() })
        .eq("id", row.id)
        .select()
        .single();
      if (error || !data) {
        problems.push(`${row.pr_number} was not updated${error ? `: ${error.message}` : ""}`);
        return;
      }
      Object.assign(row, data);
      moved++;
    });

    // Quotes that came as a new email (another rep's address, or through
    // Sage): with the newest open request to that supplier (mailRules).
    const withFiles = inbox.filter((m) => m.hasAttachments && !isOurs(addressOf(m.from)));
    await inPool(withFiles, 4, async (m) => {
      const row = requestForNewMail(m, ofThisBox, (r) => supplierFor(r, suppliers));
      if (!row) return;
      try {
        m.attachments = await graphList(pass, `${GRAPH}${box.base}/messages/${m.id}/attachments?$select=id,name,contentType,size,isInline`);
      } catch {
        return;
      }
      const savedAny = await saveNewest(row, quoteFiles([m]));
      // A quote or pro forma moves the request on as a reply would; a
      // statement from the same supplier is only saved.
      if (!savedAny || !looksLikeQuoteMail(m)) return;
      const change = threadUpdate(row, [m], supplierFor(row, suppliers)?.terms || "");
      if (!change) return;
      const { data } = await supabase.from("procurement_requests").update({ ...change, ...stamp() }).eq("id", row.id).select().single();
      if (data) {
        Object.assign(row, data);
        moved++;
      }
    });
  }));
  return { connected: true, address: me, added, moved, newQuotes, replies, problems };
}
