// A program's Offcut & wastage tab (Heinrich, 8 Oct 2026: "offcut and
// wastage tabs to see what we are using and to confirm that it is costed
// in"; then one tab, not two). Both read the engine's costing block as saved with the program at
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
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Wastage</div>
        <WastageTab costing={costing} canSeeValue={canSeeValue} />
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

function WastageTab({ costing, canSeeValue }) {
  if (!costing) return <div style={{ color: C.muted, fontSize: 14 }}>{pricedNote(costing)}</div>;
  const w = wastageRows(costing.wastage, costing.material_per_part);
  if (!w) return <div style={{ color: C.muted, fontSize: 14 }}>The engine sent no wastage for this price: press Price again on the Costing tab.</div>;
  const cell = { padding: "4px 8px", borderBottom: `1px solid ${C.border}`, textAlign: "right" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
      <div style={{ color: C.muted, fontSize: 13 }}>Per part. Stock per part {num(w.stockMm, 1)} mm, {num(w.stockKg, 3)} kg.</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ color: C.muted, fontSize: 12.5 }}>
            <th style={{ ...cell, textAlign: "left" }}>Where the steel goes</th>
            <th style={cell}>mm</th>
            <th style={cell}>kg</th>
            {canSeeValue && <th style={cell}>Cost</th>}
          </tr>
        </thead>
        <tbody>
          {w.rows.map((r) => (
            <tr key={r.what}>
              <td style={{ ...cell, textAlign: "left" }}>{r.what}</td>
              <td style={cell}>{r.mm == null ? "" : num(r.mm, 2)}</td>
              <td style={cell}>{num(r.kg, 3)}</td>
              {canSeeValue && <td style={cell}>{rand(r.cost)}</td>}
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={{ ...cell, textAlign: "left" }}>Material used per part</td>
            <td style={cell} />
            <td style={cell}>{num(w.usedKg, 3)}</td>
            {canSeeValue && <td style={cell}>{rand(w.total)}</td>}
          </tr>
        </tbody>
      </table>
      {canSeeValue && w.ok != null && (
        <div style={{ color: w.ok ? C.accentFinished : C.danger, fontWeight: 600 }}>
          {w.ok
            ? `Costed in: the four add up to the material per part, ${rand(w.costed)}.`
            : `Does not add up: the four come to ${rand(w.total)}, the part was costed at ${rand(w.costed)}. Press Price again on the Costing tab.`}
        </div>
      )}
      <div>
        Waste {num(w.wasteKg, 3)} kg a part: <b>{num(w.wastePct, 0)}%</b> of the steel bought.
      </div>
    </div>
  );
}
