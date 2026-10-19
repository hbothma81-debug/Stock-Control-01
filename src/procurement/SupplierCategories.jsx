// A supplier's broad categories (Steel & sections, Electrical & controls, ...),
// several per supplier, chosen from the short editable list
// master.supplierCategories (setup-procurement-6-supplier-categories.sql).
// The same box on Suppliers -> a supplier's Details tab and on Stock
// Manager -> Suppliers, so the two always agree (Heinrich, 19 Oct 2026).
//
// A chip per category, an x to take one off, and a type-to-find box that
// offers only the list's categories the supplier does not have yet.

import { X } from "lucide-react";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";

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
  const left = (options || []).filter((o) => !chosen.includes(o));
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
      {left.length > 0 && (
        <TypeToFind
          options={left}
          value=""
          onChange={(v) => v && left.includes(v) && onChange([...chosen, v])}
          placeholder="Add a category…"
        />
      )}
    </div>
  );
}
