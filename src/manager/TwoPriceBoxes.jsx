import { useState } from "react";
import { C, S } from "../theme.js";
import { readPrice, bothPrices, showPrice } from "./twoPrice.js";

// The add-stock form's price: a price per unit (R/m or R/sheet) and a
// price per kg side by side. Typing in one shows the other worked out
// (Heinrich, 17 Sep 2026; it replaced one box with an R/m | R/kg toggle).
//
// The box being typed in keeps its own text and is never rewritten, and
// the price is handed over once, on leaving the box or pressing Enter.
// The old box wrote the price on every keystroke and redrew itself from
// the stored number: the text jumped, a leading 0 blanked it, and each
// keystroke was its own save, so an earlier one could land last and
// leave "12" stored where 125 was typed.
//
//   unitLabel  "R/m" or "R/sheet"
//   kgPerUnit  weight of one metre or sheet; 0 or null when not known
//   perUnit    the price per unit now (stored, or worked out by the form)
//   perKg      the price per kg now
//   onCommit   called with { perUnit, perKg }; the side that cannot be
//              worked out without a weight is null. The form stores
//              whichever one its list keeps.
//   unitOff    a reason the per-unit box cannot be used, or ""
//   kgOff      the same for the per-kg box
//
// Give it a `key` of what is being priced, so a half-typed price never
// follows a change of section or material.
export default function TwoPriceBoxes({ unitLabel, kgPerUnit, perUnit, perKg, onCommit, unitOff = "", kgOff = "" }) {
  // null, or { box: "unit" | "kg", text } while somebody is typing.
  const [draft, setDraft] = useState(null);

  const typed = draft ? readPrice(draft.text) : null;
  const worked = draft && typed != null ? bothPrices(draft.box, typed, kgPerUnit) : null;

  function textFor(box) {
    if (draft && draft.box === box) return draft.text;
    if (draft) return worked ? showPrice(box === "unit" ? worked.perUnit : worked.perKg) : "";
    return showPrice(box === "unit" ? perUnit : perKg);
  }

  function commit() {
    if (!draft) return;
    // Unreadable text stays in the box with its warning; nothing is saved.
    if (typed == null) return;
    onCommit(bothPrices(draft.box, typed, kgPerUnit));
    setDraft(null);
  }

  const box = (which, label, off) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={S.label}>{label}</label>
      <input
        type="text"
        inputMode="decimal"
        style={{ ...S.input, ...(off ? { opacity: 0.5 } : {}) }}
        disabled={!!off}
        value={off ? "" : textFor(which)}
        placeholder={off ? "—" : "0.00"}
        onChange={(e) => setDraft({ box: which, text: e.target.value })}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        {box("unit", `Price ${unitLabel}`, unitOff)}
        {box("kg", "Price R/kg", kgOff)}
      </div>
      {draft && typed == null && (
        <div style={{ ...S.roleHint, color: C.danger }}>
          "{draft.text}" is not a number, so the price has not been changed.
        </div>
      )}
      {(unitOff || kgOff) && <div style={S.roleHint}>{unitOff || kgOff}</div>}
    </>
  );
}
