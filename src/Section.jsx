import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, S } from "./theme.js";

// A titled block. Started on the laser screens and now used by
// Procurement too, which is why it lives up here rather than in laser/.
//
// The heading is a pill rather than a line of text, because a heading
// that is also a control has to look like one. Flat text with a small
// arrow reads as a label, and nobody taps a label.
//
// Everything collapses. What is finished starts shut; what is still to do
// starts open.
//
// `right` puts a control on the heading itself -- "Raise PO for all 3"
// belongs on the supplier it applies to, not floating above the list. A
// button cannot sit inside another button, so that case gets a pill built
// out of a row instead. The plain case keeps the markup it always had.

export default function Section({ title, count, collapsible = true, defaultOpen = true, right, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = collapsible ? open : true;

  const activeStyle = shown ? { border: `1px solid ${C.accentRaw}`, background: C.accentTint, color: C.accentRaw } : {};

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

  let head;
  if (right) {
    head = (
      <div style={{ ...S.productionPill, ...activeStyle, padding: 0, overflow: "hidden" }}>
        <button
          type="button"
          className="stk-btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            color: "inherit",
            font: "inherit",
            cursor: collapsible ? "pointer" : "default",
            padding: "10px 8px 10px 16px",
          }}
          onClick={() => collapsible && setOpen((v) => !v)}
        >
          {inner}
        </button>
        <div style={{ paddingRight: 10, flexShrink: 0 }}>{right}</div>
      </div>
    );
  } else if (collapsible) {
    head = (
      <button
        type="button"
        className="stk-btn"
        style={{ ...S.productionPill, cursor: "pointer", color: C.text, ...activeStyle }}
        onClick={() => setOpen((v) => !v)}
      >
        {inner}
      </button>
    );
  } else {
    head = <div style={{ ...S.productionPill, cursor: "default" }}>{inner}</div>;
  }

  return (
    <div style={{ marginTop: 14 }}>
      {head}
      {shown && <div style={{ ...S.gradeItems, marginTop: 8 }}>{children}</div>}
    </div>
  );
}
