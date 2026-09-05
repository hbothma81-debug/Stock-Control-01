import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, S } from "./theme.js";

// One line in a book of records -- a delivery note, an invoice request, a
// generated document, a usage entry, a drawing.
//
// These screens are read far more often than they are acted on, and
// almost always to find one thing. Showing every card in full meant
// scrolling past six lines of detail for every record on the way to the
// one that mattered. So the line carries what you scan by, and the detail
// waits behind the chevron.
//
// Deliberately not the same component as Section: a Section is a heading
// over a group, this is a row inside one. They look related because they
// are, but a heading that behaves like a row would be worse than either.

export default function RecordRow({ title, summary, right, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ ...S.reqCard, padding: "8px 10px" }}>
      <button
        type="button"
        className="stk-btn"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "transparent",
          border: "none",
          color: C.text,
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
          flexWrap: "wrap",
          font: "inherit",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
        {summary != null && (
          <span style={{ flex: 1, minWidth: 0, color: C.muted, fontSize: 13.5 }}>{summary}</span>
        )}
        {right != null && <span style={{ flexShrink: 0 }}>{right}</span>}
        <ChevronDown
          size={16}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}
        />
      </button>

      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>{children}</div>
      )}
    </div>
  );
}
