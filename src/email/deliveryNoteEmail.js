// Emailing a delivery note, to the customer or to the supplier the work
// went out to: what the send window opens with, and the file it attaches.
// The wording and the choice of addresses are rules, in emailRules.js
// (tested); this file only fetches what those rules need. The twin of
// invoiceEmail.js.
import { deliveryNoteEmailDefaults, lastSentTo } from "./emailRules.js";
import { lastSentToParty, addressOfPerson } from "./sentEmails.js";
import { connectedMailbox } from "./outlook.js";
import { jobFileAttachment } from "./invoiceEmail.js";

// What sent_emails calls this kind of document. Its related_id is the
// note's number (DN-0042): a note is several rows, one per item, sharing it.
export const DELIVERY_NOTE = "delivery_note";

// Where this party's last DELIVERY NOTE went is looked up by this kind of
// document, so it is remembered apart from their invoices.
export async function deliveryNoteWindowDefaults({ note, job, supplier, contacts, company, senderName, appUserId }) {
  const [last, rep, mailbox] = await Promise.all([
    lastSentToParty(DELIVERY_NOTE, note.recipient_name).catch(() => []),
    addressOfPerson(job?.sales_rep).catch(() => null),
    connectedMailbox(appUserId).catch(() => null),
  ]);
  return deliveryNoteEmailDefaults({
    note,
    job,
    supplier,
    contacts,
    lastTo: lastSentTo(last),
    salesRep: rep,
    ownAddress: mailbox?.address,
    company,
    senderName,
  });
}

// The PDF as it was filed when the note was made: the same path
// viewDeliveryNoteDocument in App.jsx reopens (App.jsx decides that path in
// buildDeliveryNoteDoc; change one, change all three). A note whose PDF
// was never filed cannot be emailed, and says so rather than going out
// with nothing attached.
export async function deliveryNoteAttachment(note) {
  const fileName = `${note.delivery_note_number}.pdf`;
  try {
    return await jobFileAttachment({ storage_path: `${note.job_id}/delivery-note-${note.delivery_note_number}.pdf`, file_name: fileName });
  } catch (err) {
    console.error("The delivery note's stored PDF could not be fetched:", err);
    throw new Error(`The stored PDF of ${note.delivery_note_number} could not be found, so there is nothing to attach. Try View document: if that fails too, this note's PDF was never filed.`);
  }
}
