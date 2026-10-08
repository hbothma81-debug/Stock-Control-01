// A CNC program's selling price (Heinrich, 8 Oct 2026): a markup on the
// material and a markup on the offcut, 60% each unless the program says
// otherwise, set on its Costing tab. Machine time and setup are charged at
// cost (only the two markups were asked for).
//
// The cost is the engine's own (ERS TURNING APP quote.py): price_per_part
// = machining_per_part + first_off / qty + material_per_part, and
// material_per_part = finished + chips + saw kerf + offcut share
// (costing.wastage). Here:
//   material = what each part takes off the bar: the part, its chips and
//              its saw cut (the steel inside the bar we buy; never left
//              out of the price, his answer of 8 Oct 2026);
//   offcut   = the rest of material_per_part: the share of the bar end,
//              or more where every bar bought is charged to the job.
// A program with no wastage block (material bought per piece) has no
// offcut: all of it is material. The markups are added on top of the
// engine's cost and nothing else is summed, so the cost here is always
// the engine's. No React, no database: markup.test.js.
//
// The two markups are kept in the program's settings (markup_material,
// markup_offcut: COSTING_KEYS in cncRules.js carries them into every new
// revision; cncData's forEngine never sends them to the engine). The
// Quoting module's CNC line is to read the price from here.

export const DEFAULT_MARKUP = 60;
export const MARKUP_KEYS = { material: "markup_material", offcut: "markup_offcut" };

const n = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const cents = (v) => Math.round(v * 100) / 100;

// A program's markup in %, 60 when it has none of its own. 0 is a markup.
export function markupOf(settings, which) {
  const v = n(settings?.[MARKUP_KEYS[which]]);
  return v == null || v < 0 ? DEFAULT_MARKUP : v;
}

// The engine's material cost split into material and offcut, for one part
// of the batch and for a 1-off, to the cent.
export function materialSplit(costing) {
  const r = rawSplit(costing);
  const c = (x) => ({ material: cents(x.material), offcut: cents(x.offcut) });
  return { perPart: c(r.perPart), oneOff: c(r.oneOff) };
}

// The same, unrounded: every sum is made on these and rounded once.
function rawSplit(costing) {
  const perPart = n(costing?.material_per_part) ?? 0;
  const oneOff = n(costing?.one_off_material) ?? perPart;
  const w = costing?.wastage;
  if (!w) return { perPart: { material: perPart, offcut: 0 }, oneOff: { material: oneOff, offcut: 0 } };
  const physical = Math.min(perPart, (n(w.finished_cost) ?? 0) + (n(w.chips_cost) ?? 0) + (n(w.kerf_cost) ?? 0));
  return {
    perPart: { material: physical, offcut: Math.max(0, perPart - physical) },
    oneOff: { material: Math.min(physical, oneOff), offcut: Math.max(0, oneOff - physical) },
  };
}

// Cost and selling price: per part at the batch size, the batch, a 1-off.
// null when the program has no price yet.
export function sellingPrice(costing, settings) {
  const cost = n(costing?.price_per_part);
  if (cost == null) return null;
  const qty = n(costing.qty) || 1;
  const m = markupOf(settings, "material");
  const o = markupOf(settings, "offcut");
  const split = rawSplit(costing);
  const added = (part) => (part.material * m) / 100 + (part.offcut * o) / 100;
  const batchCost = n(costing.batch_total) ?? cost * qty;
  const oneOffCost = n(costing.one_off_price);
  // Per part, each column adds up to its total as shown, to the cent; the
  // batch adds the markup per part as shown, times the batch.
  const part = {
    cost: cents(cost),
    material: cents(split.perPart.material),
    materialSell: cents(split.perPart.material * (1 + m / 100)),
    offcut: cents(split.perPart.offcut),
    offcutSell: cents(split.perPart.offcut * (1 + o / 100)),
  };
  part.atCost = cents(part.cost - part.material - part.offcut);
  part.sell = cents(part.materialSell + part.offcutSell + part.atCost);
  return {
    qty,
    markups: { material: m, offcut: o },
    split: materialSplit(costing),
    perPart: part,
    batch: { cost: cents(batchCost), offcut: cents(split.perPart.offcut * qty), sell: cents(batchCost + (part.sell - part.cost) * qty) },
    oneOff: oneOffCost == null ? null : { cost: cents(oneOffCost), sell: cents(oneOffCost + added(split.oneOff)) },
  };
}
