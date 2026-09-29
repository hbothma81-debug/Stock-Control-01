import { useState, useEffect } from "react";
import { S } from "../theme.js";

// A material's short name, on Stock Manager -> Material Types.
//
// Typed, and taken only on leaving the box or Enter. It used to be taken
// at every letter: "MS" was saved as "M" and then as "MS". Now that a
// short name changes every row the material is written on
// (src/manager/materialNames.js), a letter at a time would be two renames.
//
// Emptied is a change like any other: it takes the short name away.
// `onCommit(text)` answers whether the change was made; if it was not
// (refused, or the person said no), the box goes back to what it held.
export default function ShortNameBox({ value, onCommit, busy, style }) {
  const held = String(value || "");
  const [val, setVal] = useState(held);
  useEffect(() => setVal(held), [held]);

  async function commit() {
    if (val.trim() === held.trim()) return setVal(held);
    const done = await onCommit(val.trim());
    if (!done) setVal(held);
  }

  return (
    <input
      value={val}
      placeholder="Short name"
      title="What the material is written as on screens and floor paper. Changing it changes every stock line, section, requisition, cut list, laser program and job line of this material. Purchase orders print the full name."
      disabled={!!busy}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
        if (e.key === "Escape") setVal(held);
      }}
      style={{ ...S.managerFactorInput, width: 130, ...(busy ? { opacity: 0.5 } : {}), ...style }}
    />
  );
}
