// The section picker's list, built from real structural stock.
//
// One option per stock line under Structural Steel: the section, its
// grade (mild steel or stainless is the grade), its length, and what is
// free to take. Free is the shelf count less what is reserved -- for
// other jobs, and for this job, shown apart so the nester takes what was
// set aside for this job before anything else. Those lines come first.
//
// Pure: takes the stock rows and the allocation rows, returns options
// for TypeToFind ({ value, label, hint } plus what the screens need).
// No database, so it is tested in a second.

// What is stored on the program: the section and the grade as one line,
// the way a plate program stores "3mm MS".
export function materialText(item) {
  return [item?.name, item?.grade]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(" ");
}

const remaining = (a) => Math.max(0, Number(a.qty_allocated) - Number(a.qty_used));

// `sectionRows` is the Structural Steel master list ({ name, type }).
// The kind of section -- square tube, round bar -- is not on the stock
// line itself; it is looked up by name there, the same way the stock
// screens do it. Given none, options simply carry no kind and the
// picker drops that narrower.
export function stockOptions(items, allocations, jobId, sectionRows) {
  const kindOf = (name) => {
    const hit = (sectionRows || []).find((e) => (e.name || "").toLowerCase() === (name || "").toLowerCase());
    return hit ? hit.type || "" : "";
  };
  const live = (allocations || []).filter((a) => a.status !== "released");
  const rows = (items || []).filter((it) => it.mainCat === "structural");
  const options = rows.map((it) => {
    const mine = live.filter((a) => a.item_id === it.id && a.job_id === jobId).reduce((n, a) => n + remaining(a), 0);
    const others = live.filter((a) => a.item_id === it.id && a.job_id !== jobId).reduce((n, a) => n + remaining(a), 0);
    const available = Math.max(0, Number(it.qty || 0) - mine - others);
    // Structural stock keeps its length in metres, as everywhere else in
    // the app ("6m lengths").
    const bits = [it.name, it.grade, it.length ? `${it.length}m` : ""].map((s) => String(s || "").trim()).filter(Boolean);
    const stock =
      mine > 0
        ? `${mine} set aside for this job` + (available > 0 ? `, ${available} more available` : "")
        : `${available} available`;
    return {
      value: String(it.id),
      label: `${bits.join(" · ")} · ${stock}`,
      hint: mine > 0 ? "set aside" : available === 0 ? "none" : "",
      item: it,
      kind: kindOf(it.name),
      material: materialText(it),
      setAside: mine,
      available,
    };
  });
  options.sort(
    (a, b) =>
      (b.setAside > 0) - (a.setAside > 0) ||
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
  );
  return options;
}

// The option a stored material line points at, for pre-filling a box:
// "SHS 50x50x3mm 304" finds the SHS 50x50x3mm line in grade 304. The
// first match wins when several lengths carry the same section.
export function optionForMaterial(options, material) {
  const want = String(material || "").trim().toLowerCase();
  if (!want) return null;
  return (options || []).find((o) => o.material.toLowerCase() === want) || null;
}
