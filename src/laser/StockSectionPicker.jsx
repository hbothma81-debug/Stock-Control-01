import { useMemo, useState } from "react";
import { C, S } from "../theme.js";
import TypeToFind from "../TypeToFind.jsx";

// The section box on the tube laser: a type-to-find over real structural
// stock, each line saying its grade, its length and what is free to take
// (see stockOptions.js). A line with nothing on the shelf can still be
// picked -- the section may be on order -- and offers to raise the
// requisition right there for whoever may.
//
// Picking a line says which stock it is. It sets nothing aside; that is
// done on the job's Materials tab.
//
// Three narrowers sit above the box, because the whole structural list
// is long and the nester usually knows the shape before the size: the
// kind of section, the grade, and the length on the shelf. They are
// plain selects -- short, fixed sets of choices taken from the lines
// themselves, so a choice that would show nothing is never offered.
//
//   options       from stockOptions()
//   value         the chosen stock line's id, or ""
//   onChange      called with the chosen option, or null when cleared
//   onRequisition opens the app's requisition form for a stock item
export default function StockSectionPicker({ options, value, onChange, canRequisition, onRequisition, emptyLabel = "Pick…", autoFocus }) {
  const all = options || [];
  const chosen = all.find((o) => o.value === String(value || "")) || null;
  const none = chosen && chosen.available === 0 && chosen.setAside === 0;

  const [kind, setKind] = useState("");
  const [grade, setGrade] = useState("");
  const [length, setLength] = useState("");

  // What each narrower can offer, off the lines themselves. Sorted the
  // way the rest of the app sorts a list, numbers read as numbers.
  const choices = useMemo(() => {
    const uniq = (pick) =>
      [...new Set(all.map((o) => String(pick(o.item) ?? "").trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );
    return {
      kinds: [...new Set(all.map((o) => String(o.kind || "").trim()).filter(Boolean))].sort((x, y) =>
        x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" })
      ),
      grades: uniq((it) => it?.grade),
      lengths: uniq((it) => it?.length),
    };
  }, [all]);

  const shown = useMemo(() => {
    const matches = (o) =>
      (!kind || String(o.kind || "").trim() === kind) &&
      (!grade || String(o.item?.grade || "").trim() === grade) &&
      (!length || String(o.item?.length ?? "").trim() === length);
    const list = all.filter(matches);
    // The line already picked stays in the list whatever the narrowers
    // say, or choosing one would blank the box and look like a loss.
    if (chosen && !list.some((o) => o.value === chosen.value)) return [chosen, ...list];
    return list;
  }, [all, kind, grade, length, chosen]);

  const narrowed = !!(kind || grade || length);

  const select = (label, v, setV, list) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 110px", minWidth: 0 }}>
      <span style={{ ...S.roleHint, marginTop: 0 }}>{label}</span>
      <select style={{ ...S.input, padding: "5px 6px", fontSize: 13 }} value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">Any</option>
        {list.map((x) => (
          <option key={x} value={x}>
            {label === "Length" ? `${x}m` : x}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      {all.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {choices.kinds.length > 1 && select("Kind", kind, setKind, choices.kinds)}
          {choices.grades.length > 1 && select("Grade", grade, setGrade, choices.grades)}
          {choices.lengths.length > 1 && select("Length", length, setLength, choices.lengths)}
          {narrowed && (
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.reqActionBtnMuted, alignSelf: "flex-end" }}
              onClick={() => {
                setKind("");
                setGrade("");
                setLength("");
              }}
              title="Show every section again"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <TypeToFind
        options={shown}
        value={value || ""}
        onChange={(v) => onChange(all.find((o) => o.value === String(v)) || null)}
        emptyLabel={emptyLabel}
        autoFocus={autoFocus}
        maxShown={14}
      />

      {narrowed && (
        <div style={{ ...S.roleHint, marginTop: 4 }}>
          {shown.length === 0
            ? "No section matches all three. Clear one of them."
            : `${shown.length} of ${all.length} sections shown.`}
        </div>
      )}

      {all.length === 0 && (
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
