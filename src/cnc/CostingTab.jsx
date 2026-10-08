// A program's Costing tab: machine time, material, the price per part at
// its batch size and the 1-off price, every figure from the engine (its
// costing block); this screen does no sums of money (Heinrich, 8 Oct 2026).
//
// Kept with the program: the batch quantity, bar length, parts per bar,
// how the material is priced (Priced by: per kg, per metre, or per piece
// from an outside supplier) and the price per piece. Changing one prices
// the program again and saves the new price, which is what a quote reads.
// Per kg and per metre use the bar size's own price (cnc_bar_prices, kept
// as typed; the other unit worked out from the bar's weight, pricing.js),
// else the grade's R/kg on CNC Bar Grades, else R30/kg.
//
// Money shows only with "Can see Rand values"; changing anything needs the
// CNC Edit tick, and a price needs Rand values too.

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import NumberBox from "../manager/NumberBox.jsx";
import { C, S } from "../theme.js";
import { recost, saveBarPrice } from "./cncData.js";
import { DEFAULT_RATE_PER_S, DEFAULT_SETUP_PRICE, costingFigures, rand, wasteCharged } from "./cncRules.js";
import { PRICED_BY, barSizeOf, bothUnits, findBarPrice, kgPerMetre, materialPricing, sizeLabel } from "./pricing.js";

const minSec = (s) => (s == null ? "–" : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

function Box({ label, value }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", flex: "1 1 140px" }}>
      <div style={{ fontSize: 12.5, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function CostingTab({ program, current, shown, materials, barPrices, pipes, canEdit, canSeeValue, userName, onBarPrices, onProgramSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const material = (materials || []).find((m) => m.name === program.material) || null;
  const s = program.settings || {};
  const priceBy = s.price_by || "kg";
  const costing = program.costing || current?.costing || null;
  const f = costingFigures(costing);
  const charged = wasteCharged(costing);
  const size = barSizeOf(s, costing);
  const kgm = size ? kgPerMetre(size.od, size.id, material?.density) : 0;
  const sizeRow = findBarPrice(barPrices, program.material, size);
  const pricing = materialPricing({ priceBy, piecePrice: s.piece_price, sizeRow, gradePrice: material?.price, kgm });
  const units = sizeRow ? bothUnits(sizeRow.price, sizeRow.unit, kgm) : { perKg: null, perM: null };
  const fallback = Number(material?.price) > 0 ? bothUnits(material.price, "R/kg", kgm) : null;
  const mayPrice = canEdit && canSeeValue && !busy;
  const rateUnit = s.rate_unit === "R/h" ? "R/h" : "R/s";
  // A bar-puller job buys stock bars and cuts them into puller bars: two
  // sections (Heinrich, 8 Oct 2026). Known from the engine's answer
  // (costing.stock) or the program's own holding.
  const stock = costing?.stock || null;
  const puller = !!stock || s.holding === "bar puller";
  const sectionBox = { border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 };
  const num = (v, dp = 0) => (v == null ? "–" : Number(v).toLocaleString(undefined, { maximumFractionDigits: dp }));
  const chargeAllTick = (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: canEdit ? "pointer" : "default" }}>
      <input
        type="checkbox"
        checked={!!s.charge_all_material}
        disabled={!canEdit || busy}
        onChange={(e) => price({ charge_all_material: e.target.checked })}
      />
      Charge all material to this job
    </label>
  );

  async function price(changes) {
    setError("");
    setBusy(true);
    try {
      const costingSettings = {
        qty: s.qty ?? 1,
        parts_per_bar: s.parts_per_bar,
        bar_length: s.bar_length,
        price_by: s.price_by,
        piece_price: s.piece_price,
        setup_price: s.setup_price,
        rate_per_s: s.rate_per_s,
        rate_unit: s.rate_unit,
        stock_length: s.stock_length,
        charge_all_material: s.charge_all_material,
        ...changes,
      };
      for (const k of Object.keys(costingSettings)) if (costingSettings[k] == null || costingSettings[k] === 0 || costingSettings[k] === "" || costingSettings[k] === false) delete costingSettings[k];
      onProgramSaved(await recost({ program, current, material, costingSettings }));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  // A bar size's price typed in either unit is kept as typed, then the
  // program is priced again with it.
  async function setBarPrice(n, unit) {
    setError("");
    if (!size || !material) return;
    try {
      onBarPrices(await saveBarPrice({ grade: material.name, size, price: n, unit, userName }));
      await price({});
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  const unitBox = (unit, value, ph) =>
    mayPrice && size ? (
      <NumberBox style={S.input} value={value ?? 0} placeholder={ph} title={`Saved as ${program.material} ${sizeLabel(size, pipes)}'s price, ${unit}`} onCommit={(n) => setBarPrice(n, unit)} />
    ) : (
      <div style={{ fontSize: 15 }}>{canSeeValue ? (value != null ? `R ${value}` : ph ? `R ${ph}` : "–") : "–"}</div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {shown && current && shown.id !== current.id && (
        <div style={{ fontSize: 13, color: C.muted }}>The price is for the current revision, rev {current.rev}.</div>
      )}
      {!f && <div style={{ color: C.muted, fontSize: 14 }}>No price yet: press Price again below.</div>}
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
              Batch total {rand(f.batchTotal)} · material at{" "}
              {f.materialPrice != null ? (f.materialUnit === "billet" ? `R ${f.materialPrice} a piece` : `R ${f.materialPrice}${f.materialUnit ? f.materialUnit.replace(/^R/, "") : ""}`) : "–"}
              {f.barsNeeded != null ? ` · ${f.barsNeeded} bar${f.barsNeeded === 1 ? "" : "s"}` : ""}
            </div>
          )}
          {canSeeValue && charged && (
            <div style={{ fontSize: 14 }}>
              Offcut and wastage charged: <b>{rand(charged.batch)}</b> for the batch of {charged.qty}, {rand(charged.perPart)} a part
              <span style={{ color: C.muted }}> (chips, saw kerf and the offcut; see Offcut &amp; wastage)</span>
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
          <label style={S.label}>Material priced by</label>
          {canEdit && canSeeValue ? (
            <select style={S.input} value={priceBy} disabled={busy} onChange={(e) => price({ price_by: e.target.value })}>
              {PRICED_BY.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 15 }}>{PRICED_BY.find((p) => p.value === priceBy)?.label}</div>
          )}
        </div>
      </div>

      {canSeeValue && (
        <div style={S.formGrid}>
          <div>
            <label style={S.label}>Setup price per job (R)</label>
            {mayPrice ? (
              <NumberBox
                style={S.input}
                value={s.setup_price}
                placeholder={`${DEFAULT_SETUP_PRICE} (default)`}
                title="Empty: the default R750"
                onCommit={(n) => price({ setup_price: n })}
              />
            ) : (
              <div style={{ fontSize: 15 }}>R {s.setup_price || DEFAULT_SETUP_PRICE}</div>
            )}
          </div>
          <div>
            <label style={S.label}>Machine rate</label>
            {mayPrice ? (
              <div style={{ display: "flex", gap: 6 }}>
                <NumberBox
                  style={{ ...S.input, flex: 1 }}
                  value={s.rate_per_s ? (rateUnit === "R/h" ? Math.round(s.rate_per_s * 3600 * 100) / 100 : s.rate_per_s) : 0}
                  placeholder={rateUnit === "R/h" ? `${Math.round(DEFAULT_RATE_PER_S * 3600)} (default)` : `${DEFAULT_RATE_PER_S} (default)`}
                  title="Empty: the default R0.21/s (R756/h)"
                  onCommit={(n) => price({ rate_per_s: n > 0 ? (rateUnit === "R/h" ? n / 3600 : n) : 0 })}
                />
                <select style={{ ...S.input, width: 82 }} value={rateUnit} disabled={busy} onChange={(e) => price({ rate_unit: e.target.value })}>
                  <option value="R/s">R/s</option>
                  <option value="R/h">R/h</option>
                </select>
              </div>
            ) : (
              <div style={{ fontSize: 15 }}>
                {rateUnit === "R/h" ? `R ${Math.round((s.rate_per_s || DEFAULT_RATE_PER_S) * 3600 * 100) / 100}/h` : `R ${s.rate_per_s || DEFAULT_RATE_PER_S}/s`}
              </div>
            )}
          </div>
        </div>
      )}

      {canSeeValue && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {priceBy === "piece" ? (
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Price per piece from the supplier (R)</label>
                {mayPrice ? (
                  <NumberBox style={S.input} value={s.piece_price} placeholder="Price a piece" onCommit={(n) => price({ piece_price: n })} />
                ) : (
                  <div style={{ fontSize: 15 }}>{s.piece_price ? `R ${s.piece_price}` : "–"}</div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {program.material || "No grade"} {size ? sizeLabel(size, pipes) : ""}
                {size && kgm > 0 ? <span style={{ fontWeight: 400, color: C.muted }}> · {Math.round(kgm * 100) / 100} kg/m</span> : null}
              </div>
              {!size && <div style={{ fontSize: 13, color: C.muted }}>The bar size is known after the first price: press Price again.</div>}
              <div style={S.formGrid}>
                <div>
                  <label style={S.label}>R/kg{priceBy === "kg" ? " (used)" : ""}</label>
                  {unitBox("R/kg", units.perKg, fallback?.perKg != null ? String(fallback.perKg) : "30")}
                </div>
                <div>
                  <label style={S.label}>R/m{priceBy === "m" ? " (used)" : ""}</label>
                  {unitBox("R/m", units.perM, fallback?.perM != null ? String(fallback.perM) : "")}
                </div>
              </div>
            </>
          )}
          <div style={{ fontSize: 13, color: C.muted }}>Priced from {pricing.from}.</div>
        </div>
      )}

      {puller ? (
        <>
          <div style={sectionBox}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Stock bar (as bought)</div>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Stock length (mm)</label>
                {canEdit ? (
                  <NumberBox style={S.input} value={s.stock_length} placeholder="6000 (default)" onCommit={(n) => price({ stock_length: n })} />
                ) : (
                  <div style={{ fontSize: 15 }}>{s.stock_length || 6000}</div>
                )}
              </div>
              <div style={{ alignSelf: "end" }}>{chargeAllTick}</div>
            </div>
            {stock && (
              <div style={{ fontSize: 13.5, display: "flex", flexDirection: "column", gap: 2 }}>
                <div>
                  {num(stock.stock_bars_needed)} stock bar{Number(stock.stock_bars_needed) === 1 ? "" : "s"} of {num(stock.stock_length_mm)} mm, each cut into {num(stock.puller_bars_per_stock_bar)} puller bars ({num(stock.saw_kerf_mm, 1)} mm saw cut)
                </div>
                <div>
                  {num(stock.puller_bars_left)} puller bar{Number(stock.puller_bars_left) === 1 ? "" : "s"} left, {num(stock.unused_mm)} mm unused
                  {canSeeValue && stock.unused_cost != null ? ` (${rand(stock.unused_cost)})` : ""}:{" "}
                  {stock.charge_all_material ? <b>charged to this job</b> : "back to stock, not charged"}
                </div>
                {canSeeValue && (
                  <div style={{ color: C.muted }}>
                    A stock bar costs {rand(stock.stock_bar_cost)}; this job is charged {rand(stock.charged_cost)} of material.
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={sectionBox}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Puller bar (cut from the stock bar)</div>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Puller bar length (mm)</label>
                {canEdit ? (
                  <NumberBox style={S.input} value={s.bar_length} placeholder="Engine's choice (998)" onCommit={(n) => price({ bar_length: n })} />
                ) : (
                  <div style={{ fontSize: 15 }}>{s.bar_length || "Engine's choice"}</div>
                )}
              </div>
              <div>
                <label style={S.label}>Parts per puller bar</label>
                <div style={{ fontSize: 15, paddingTop: 6 }}>{num(costing?.parts_per_bar)}</div>
              </div>
            </div>
            {costing?.offcut && (
              <div style={{ fontSize: 13.5, display: "flex", flexDirection: "column", gap: 2 }}>
                <div>
                  {num(stock?.puller_bars_needed ?? costing.offcut.bars_needed)} puller bars of {num(stock?.puller_bar_mm ?? costing.offcut.bar_length_mm)} mm, {num(costing.offcut.offcut_mm, 1)} mm offcut on each
                  {costing.offcut.puller_waste_mm ? ` (incl. ${num(costing.offcut.puller_waste_mm)} mm puller waste)` : ""}
                </div>
                {costing.offcut.batch_offcut_mm != null && (
                  <div>
                    Offcut for the order {num(costing.offcut.batch_offcut_mm, 1)} mm{canSeeValue && costing.offcut.batch_cost != null ? `, charged ${rand(costing.offcut.batch_cost)}` : ""}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={S.formGrid}>
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
          {priceBy !== "piece" && <div style={{ gridColumn: "1 / -1" }}>{chargeAllTick}</div>}
        </div>
      )}
      {canEdit && (
        <button type="button" className="stk-btn" style={{ ...S.chip, alignSelf: "flex-start" }} disabled={busy || !current} onClick={() => price({})}>
          <RefreshCw size={13} /> {busy ? "Pricing…" : "Price again"}
        </button>
      )}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
    </div>
  );
}
