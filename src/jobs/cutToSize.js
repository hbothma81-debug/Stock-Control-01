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
    const bars = [];
    const tooLong = [];
    for (const piece of sorted) {
      const needs = piece.lengthMm + KERF_MM;
      if (needs > g.usableMm) {
        tooLong.push(piece);
        continue;
      }
      let bar = bars.find((b) => b.usedMm + needs <= g.usableMm);
      if (!bar) {
        bar = { pieces: [], usedMm: 0, offcutMm: g.usableMm };
        bars.push(bar);
      }
      bar.pieces.push(piece);
      bar.usedMm += needs;
      bar.offcutMm = g.usableMm - bar.usedMm;
    }
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

// Rounded the way the shop reads them: whole millimetres, metres to two
// places, kilograms to one.
export const fmtMm = (mm) => `${Math.round(mm).toLocaleString()} mm`;
export const fmtM = (m) => `${m.toFixed(2)} m`;
export const fmtKg = (kg) => `${kg.toFixed(1)} kg`;
