// The floor's printed sheet for a tube program.
//
// Page 1 is the whole program at a glance: the number, big; what to draw
// from stores, in the stock manager's words; every part with its mark,
// drawing, length, how many, a tick box and room for notes. Then a page
// per nest (two to a page when both fit): how many tubes to cut it on,
// a box to tick per tube, what comes off each tube, and the offcut left.
//
// The mark is the tube software's own part number, so a problem on the
// floor can be found in the software by the same number. Marks repeat
// between programs; the program number on every page keeps them apart.
//
// The drawing is the software's part name, which is the drawing number.
// When the part is also a line on the job, that line's stock code sits
// beside it.
//
// Programs made before the nests were kept (setup-tube-laser-nests.sql)
// print page 1 only, with the parts from the program's own list.
//
// `printModel` is pure and tested; `printNestingSheet` draws it.

const text = (v) => (v == null ? "" : String(v).trim());
const lower = (v) => text(v).toLowerCase();

// 2525 -> "2 525", 2802.4 -> "2 802.4". A plain space: the PDF's
// standard font has no narrow space, and a comma reads as a decimal here.
export function fmtMm(n) {
  const v = Number(n);
  if (n == null || n === "" || !Number.isFinite(v)) return "";
  const r = Math.round(v * 10) / 10;
  const [whole, dec] = String(Math.abs(r)).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (r < 0 ? "-" : "") + grouped + (dec ? "." + dec : "");
}

// "Round tube R19.05mm_Nest 3" -> "Nest 3".
export function nestLabel(name, i) {
  const m = /nest\s*(\d+)/i.exec(text(name));
  return m ? `Nest ${m[1]}` : `Nest ${i + 1}`;
}

export function printModel(program, jobLines) {
  const p = program || {};
  const nests = Array.isArray(p.nests) ? p.nests : [];
  const jobs = (p.jobs || []).filter((l) => l.job_id);
  const jobIds = new Set(jobs.map((l) => l.job_id));
  const lines = (jobLines || []).filter((l) => jobIds.has(l.job_id));
  const jobNumberOf = (jobId) => jobs.find((l) => l.job_id === jobId)?.job_number || "";

  // The job line a part is, by name. Parts under a line first, since that
  // is where the import puts them; a plain line only when it is the one.
  function lineFor(name) {
    const hits = lines.filter((l) => lower(l.description) === lower(name));
    const child = hits.filter((l) => l.parent_quote_item_id);
    const pick = child.length ? child : hits;
    return pick.length === 1 ? pick[0] : null;
  }

  // The software's number for each part, from wherever it was kept.
  const markOf = new Map();
  for (const n of nests) for (const pt of n.parts || []) if (pt.id != null && !markOf.has(lower(pt.name))) markOf.set(lower(pt.name), pt.id);
  for (const pt of p.parts || []) if (pt.id != null && !markOf.has(lower(pt.name))) markOf.set(lower(pt.name), pt.id);

  function describe(name, length) {
    const line = lineFor(name);
    return {
      mark: markOf.has(lower(name)) ? String(markOf.get(lower(name))) : "",
      drawing: text(name),
      code: text(line?.stock_code),
      job: jobs.length > 1 && line ? jobNumberOf(line.job_id) : "",
      length: length == null ? null : Number(length),
    };
  }

  // Page 1's part list: the program's own list when it has one; otherwise
  // added up from the nests (the import keeps the nests even when the
  // parts were not put on the job).
  let totals;
  if ((p.parts || []).length) {
    totals = p.parts.map((pt) => ({ name: pt.name, qty: Number(pt.qty) || 0, length: pt.length }));
  } else {
    const byName = new Map();
    for (const n of nests) {
      const tubes = Number(n.qty) || 0;
      for (const pt of n.parts || []) {
        const key = lower(pt.name) + "|" + (pt.length ?? "");
        const have = byName.get(key) || { name: pt.name, qty: 0, length: pt.length };
        have.qty += (Number(pt.qty) || 0) * tubes;
        byName.set(key, have);
      }
    }
    totals = [...byName.values()];
  }
  const parts = totals
    .map((t) => ({ ...describe(t.name, t.length), qty: t.qty }))
    .sort((a, b) => (Number(a.mark) || Infinity) - (Number(b.mark) || Infinity) || a.drawing.localeCompare(b.drawing));

  const lengths = Math.max(1, Number(p.sheets_required) || 1);
  const tubeLength = nests.map((n) => Number(n.tubeLength)).find((v) => v > 0) || null;

  return {
    number: text(p.program_number),
    reference: text(p.nesting_name),
    material: text(p.material),
    jobs: jobs.map((l) => ({ number: l.job_number || "", customer: l.customer || "" })),
    draw: { lengths, material: text(p.material), tubeLength },
    showJob: jobs.length > 1,
    parts,
    nests: nests.map((n, i) => {
      const tubes = Math.max(0, Number(n.qty) || 0);
      return {
        label: nestLabel(n.name, i),
        tubes,
        tubeLength: Number(n.tubeLength) || null,
        remnant: n.remnant == null || n.remnant === "" ? null : Number(n.remnant),
        parts: (n.parts || []).map((pt) => ({
          ...describe(pt.name, pt.length),
          perTube: Number(pt.qty) || 0,
          makes: (Number(pt.qty) || 0) * tubes,
        })),
      };
    }),
  };
}

// ---- drawing ----

// Every size on the sheet in one place, in points. Big, because it is
// read at the machine, not at a desk.
const T = { number: 40, label: 10, title: 22, draw: 16, body: 12, table: 11, length: 14, small: 9 };
const INK = [27, 29, 31];

export async function printNestingSheet(program, jobLines, { orientation = "portrait" } = {}) {
  // Taken by name where it is exported by name: the browser build and the
  // Node build (the sample printouts) hand the default over differently.
  const [pdfMod, tableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const jsPDF = pdfMod.jsPDF || pdfMod.default?.jsPDF || pdfMod.default;
  const autoTable =
    typeof tableMod.default === "function" ? tableMod.default : tableMod.autoTable || tableMod.default?.autoTable || tableMod.default?.default;
  const m = printModel(program, jobLines);
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = 12;
  const R = W - 12;
  const bottom = H - 14;
  const printed = new Date().toLocaleDateString();

  const tableBase = {
    theme: "grid",
    margin: { left: L, right: W - R, bottom: 16 },
    styles: { fontSize: T.table, cellPadding: 2, minCellHeight: 10, valign: "middle", textColor: 20, lineColor: 120, lineWidth: 0.2 },
    headStyles: { fillColor: INK, textColor: 255, fontSize: T.table, minCellHeight: 8 },
  };
  // An empty square in a tick column, drawn into the cell.
  const tickBox = (col) => (data) => {
    if (data.section !== "body" || data.column.index !== col) return;
    const s = 6;
    doc.setDrawColor(40);
    doc.setLineWidth(0.4);
    doc.rect(data.cell.x + (data.cell.width - s) / 2, data.cell.y + (data.cell.height - s) / 2, s, s);
  };

  // ---- page 1: the program at a glance ----
  doc.setFontSize(T.label);
  doc.setFont(undefined, "normal");
  doc.text("TUBE LASER PROGRAM", L, 14);
  doc.text(`Printed ${printed}`, R, 14, { align: "right" });
  doc.setFontSize(T.number);
  doc.setFont(undefined, "bold");
  doc.text(m.number || "(no number)", L, 30);
  let y = 40;
  doc.setFontSize(T.body);
  doc.setFont(undefined, "normal");
  const info = [
    m.reference ? `Reference: ${m.reference}` : null,
    m.jobs.length
      ? `Job${m.jobs.length > 1 ? "s" : ""}: ${m.jobs.map((j) => (j.customer ? `${j.number} (${j.customer})` : j.number)).join(", ")}`
      : "No job on this program",
  ].filter(Boolean);
  for (const line of info) {
    const wrapped = doc.splitTextToSize(line, R - L);
    doc.text(wrapped, L, y);
    y += 6 * wrapped.length;
  }

  // Draw from stores, in a box of its own: the one thing to fetch.
  y += 2;
  const drawText = `${m.draw.lengths} ${m.draw.lengths === 1 ? "length" : "lengths"} of ${m.draw.material || "(no section)"}`;
  const drawSub = m.draw.tubeLength ? `${fmtMm(m.draw.tubeLength)} mm each` : "";
  const boxH = drawSub ? 22 : 16;
  doc.setDrawColor(40);
  doc.setLineWidth(0.6);
  doc.rect(L, y, R - L, boxH);
  doc.setFontSize(T.label);
  doc.text("DRAW FROM STORES", L + 3, y + 5);
  doc.setFontSize(T.draw);
  doc.setFont(undefined, "bold");
  doc.text(drawText, L + 3, y + 12);
  doc.setFont(undefined, "normal");
  if (drawSub) {
    doc.setFontSize(T.body);
    doc.text(drawSub, L + 3, y + 18.5);
  }
  y += boxH + 6;

  if (m.parts.length) {
    const head = ["Mark", "Drawing / description", "Code", "Length mm", "Qty", ...(m.showJob ? ["Job"] : []), "Done", "Notes"];
    const doneCol = head.indexOf("Done");
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [head],
      body: m.parts.map((pt) => [pt.mark, pt.drawing, pt.code, fmtMm(pt.length), pt.qty, ...(m.showJob ? [pt.job] : []), "", ""]),
      // The drawing gets what is left, because it is what wraps. A Job
      // column on a portrait page takes its room from Code and Notes.
      columnStyles: {
        0: { cellWidth: 14, halign: "center", fontStyle: "bold", fontSize: T.length },
        2: { cellWidth: m.showJob && orientation !== "landscape" ? 20 : 26 },
        3: { cellWidth: 26, halign: "right", fontStyle: "bold", fontSize: T.length },
        4: { cellWidth: 16, halign: "right", fontStyle: "bold", fontSize: T.length },
        ...(m.showJob ? { 5: { cellWidth: 22 } } : {}),
        [doneCol]: { cellWidth: 14 },
        [doneCol + 1]: { cellWidth: orientation === "landscape" ? 60 : m.showJob ? 20 : 34 },
      },
      didDrawCell: tickBox(doneCol),
    });
  } else {
    doc.setFontSize(T.body);
    doc.text("No parts are recorded on this program.", L, y + 4);
  }

  // ---- a page per nest, two to a page when both fit ----
  const nestHeight = (n) => {
    const perRow = Math.max(1, Math.floor((R - L) / 11));
    return 26 + Math.ceil(n.tubes / perRow) * 11 + (n.parts.length + 1) * 10 + 24;
  };
  let onPage = 0;
  y = bottom;
  for (const n of m.nests) {
    if (onPage >= 2 || y + nestHeight(n) > bottom) {
      doc.addPage();
      y = 16;
      onPage = 0;
    } else {
      y += 6;
      doc.setDrawColor(150);
      doc.setLineWidth(0.3);
      doc.line(L, y - 3, R, y - 3);
    }
    onPage += 1;

    doc.setFontSize(T.title);
    doc.setFont(undefined, "bold");
    doc.text(`${n.label.toUpperCase()} — cut ${n.tubes} ${n.tubes === 1 ? "tube" : "tubes"}`, L, y + 6);
    doc.setFontSize(T.label);
    doc.setFont(undefined, "normal");
    doc.text(`Program ${m.number}`, R, y + 6, { align: "right" });
    doc.setFontSize(T.body);
    const facts = [
      m.material,
      n.tubeLength ? `tube ${fmtMm(n.tubeLength)} mm` : null,
      n.remnant != null ? `offcut ${fmtMm(n.remnant)} mm per tube` : null,
    ].filter(Boolean);
    doc.text(facts.join("  ·  "), L, y + 13);
    y += 18;

    // A box per tube, numbered, to tick as each one comes off.
    const s = 9;
    const gap = 2;
    const perRow = Math.max(1, Math.floor((R - L + gap) / (s + gap)));
    doc.setFontSize(T.small);
    doc.setDrawColor(40);
    doc.setLineWidth(0.4);
    for (let i = 0; i < n.tubes; i++) {
      const bx = L + (i % perRow) * (s + gap);
      const by = y + Math.floor(i / perRow) * (s + gap);
      doc.rect(bx, by, s, s);
      doc.text(String(i + 1), bx + 1, by + 3);
    }
    y += Math.ceil(n.tubes / perRow) * (s + gap) + 3;

    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [["Mark", "Drawing / description", "Code", "Length mm", "Per tube", "Makes"]],
      body: n.parts.map((pt) => [pt.mark, pt.drawing, pt.code, fmtMm(pt.length), pt.perTube, pt.makes]),
      columnStyles: {
        0: { cellWidth: 14, halign: "center", fontStyle: "bold", fontSize: T.length },
        2: { cellWidth: 26 },
        3: { cellWidth: 26, halign: "right", fontStyle: "bold", fontSize: T.length },
        4: { cellWidth: 20, halign: "right", fontStyle: "bold", fontSize: T.length },
        5: { cellWidth: 18, halign: "right" },
      },
    });
    y = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(T.label);
    doc.text("Notes", L, y);
    doc.setDrawColor(170);
    doc.setLineWidth(0.2);
    doc.line(L, y + 7, R, y + 7);
    doc.line(L, y + 14, R, y + 14);
    y += 16;
  }

  // Every page says which program it belongs to, and which page it is.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(T.small);
    doc.setFont(undefined, "normal");
    doc.text(`Program ${m.number}${m.reference ? ` · ${m.reference}` : ""}`, L, H - 7);
    doc.text(`Page ${i} of ${pages}`, R, H - 7, { align: "right" });
  }

  const fileName = `Program ${m.number || "tube"}.pdf`;
  // Opened in a new tab to print from; where the browser blocks that,
  // saved instead.
  const url = doc.output("bloburl");
  const win = window.open(url, "_blank");
  if (!win) doc.save(fileName);
}
