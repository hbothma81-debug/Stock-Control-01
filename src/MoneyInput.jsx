// A price box with a grey R fixed inside its left edge, so what is typed
// reads the same as every shown figure ("R 1,234.56"). Heinrich, 21 Oct 2026.
//
// Drop-in for <input>: every prop goes to the input. Width, flex and margins
// from `style` move to the wrapper so the box still sits where it did.

import { C } from "./theme.js";

const OUTER = ["width", "minWidth", "maxWidth", "flex", "flexGrow", "flexShrink", "flexBasis", "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "alignSelf"];

export default function MoneyInput({ style = {}, ...props }) {
  const outer = { position: "relative", display: "inline-flex", alignItems: "center", boxSizing: "border-box" };
  const inner = { ...style, paddingLeft: 24, width: "100%", boxSizing: "border-box" };
  for (const k of OUTER) {
    if (k in style) {
      outer[k] = style[k];
      if (k !== "width") delete inner[k];
    }
  }
  if (!("width" in style)) outer.width = "100%";
  return (
    <span style={outer}>
      <span aria-hidden style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: style.fontSize || 14, pointerEvents: "none", lineHeight: 1 }}>
        R
      </span>
      <input {...props} style={inner} />
    </span>
  );
}
