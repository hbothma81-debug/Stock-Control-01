// One way to show money, everywhere in the app: "R 1,234.56".
//
// Heinrich, 21 Oct 2026: "R in front of all values throughout the app",
// R space thousands-comma, cents everywhere (no rounded totals).
//
// The locale is fixed to en-US on purpose. A browser set to en-ZA formats
// 1234.5 as "1 234,50" (comma for the decimal point), which read as a
// different number on the Procurement screens before this file existed.

export function rand(n) {
  if (n == null || n === "") return "";
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return `R ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
