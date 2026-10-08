// A program's Costing tab: machine time, material, the price per part at
// its batch size and the 1-off price, every figure from the engine (its
// costing block); this screen does no sums (Heinrich, 8 Oct 2026).
//
// The batch quantity, bar length and parts per bar are kept with the
// program; changing one prices it again and saves the new price, which is
// what a quote reads. The material price is the grade's on Stock Manager ->
// CNC Bar Grades (R30/kg when it has none), and a price typed here is
// saved to that grade, for every program and the rest of the app.
//
// Money shows only with "Can see Rand values"; changing anything needs the
// CNC Edit tick, and the material price needs Rand values too.

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import NumberBox from "../manager/NumberBox.jsx";
import { C, S } from "../theme.js";
import { recost } from "./cncData.js";
import { costingFigures, rand } from "./cncRules.js";

const minSec = (s) => (s == null ? "–" : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

function Box({ label, value }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", flex: "1 1 140px" }}>
      <div style={{ fontSize: 12.5, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function CostingTab({ program, current, shown, materials, canEdit, canSeeValue, onSaveMaterialPrice, onProgramSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const material = (materials || []).find((m) => m.name === program.material) || null;
  const s = program.settings || {};
  const costing = program.costing || current?.costing || null;
  const f = costingFigures(costing);
  const mayChange = canEdit && !busy && !!current;
  const priceNow = Number(material?.price) > 0 ? Number(material.price) : null;
  const priceChanged = f && priceNow != null && f.materialPrice != null && Math.abs(priceNow - f.materialPrice) > 0.005;

  async function price(changes, materialNow = material) {
    setError("");
    setBusy(true);
    try {
      const costingSettings = { qty: s.qty ?? 1, parts_per_bar: s.parts_per_bar, bar_length: s.bar_length, ...changes };
      for (const k of Object.keys(costingSettings)) if (costingSettings[k] == null || costingSettings[k] === 0) delete costingSettings[k];
      onProgramSaved(await recost({ program, current, material: materialNow, costingSettings }));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {shown && current && shown.id !== current.id && (
        <div style={{ fontSize: 13, color: C.muted }}>The price is for the current revision, rev {current.rev}.</div>
      )}
      {!f && <div style={{ color: C.muted, fontSize: 14 }}>No price yet: set the batch quantity below.</div>}
      {f && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Box label="Machine time per part" value={minSec(f.machineS)} />
            {canSeeValue ? (
              <>
                <Box label="Material per part" value={rand(f.materialPerPart)} />
                <Box label={`Per part, batch of ${f.qty ?? s.qty ?? 1}`} value={rand(f.pricePerPart)} />
                <Box label="1-off incl. setup" value={rand(f.oneOff)} />
              </>
            ) : (
              <Box label="Material per part" value={f.kgPerPart != null ? `${f.kgPerPart} kg` : "–"} />
            )}
          </div>
          {canSeeValue && (
            <div style={{ fontSize: 14 }}>
              Batch total {rand(f.batchTotal)} · material at {f.materialPrice != null ? `R ${f.materialPrice}${f.materialUnit ? f.materialUnit.replace(/^R/, "") : ""}` : "–"}
              {f.barsNeeded != null ? ` · ${f.barsNeeded} bar${f.barsNeeded === 1 ? "" : "s"}` : ""}
            </div>
          )}
          {f.notes.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.muted }}>
              {f.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {canSeeValue && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: 14 }}>Breakdown</summary>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 14px", fontSize: 13, marginTop: 6 }}>
                {Object.entries(costing)
                  .filter(([, v]) => v != null && typeof v !== "object")
                  .map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <div style={{ color: C.muted }}>{k.replace(/_/g, " ")}</div>
                      <div>{String(v)}</div>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </>
      )}

      <div style={S.formGrid}>
        <div>
          <label style={S.label}>Batch quantity</label>
          {canEdit ? (
            <NumberBox style={S.input} value={s.qty ?? 1} placeholder="1" onCommit={(n) => price({ qty: Math.max(1, Math.round(n)) })} />
          ) : (
            <div style={{ fontSize: 15 }}>{s.qty ?? 1}</div>
          )}
        </div>
        <div>
          <label style={S.label}>Material price R/kg ({program.material || "no grade"})</label>
          {canEdit && canSeeValue && material ? (
            <NumberBox
              style={S.input}
              value={material.ownPrice}
              placeholder={priceNow != null ? String(priceNow) : "30 (not priced)"}
              title="Saved to Stock Manager → CNC Bar Grades, for every program"
              onCommit={(n) => {
                onSaveMaterialPrice(material.fullName, n);
                price({}, { ...material, price: n > 0 ? n : material.price });
              }}
            />
          ) : (
            <div style={{ fontSize: 15 }}>{canSeeValue ? (priceNow != null ? `R ${priceNow}` : "R 30 (not priced)") : "–"}</div>
          )}
        </div>
        <div>
          <label style={S.label}>Bar length (mm)</label>
          {canEdit ? (
            <NumberBox style={S.input} value={s.bar_length} placeholder="Engine's choice" onCommit={(n) => price({ bar_length: n })} />
          ) : (
            <div style={{ fontSize: 15 }}>{s.bar_length || "Engine's choice"}</div>
          )}
        </div>
        <div>
          <label style={S.label}>Parts per bar</label>
          {canEdit ? (
            <NumberBox style={S.input} value={s.parts_per_bar} placeholder="Engine's choice" onCommit={(n) => price({ parts_per_bar: Math.round(n) })} />
          ) : (
            <div style={{ fontSize: 15 }}>{s.parts_per_bar || "Engine's choice"}</div>
          )}
        </div>
      </div>
      {priceChanged && canSeeValue && (
        <div style={{ color: C.accentRaw, fontSize: 14 }}>
          {program.material} is R {priceNow}/kg now; this price used R {f.materialPrice}.
        </div>
      )}
      {canEdit && (
        <button type="button" className="stk-btn" style={{ ...S.chip, alignSelf: "flex-start" }} disabled={!mayChange} onClick={() => price({})}>
          <RefreshCw size={13} /> {busy ? "Pricing…" : "Price again"}
        </button>
      )}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
    </div>
  );
}
