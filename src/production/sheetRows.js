// The Production tab's Sheet view: filtering and sorting its rows
// (Heinrich, 22 Oct 2026; plan in docs/PRODUCTION-SHEET-VIEW-PLAN.md).
// A row is one item at the department's stage, built in App.jsx from the
// Production queue; this file only narrows and orders them.

// The columns that carry a filter box under their heading.
export const FILTER_COLUMNS = ["job", "customer", "code", "description", "rep"];

const text = (v) => String(v ?? "").toLowerCase();

// Every box filled in must be found in its column, case ignored.
export function filterRows(rows, filters) {
  const wanted = Object.entries(filters || {})
    .map(([key, value]) => [key, text(value).trim()])
    .filter(([, value]) => value);
  if (wanted.length === 0) return rows;
  return rows.filter((row) => wanted.every(([key, value]) => text(row[key]).includes(value)));
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

// Numbers as numbers, words A to Z with "P-2" before "P-10", blanks last
// whichever way round. Ties keep the order the rows came in (the cards'
// own order: urgent, re-cuts, yours, due date).
export function sortRows(rows, key, dir) {
  if (!key) return rows;
  const sign = dir === "desc" ? -1 : 1;
  const blank = (v) => v === null || v === undefined || v === "";
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const x = a.row[key];
      const y = b.row[key];
      if (blank(x) || blank(y)) return blank(x) === blank(y) ? a.i - b.i : blank(x) ? 1 : -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
      return c === 0 ? a.i - b.i : c * sign;
    })
    .map((r) => r.row);
}

// A heading pressed: A to Z, then Z to A, then back to the cards' order.
export function nextSort(current, key) {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

// Cards or Sheet, remembered per device and per department: "it will work
// for certain departments and not others".
export const VIEW_STORE_KEY = "stk-production-view";

export function readViews(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(VIEW_STORE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function viewFor(views, dept) {
  return views?.[dept] === "sheet" ? "sheet" : "cards";
}
