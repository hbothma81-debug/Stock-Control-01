// The two boxes over the Quotes and Items quoted tabs (Heinrich, 20 Oct
// 2026: "one for description and one for Supplier ... open all items from
// one supplier at a time"; "only the boxes on top, no pills"): a search
// box for the words, and a type-to-find Supplier box offering only the
// suppliers that have quotes, A to Z, each with its count. Both together
// narrow the list. On one supplier's own page the Supplier box is left off.

import TypeToFind from "../TypeToFind.jsx";
import { S } from "../theme.js";

const nameKey = (s) => String(s || "").trim().toLowerCase();

// The suppliers in `rows` (each with a .supplier_name, or .q.supplier_name
// for items), A to Z, with how many each has.
export function supplierOptions(rows, nameOf, unit) {
  const counts = new Map();
  for (const r of rows || []) {
    const name = String(nameOf(r) || "").trim();
    if (!name) continue;
    const key = nameKey(name);
    const had = counts.get(key);
    counts.set(key, { name: had?.name || name, n: (had?.n || 0) + 1 });
  }
  return [...counts.values()]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
    .map(({ name, n }) => ({ value: name, label: name, hint: `${n} ${unit}${n === 1 ? "" : "s"}` }));
}

// Whether a row's supplier is the one picked (none picked: every row).
export const isSupplier = (name, picked) => !picked || nameKey(name) === nameKey(picked);

export default function QuoteFilters({ search, setSearch, placeholder, supplier, setSupplier, options }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <input
        style={{ ...S.input, flex: "2 1 220px", minWidth: 0, boxSizing: "border-box" }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
      />
      {setSupplier && (
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <TypeToFind options={options} value={supplier} onChange={(v) => setSupplier(v || "")} emptyLabel="All suppliers" />
        </div>
      )}
    </div>
  );
}
