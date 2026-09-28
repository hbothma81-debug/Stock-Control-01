// A tube program cut off more than one stock line: three full lengths
// and two offcuts of the same section, say (Heinrich, 28 Sep 2026).
//
// The program keeps them as a list, in the order the nester put them on
// the form (laser_programs.stock_lines, setup-laser-program-stock-lines.sql):
//
//   [{ stock_item_id, qty, length }, ...]
//
// `length` is the stock line's length in metres, kept only so the
// screens can say "3 × 6m + 2 × 2.4m" without looking the line up.
//
// The Cutting screen has one box for the whole program, by his answer:
// the lengths come off the shelf in the order listed. The first line's
// lengths are cuts 1 to qty, the next line's follow on, and so on. A cut
// past the end of the list (the nester raised the program's count
// afterwards) comes off the last line.
//
// A program with one stock line keeps no list: laser_programs.stock_item_id
// says which line, as it always did.
//
// Pure: no database, tested in stockLines.test.js.

const whole = (n) => Math.max(0, Math.round(Number(n) || 0));

// The list to store, from the form's rows: `rows` are
// [{ option, qty }] with `option` from stockOptions(). Rows with no
// stock line picked or no quantity are left out; the same stock line
// picked twice is added up in the place it was first listed.
export function buildStockLines(rows) {
  const lines = [];
  for (const r of rows || []) {
    const id = r?.option?.item?.id;
    const qty = whole(r?.qty);
    if (!id || qty <= 0) continue;
    const already = lines.find((l) => l.stock_item_id === id);
    if (already) already.qty += qty;
    else lines.push({ stock_item_id: id, qty, length: r.option.item.length ?? null });
  }
  return lines;
}

export function totalLengths(lines) {
  return (lines || []).reduce((n, l) => n + whole(l.qty), 0);
}

// The program's list, or an empty one: anything that is not a list of
// lines with a stock line and a quantity reads as "no list".
export function stockLinesOf(program) {
  const raw = program?.stock_lines;
  if (!Array.isArray(raw)) return [];
  return raw.filter((l) => l && l.stock_item_id && whole(l.qty) > 0);
}

// What moves on the shelf when the cut count goes from `before` to
// `after`: [{ stock_item_id, delta }], positive off the shelf, negative
// back onto it. Lines that do not move are left out.
export function stockMoves(lines, before, after) {
  const list = (lines || []).filter((l) => l && l.stock_item_id && whole(l.qty) > 0);
  const from = whole(before);
  const to = whole(after);
  if (list.length === 0 || from === to) return [];
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const sign = to > from ? 1 : -1;
  const moves = [];
  let start = 0;
  list.forEach((l, i) => {
    const last = i === list.length - 1;
    const end = last ? Infinity : start + whole(l.qty);
    const n = Math.max(0, Math.min(hi, end) - Math.max(lo, start));
    if (n > 0) {
      const already = moves.find((m) => m.stock_item_id === l.stock_item_id);
      if (already) already.delta += sign * n;
      else moves.push({ stock_item_id: l.stock_item_id, delta: sign * n });
    }
    start += whole(l.qty);
  });
  // Going back, the last one cut is the first one returned.
  return sign > 0 ? moves : moves.reverse();
}

// "3 × 6m + 2 × 2.4m", for the program's card. Empty when there is no
// list.
export function stockLinesText(lines) {
  return (lines || [])
    .filter((l) => l && whole(l.qty) > 0)
    .map((l) => `${whole(l.qty)} × ${l.length != null && l.length !== "" ? `${l.length}m` : "length not given"}`)
    .join(" + ");
}
