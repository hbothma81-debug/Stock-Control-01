import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, S } from "../theme.js";

// A titled block on the laser screens.
//
// The heading is a pill rather than a line of text, because a heading
// that is also a control has to look like one. Flat text with a small
// arrow reads as a label, and nobody taps a label.
//
// Everything collapses. What is finished starts shut; what is still to do
// starts open.

export default function Section({ title, count, collapsible = true, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = collapsible ? open : true;

  const inner = (
    <>
      <span style={{ flex: 1, textAlign: "left", fontSize: 15.5, fontWeight: 700 }}>{title}</span>
      {count != null && <span style={S.gradeCount}>{count}</span>}
      {collapsible && (
        <ChevronDown
          size={16}
          style={{ transform: shown ? "none" : "rotate(-90deg)", transition: "transform .15s", flexShrink: 0 }}
        />
      )}
    </>
  );

  return (
    <div style={{ marginTop: 14 }}>
      {collapsible ? (
        <button
          type="button"
          className="stk-btn"
          style={{
            ...S.productionPill,
            cursor: "pointer",
            color: C.text,
            ...(shown ? { border: `1px solid ${C.accentRaw}`, background: C.accentTint, color: C.accentRaw } : {}),
          }}
          onClick={() => setOpen((v) => !v)}
        >
          {inner}
        </button>
      ) : (
        <div style={{ ...S.productionPill, cursor: "default" }}>{inner}</div>
      )}
      {shown && <div style={{ ...S.gradeItems, marginTop: 8 }}>{children}</div>}
    </div>
  );
}
