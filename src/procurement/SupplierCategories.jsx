// A supplier's categories: the detailed words of what ERS buys from them
// ("Engineering steel (EN8 bar)", "Springs", "Wire forms"), several per
// supplier (Heinrich, 20 Oct 2026: "each supplier will have their
// categories, more than one possible, and they are also searchable with
// the bigger list of categories like we had"). There is no separate list:
// the box suggests every category already on any supplier, and a new one
// is simply typed. Decided first with the Stock Manager conversation on 10
// Sep 2026. The same box on Suppliers -> a supplier's Details tab and on
// Stock Manager -> Suppliers, so the two always agree.

import { X } from "lucide-react";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";

// Every category on any supplier, once each (capitals ignored), A-Z.
export function allSupplierCategories(suppliers) {
  const seen = new Map();
  for (const s of suppliers || []) {
    for (const c of s.categories || []) {
      const key = String(c).trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, String(c).trim());
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function CategoryChips({ value }) {
  if (!value?.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
      {value.map((c) => (
        <span key={c} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.border}`, color: C.muted }}>
          {c}
        </span>
      ))}
    </div>
  );
}

export default function SupplierCategoriesField({ value, options, onChange, canEdit }) {
  const chosen = value || [];
  if (!canEdit) {
    return (
      <div>
        <label style={S.label}>Categories</label>
        {chosen.length ? <CategoryChips value={chosen} /> : <div style={{ color: C.muted, fontSize: 13 }}>None yet.</div>}
      </div>
    );
  }
  const has = (c) => chosen.some((x) => x.toLowerCase() === c.toLowerCase());
  const left = (options || []).filter((o) => !has(o));
  // A typed category that is already on another supplier takes that
  // spelling, so "springs" and "Springs" stay one category.
  function add(text) {
    const typed = String(text || "").trim();
    if (!typed) return;
    const known = (options || []).find((o) => o.toLowerCase() === typed.toLowerCase());
    const c = known || typed.charAt(0).toUpperCase() + typed.slice(1);
    if (!has(c)) onChange([...chosen, c]);
  }
  return (
    <div>
      <label style={S.label}>Categories</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {chosen.map((c) => (
          <span
            key={c}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, padding: "3px 6px 3px 10px", borderRadius: 999, border: `1px solid ${C.accentRaw}`, color: C.accentRaw }}
          >
            {c}
            <button
              type="button"
              className="stk-btn"
              title={`Take ${c} off this supplier`}
              onClick={() => onChange(chosen.filter((x) => x !== c))}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "inline-flex" }}
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <TypeToFind options={left} value="" onChange={add} allowNew placeholder="Add a category: type to find one, or a new one…" />
    </div>
  );
}
