// The delivery note's paper: what is drawn where. No database and no
// screen in here. The PDF document and its table plug-in are handed in, so
// the layout is tested with the real thing: npm test.
//
// A note is printed twice, the customer's copy and ours.
//
//   one sheet    both copies on one page: the customer's on the top half,
//                ours on the bottom half, a dashed line to cut along. How
//                every note was printed until 28 Sep 2026, and how a note
//                that fits still is.
//   a copy each  where the customer's copy does not fit the top half: it
//                takes the pages it needs, and ours starts on a fresh page.
//                Pages after a copy's first say whose copy they belong to,
//                and every page says which page of the copy it is.
//
// Until 28 Sep 2026 our copy was printed from 166 mm whatever the
// customer's had taken. Nine lines fitted; from eleven our copy printed on
// top of the customer's table. Nobody saw it while a note was one line. A
// note made with an invoice request carries every line of the request
// (JOB-0132, 25 lines, was held back for this).
//
// Which of the two it is, is measured and not counted: the customer's copy
// is drawn first and the page says where it ended. A description that
// wraps, a long company name or an address of four lines all move that.

// Millimetres on an A4 page, 210 by 297.
export const NOTE_PAGE = {
  left: 14,
  right: 196,
  top: 26, // where a copy's heading sits
  secondCopyTop: 166, // ours, on one sheet
  cutLine: 155,
  lastLine: 280, // a copy with pages of its own signs no lower than this
  footer: 290, // and its page count sits here, clear of the signatures
};

// The top half is full when the signature line would sit lower than this.
// Ours is printed 140 mm further down, so on one sheet it signs at 287 at
// the lowest: nine lines, with nothing under it but the edge of the page.
export const TOP_HALF_ENDS = 147;
const ONE_SHEET_LAST_LINE = NOTE_PAGE.secondCopyTop + (TOP_HALF_ENDS - NOTE_PAGE.top);

export const COPIES = ["Recipient Copy", "Our Copy"];

// Does the customer's copy, as drawn, leave the bottom half for ours?
export function fitsOneSheet({ signaturesAt, lastPage }) {
  return lastPage === 1 && Number(signaturesAt) <= TOP_HALF_ENDS;
}

const pageOf = (doc) => doc.internal.getCurrentPageInfo().pageNumber;

// One copy, from `top` on the page the document is on. Gives back where it
// ended: the page and the height of the signature line. `lastLine` is the
// lowest the signatures may sit before they go over the page.
function drawCopy({ doc, autoTable, note, lineItems, company, drawLogo, top, label, lastLine = NOTE_PAGE.lastLine }) {
  const { left, right } = NOTE_PAGE;
  const firstPage = pageOf(doc);
  let y = top;
  const { width: logoW } = (drawLogo && drawLogo(doc, company, left, y - 8, 26, 14)) || { width: 0 };
  const textX = left + (logoW ? logoW + 6 : 0);
  doc.setFontSize(9);
  doc.setFont(undefined, "bold");
  doc.text(label, right, y - 6, { align: "right" });
  doc.setFontSize(16);
  doc.text("DELIVERY NOTE", right, y, { align: "right" });
  // The company name wraps within the space before the title, so a long
  // registered name can never collide with it.
  doc.setFontSize(12);
  const nameLines = doc.splitTextToSize(company.name || "Delivery Note", 105 - (textX - left));
  doc.text(nameLines, textX, y);
  y += Math.max(nameLines.length * 5, 5) + 4;
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text(`Number: ${note.delivery_note_number}`, right, y, { align: "right" });
  y += 5;
  doc.text(`Date: ${new Date(note.created_at || Date.now()).toLocaleDateString()}`, right, y, { align: "right" });
  y += 8;
  doc.setFont(undefined, "bold");
  doc.text(note.direction === "to_supplier" ? "To (Supplier):" : "To (Customer):", left, y);
  doc.setFont(undefined, "normal");
  doc.text(String(note.recipient_name || ""), left + 45, y);
  y += 5;
  // An address is as many lines as it was typed in, and each takes its
  // own room. It was given one line's room, so a supplier's address of
  // three lines ran into the table.
  const address = String(note.recipient_address || "").trim();
  if (address) {
    const addressLines = doc.splitTextToSize(address, right - (left + 45));
    doc.text(addressLines, left + 45, y);
    y += addressLines.length * 4.5 + 0.5;
  }
  y += 5;
  autoTable(doc, {
    startY: y,
    head: [["Code", "Description", "Qty"]],
    body: (lineItems || []).map((li) => [li.code || "—", String(li.description ?? ""), String(li.qty)]),
    theme: "grid",
    headStyles: { fillColor: [27, 29, 31] },
    margin: { left, right: left },
    // A page the table runs on to says whose it is: a loose second page
    // with nothing but rows on it belongs to no note.
    didDrawPage: (data) => {
      if (data.pageNumber < 2) return;
      doc.setFontSize(9);
      doc.setFont(undefined, "bold");
      doc.text(`${note.delivery_note_number} — ${label}, continued`, left, 9);
      doc.setFont(undefined, "normal");
    },
  });
  let signaturesAt = (doc.lastAutoTable?.finalY || y + 20) + 12;
  // No room left under the table for somebody to sign: the signatures go
  // over the page, never off the bottom of this one.
  if (signaturesAt > lastLine) {
    doc.addPage();
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.text(`${note.delivery_note_number} — ${label}, continued`, left, 9);
    doc.setFont(undefined, "normal");
    signaturesAt = NOTE_PAGE.top;
  }
  doc.setFontSize(9);
  doc.text("Sent by: _______________________", left, signaturesAt);
  doc.text("Received by: _______________________", right - 70, signaturesAt);
  return { label, firstPage, lastPage: pageOf(doc), top, signaturesAt };
}

// Draws the whole note into `doc`, a new jsPDF document. `drawLogo` is the
// app's own (addCompanyLogo); without one the note has no logo. Gives back
// what it did, which is what the tests read:
//   { layout: "one sheet" | "a copy each", pages, copies: [{ label,
//     firstPage, lastPage, top, signaturesAt }, ...] }
export function drawDeliveryNote({ doc, autoTable, note, lineItems, company, drawLogo }) {
  const { left, right, top, secondCopyTop, cutLine, footer } = NOTE_PAGE;
  const shared = { doc, autoTable, note, lineItems, company: company || {}, drawLogo };
  const customers = drawCopy({ ...shared, top, label: COPIES[0] });

  if (fitsOneSheet(customers)) {
    doc.setDrawColor(180, 180, 180);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(left, cutLine, right, cutLine);
    doc.setLineDashPattern([], 0);
    // Ours is as tall as the customer's, which fitted: it cannot run over.
    const ours = drawCopy({ ...shared, top: secondCopyTop, label: COPIES[1], lastLine: ONE_SHEET_LAST_LINE });
    return { layout: "one sheet", pages: doc.getNumberOfPages(), copies: [customers, ours] };
  }

  doc.addPage();
  const ours = drawCopy({ ...shared, top, label: COPIES[1] });
  const copies = [customers, ours];
  for (const copy of copies) {
    const of = copy.lastPage - copy.firstPage + 1;
    for (let p = copy.firstPage; p <= copy.lastPage; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.text(`${note.delivery_note_number} — ${copy.label} — page ${p - copy.firstPage + 1} of ${of}`, (left + right) / 2, footer, { align: "center" });
    }
  }
  doc.setPage(doc.getNumberOfPages());
  return { layout: "a copy each", pages: doc.getNumberOfPages(), copies };
}
