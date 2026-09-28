// Delivery notes: the rules. No database and no screen in here, so they
// can be tested: npm test.
//
// A delivery note is one number and one PDF, saved as a row per line
// (delivery_notes; the rows share the number). Two ways one is made:
//
//   by hand   the job page's Items tab, "Delivery Note": to a supplier
//             (the lines go "out" until checked back in) or to the customer.
//   by itself with every invoice request, by whatever route the request was
//             sent (Heinrich, 28 Sep 2026): a customer note for exactly the
//             lines and quantities on that request, always, no tick to
//             remember. The request prints the note's number; the note's
//             rows name the request (invoice_request_id).
//
// The note never holds the request up. The request is sent first, as it
// always was; a note that cannot be made is said out loud and can be made
// afterwards from the request's own row.
//
// Numbers come from the database (take_delivery_note_number,
// setup-delivery-notes-per-request.sql): one caller at a time, never a
// number a note already carries. Until 28 Sep 2026 the app counted them
// itself and the table refused two rows under one number, so a note with
// two lines failed half saved and jammed every note after it (live, from
// DN-0005 on 31 Aug).

// "DN-0005" is 5. Anything else is not a delivery note number.
export function numberOfNote(text) {
  const m = /^DN-(\d+)$/.exec(String(text || "").trim());
  return m ? Number(m[1]) : null;
}

// For a database without take_delivery_note_number: the first number no
// note carries, and never less than the counter. Mirrors the function in
// setup-delivery-notes-per-request.sql: change both together.
export function nextNoteNumber(usedNumbers, counter) {
  const used = (usedNumbers || []).map(numberOfNote).filter((n) => n != null);
  const highest = used.length ? Math.max(...used) : 0;
  const floor = Number.isInteger(Number(counter)) && Number(counter) > 0 ? Number(counter) : 1;
  return Math.max(floor, highest + 1);
}

// The rows of one note, a row per line. Every row carries every key: rows
// saved together send every key any of them has, and a row without one
// saves a blank over the column's own default.
export function noteRows({ noteNumber, job, itemsWithQty, direction, recipientName, recipientAddress, notes, createdBy, requestId }) {
  const toSupplier = direction === "to_supplier";
  return (itemsWithQty || []).map(({ item, qty }) => ({
    delivery_note_number: noteNumber,
    job_id: job.id,
    quote_item_id: item.id,
    recipient_type: toSupplier ? "supplier" : "customer",
    recipient_name: String(recipientName || "").trim(),
    recipient_address: recipientAddress || "",
    direction: toSupplier ? "to_supplier" : "to_customer",
    notes: String(notes || "").trim(),
    created_by: createdBy || "",
    qty: Number(qty),
    invoice_request_id: requestId || null,
  }));
}

// The two columns setup-delivery-notes-per-request.sql adds. On a database
// that has not had it, the rows are saved without them: the note is made,
// it only does not know its quantities or its request.
const NEW_COLUMNS = ["qty", "invoice_request_id"];

export function withoutNewColumns(rows) {
  return (rows || []).map((row) => {
    const copy = { ...row };
    for (const c of NEW_COLUMNS) delete copy[c];
    return copy;
  });
}

export function isMissingNewColumn(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return NEW_COLUMNS.some((c) => new RegExp(`\\b${c}\\b`).test(text)) && /PGRST204|42703|column/i.test(text);
}

// The database refusing a second row under one number, or a number
// somebody took a moment ago.
export const isNumberRefused = (error) => error?.code === "23505" && /delivery_note_number/.test(error?.message || "");

// The database has no take_delivery_note_number yet.
export const allocatorMissing = (error) =>
  !!error && (error.code === "PGRST202" || /could not find the function/i.test(String(error.message || "")));

// The lines of a note as its PDF lists them.
export function notePdfLines(itemsWithQty, codeOf, descriptionOf) {
  return (itemsWithQty || []).map(({ item, qty }) => ({ code: codeOf(item), description: descriptionOf(item), qty }));
}

// Which note belongs to which request: a map from the request's id to its
// note's number and rows. A request can have one note; should two ever
// name it, the earlier made is the one shown.
export function notesByRequest(noteRowsHeld) {
  const found = new Map();
  const rows = [...(noteRowsHeld || [])]
    .filter((r) => r?.invoice_request_id)
    .sort((a, b) => Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0));
  for (const r of rows) {
    const held = found.get(r.invoice_request_id);
    if (!held) found.set(r.invoice_request_id, { number: r.delivery_note_number, rows: [r] });
    else if (held.number === r.delivery_note_number) held.rows.push(r);
  }
  return found;
}

// The numbers of the notes on one job, each once, in number order. A note
// is a row per line, so its number is held once per line.
export function notesOnJob(noteRowsHeld, jobId) {
  const numbers = (noteRowsHeld || [])
    .filter((d) => d?.job_id === jobId)
    .map((d) => d.delivery_note_number)
    .filter(Boolean);
  return [...new Set(numbers)].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

// Requests have kept a list of their own lines since this day
// (job_quote_item_invoices.request_id, setup-invoice-request-function.sql,
// live 27 Sep 2026). One sent before it cannot have its note made by the
// app, so it is not offered the button: a button that can only say "cannot
// tell" is worse than none.
export const REQUESTS_KEEP_LINES_SINCE = "2026-09-27T00:00:00+02:00";

export function canMakeNoteFor(request) {
  const sent = Date.parse(request?.submitted_at || "");
  return Number.isFinite(sent) && sent >= Date.parse(REQUESTS_KEEP_LINES_SINCE);
}

// Whether the rows held say the database has the link at all. No rows to
// look at is "cannot tell".
export function linkReady(noteRowsHeld) {
  const first = (noteRowsHeld || [])[0];
  return first ? "invoice_request_id" in first : null;
}

// A note for a request already sent: its lines come from the request's
// own log (job_quote_item_invoices.request_id), which requests have kept
// since 27 Sep 2026. Lines since removed from the job are left out and
// counted, so the person can be told.
export function linesOfRequest(logRows, quoteItems) {
  const byId = new Map((quoteItems || []).map((q) => [q.id, q]));
  const itemsWithQty = [];
  let gone = 0;
  for (const row of logRows || []) {
    const item = byId.get(row.quote_item_id);
    const qty = Number(row.qty_added);
    if (!item) gone++;
    else if (qty > 0) itemsWithQty.push({ item, qty });
  }
  itemsWithQty.sort((a, b) => (Number(a.item.sort_order) || 0) - (Number(b.item.sort_order) || 0));
  return { itemsWithQty, gone };
}

// What the person is told when the request went and its note did not.
export function noteNotMadeWords(jobNumber, err) {
  const why = err?.needsSetup
    ? "The database has not been updated for delivery notes with more than one line (setup-delivery-notes-per-request.sql)."
    : "Check your connection.";
  return (
    `The invoice request for ${jobNumber} WAS sent. Its delivery note could not be made. ${why}\n\n` +
    `Open the job's Invoice tab and press "Make delivery note" on the request.`
  );
}
