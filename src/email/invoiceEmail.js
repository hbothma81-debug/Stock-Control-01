// Emailing the invoice accounts uploaded from Sage to the customer: what
// the send window opens with, and the file it attaches. Keeps App.jsx to a
// few lines. The wording and the choice of addresses are rules, in
// emailRules.js (tested); this file only fetches what those rules need.
import { supabase } from "../lib/supabaseClient.js";
import { invoiceEmailDefaults, lastSentTo } from "./emailRules.js";
import { lastSentToParty, addressOfPerson } from "./sentEmails.js";
import { connectedMailbox } from "./outlook.js";

// What sent_emails calls this kind of document.
export const SAGE_INVOICE = "sage_invoice";

// Three small look-ups side by side, each allowed to fail without costing
// the person the window: where this customer's last invoice went, the
// sales rep's address (offered for Cc), and the sender's own address (so a
// rep is not offered a copy to himself).
export async function invoiceWindowDefaults({ job, contacts, company, senderName, appUserId }) {
  const [last, rep, mailbox] = await Promise.all([
    lastSentToParty(SAGE_INVOICE, job.customer).catch(() => []),
    addressOfPerson(job.sales_rep).catch(() => null),
    connectedMailbox(appUserId).catch(() => null),
  ]);
  return invoiceEmailDefaults({
    job,
    contacts,
    lastTo: lastSentTo(last),
    salesRep: rep,
    ownAddress: mailbox?.address,
    company,
    senderName,
  });
}

// The uploaded file itself, as "Open the invoice" shows it.
export async function jobFileAttachment(doc) {
  const { data, error } = await supabase.storage.from("job-documents").download(doc.storage_path);
  if (error) throw error;
  const isPdf = /\.pdf$/i.test(doc.file_name || "");
  return { fileName: doc.file_name, blob: data, contentType: data.type || (isPdf ? "application/pdf" : "application/octet-stream") };
}
