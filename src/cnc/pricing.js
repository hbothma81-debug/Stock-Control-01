// How a CNC program's material is priced (Heinrich, 8 Oct 2026): per kg,
// per metre, or per piece from an outside supplier, chosen per program;
// each bar size of a grade has its own price, kept as typed (R/kg or R/m)
// in cnc_bar_prices (setup-cnc-9-bar-prices.sql); the other unit is worked
// out from the bar's weight. A size with no price of its own uses the
// grade's R/kg (CNC Bar Grades); with neither, nothing is sent and the
// engine costs the bar at R30/kg. No React, no database: pricing.test.js.
//
// The weight per metre mirrors the engine's (ERS TURNING APP quote.py:
// a round section, OD and ID in mm, density in kg/dm3). Change both.

export const PRICED_BY = [
  { value: "kg", label: "Per kg (R/kg)" },
  { value: "m", label: "Per metre (R/m)" },
  { value: "piece", label: "Per piece (outside supplier)" },
];

const round2 = (n) => Math.round(Number(n) * 100) / 100;

// kg in one metre of round bar or tube.
export function kgPerMetre(od, id = 0, density = 7.85) {
  const o = Number(od) || 0;
  const i = Number(id) || 0;
  const d = Number(density) || 7.85;
  if (o <= 0 || i >= o) return 0;
  return ((Math.PI / 4) * (o * o - i * i) * d) / 1000;
}

// The bar a program is cut from, as OD and ID in mm: what the engine says
// it picked (its costing) first, otherwise what was typed.
export function barSizeOf(settings = {}, costing = null) {
  const od = Number(costing?.bar_dia ?? settings?.bar_dia) || 0;
  if (!od) return null;
  const id = Number(costing?.bar_id ?? settings?.bar_id) || 0;
  return { od: round2(od), id: round2(id) };
}

export function sameSize(a, b) {
  return !!a && !!b && Math.abs(Number(a.od) - Number(b.od)) < 0.005 && Math.abs(Number(a.id) - Number(b.id)) < 0.005;
}

// A bar size as the shop says it: "D50", "D71 x 50", "100NB SCH120".
export function sizeLabel(size, pipes = null) {
  if (!size) return "";
  for (const p of pipes || []) {
    if (Math.abs(Number(p.od) - size.od) > 0.05) continue;
    const s = (p.schedules || []).find((x) => Math.abs(Number(x.id) - size.id) < 0.05);
    if (s) return `${p.nb ? `${p.nb}NB` : `${p.nps}"`} SCH${s.sch}`;
  }
  return size.id > 0 ? `D${size.od} x ${size.id}` : `D${size.od}`;
}

// This grade's price row for this bar size, if it has one.
export function findBarPrice(barPrices, grade, size) {
  if (!size || !grade) return null;
  const g = String(grade).toLowerCase();
  return (barPrices || []).find((r) => String(r.grade).toLowerCase() === g && sameSize({ od: r.od, id: r.id_mm }, size)) || null;
}

// A price in both units: the one typed, and the other from the weight.
export function bothUnits(price, unit, kgm) {
  const p = Number(price) || 0;
  if (!p) return { perKg: null, perM: null };
  if (unit === "R/m") return { perM: round2(p), perKg: kgm > 0 ? round2(p / kgm) : null };
  return { perKg: round2(p), perM: kgm > 0 ? round2(p * kgm) : null };
}

// What the engine is sent for the material (material_price, price_unit),
// and where it came from, in words for the Costing tab. Nothing sent means
// the engine's R30/kg.
export function materialPricing({ priceBy = "kg", piecePrice, sizeRow, gradePrice, kgm }) {
  if (priceBy === "piece") {
    if (Number(piecePrice) > 0) return { send: { material_price: round2(piecePrice), price_unit: "billet" }, from: "the price per piece" };
    return { send: {}, from: "no price per piece yet: R30/kg" };
  }
  let units = null;
  let from = "";
  if (sizeRow && Number(sizeRow.price) > 0) {
    units = bothUnits(sizeRow.price, sizeRow.unit, kgm);
    from = `this bar size's price (${sizeRow.unit} as typed)`;
  } else if (Number(gradePrice) > 0) {
    units = bothUnits(gradePrice, "R/kg", kgm);
    from = "the grade's R/kg (no price for this bar size)";
  }
  if (!units) return { send: {}, from: "not priced: R30/kg" };
  if (priceBy === "m") {
    if (units.perM == null) return { send: {}, from: "no bar size known yet for a price per metre: R30/kg" };
    return { send: { material_price: units.perM, price_unit: "R/m" }, from };
  }
  return { send: { material_price: units.perKg, price_unit: "R/kg" }, from };
}
