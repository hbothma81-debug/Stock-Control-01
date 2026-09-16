// The order the floor sees a job's lines and parts in: the Each counts
// on a Production card, Laser Status, the tube packing and nesting
// screens, the packer's To pack list, and the printed job sheet.
//
// Decided with Heinrich on 16 Sep 2026 (JOB-0068, a job with many parts,
// listed in whatever order the database happened to return them):
//   - lines A to Z by name, numbers read as numbers (P-2 before P-10);
//   - a line's parts together under its name, A to Z as well, so the
//     same part name under three different lines is not three identical
//     rows side by side;
//   - a finished part keeps its place, so nobody loses theirs.
//
// The Items tab, delivery notes and invoice requests keep quote order
// (sort_order). That is the customer's order, not the floor's.

// Mirrors byText in App.jsx, the app's one ordering rule for names: case
// ignored, numbers inside the text read as numbers. Change both together.
function byText(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

// The text a row shows. A line with no description shows "Item".
const shownName = (it) => String(it?.description || "Item");

// Two lines or two parts side by side: by name, then the shorter first
// (five parts can share one name and differ only by length), then the
// code, then quote order, then id. The last two mean two rows never swap
// places when the list is loaded again after pressing Log.
export function compareLines(a, b, name = shownName) {
  return (
    byText(name(a), name(b)) ||
    (Number(a?.length_mm) || 0) - (Number(b?.length_mm) || 0) ||
    byText(a?.stock_code, b?.stock_code) ||
    (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0) ||
    String(a?.id ?? "").localeCompare(String(b?.id ?? ""))
  );
}

// A list of lines and parts, grouped the way the floor reads them.
//
//   items     what the screen lists (a stage's lines, or a job's)
//   allItems  the whole job's lines, to find a part's line by id: on a
//             cutting stage the lines themselves are not in `items`
//   name      the text a row shows, when it is not the description
//
// Returns groups in A to Z order of their line:
//   { key, heading, rows: [{ item, indent }] }
// heading is the line's name (its first line only) when its parts are
// listed without the line itself; null otherwise. A line listed with its
// parts comes first in its group, unindented, its parts indented under
// it. A part whose line cannot be found stands on its own.
export function groupJobLines(items, allItems, name = shownName) {
  const list = (items || []).filter(Boolean);
  const byId = new Map((allItems || list).map((it) => [it.id, it]));
  for (const it of list) if (!byId.has(it.id)) byId.set(it.id, it);

  const groups = new Map();
  const groupFor = (key, line) => {
    if (!groups.has(key)) groups.set(key, { key, line, lineListed: false, parts: [] });
    return groups.get(key);
  };
  for (const it of list) {
    const line = it.parent_quote_item_id ? byId.get(it.parent_quote_item_id) : null;
    if (line) groupFor(line.id, line).parts.push(it);
    else groupFor(it.id, it).lineListed = true;
  }

  return [...groups.values()]
    .sort((a, b) => compareLines(a.line, b.line, name))
    .map((g) => ({
      key: g.key,
      heading: g.parts.length > 0 && !g.lineListed ? String(name(g.line)).split("\n")[0].trim() : null,
      rows: [
        ...(g.lineListed ? [{ item: g.line, indent: false }] : []),
        ...[...g.parts].sort((a, b) => compareLines(a, b, name)).map((item) => ({ item, indent: true })),
      ],
    }));
}
