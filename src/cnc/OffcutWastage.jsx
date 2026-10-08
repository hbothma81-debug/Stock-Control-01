// A program's Offcut tab (Heinrich, 8 Oct 2026: "offcut and wastage tabs
// to see what we are using and to confirm that it is costed in"; then one
// tab, not two; then "only wastage I need is offcuts": the chips are steel
// bought and stay in the material, so they are no longer shown as waste). Both read the engine's costing block as saved with the program at
// its batch size (costing.offcut, costing.wastage); no sums here except
// the total line, which shows the four costs add up to the material per
// part (wastageRows in cncRules.js). Rand only with "Can see Rand values".
// The offcut is always charged (his answer), and whole bars are bought per
// order and charged in full: the engine's offcut.batch_cost is all the bar
// the order does not use, offcut_per_part_cost that over the batch, and a
// 1-off pays one whole bar (one_off_material). Heinrich, 8 Oct 2026.

import { C } from "../theme.js";
import { rand, wastageRows } from "./cncRules.js";

const num = (v, dp = 0) => (v == null || v === "" ? "–" : Number(v).toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 }));

function Grid({ rows }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", fontSize: 14 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <div style={{ color: C.muted }}>{k}</div>
          <div>{v}</div>
        </div>
      ))}
    </div>
  );
}

const pricedNote = (costing) =>
  !costing ? "No price yet: open the Costing tab and press Price again." : "";

// The one tab: the offcut first, then where each part's steel goes.
export default function OffcutWastageTab({ costing, canSeeValue }) {
  if (!costing) return <div style={{ color: C.muted, fontSize: 14 }}>{pricedNote(costing)}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Offcut</div>
        <OffcutTab costing={costing} canSeeValue={canSeeValue} />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Material per part</div>
        <MaterialTab costing={costing} canSeeValue={canSeeValue} />
      </div>
    </div>
  );
}

function OffcutTab({ costing, canSeeValue }) {
  if (!costing) return <div style={{ color: C.muted, fontSize: 14 }}>{pricedNote(costing)}</div>;
  const o = costing.offcut;
  if (!o) {
    return (
      <div style={{ color: C.muted, fontSize: 14 }}>
        {costing.material_unit === "billet"
          ? "No bar: the material is bought per piece, so there is no offcut."
          : "No bar length for this job: type the bar length on the Costing tab to see the offcut."}
      </div>
    );
  }
  const rows = [
    ["Bar length", `${num(o.bar_length_mm)} mm`],
    ["Cut per part", `${num(o.cut_mm, 1)} mm`],
    ["Parts per bar", num(o.parts_per_bar)],
    ["Bar puller waste", o.puller_waste_mm ? `${num(o.puller_waste_mm)} mm` : "none"],
    ["Offcut per bar", `${num(o.offcut_mm, 1)} mm · ${num(o.offcut_kg, 3)} kg`],
    ["Bars for the batch", num(o.bars_needed)],
    ...(o.batch_offcut_mm != null ? [["Offcut for the whole order", `${num(o.batch_offcut_mm, 1)} mm (every bar bought, less the parts)`]] : []),
    ["Charged", o.charged ? "Yes, always: the whole bars bought for the order" : "No"],
  ];
  if (canSeeValue) {
    rows.push(["Cost of a bar", rand(o.bar_cost)]);
    if (o.batch_cost != null) rows.push(["Offcut charged for the order", rand(o.batch_cost)]);
    else rows.push(["Offcut cost per bar", rand(o.offcut_cost)]);
    rows.push(["Offcut cost per part", rand(o.offcut_per_part_cost)]);
    if (costing.one_off_material != null) rows.push(["Material for a 1-off (one whole bar)", rand(costing.one_off_material)]);
  }
  return <Grid rows={rows} />;
}

// Each part's material in two: what it takes off the bar (the part, its
// chips and its saw cut) and its share of the offcut; the two add up to
// the material per part it was costed at.
function MaterialTab({ costing, canSeeValue }) {
  const w = wastageRows(costing.wastage, costing.material_per_part);
  if (!w) return <div style={{ color: C.muted, fontSize: 14 }}>The engine sent no material split for this price: press Price again on the Costing tab.</div>;
  const [part, chips, kerf, offcut] = w.rows;
  const sum = (k) => [part, chips, kerf].reduce((t, r) => t + (r[k] || 0), 0);
  const rows = [
    [`Material: the part, its chips and saw cut${w.stockMm != null ? ` (${num(w.stockMm, 1)} mm of bar)` : ""}`, `${num(sum("kg"), 3)} kg${canSeeValue ? ` · ${rand(sum("cost"))}` : ""}`],
    ["Share of the offcut", `${num(offcut.kg, 3)} kg${canSeeValue ? ` · ${rand(offcut.cost)}` : ""}`],
    ["Material per part", `${num(w.usedKg, 3)} kg${canSeeValue ? ` · ${rand(w.total)}` : ""}`],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
      <Grid rows={rows} />
      {canSeeValue && w.ok != null && (
        <div style={{ color: w.ok ? C.accentFinished : C.danger, fontWeight: 600 }}>
          {w.ok
            ? `Costed in: the two add up to the material per part, ${rand(w.costed)}.`
            : `Does not add up: they come to ${rand(w.total)}, the part was costed at ${rand(w.costed)}. Press Price again on the Costing tab.`}
        </div>
      )}
    </div>
  );
}
