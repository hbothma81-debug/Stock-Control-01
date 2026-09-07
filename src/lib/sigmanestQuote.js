// Reading a SigmaNest quote PDF.
//
// These come off the nesting machine as "ER Supplies Quote-JOB-31728.pdf"
// and are the same layout every time, which is the only reason this is
// worth doing: a quote is retyped into a job by hand today, line by line.
//
// The pages are simple -- every string is drawn with its own position, no
// kerning arrays, no font tricks -- so this reads where each string sits
// and puts it in the column it is under. Reading order alone is not enough:
// one line of the table is drawn as six separate pieces at five different
// heights, in an order that has nothing to do with how it looks.
//
//     513 | 404:1 x bend                        <- Secondary Ops
//     507 |  26:1                               <- a line counter, not a column
//     499 | 114:8  222:MS  327:88X50  487:20.39  545:163.12
//     497 | 145:100                             <- Part Name
//     495 | 269:6.00                            <- Thk
//
// So: find the header, learn where its columns are, then gather each line
// around its part name and drop every piece into the nearest column.

// How far above or below its part name a piece of the same line can sit.
// Lines are about 70 apart and a line is about 18 tall, so this has room
// on both sides without ever reaching the next one.
const LINE_HEIGHT = 25;

// How far from a column a piece can sit and still belong to it. The
// furthest real one is 33; the line counter down the left is 68 from
// anything, and is meant to be ignored.
const COLUMN_REACH = 40;

const COLUMNS = ["Quantity", "Part Name", "Mat", "Thk", "Size", "Seconday Ops", "Unit Price", "Total Price"];

// ---------------------------------------------------------------- reading

// Every drawn string in the PDF, with where it sits. `inflate` is passed in
// rather than imported so this works in both places: the browser hands it
// DecompressionStream, a script hands it zlib.
export async function extractPdfTextItems(bytes, inflate) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let whole = "";
  for (let i = 0; i < raw.length; i += 8192) {
    whole += String.fromCharCode.apply(null, raw.subarray(i, Math.min(i + 8192, raw.length)));
  }

  const items = [];
  let page = 0;
  let from = 0;

  while (true) {
    const start = whole.indexOf("stream", from);
    if (start === -1) break;
    let s = start + 6;
    if (raw[s] === 13) s++;
    if (raw[s] === 10) s++;
    const end = whole.indexOf("endstream", s);
    if (end === -1) break;

    // The compressed data runs from here to just before "endstream", and
    // there is a line break in between. The browser's decompressor refuses
    // anything trailing, so it comes off before we hand it over.
    let stop = end;
    while (stop > s && (raw[stop - 1] === 10 || raw[stop - 1] === 13)) stop--;

    let text = null;
    try {
      const out = await inflate(raw.slice(s, stop));
      text = "";
      for (let i = 0; i < out.length; i += 8192) {
        text += String.fromCharCode.apply(null, out.subarray(i, Math.min(i + 8192, out.length)));
      }
    } catch {
      // Images and fonts land here. Not what we are after.
    }
    from = end + 9;
    if (!text || !/\bTj\b/.test(text)) continue;
    page += 1;

    // The last two numbers of "a b c d x y Tm" are where the string starts.
    const re = /([-\d.]+)\s+([-\d.]+)\s+Tm\s*\(((?:\\.|[^()\\])*)\)\s*Tj/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const value = m[3]
        .replace(/\\([()\\])/g, "$1")
        .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
      if (!value.trim()) continue;
      items.push({ page, x: parseFloat(m[1]), y: parseFloat(m[2]), text: value.trim() });
    }
  }

  return items;
}

// ---------------------------------------------------------------- helpers

// A number as the quote writes it: "1 170.16" is one thousand one hundred
// and seventy, with a space where a comma would be.
function toNumber(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/[\s ]/g, "").replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const find = (items, label) => items.find((i) => i.text === label) || null;

// What is written to the right of a label, on the same line as it.
function rightOf(items, label) {
  const at = find(items, label);
  if (!at) return "";
  // Stopping at a wide gap matters: the notes block on the right of the
  // page sits at the same height as "Quote To :" on the left, and without
  // this the customer came out as "Plantcore Mining AND GUARD".
  const sameLine = items
    .filter((i) => i.page === at.page && i.x > at.x && Math.abs(i.y - at.y) <= 5)
    .sort((a, b) => a.x - b.x);
  const words = [];
  let previousX = at.x;
  for (const i of sameLine) {
    if (i.x - previousX > 120) break;
    words.push(i.text);
    previousX = i.x;
  }
  return words.join(" ").trim();
}

// ---------------------------------------------------------------- parsing

export function parseSigmaNestQuote(items) {
  const quoteNumber = rightOf(items, "Quote:");
  const customer = rightOf(items, "Quote To :");

  // The notes sit in the right-hand block between the "Notes :" label and
  // "Quoted Date :" below it, and run to as many lines as they need --
  // "PUMP 64 -55kW MOTOR BASE" then "AND GUARD". The first line is drawn
  // slightly ABOVE its own label, so the top of the band allows for that.
  let notes = "";
  const notesAt = find(items, "Notes :");
  const dateAt = find(items, "Quoted Date :");
  if (notesAt) {
    const floor = dateAt && dateAt.page === notesAt.page ? dateAt.y : notesAt.y - 60;
    notes = items
      .filter(
        (i) =>
          i.page === notesAt.page &&
          i !== notesAt &&
          i.x > notesAt.x + 10 &&
          i.y > floor &&
          i.y <= notesAt.y + 12
      )
      .sort((a, b) => b.y - a.y)
      .map((i) => i.text)
      .join(" ")
      .trim();
  }

  const headers = items.filter((i) => i.text === "Part Name");
  if (headers.length === 0) {
    return { ok: false, reason: "no-table", quoteNumber, customer, notes, lines: [], quotedTotal: null };
  }

  const lines = [];

  for (const header of headers) {
    const columns = COLUMNS.map((name) => {
      const cell = items.find(
        (i) => i.page === header.page && i.text === name && Math.abs(i.y - header.y) <= 5
      );
      return cell ? { name, x: cell.x } : null;
    }).filter(Boolean);
    if (columns.length < 5) continue;

    const nameColumn = columns.find((c) => c.name === "Part Name");
    const columnFor = (x) => {
      let best = null;
      for (const col of columns) {
        const d = Math.abs(col.x - x);
        if (d <= COLUMN_REACH && (!best || d < Math.abs(best.x - x))) best = col;
      }
      return best;
    };

    // Everything under this header, down to where the table stops.
    const stops = items.filter(
      (i) => i.page === header.page && i.y < header.y && /^(Please Note:|SUB TOTAL|VAT @|TOTAL :)/.test(i.text)
    );
    const bottom = stops.length ? Math.max(...stops.map((i) => i.y)) : -Infinity;
    const body = items.filter((i) => i.page === header.page && i.y < header.y - 5 && i.y > bottom);

    // Each line is gathered around its part name. A name too long for its
    // column wraps onto a second one just above, close enough that both
    // land in the same gathering.
    const nameCells = body
      .filter((i) => {
        const col = columnFor(i.x);
        return col && col.name === "Part Name";
      })
      .sort((a, b) => b.y - a.y);

    const anchors = [];
    for (const cell of nameCells) {
      const last = anchors[anchors.length - 1];
      if (last && Math.abs(last.y - cell.y) <= LINE_HEIGHT) {
        last.cells.push(cell);
        last.y = (last.y + cell.y) / 2;
      } else {
        anchors.push({ y: cell.y, cells: [cell] });
      }
    }

    for (const anchor of anchors) {
      const partName = anchor.cells
        .slice()
        .sort((a, b) => b.y - a.y)
        .map((c) => c.text)
        .join(" ")
        .trim();

      const cell = {};
      for (const i of body) {
        if (Math.abs(i.y - anchor.y) > LINE_HEIGHT) continue;
        if (i.text === "R") continue; // the rand signs have their own little columns
        const col = columnFor(i.x);
        if (!col || col.name === "Part Name") continue;
        cell[col.name] = cell[col.name] ? `${cell[col.name]} ${i.text}` : i.text;
      }

      const qty = toNumber(cell.Quantity);
      const unit = toNumber(cell["Unit Price"]);
      const total = toNumber(cell["Total Price"]);
      // A line without a price is not a line. Nothing else in the table
      // looks like this, so anything that does is a stray.
      if (unit === null || total === null) continue;

      lines.push({
        partName,
        material: cell.Mat || "",
        size: cell.Size || "",
        // The ops column carries a dash for "none", and a line can pick up
        // more than one of them. A dash is not an operation.
        secondaryOps: (cell["Seconday Ops"] || "")
          .split(/\s+/)
          .filter((w) => w && w !== "-")
          .join(" "),
        thickness: toNumber(cell.Thk),
        qty,
        unitPrice: unit,
        totalPrice: total,
      });
    }
  }

  // The figure written to the right of a totals label.
  const totalBeside = (label) => {
    const at = find(items, label);
    if (!at) return null;
    const numbers = items
      .filter((i) => i.page === at.page && i.x > at.x && Math.abs(i.y - at.y) <= 6)
      .map((i) => toNumber(i.text))
      .filter((n) => n !== null);
    return numbers.length ? Math.max(...numbers) : null;
  };

  // Two totals on the page, and which one is wanted matters. The lines add
  // up to the sub total; VAT is added after. Everywhere else in the app a
  // job is worth what its lines come to, so taking the VAT-inclusive figure
  // here would make one job read fifteen percent bigger than the same work
  // typed in by hand.
  const subTotal = totalBeside("SUB TOTAL :");
  const grandTotal = totalBeside("TOTAL :");

  return {
    ok: lines.length > 0,
    reason: lines.length > 0 ? "" : "no-lines",
    quoteNumber,
    customer,
    notes,
    lines,
    quotedTotal: subTotal ?? grandTotal,
    subTotal,
    totalIncludingVat: grandTotal,
  };
}

// The browser's own inflate. Every current browser has it; a very old one
// does not, and this says so rather than failing quietly.
export async function browserInflate(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser is too old to read a PDF here.");
  }
  const attempt = async (format) => {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  // A PDF's Flate streams carry the zlib header, but not every writer puts
  // one on, so a raw stream is worth a second try before giving up.
  try {
    return await attempt("deflate");
  } catch {
    return await attempt("deflate-raw");
  }
}
