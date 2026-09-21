// Receiving plate, sections and CNC bar (supplier prices step 5, decided
// with Heinrich 21 Sep 2026). The same item from another supplier is its
// own stock row, always, so what arrives lands on the delivering
// supplier's row, made if there is none; and a row that gets more stock at
// another price is worth the average by quantity.

export const MATERIAL_CATS = ["plate", "structural", "cncBar"];

const norm = (s) => String(s || "").trim().toLowerCase();

// The same stock item, supplier aside. Mirrors the add-stock form's
// "already in the library" check (matchedExisting in App.jsx): change one,
// change the other.
export function sameSpec(a, b) {
  if (!a || !b || a.mainCat !== b.mainCat || norm(a.grade) !== norm(b.grade)) return false;
  if (a.mainCat === "plate") {
    return norm(a.size) === norm(b.size) && norm(a.thickness) === norm(b.thickness) && (a.stockType || "full") === (b.stockType || "full");
  }
  if (a.mainCat === "structural") {
    const len = (it) => (it.trackLength ? Number(it.length) || 0 : 0);
    return norm(a.name) === norm(b.name) && len(a) === len(b);
  }
  if (a.mainCat === "cncBar") return Number(a.diameter) === Number(b.diameter) && (Number(a.length) || 0) === (Number(b.length) || 0);
  return false;
}

// (old stock at its price + what arrived at its price) / all of it. A row
// with nothing on hand, or no price yet, takes the new price; a delivery
// with no price leaves the row's alone. Rounded to cents.
export function averagePaid(oldQty, oldPrice, addQty, addPrice) {
  const q0 = Math.max(0, Number(oldQty) || 0), p0 = Number(oldPrice) || 0;
  const q1 = Math.max(0, Number(addQty) || 0), p1 = Number(addPrice) || 0;
  if (!(p1 > 0) || q1 === 0) return p0 > 0 ? p0 : null;
  if (!(p0 > 0) || q0 === 0) return p1;
  return Math.round(((q0 * p0 + q1 * p1) / (q0 + q1)) * 100) / 100;
}

// A PO line is priced per sheet, per length or per piece; the price list
// is R/kg (plate, bar) or R/m (sections). `kgEach` is one sheet's or one
// bar's weight. 0 when it cannot be worked back.
export function rateFromLinePrice(item, unitPrice, kgEach) {
  const price = Number(unitPrice) || 0;
  if (!item || !(price > 0)) return 0;
  if (item.mainCat === "structural") {
    const len = item.trackLength ? Number(item.length) || 0 : 0;
    return len > 0 ? price / len : price;
  }
  return Number(kgEach) > 0 ? price / Number(kgEach) : 0;
}

// Where a delivery lands. `items` in, { items, targetId } out. For plate,
// sections and bar from a named supplier: the requisition's own row when
// it is that supplier's, else that supplier's row of the same item, else
// the requisition's row if it is empty and has no supplier (it becomes
// theirs), else a new row copied from it with an empty shelf location.
// Anything else lands on the requisition's row as it always did.
// `rate` (R/kg or R/m) feeds the average; `keepPaid` is false on a
// database without the paid price column.
export function landDelivery(items, { itemId, qty, supplier, rate = 0, newId, keepPaid = true }) {
  const from = (items || []).find((it) => it.id === itemId);
  const add = Number(qty) || 0;
  if (!from || !(add > 0)) return { items, targetId: from ? from.id : null };
  const material = MATERIAL_CATS.includes(from.mainCat);
  let target = from;
  let claim = false;
  if (material && norm(supplier) && norm(from.supplier) !== norm(supplier)) {
    const theirs = items.find((it) => it.id !== from.id && sameSpec(it, from) && norm(it.supplier) === norm(supplier));
    if (theirs) target = theirs;
    // An empty row with no supplier becomes theirs; one with stock of
    // unknown origin on it is left as it is.
    else if (!norm(from.supplier) && !((Number(from.qty) || 0) > 0)) claim = true;
    else target = null;
  }
  const paid = (it) => (material && keepPaid ? { paidPrice: averagePaid(it.qty, it.paidPrice, add, rate) } : {});
  if (!target) {
    const row = { ...from, id: newId, supplier: String(supplier).trim(), qty: 0, loc: "", comment: "", paidPrice: null };
    return { items: [...items, { ...row, ...paid(row), qty: add }], targetId: newId };
  }
  return {
    items: items.map((it) =>
      it.id === target.id ? { ...it, ...paid(it), qty: (Number(it.qty) || 0) + add, ...(claim ? { supplier: String(supplier).trim() } : {}) } : it
    ),
    targetId: target.id,
  };
}
