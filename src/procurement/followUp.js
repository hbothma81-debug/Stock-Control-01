// Sends one follow-up for a quote request, when a person presses Send.
// Nothing else ever calls this: the mailbox read never sends.
//
// LIVE: a reply in the request's own email thread, from the mailbox the
// request came from (the person's own, or sales@ as sales@, which needs
// Send As rights on it; Heinrich 19 Oct 2026: "yes"). It answers the
// supplier's last mail when there is one, otherwise "reply all" to our own
// request, which reaches the people it went to. A request with no mail
// found yet (loaded from requests.md) gets a new mail to its contact.
//
// PRACTICE (any address but the live site, emailRules.goesToSelf): it goes
// only to the sender's own mailbox, marked [PRACTICE], saying where it
// would have gone. The same rule the other Send buttons keep.

import { mailSendPass } from "../email/outlook.js";
import { goesToSelf, graphMessage } from "../email/emailRules.js";
import { recordSentEmail } from "../email/sentEmails.js";
import { textToHtml } from "./mailRules.js";
import { todayInSA } from "./procurementRules.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function graph(pass, method, url, body) {
  const res = await fetch(`${GRAPH}${url}`, {
    method,
    headers: { Authorization: `Bearer ${pass}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return res.status === 202 || res.status === 204 ? null : res.json().catch(() => null);
  let reason = `Microsoft answered ${res.status}`;
  try {
    reason = (await res.json())?.error?.message || reason;
  } catch {
    // the number is all there is
  }
  if (res.status === 403) reason = `${reason} (this sign-in may not send as ${url.split("/")[2] || "that mailbox"}; ask IT for Send As rights)`;
  throw new Error(reason);
}

// Returns { sentTo, practice }. Throws, with Microsoft's reason, when it did
// not go; once Microsoft accepted it, nothing after can make it "not sent".
export async function sendFollowUp({ supabase, appUserId, userName, row, text }) {
  const got = await mailSendPass(appUserId, { interactive: true });
  if (!got) throw new Error("Outlook is not connected on this device yet. Press Send again after signing in.");
  const { pass, address: me } = got;
  const practice = goesToSelf(window.location.hostname);
  const base = row.owner_id ? "/me" : `/users/${encodeURIComponent(row.mailbox)}`;
  const subject = `Follow-up ${row.pr_number}: ${row.item || ""}`.trim();

  if (practice) {
    // graphMessage gives sendMail's whole body ({ message, saveToSentItems }).
    await graph(
      pass,
      "POST",
      "/me/sendMail",
      graphMessage({
        to: [me],
        subject: `[PRACTICE] ${subject}`,
        body: `PRACTICE COPY. On the live app this would have gone as a reply in the request's thread, from ${row.mailbox}, to ${row.contact_email}.\n\n${text}`,
      })
    );
  } else if (row.reply_message_id) {
    await graph(pass, "POST", `${base}/messages/${row.reply_message_id}/reply`, { comment: textToHtml(text) });
  } else {
    let requestId = null;
    if (row.request_message_id) {
      const id = row.request_message_id.replace(/'/g, "''");
      const found = await graph(pass, "GET", `${base}/messages?$filter=${encodeURIComponent(`internetMessageId eq '${id}'`)}&$select=id&$top=1`);
      requestId = found?.value?.[0]?.id || null;
    }
    if (requestId) {
      await graph(pass, "POST", `${base}/messages/${requestId}/replyAll`, { comment: textToHtml(text) });
    } else {
      await graph(pass, "POST", `${base}/sendMail`, graphMessage({ to: [row.contact_email], subject, body: text }));
    }
  }

  // It has gone. The request's count and date, then the app's record of sent mail.
  const today = todayInSA(Date.now());
  const { data } = await supabase
    .from("procurement_requests")
    .update({ chases: (Number(row.chases) || 0) + 1, waiting_since: today, updated_at: new Date().toISOString(), updated_by: userName })
    .eq("id", row.id)
    .select()
    .single();
  try {
    await recordSentEmail({
      sent_by: userName || null,
      from_address: row.owner_id ? me : row.mailbox,
      to_addresses: [row.contact_email].filter(Boolean),
      cc_addresses: [],
      subject,
      document_type: "quote_follow_up",
      related_id: row.pr_number,
      party_name: row.supplier_name || null,
      test_mode: practice,
    });
  } catch {
    // The mail went; a missing record line must not say otherwise.
  }
  return { sentTo: practice ? me : row.contact_email, practice, row: data || null };
}
