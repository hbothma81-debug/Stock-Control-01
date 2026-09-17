import { C, S } from "./theme.js";

// One money figure in a box: a label, the rand amount, and a line under
// it saying what was counted. One file behind every such box, so they
// cannot drift apart: the Jobs list ("On order", "Invoiced in September"),
// Procurement -> Purchase Orders ("Still on order", "Ordered in",
// "Received in") and Records -> Invoicing ("Requested in").
//
// `hint` is the line under the amount ("12 jobs · excluding VAT").
// `note` is a second, optional line for whatever would otherwise make the
// figure read as more than it is ("2 of 12 not priced").
// Boxes go side by side inside FigureRow and wrap on a phone.

export function rand(n) {
  return `R ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FigureRow({ children }) {
  return <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>{children}</div>;
}

export default function FigureBox({ label, value, hint, note }) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: "10px 14px",
        flex: "1 1 220px",
      }}
    >
      <div style={S.label}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{rand(value)}</div>
      {hint && <div style={S.roleHint}>{hint}</div>}
      {note && <div style={S.roleHint}>{note}</div>}
    </div>
  );
}
