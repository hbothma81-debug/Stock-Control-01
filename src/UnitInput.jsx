// A number box with its unit fixed in grey inside the box: "R" on the left
// for money, "mm", "m", "kg", "kg/m" or "m²" on the right for sizes and
// weights, so what is typed reads like every shown figure.
// Heinrich, 21 Oct 2026: R first, then "the same grey for mm and m".
//
// Drop-in for <input>: every prop goes to the input. Width, flex and margins
// from `style` move to the wrapper so the box still sits where it did.

import { C } from "./theme.js";

const OUTER = ["width", "minWidth", "maxWidth", "flex", "flexGrow", "flexShrink", "flexBasis", "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "alignSelf"];

export default function UnitInput({ prefix, suffix, style = {}, ...props }) {
  const outer = { position: "relative", display: "inline-flex", alignItems: "center", boxSizing: "border-box" };
  const inner = { ...style, boxSizing: "border-box", width: "100%" };
  // Room for the unit, and a fixed-width box grows by the same amount so
  // the typing space stays what it was (a 70px kg/m box kept "3.25" whole).
  const left = prefix ? 9 + 8 * prefix.length + 7 : 0;
  const right = suffix ? 9 + 8 * suffix.length + 4 : 0;
  if (left) inner.paddingLeft = left;
  if (right) inner.paddingRight = right;
  for (const k of OUTER) {
    if (k in style) {
      outer[k] = style[k];
      if (k !== "width") delete inner[k];
    }
  }
  if (!("width" in style)) outer.width = "100%";
  else if (typeof style.width === "number") outer.width = style.width + left + right - 10;
  const tag = (side, text) => (
    <span aria-hidden style={{ position: "absolute", [side]: 9, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: style.fontSize || 14, pointerEvents: "none", lineHeight: 1, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
  return (
    <span style={outer}>
      {prefix ? tag("left", prefix) : null}
      <input {...props} style={inner} />
      {suffix ? tag("right", suffix) : null}
    </span>
  );
}
