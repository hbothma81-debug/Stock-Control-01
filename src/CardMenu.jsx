import { useState, useEffect, useRef } from "react";
import { MoreVertical } from "lucide-react";
import { C, S } from "./theme.js";

// The ⋮ at a card's top right, for the actions used now and then. Heinrich,
// 21 Oct 2026: "the app is a bit too busy ... we need to simplify" -- a rare
// button goes in here rather than across the card. The control for the
// common path stays on the card itself.
//
// items: [{ label, icon, onClick }]. Closes on a pick, a click outside or
// Escape.
//
// fixed: measure the button and pin the list to the window instead of to
// the card. For a ⋮ inside a sheet that scrolls sideways, where a list
// hanging off the card is cut off at the edge of the scrolling box.
export default function CardMenu({ items, title = "More", fixed = false }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        className="stk-btn"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={() => {
          if (!open && fixed && ref.current) {
            const r = ref.current.getBoundingClientRect();
            setAt({ top: Math.round(r.bottom + 4), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
          }
          setOpen((o) => !o);
        }}
        style={{ background: "none", border: "none", color: C.muted, padding: 4, cursor: "pointer", display: "flex" }}
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div
          style={{
            ...S.stockDropdown,
            left: "auto",
            right: 0,
            minWidth: 180,
            ...(fixed && at ? { position: "fixed", top: at.top, right: at.right } : {}),
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className="stk-btn"
              style={{ ...S.stockDropdownItem, display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
