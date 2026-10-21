import { useState } from "react";
import { C } from "../theme.js";
import UnitInput from "../UnitInput.jsx";
import { readPrice } from "./twoPrice.js";

// A number that is saved once, on leaving the box or pressing Enter:
// Stock Manager's kg/m, density and price boxes, and the requisition price.
// Those used to write the master list on every keystroke, each keystroke
// its own save, so an earlier one could land last ("12" kept where 125 was
// typed); a leading 0 blanked the box and a comma was refused.
//
// While somebody types, the box shows their own text. Otherwise it shows
// the stored value, so a change made elsewhere shows up and is never
// written back. Empty text saves 0. Unreadable text is outlined red and
// nothing is saved.
//
//   value     the stored number (0 or blank shows empty)
//   onCommit  called with the new number, only when it differs
//   prefix / suffix  a unit shown in grey inside the box ("R", "mm", "kg/m")
export default function NumberBox({ value, onCommit, style, title, placeholder = "0", prefix, suffix }) {
  const [draft, setDraft] = useState(null);
  const stored = Number(value) || 0;
  const typed = draft == null ? null : readPrice(draft);
  const bad = draft != null && typed == null;

  function commit() {
    if (draft == null || typed == null) return;
    if (typed !== stored) onCommit(typed);
    setDraft(null);
  }

  return (
    <UnitInput
      prefix={prefix}
      suffix={suffix}
      type="text"
      inputMode="decimal"
      value={draft != null ? draft : stored === 0 ? "" : String(stored)}
      placeholder={placeholder}
      title={bad ? `"${draft}" is not a number, so nothing has been changed.` : title}
      style={{ ...style, ...(bad ? { outline: `1px solid ${C.danger}` } : {}) }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}
