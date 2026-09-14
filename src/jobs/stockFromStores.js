// Stock from stores on the job sheet: everything the job's Materials tab
// has set aside, so the storeman can pull it from the one piece of paper.
//
// Mirrors src/jobs/Materials.jsx -- its three groups (no stage yet, then
// stage by stage in flow order, then a stage since taken off the job) and
// its outstanding sum (reserved less used). Change one, change the other,
// or the paper and the screen disagree about what is still to come out.
//
// Handed-back reservations are left off: nothing is coming out of stores
// for them. Fully used ones stay, reading nothing outstanding, so the
// sheet shows everything the tab does.

const num = (v) => Number(v) || 0;

export const outstandingOf = (a) => Math.max(0, num(a.qty_allocated) - num(a.qty_used));

// `stages` is the job's own stages in flow order, no shortage re-cuts --
// the same list the Materials tab is handed.
export function stockFromStoresGroups(allocations, stages) {
  const live = (allocations || []).filter((a) => a.status !== "released");
  const list = stages || [];
  return [
    { title: "For the job, no stage yet", rows: live.filter((a) => !a.process_id) },
    ...list.map((p) => ({ title: p.process_name, rows: live.filter((a) => a.process_id === p.id) })),
    {
      title: "Against a stage no longer on this job",
      rows: live.filter((a) => a.process_id && !list.some((p) => p.id === a.process_id)),
    },
  ].filter((g) => g.rows.length > 0);
}

// Draws the table from `y` and returns where the next thing may start.
// Draws nothing, and hands `y` back unchanged, when nothing is reserved.
// `T` and `tableStyles` are the job sheet's own type scale, so this table
// prints the same size as the ones around it.
export function addStockFromStores(doc, autoTable, { allocations, stages, items, y, leftX, T, tableStyles }) {
  const groups = stockFromStoresGroups(allocations, stages);
  if (groups.length === 0) return y;
  const stockOf = (a) => (items || []).find((i) => i.id === a.item_id);
  const codeOf = (a) => String(stockOf(a)?.partNumber || "").trim();
  // Most stores items carry no code, and a column of dashes is noise.
  const withCode = groups.some((g) => g.rows.some((a) => codeOf(a)));
  const o = withCode ? 1 : 0;
  const head = [...(withCode ? ["Code"] : []), "Item", "Reserved", "Taken", "Outstanding", "Pulled"];

  // A heading stranded at the foot of a page with its table overleaf.
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = 18;
  }
  doc.setFontSize(T.heading);
  doc.setFont(undefined, "bold");
  doc.text("Stock from stores", leftX, y + 3);
  doc.setFont(undefined, "normal");
  doc.setFontSize(T.body);

  autoTable(doc, {
    startY: y + 5,
    head: [head],
    body: groups.flatMap((g) => [
      // The stage as a band across the table, so one table carries every
      // group and the columns line up all the way down.
      [{ content: g.title, colSpan: head.length, styles: { fontStyle: "bold", fillColor: [236, 236, 236] } }],
      ...g.rows.map((a) => {
        const s = stockOf(a);
        // Long material is reserved in lengths; say how long, as the tab does.
        const lengths = s?.trackLength && num(s.length) > 0 ? ` · ${num(s.length)} m lengths` : "";
        return [
          ...(withCode ? [codeOf(a) || "—"] : []),
          `${a.item_name || s?.name || "Item"}${lengths}`,
          num(a.qty_allocated),
          num(a.qty_used),
          outstandingOf(a),
          "",
        ];
      }),
    ]),
    theme: "grid",
    ...tableStyles,
    columnStyles: {
      ...(withCode ? { 0: { cellWidth: 26 } } : {}),
      [o + 1]: { cellWidth: 18, halign: "right" },
      [o + 2]: { cellWidth: 16, halign: "right" },
      [o + 3]: { cellWidth: 22, halign: "right", fontStyle: "bold" },
      // An empty box, ticked as each item comes off the shelf.
      [o + 4]: { cellWidth: 14 },
    },
    margin: { left: leftX },
  });
  return doc.lastAutoTable.finalY + 5;
}
