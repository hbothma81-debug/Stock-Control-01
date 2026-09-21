// The rules for master.supplierPrices: one price per material per supplier
// (table master_supplier_prices, setup-supplier-prices.sql; decided with
// Heinrich 21 Sep 2026). The price list is its own thing: stock on hand
// never reads it for its value, only the screens that are about to buy or
// quote do.
//
// A material is a row of one of the three price lists: `listName` is
// "grades", "cncGrades" or "sections", `name` the row's own name (a
// material's full name, never its short name) and `grade` a section's
// material, "" for the other two lists.
//
// A row: { id, listName, name, grade, supplierId, price, setBy, setAt }.
// The id is made from what the row is for, so two devices pricing the same
// material for the same supplier write the same row, and a save sent twice
// is the same save. The database refuses a second row for the pair
// (master_supplier_prices_one_per_supplier), which this mirrors.

export const STALE_AFTER_MONTHS = 3;

const norm = (s) => String(s || "").trim().toLowerCase();

// The id is a fingerprint (cyrb53, 53 bits) of those four, not the words
// themselves: a name can hold a comma, a bracket or a quote, and an id
// travels in a request's address when lines are deleted.
function fingerprint(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function priceId(listName, name, grade, supplierId) {
  return "sp-" + fingerprint([listName, norm(name), norm(grade), supplierId].join("\n"));
}

export function isFor(p, listName, name, grade) {
  return p.listName === listName && norm(p.name) === norm(name) && norm(p.grade) === norm(grade);
}

export function pricesFor(prices, listName, name, grade) {
  return (prices || []).filter((p) => isFor(p, listName, name, grade));
}

// Older than three months: shown red, still counted (his answer: keep it).
export function isStale(setAt, now = new Date()) {
  const at = new Date(setAt);
  if (!setAt || isNaN(at)) return true;
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - STALE_AFTER_MONTHS);
  return at < limit;
}

// The lowest price above nothing; of two the same, the one set last.
export function cheapest(list) {
  let best = null;
  for (const p of list || []) {
    if (!(Number(p.price) > 0)) continue;
    if (!best || p.price < best.price || (p.price === best.price && String(p.setAt) > String(best.setAt))) best = p;
  }
  return best;
}

// What a material costs, for every screen that reads a price: the lowest
// of its supplier prices and the price with no supplier (`basePrice`, the
// material's own row), nothing-prices left out. With no supplier lines it
// is the material's own price, as it always was.
export function listPrice(lines, basePrice) {
  const base = Number(basePrice) || 0;
  const best = cheapest(lines);
  if (!best) return base;
  return base > 0 && base < best.price ? base : best.price;
}

// A section's lines: its own material's, or, when that material has none,
// the ones filed under no material, which stand in for any (as the
// section rows themselves do, findSectionEntry in App.jsx).
export function sectionLines(prices, name, grade) {
  const exact = pricesFor(prices, "sections", name, grade);
  return exact.length || !norm(grade) ? exact : pricesFor(prices, "sections", name, "");
}

// Adds the supplier's price for a material, or changes it. Every change
// restamps who and when, which is what the red age goes by.
export function setPrice(prices, { listName, name, grade = "", supplierId, price, setBy = "", now = new Date() }) {
  if (!supplierId || !norm(name)) return prices || [];
  const id = priceId(listName, name, grade, supplierId);
  const row = {
    id, listName, name: String(name).trim(), grade: String(grade || "").trim(), supplierId,
    price: Number(price) || 0, setBy, setAt: now.toISOString(),
  };
  const list = prices || [];
  return list.some((p) => p.id === id) ? list.map((p) => (p.id === id ? row : p)) : [...list, row];
}

export function removePrice(prices, id) {
  return (prices || []).filter((p) => p.id !== id);
}

// Hands a price line to another supplier. Refused (the same list comes
// back) when that supplier already has a line for the material.
export function changeSupplier(prices, id, supplierId) {
  const list = prices || [];
  const row = list.find((p) => p.id === id);
  if (!row || !supplierId || row.supplierId === supplierId) return list;
  const newId = priceId(row.listName, row.name, row.grade, supplierId);
  if (list.some((p) => p.id === newId)) return list;
  return list.map((p) => (p.id === id ? { ...p, id: newId, supplierId } : p));
}

// A material renamed, or a section moved to another material: its prices
// go with it. `from.grade` left out means every material of that size (a
// size renamed through its boxes). A line that would land on one already
// there is dropped: the one already there is what the screen showed.
export function movePrices(prices, listName, from, to) {
  const list = prices || [];
  const moving = (p) =>
    p.listName === listName && norm(p.name) === norm(from.name) && (from.grade === undefined || norm(p.grade) === norm(from.grade));
  const staying = new Set(list.filter((p) => !moving(p)).map((p) => p.id));
  const out = [];
  for (const p of list) {
    if (!moving(p)) { out.push(p); continue; }
    const name = to.name !== undefined ? String(to.name).trim() : p.name;
    const grade = to.grade !== undefined ? String(to.grade || "").trim() : p.grade;
    const id = priceId(listName, name, grade, p.supplierId);
    if (staying.has(id)) continue;
    staying.add(id);
    out.push({ ...p, id, name, grade });
  }
  return out;
}

export function dropPrices(prices, listName, name, grade) {
  return (prices || []).filter((p) => !isFor(p, listName, name, grade));
}

// To and from the table's columns.
export const priceFromRow = (r) => ({
  id: r.id, listName: r.list_name, name: r.name, grade: r.grade || "", supplierId: r.supplier_id,
  price: Number(r.price) || 0, setBy: r.set_by || "", setAt: r.set_at,
});
export const priceToRow = (p) => ({
  id: p.id, list_name: p.listName, name: p.name, grade: p.grade || "", supplier_id: p.supplierId,
  price: p.price || 0, set_by: p.setBy || "", set_at: p.setAt,
});
