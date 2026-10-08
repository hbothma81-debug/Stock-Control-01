// The CNC tab's Materials: Stock Manager's CNC Bar Grades, the one list of
// CNC materials (Heinrich, 8 Oct 2026, option A), each with its bar sizes.
//
// A grade's own price is R/kg ("no supplier" price on the grade); what every
// screen uses is the cheapest of it and the grade's supplier prices, shown
// beside it. Each bar size of a grade may have its own price (his answer B,
// cnc_bar_prices), kept as typed, R/kg or R/m, the other worked out from
// the bar's weight (pricing.js). A size with no price takes the grade's
// R/kg; a grade with no price is costed at R30/kg. New grades and sizes may
// be added here.
//
// Prices show only with "Can see Rand values"; changing or adding needs the
// CNC Edit tick and Rand values. A grade's price and a new grade are saved
// by App (the master list's save queue), handed in as onSavePrice / onAdd.

import { Fragment, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import NumberBox from "../manager/NumberBox.jsx";
import { C, S } from "../theme.js";
import { readNumber } from "./cncRules.js";
import { removeBarPrice, saveBarPrice } from "./cncData.js";
import { bothUnits, kgPerMetre, sizeLabel } from "./pricing.js";

export default function MaterialsList({ materials, barPrices, pipes, canEdit, canSeeValue, userName, onSavePrice, onAdd, onBarPrices }) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState({ name: "", density: "", price: "" });
  const [open, setOpen] = useState({});
  const [newSize, setNewSize] = useState({});
  const [error, setError] = useState("");
  const mayChange = canEdit && canSeeValue;
  const q = search.trim().toLowerCase();
  const shown = [...(materials || [])]
    .filter((m) => !q || m.name.toLowerCase().includes(q) || (m.fullName || "").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

  function add() {
    setError("");
    const name = adding.name.trim();
    if (!name) return;
    if ((materials || []).some((m) => m.name.toLowerCase() === name.toLowerCase() || (m.fullName || "").toLowerCase() === name.toLowerCase())) {
      setError(`${name} is on the list already.`);
      return;
    }
    const density = readNumber(adding.density);
    const price = readNumber(adding.price);
    if (Number.isNaN(density) || Number.isNaN(price)) {
      setError("The weight and the price must be numbers.");
      return;
    }
    onAdd(name, density || 7.85, price || 0);
    setAdding({ name: "", density: "", price: "" });
  }

  async function savePrice(grade, size, price, unit) {
    setError("");
    try {
      onBarPrices(await saveBarPrice({ grade, size, price, unit, userName }));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function addSize(m) {
    const d = newSize[m.name] || {};
    const od = readNumber(d.od);
    const id = readNumber(d.id) || 0;
    const price = readNumber(d.price);
    if (!od || Number.isNaN(od) || Number.isNaN(id) || id >= od || !price || Number.isNaN(price)) {
      setError("A bar size needs its OD, an ID smaller than the OD (empty for solid bar) and a price.");
      return;
    }
    await savePrice(m.name, { od: Math.round(od * 100) / 100, id: Math.round(id * 100) / 100 }, price, d.unit || "R/kg");
    setNewSize((x) => ({ ...x, [m.name]: {} }));
  }

  async function remove(row) {
    setError("");
    try {
      onBarPrices(await removeBarPrice(row.id));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input style={S.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search grades…" />
      <div style={{ fontSize: 13, color: C.muted }}>
        The same list as Stock Manager → CNC Bar Grades. A grade's price changed here changes it for every program and the rest of the app; a
        bar size's price is for that size of that grade.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: "6px 12px", alignItems: "center", fontSize: 14 }}>
        <div />
        <div style={{ color: C.muted, fontSize: 12.5 }}>Grade</div>
        <div style={{ color: C.muted, fontSize: 12.5 }}>kg/dm³</div>
        <div style={{ color: C.muted, fontSize: 12.5 }}>R/kg</div>
        {shown.map((m) => {
          const sizes = (barPrices || [])
            .filter((r) => String(r.grade).toLowerCase() === m.name.toLowerCase())
            .sort((a, b) => a.od - b.od || a.id_mm - b.id_mm);
          const isOpen = !!open[m.name];
          const d = newSize[m.name] || {};
          return (
            <Fragment key={m.fullName || m.name}>
              <button type="button" className="stk-btn" style={{ background: "transparent", border: "none", color: C.text, cursor: "pointer", padding: 0 }} onClick={() => setOpen((o) => ({ ...o, [m.name]: !o[m.name] }))} title="Bar sizes">
                <ChevronDown size={15} style={{ transform: isOpen ? "none" : "rotate(-90deg)" }} />
              </button>
              <div>
                {m.name}
                {m.fullName && m.fullName !== m.name ? <span style={{ color: C.muted }}> ({m.fullName})</span> : null}
                <span style={{ color: C.muted, fontSize: 12.5 }}> · {sizes.length} bar size{sizes.length === 1 ? "" : "s"}</span>
              </div>
              <div>{m.density || "–"}</div>
              <div>
                {!canSeeValue ? (
                  "–"
                ) : mayChange ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <NumberBox style={{ ...S.input, width: 90 }} value={m.ownPrice} placeholder="30" title="This grade's own price, saved to CNC Bar Grades" onCommit={(n) => onSavePrice(m.fullName, n)} />
                    {Number(m.price) > 0 && Number(m.price) !== Number(m.ownPrice) && <span style={{ fontSize: 12.5, color: C.muted }}>uses R {m.price} (cheapest supplier)</span>}
                    {!(Number(m.price) > 0) && <span style={{ fontSize: 12.5, color: C.accentRaw }}>not priced: R30</span>}
                  </div>
                ) : Number(m.price) > 0 ? (
                  `R ${m.price}`
                ) : (
                  <span style={{ color: C.accentRaw }}>R 30 (not priced)</span>
                )}
              </div>
              {isOpen && (
                <div style={{ gridColumn: "2 / -1", border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {sizes.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>No bar sizes priced: every size takes the grade's R/kg.</div>}
                  {sizes.map((r) => {
                    const size = { od: Number(r.od), id: Number(r.id_mm) };
                    const kgm = kgPerMetre(size.od, size.id, m.density);
                    const u = bothUnits(r.price, r.unit, kgm);
                    return (
                      <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13.5 }}>
                        <div style={{ minWidth: 110, fontWeight: 600 }}>{sizeLabel(size, pipes)}</div>
                        <div style={{ color: C.muted, minWidth: 70 }}>{Math.round(kgm * 100) / 100} kg/m</div>
                        {canSeeValue && (
                          <>
                            <span>R/kg</span>
                            {mayChange ? <NumberBox style={{ ...S.input, width: 80 }} value={u.perKg ?? 0} onCommit={(n) => savePrice(m.name, size, n, "R/kg")} /> : <span>{u.perKg ?? "–"}</span>}
                            <span>R/m</span>
                            {mayChange ? <NumberBox style={{ ...S.input, width: 90 }} value={u.perM ?? 0} onCommit={(n) => savePrice(m.name, size, n, "R/m")} /> : <span>{u.perM ?? "–"}</span>}
                            <span style={{ color: C.muted, fontSize: 12 }}>typed as {r.unit}</span>
                          </>
                        )}
                        {mayChange && (
                          <button type="button" className="stk-btn" style={{ ...S.chip, padding: "4px 8px", color: C.danger }} onClick={() => remove(r)} title="Remove this bar size's price">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {mayChange && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13.5 }}>
                      <input style={{ ...S.input, width: 80 }} placeholder="OD" inputMode="decimal" value={d.od ?? ""} onChange={(e) => setNewSize((x) => ({ ...x, [m.name]: { ...d, od: e.target.value } }))} />
                      <input style={{ ...S.input, width: 80 }} placeholder="ID (tube)" inputMode="decimal" value={d.id ?? ""} onChange={(e) => setNewSize((x) => ({ ...x, [m.name]: { ...d, id: e.target.value } }))} />
                      <input style={{ ...S.input, width: 90 }} placeholder="Price" inputMode="decimal" value={d.price ?? ""} onChange={(e) => setNewSize((x) => ({ ...x, [m.name]: { ...d, price: e.target.value } }))} />
                      <select style={{ ...S.input, width: 90 }} value={d.unit || "R/kg"} onChange={(e) => setNewSize((x) => ({ ...x, [m.name]: { ...d, unit: e.target.value } }))}>
                        <option value="R/kg">R/kg</option>
                        <option value="R/m">R/m</option>
                      </select>
                      <button type="button" className="stk-btn" style={S.chip} onClick={() => addSize(m)}>
                        <Plus size={13} /> Add bar size
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
      {shown.length === 0 && <div style={S.empty}>No grades{q ? " match" : " yet"}.</div>}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}

      {mayChange && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Add a grade</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <div>
              <label style={S.label}>Name</label>
              <input style={S.input} value={adding.name} onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))} placeholder="e.g. EN24T" />
            </div>
            <div>
              <label style={S.label}>kg/dm³</label>
              <input style={S.input} value={adding.density} inputMode="decimal" onChange={(e) => setAdding((a) => ({ ...a, density: e.target.value }))} placeholder="7.85" />
            </div>
            <div>
              <label style={S.label}>R/kg</label>
              <input style={S.input} value={adding.price} inputMode="decimal" onChange={(e) => setAdding((a) => ({ ...a, price: e.target.value }))} placeholder="30" />
            </div>
            <button type="button" className="stk-btn" style={S.addBtn} onClick={add} disabled={!adding.name.trim()}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
