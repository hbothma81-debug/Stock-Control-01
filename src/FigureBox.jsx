import { C, S } from "./theme.js";

// One money figure in a box: a label, the rand amount, and a line under
// it saying what was counted. Used on the Jobs list ("On order",
// "Invoiced in September").
//
// It looks the same as the three boxes on Procurement -> Purchase Orders,
// which are still drawn by their own few lines in App.jsx. Whether those
// move onto this file is Heinrich's call (asked 17 Sep 2026); until then,
// a change to how a box looks has to be made in both places.
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
