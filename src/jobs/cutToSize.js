// The cut-to-size maths, kept apart from the screen so the quoting module
// can use exactly the same working later.
//
// Nothing in the database decides any of this: job_cut_items only keeps
// what was typed (section, length, quantity, stock length). Bars needed
// and offcuts are worked out here, every time, from those numbers.

// Lost to the saw blade on every cut.
export const KERF_MM = 1;

// Taken off the front of a bar to square it up, when the line asks for
// it. Includes the blade width of that cut.
export const TRIM_MM = 10;

// What a bar is unless somebody says otherwise. Metres, because that is
// how structural stock stores its lengths.
export const DEFAULT_STOCK_M = 6;

// An offcut shorter than this is scrap, not stock. Structural only --
// CNC bar keeps down to 50mm, but that is a different screen.
export const MIN_OFFCUT_MM = 1000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sameText = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

// How much of a bar there is to cut pieces from.
export function usableBarMm(stockLengthM, trimFront) {
  return num(stockLengthM) * 1000 - (trimFront ? TRIM_MM : 0);
}

// Metres of section one line calls for.
export function lineMetres(line) {
  return (num(line.cut_length_mm) * num(line.qty)) / 1000;
}

export function offcutIsKeepable(mm) {
  return mm >= MIN_OFFCUT_MM;
}

// Lays the pieces out on bars, one group per section, grade and stock
// length. Longest pieces first, each one onto the first bar it fits; a new
// bar when none has room. That is how a saw operator does it by eye, and
// it is what the CUTTING LIST sheet in the costing workbook shows (L1 to
// L12 across each bar).
//
// Returns one entry per group:
//   { key, section, grade, stockLengthM, trimFront, usableMm,
//     bars: [{ pieces: [{ lineId, drawingNo, lengthMm }], usedMm, offcutMm }],
//     tooLong: [{ lineId, drawingNo, lengthMm }],   pieces no bar can hold
//     pieceCount, metres }
export function planBars(lines) {
  const groups = new Map();
  for (const line of lines || []) {
    const section = (line.section || "").trim();
    if (!section) continue;
    const stockLengthM = num(line.stock_length_m) || DEFAULT_STOCK_M;
    const trimFront = line.trim_front !== false;
    const key = [section.toLowerCase(), (line.grade || "").trim().toLowerCase(), stockLengthM, trimFront ? "t" : ""].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        section,
        grade: (line.grade || "").trim(),
        stockLengthM,
        trimFront,
        usableMm: usableBarMm(stockLengthM, trimFront),
        pieces: [],
      });
    }
    const g = groups.get(key);
    const lengthMm = num(line.cut_length_mm);
    const qty = Math.max(0, Math.floor(num(line.qty)));
    if (lengthMm <= 0) continue;
    for (let i = 0; i < qty; i++) {
      g.pieces.push({ lineId: line.id, drawingNo: line.drawing_no || "", lengthMm });
    }
  }

  const out = [];
  for (const g of groups.values()) {
    const sorted = [...g.pieces].sort((a, b) => b.lengthMm - a.lengthMm);
    const tooLong = sorted.filter((p) => p.lengthMm + KERF_MM > g.usableMm);
    const fits = sorted.filter((p) => p.lengthMm + KERF_MM <= g.usableMm);
    // Two ways of packing, keep the better. First fit puts a piece on the
    // first bar with room; best fit puts it where it leaves the least
    // room. Neither always wins, so both are tried. Fewer bars wins; on a
    // tie, the layout whose biggest offcut is biggest -- one long piece
    // back in the rack beats two short ones in the scrap bin.
    const bars = betterOf(packBars(fits, g.usableMm, "first"), packBars(fits, g.usableMm, "best"));
    out.push({
      key: g.key,
      section: g.section,
      grade: g.grade,
      stockLengthM: g.stockLengthM,
      trimFront: g.trimFront,
      usableMm: g.usableMm,
      bars,
      tooLong,
      pieceCount: g.pieces.length,
      metres: g.pieces.reduce((sum, p) => sum + p.lengthMm, 0) / 1000,
    });
  }
  return out;
}

// Pieces arrive longest first. Each one goes on a bar, and the bar is
// chosen by `rule`: "first" takes the first bar with room, "best" the bar
// that would be left with the least room. A new bar when none has room.
// Within a bar the pieces stay longest first, which is the cutting order:
// the offcut is the last thing off the saw.
function packBars(pieces, usableMm, rule) {
  const bars = [];
  for (const piece of pieces) {
    const needs = piece.lengthMm + KERF_MM;
    let bar = null;
    if (rule === "best") {
      for (const b of bars) {
        const room = usableMm - b.usedMm;
        if (room >= needs && (!bar || room < usableMm - bar.usedMm)) bar = b;
      }
    } else {
      bar = bars.find((b) => b.usedMm + needs <= usableMm) || null;
    }
    if (!bar) {
      bar = { pieces: [], usedMm: 0, offcutMm: usableMm };
      bars.push(bar);
    }
    bar.pieces.push(piece);
    bar.usedMm += needs;
    bar.offcutMm = usableMm - bar.usedMm;
  }
  return bars;
}

function betterOf(a, b) {
  if (a.length !== b.length) return a.length < b.length ? a : b;
  const biggest = (bars) => bars.reduce((max, bar) => Math.max(max, bar.offcutMm), 0);
  return biggest(b) > biggest(a) ? b : a;
}

// Structural stock that could be one of this group's bars: the same
// section and grade, at least the stock length, and not an offcut.
// Counts pieces, not rows -- a row of four 6m lengths is four bars.
export function barsOnShelf(group, items) {
  return (items || [])
    .filter(
      (it) =>
        it.mainCat === "structural" &&
        sameText(it.name, group.section) &&
        sameText(it.grade, group.grade) &&
        num(it.length) >= group.stockLengthM &&
        it.stockType !== "offcut"
    )
    .reduce((sum, it) => sum + num(it.qty), 0);
}

// Bars already set aside for this job that could serve this group: open
// allocations whose stock item is the same section and grade at the stock
// length or longer. Counts what is still unused on each allocation.
export function barsSetAside(group, allocations, items) {
  return (allocations || [])
    .filter((a) => a.status !== "released")
    .reduce((sum, a) => {
      const it = (items || []).find((i) => i.id === a.item_id);
      if (!it || it.mainCat !== "structural") return sum;
      if (!sameText(it.name, group.section) || !sameText(it.grade, group.grade)) return sum;
      if (num(it.length) < group.stockLengthM) return sum;
      return sum + Math.max(0, num(a.qty_allocated) - num(a.qty_used));
    }, 0);
}

// Bars asked for or on a purchase order but not yet on the floor: open
// requisitions whose stock item is the same section and grade at the
// stock length or longer. "pending" is asked for, "ordered" is on a PO;
// "received" is already counted on the shelf, so it is left out.
export function barsOnOrder(group, requisitions, items) {
  return (requisitions || [])
    .filter((r) => r.status === "pending" || r.status === "ordered")
    .reduce((sum, r) => {
      const it = (items || []).find((i) => i.id === r.itemId);
      if (!it || it.mainCat !== "structural") return sum;
      if (!sameText(it.name, group.section) || !sameText(it.grade, group.grade)) return sum;
      if (num(it.length) < group.stockLengthM) return sum;
      return sum + num(r.qty);
    }, 0);
}

// The heading a material gets everywhere: its type from the Sections list
// when it has one, then the size and grade. "Angle 50x50x5 S355", not
// just "50x50x5".
export function materialName(group, findSectionType) {
  const type = findSectionType ? findSectionType(group.section) : "";
  return [type, group.section, group.grade].filter(Boolean).join(" ");
}

// Rounded the way the shop reads them: whole millimetres, metres to two
// places, kilograms to one.
export const fmtMm = (mm) => `${Math.round(mm).toLocaleString()} mm`;
export const fmtM = (m) => `${m.toFixed(2)} m`;
export const fmtKg = (kg) => `${kg.toFixed(1)} kg`;
