// The sums behind the two price boxes on the add-stock form
// (TwoPriceBoxes.jsx): a price per unit (R/m or R/sheet) beside a price
// per kg, joined by the unit's weight. No React, no database.

// What somebody typed, as a number. A comma is taken as the decimal point
// (South African keyboards), spaces are dropped ("1 250,50"). Empty text
// is 0, which clears the price; anything unreadable is null.
export function readPrice(text) {
  const t = String(text ?? "").replace(/\s/g, "").replace(",", ".");
  if (t === "") return 0;
  if (!/^\d*\.?\d*$/.test(t) || t === ".") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// Four decimals are kept on what is stored, so a typed R1500 a sheet
// stored as R/kg still reads R1500.00 when multiplied back.
const round4 = (n) => Math.round(n * 10000) / 10000;

// Both prices from one typed box. `box` is "unit" or "kg"; `kgPerUnit` is
// the weight of one metre or one sheet. The side that cannot be worked
// out without a weight comes back null.
export function bothPrices(box, value, kgPerUnit) {
  const w = kgPerUnit > 0 ? kgPerUnit : 0;
  if (box === "kg") return { perKg: round4(value), perUnit: w ? round4(value * w) : null };
  return { perUnit: round4(value), perKg: w ? round4(value / w) : null };
}

// A stored price as the box shows it: two decimals, blank for none.
export function showPrice(n) {
  return n > 0 ? (Math.round(n * 100) / 100).toFixed(2) : "";
}
