// The job page's Drawings tab: which line has which drawing, and where
// the line goes on the floor (Heinrich, 21 Oct 2026).
//
// A line's drawing is the drawings library's current one for the line's
// part number: the linked stock part's, else the line's own stock code
// (linePartNumber in App.jsx, which the Production card's Drawings block
// uses too, so the two screens agree). The library is never copied onto the
// job, so a new revision shows here the moment it is uploaded.

// lines: the job's quote items, parts included.
// partNumberOf(line): the linked stock part's part number, or "".
// drawingsByPart: { [partNumber]: drawing row } for current drawings.
// stagesOf(line): stage names the line goes to, in flow order.
// drawingsByLine: { [line id]: drawing row } kept on this job for a line
// with no part number (drawings.quote_item_id); the part's own drawing
// wins where there is one.
// Returns { withDrawing, withoutDrawing }, each a list of rows sorted by
// part number (numbers read as numbers), then description.
export function drawingRows(lines, partNumberOf, drawingsByPart, stagesOf, drawingsByLine = {}) {
  const withDrawing = [];
  const withoutDrawing = [];
  for (const line of lines || []) {
    const partNumber = (partNumberOf(line) || "").trim();
    const drawing = (partNumber ? drawingsByPart[partNumber] : null) || drawingsByLine[line.id] || null;
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

// Upper case, letters and digits only: "ers-1001 rev_B" and "ERS1001REVB"
// are the same to the matcher.
const squash = (text) => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// The file's name without its extension.
export function fileStem(fileName) {
  return String(fileName || "").replace(/\.[^.]*$/, "").trim();
}

// Which of the job's part numbers a dropped file is for: the longest part
// number found inside its name, so "P-10.pdf" is P-10 and not P-1. Two
// different part numbers of that same longest length both found is not a
// guess this makes: null, and the person picks.
export function matchFileToPart(fileName, partNumbers) {
  const stem = squash(fileStem(fileName));
  let best = null;
  let tie = false;
  for (const pn of new Set((partNumbers || []).map((p) => (p || "").trim()).filter(Boolean))) {
    const code = squash(pn);
    if (!code || !stem.includes(code)) continue;
    if (!best || code.length > squash(best).length) {
      best = pn;
      tie = false;
    } else if (code.length === squash(best).length && code !== squash(best)) {
      tie = true;
    }
  }
  return tie ? null : best;
}

// Which job line a dropped file is for (Heinrich, 21 Oct 2026: "if the
// file name matches the description or stock code they should
// automatically be linked"). The part number first, by matchFileToPart;
// failing that the description: the whole description found in the name
// (four letters or more, so "Lug" finds nothing by accident), the longest
// one winning and a tie not guessed. null: no line, This job only.
export function matchFileToLine(fileName, lines, partNumberOf) {
  const part = matchFileToPart(fileName, (lines || []).map(partNumberOf));
  if (part) return (lines || []).find((l) => (partNumberOf(l) || "").trim() === part) || null;
  const stem = squash(fileStem(fileName));
  let best = null;
  let tie = false;
  for (const line of lines || []) {
    const words = squash(line.description);
    if (words.length < 4 || !stem.includes(words)) continue;
    const bestWords = best ? squash(best.description) : "";
    if (!best || words.length > bestWords.length) {
      best = line;
      tie = false;
    } else if (words.length === bestWords.length && words !== bestWords) {
      tie = true;
    }
  }
  return tie ? null : best;
}

// The part number a "This job only" drawing is filed under in the
// library: the job number, then the file's name, so the same file
// dropped on the same job again is a new revision of it.
export function jobOnlyPartNumber(jobNumber, fileName) {
  return `${jobNumber}-${fileStem(fileName)}`;
}

// "Our rev 2, customer rev B", or the one there is.
export function revisionText(drawing) {
  if (!drawing) return "";
  const ours = drawing.internal_revision != null ? `Our rev ${drawing.internal_revision}` : "";
  const theirs = drawing.customer_revision ? `customer rev ${drawing.customer_revision}` : "";
  return [ours, theirs].filter(Boolean).join(", ");
}
