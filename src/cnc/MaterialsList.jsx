// The CNC tab's Materials: Stock Manager's CNC Bar Grades, the one list of
// CNC materials and their prices (Heinrich, 8 Oct 2026, option A). Prices
// are R/kg. The price box is the grade's own ("no supplier") price; what
// every screen uses is the cheapest of it and the grade's supplier prices,
// shown beside it. A grade with no price is costed at R30/kg by the
// engine. New grades may be added here as on Stock Manager (his answer).
//
// Prices show only with "Can see Rand values"; changing or adding needs the
// CNC Edit tick and Rand values. The saving itself is App's (the master
// list's save queue), handed in as onSavePrice and onAdd.

import { useState } from "react";
import { Plus } from "lucide-react";
import NumberBox from "../manager/NumberBox.jsx";
import { C, S } from "../theme.js";
import { readNumber } from "./cncRules.js";

export default function MaterialsList({ materials, canEdit, canSeeValue, onSavePrice, onAdd }) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState({ name: "", density: "", price: "" });
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input style={S.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search grades…" />
      <div style={{ fontSize: 13, color: C.muted }}>
        The same list as Stock Manager → CNC Bar Grades. A price changed here changes it for every program and the rest of the app.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "6px 12px", alignItems: "center", fontSize: 14 }}>
        <div style={{ color: C.muted, fontSize: 12.5 }}>Grade</div>
        <div style={{ color: C.muted, fontSize: 12.5 }}>kg/dm³</div>
        <div style={{ color: C.muted, fontSize: 12.5 }}>R/kg</div>
        {shown.map((m) => (
          <div key={m.fullName || m.name} style={{ display: "contents" }}>
            <div>
              {m.name}
              {m.fullName && m.fullName !== m.name ? <span style={{ color: C.muted }}> ({m.fullName})</span> : null}
            </div>
            <div>{m.density || "–"}</div>
            <div>
              {!canSeeValue ? (
                "–"
              ) : mayChange ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <NumberBox
                    style={{ ...S.input, width: 90 }}
                    value={m.ownPrice}
                    placeholder="30"
                    title="This grade's own price, saved to CNC Bar Grades"
                    onCommit={(n) => onSavePrice(m.fullName, n)}
                  />
                  {Number(m.price) > 0 && Number(m.price) !== Number(m.ownPrice) && (
                    <span style={{ fontSize: 12.5, color: C.muted }}>uses R {m.price} (cheapest supplier)</span>
                  )}
                  {!(Number(m.price) > 0) && <span style={{ fontSize: 12.5, color: C.accentRaw }}>not priced: R30</span>}
                </div>
              ) : Number(m.price) > 0 ? (
                `R ${m.price}`
              ) : (
                <span style={{ color: C.accentRaw }}>R 30 (not priced)</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {shown.length === 0 && <div style={S.empty}>No grades{q ? " match" : " yet"}.</div>}

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
          {error && <div style={{ color: C.danger, fontSize: 14, marginTop: 6 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
