// The database side of emailing: the record of what was sent
// (sent_emails, setup-sent-emails.sql and setup-sent-emails-party.sql), and
// the two small look-ups the invoice window needs. The rules are in
// emailRules.js; nothing here decides anything.
import { supabase } from "../lib/supabaseClient.js";
import { idBatches } from "../lib/rowsForIds.js";

// Writes the record of an email that has ALREADY gone. `party_name` (the
// customer or supplier) arrived in a second SQL file: where that has not
// been run yet the row is saved without it, so the record is never lost
// over a missing column.
export async function recordSentEmail(row) {
  const first = await supabase.from("sent_emails").insert(row);
  if (!first.error) return;
  const text = `${first.error.code || ""} ${first.error.message || ""}`;
  if (row.party_name != null && /party_name/.test(text)) {
    const { party_name: _left, ...rest } = row;
    const second = await supabase.from("sent_emails").insert(rest);
    if (!second.error) return;
    throw second.error;
  }
  throw first.error;
}

// The newest email of one kind sent to one customer or supplier, for
// "where did their last invoice go". One row. Nothing, or no column yet,
// gives [].
export async function lastSentToParty(documentType, partyName) {
  if (!supabase || !partyName) return [];
  const { data, error } = await supabase
    .from("sent_emails")
    .select("sent_at, to_addresses")
    .eq("document_type", documentType)
    .eq("party_name", partyName)
    .order("sent_at", { ascending: false })
    .limit(1);
  return error ? [] : data || [];
}

// The "Emailed ..." rows for many documents in one go: a map from the
// document's id to its rows, newest first, five at most. For a list of
// cards (Records -> Invoicing lists every invoiced job), where a read per
// card would be hundreds of requests. The ids go in batches because a long
// list travels in the web address (src/lib/rowsForIds.js says why). Asked
// when a list is opened and after a send, never on a timer.
const LINES_PER_DOCUMENT = 5;
export async function sentEmailsFor(documentType, relatedIds) {
  const byId = new Map();
  if (!supabase) return byId;
  const answers = await Promise.all(
    idBatches((relatedIds || []).map(String), 100).map((batch) =>
      supabase
        .from("sent_emails")
        .select("id, sent_at, sent_by, to_addresses, test_mode, related_id")
        .eq("document_type", documentType)
        .in("related_id", batch)
        .order("sent_at", { ascending: false })
        .limit(1000)
    )
  );
  for (const { data, error } of answers) {
    if (error) continue;
    for (const row of data || []) {
      const list = byId.get(row.related_id) || [];
      if (list.length < LINES_PER_DOCUMENT) list.push(row);
      byId.set(row.related_id, list);
    }
  }
  return byId;
}

// A person's address by the name a job holds for its sales rep, so the rep
// can be offered for Cc. The login address, which is what the app has.
export async function addressOfPerson(name) {
  if (!supabase || !String(name || "").trim()) return null;
  const { data, error } = await supabase.from("profiles").select("name, email").ilike("name", String(name).trim()).limit(1);
  if (error || !data?.[0]?.email) return null;
  return { name: data[0].name || name, email: data[0].email };
}
