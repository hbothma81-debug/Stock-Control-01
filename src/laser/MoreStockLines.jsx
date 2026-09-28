import { Plus, X } from "lucide-react";
import { S } from "../theme.js";
import TypeToFind from "../TypeToFind.jsx";

// The rows under the tube laser's section box: more lengths and offcuts
// of the same section, each with how many (Heinrich, 28 Sep 2026). A
// nest is often cut off a few full lengths and whatever offcuts are on
// the rack, and each of those is its own stock line.
//
// The first stock line is picked in the section box above, as before.
// These rows offer only that line's section and grade in its other
// lengths: a tube program is one section. The order of the rows is the
// order the lengths come off the shelf as the operator cuts (see
// stockLines.js).
//
// Picking a line here sets nothing aside, the same as the box above.
//
//   options   from stockOptions(), the whole list
//   first     the option picked in the section box, or null
//   rows      [{ value, qty }], value a stock line's id or ""
//   onChange  called with the new rows
//   units     "lengths"
export default function MoreStockLines({ options, first, rows, onChange, units = "lengths" }) {
  if (!first) return null;
  const list = rows || [];
  const same = (options || []).filter((o) => o.material === first.material && o.value !== first.value);
  const taken = (i) => list.filter((_, n) => n !== i).map((r) => r.value);
  const choicesFor = (i) => same.filter((o) => !taken(i).includes(o.value));
  const set = (i, change) => onChange(list.map((r, n) => (n === i ? { ...r, ...change } : r)));
  const canAdd = same.length > list.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {list.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 320px" }}>
            <label style={S.label}>Also cut from</label>
            <TypeToFind
              options={choicesFor(i)}
              value={r.value || ""}
              onChange={(v) => set(i, { value: v ? String(v) : "" })}
              emptyLabel="Pick the length or offcut…"
              maxShown={14}
            />
          </div>
          <div style={{ flex: "0 0 108px" }}>
            <label style={S.label}>How many</label>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              style={S.input}
              value={r.qty}
              onChange={(e) => set(i, { qty: e.target.value })}
              title={`How many ${units} off this stock line`}
            />
          </div>
          <button
            type="button"
            className="stk-btn"
            style={S.iconBtn}
            onClick={() => onChange(list.filter((_, n) => n !== i))}
            title="Take this one off"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {canAdd ? (
        <button
          type="button"
          className="stk-btn"
          style={{ ...S.reqActionBtnMuted, width: "fit-content" }}
          onClick={() => onChange([...list, { value: "", qty: "1" }])}
          title="The same section in another length, or an offcut of it"
        >
          <Plus size={13} /> Add another length or offcut
        </button>
      ) : (
        list.length === 0 && (
          <div style={S.roleHint}>No other length or offcut of {first.material} is in stock.</div>
        )
      )}
      {list.length > 0 && (
        <div style={S.roleHint}>The lengths come off the shelf in this order as they are cut, top row first.</div>
      )}
    </div>
  );
}
