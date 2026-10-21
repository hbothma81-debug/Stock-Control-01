// The job page's Drawings tab: which line has which drawing, and where
// the line goes on the floor (Heinrich, 21 Oct 2026).
//
// A line's drawing is the drawings library's current one for the part
// number of the stock part the line is linked to: the same rule the
// Production card uses for its Drawings block (drawingsForJob in
// App.jsx). Change both together. The library is never copied onto the
// job, so a new revision shows here the moment it is uploaded.

// lines: the job's quote items, parts included.
// partNumberOf(line): the linked stock part's part number, or "".
// drawingsByPart: { [partNumber]: drawing row } for current drawings.
// stagesOf(line): stage names the line goes to, in flow order.
// Returns { withDrawing, withoutDrawing }, each a list of rows sorted by
// part number (numbers read as numbers), then description.
export function drawingRows(lines, partNumberOf, drawingsByPart, stagesOf) {
  const withDrawing = [];
  const withoutDrawing = [];
  for (const line of lines || []) {
    const partNumber = (partNumberOf(line) || "").trim();
    const drawing = partNumber ? drawingsByPart[partNumber] || null : null;
    const row = { line, partNumber, drawing, stages: stagesOf(line) };
    (drawing ? withDrawing : withoutDrawing).push(row);
  }
  const byPart = (a, b) =>
    a.partNumber.localeCompare(b.partNumber, undefined, { numeric: true, sensitivity: "base" }) ||
    (a.line.description || "").localeCompare(b.line.description || "", undefined, { numeric: true, sensitivity: "base" });
  withDrawing.sort(byPart);
  withoutDrawing.sort(byPart);
  return { withDrawing, withoutDrawing };
}

// Why a line has no drawing, in the words the tab shows.
export function noDrawingReason(row) {
  return row.partNumber ? `No drawing on file for ${row.partNumber}` : "Not linked to a stock part";
}

// "Our rev 2, customer rev B", or the one there is.
export function revisionText(drawing) {
  if (!drawing) return "";
  const ours = drawing.internal_revision != null ? `Our rev ${drawing.internal_revision}` : "";
  const theirs = drawing.customer_revision ? `customer rev ${drawing.customer_revision}` : "";
  return [ours, theirs].filter(Boolean).join(", ");
}
