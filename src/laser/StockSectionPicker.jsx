import { C, S } from "../theme.js";
import TypeToFind from "../TypeToFind.jsx";

// The section box on the tube laser: a type-to-find over real structural
// stock, each line saying its grade, its length and what is free to take
// (see stockOptions.js). A line with nothing on the shelf can still be
// picked -- the section may be on order -- and offers to raise the
// requisition right there for whoever may.
//
//   options       from stockOptions()
//   value         the chosen stock line's id, or ""
//   onChange      called with the chosen option, or null when cleared
//   onRequisition opens the app's requisition form for a stock item
export default function StockSectionPicker({ options, value, onChange, canRequisition, onRequisition, emptyLabel = "Pick…", autoFocus }) {
  const chosen = (options || []).find((o) => o.value === String(value || "")) || null;
  const none = chosen && chosen.available === 0 && chosen.setAside === 0;
  return (
    <div>
      <TypeToFind
        options={options || []}
        value={value || ""}
        onChange={(v) => onChange((options || []).find((o) => o.value === String(v)) || null)}
        emptyLabel={emptyLabel}
        autoFocus={autoFocus}
        maxShown={14}
      />
      {(options || []).length === 0 && (
        <div style={{ ...S.roleHint, marginTop: 4 }}>No structural stock lines yet — add them under the Structural Steel tab.</div>
      )}
      {none && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <span style={{ ...S.roleHint, color: C.danger, marginTop: 0 }}>None in stock.</span>
          {canRequisition && onRequisition && (
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.reqActionBtnMuted, color: C.danger, border: `1px solid ${C.danger}` }}
              onClick={() => onRequisition(chosen.item)}
              title="Raise a requisition for this section"
            >
              Request stock to order
            </button>
          )}
        </div>
      )}
    </div>
  );
}
