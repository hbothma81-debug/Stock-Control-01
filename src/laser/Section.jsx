import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, S } from "../theme.js";

// A titled block on the laser screens.
//
// Two jobs. It gives the headings more weight than the ones used
// elsewhere in the app -- these screens are read at a machine, often at
// arm's length, and the old 15px uppercase did not separate one list from
// the next. And it collapses, so finished work can be there without
// filling the screen.
//
// Anything already done starts closed. What is still to do is what the
// person is looking at; what is finished is only there to check.

export default function Section({ title, count, collapsible = false, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = collapsible ? open : true;

  const heading = (
    <>
      <span
        style={{
          fontFamily: S.gradeTitle.fontFamily,
          fontSize: 19,
          fontWeight: 700,
          letterSpacing: "0.01em",
          flex: 1,
          textAlign: "left",
        }}
      >
        {title}
      </span>
      {count != null && <span style={S.gradeCount}>{count}</span>}
      {collapsible && (
        <ChevronDown
          size={18}
          style={{ transform: shown ? "none" : "rotate(-90deg)", transition: "transform .15s", flexShrink: 0 }}
        />
      )}
    </>
  );

  return (
    <div style={{ ...S.gradeBlock, marginTop: 14 }}>
      {collapsible ? (
        <button
          type="button"
          className="stk-grade"
          style={{ ...S.gradeHeader, width: "100%", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}
          onClick={() => setOpen((v) => !v)}
        >
          {heading}
        </button>
      ) : (
        <div
          style={{
            ...S.gradeHeader,
            width: "100%",
            paddingBottom: 8,
            borderBottom: `1px solid ${C.border}`,
            cursor: "default",
          }}
        >
          {heading}
        </div>
      )}
      {shown && <div style={S.gradeItems}>{children}</div>}
    </div>
  );
}
