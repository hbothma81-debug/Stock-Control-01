// One search for stock items, so every screen finds the same things.
//
// The Stock tab's own search (haystack in App.jsx) reads every field on a
// row and matches each typed word on its own, so "mild steel 6mm" works
// whichever order the words come in and whichever field each lands in.
// The Request stock pop-up used to look at four fields and match the whole
// phrase against one field at a time, which is why it missed items the
// Stock tab could find (7 Oct 2026). Both now read from here; the Stock
// tab's copy switches over once the drawings split has landed in App.jsx.
//
//   stockSearchText(item, extra)  everything on the row as one lower-case
//                                 string; extra is more words to include
//                                 (a section type, reserved customers)
//   searchWords(query)            the typed text as lower-case words
//   matchesWords(text, words)     every word appears somewhere in text

export function stockSearchText(it, extra = []) {
  return [
    it.name,
    it.grade,
    it.size,
    it.thickness,
    it.length ? `${it.length}m` : "",
    it.diameter,
    it.partNumber,
    it.customer,
    it.supplier,
    it.loc,
    it.comment,
    it.sheetName,
    it.fastenerType,
    it.fastenerGrade,
    it.finish,
    it.manufacturer,
    ...extra,
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
}

export function searchWords(query) {
  return String(query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesWords(text, words) {
  if (words.length === 0) return true;
  return words.every((w) => text.includes(w));
}

// The requisition list's own text: the request's label, supplier, who
// asked, the job and the note.
export function requisitionSearchText(r) {
  return [r.itemLabel, r.itemRawName, r.itemGrade, r.supplier, r.requestedBy, r.jobNumber, r.notes, r.poNumber]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
}
