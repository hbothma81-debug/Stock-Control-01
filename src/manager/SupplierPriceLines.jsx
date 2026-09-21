import { X } from "lucide-react";
import { C } from "../theme.js";
import TypeToFind from "../TypeToFind.jsx";
import NumberBox from "./NumberBox.jsx";
import { cheapest, isStale, STALE_AFTER_MONTHS } from "./supplierPrices.js";

// Stock Manager: a material's supplier prices, one flat line per supplier
// under the material's own row (Heinrich, 21 Sep 2026: flat lines, never a
// row that opens). A new line is made on the material's own row, by picking
// a supplier beside its price box; these are the lines already there.
//
//   lines      the material's rows of master.supplierPrices
//   suppliers  master.suppliers
//   unit       "R/m" or "R/kg", the price box's hint
//   what       the material in words, for the hints
//   S          the app's styles (managerFactorInput, managerDelete)
const shortDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
};

export default function SupplierPriceLines({ lines, suppliers, unit, what, S, onPrice, onSupplier, onRemove }) {
  if (!lines || lines.length === 0) return null;
  const nameOf = (id) => (suppliers || []).find((s) => s.id === id)?.name || "Supplier no longer on the list";
  const best = lines.length > 1 ? cheapest(lines) : null;
  const sorted = [...lines].sort((a, b) => nameOf(a.supplierId).localeCompare(nameOf(b.supplierId)));
  return sorted.map((p) => {
    const stale = isStale(p.setAt);
    const taken = new Set(lines.filter((x) => x.id !== p.id).map((x) => x.supplierId));
    return (
      <div key={p.id} style={{ flex: "1 1 100%", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, paddingLeft: 18, fontSize: 13 }}>
        <TypeToFind
          style={{ width: 200 }}
          inputStyle={{ ...S.managerFactorInput, width: "100%", padding: "5px 24px 5px 7px", boxSizing: "border-box" }}
          options={(suppliers || []).filter((s) => !taken.has(s.id)).map((s) => ({ value: s.id, label: s.name }))}
          value={p.supplierId}
          onChange={(v) => v && onSupplier(p.id, v)}
          title={`Supplier of ${what}`}
        />
        <NumberBox value={p.price} onCommit={(v) => onPrice(p.supplierId, v)} style={S.managerFactorInput} title={`${unit} from ${nameOf(p.supplierId)}`} />
        <span style={{ color: C.muted }}>{unit}</span>
        <span
          style={{ color: stale ? C.danger : C.muted, fontWeight: stale ? 600 : 400 }}
          title={stale ? `Older than ${STALE_AFTER_MONTHS} months. Still counted when picking the cheapest.` : undefined}
        >
          {shortDate(p.setAt)}
          {p.setBy ? `, ${p.setBy}` : ""}
        </span>
        {best && best.id === p.id && <span style={{ color: C.muted }}>cheapest</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => onRemove(p.id)} title={`Remove ${nameOf(p.supplierId)}'s price for ${what}`}>
          <X size={13} />
        </button>
      </div>
    );
  });
}
