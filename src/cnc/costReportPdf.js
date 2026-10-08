// The cost report (Heinrich, 8 Oct 2026: "a printout report / pdf export
// button with cost breakdown and wastage"; for ERS only; one button; also
// "material to order and tools to add if a tool is not available, anything
// that can impact cost"). A4 portrait, drawn from the engine's costing
// block as saved with the program (no sums here); the document and its
// table plug-in are handed in, so it is tested with the real thing
// (costReportPdf.test.js). Sections the engine does not send yet are left
// out with a line saying so. The markups and selling price are
// markup.js's, the one copy the Costing tab also shows (Heinrich, 8 Oct
// 2026: the report gets the material / offcut split and the selling price;
// the chips are in the material, not shown as waste).

import { oNumber, rand, wastageRows } from "./cncRules.js";
import { sellingPrice } from "./markup.js";

const L = 14;
const R = 196;
const W = R - L;
const GREY = [238, 236, 230];
const LINE = [190, 190, 190];
const INK = [30, 30, 30];
const MUTED = [110, 110, 110];
const RED = [194, 61, 38];
const SIZE = { title: 15, head: 10.5, body: 8.5, small: 7.5 };
const safe = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/[→]/g, "->");
const num = (v, dp = 0) => (v == null || v === "" ? "-" : Number(v).toLocaleString("en-US", { maximumFractionDigits: dp }));
const minSec = (s) => (s == null ? "-" : `${Math.floor(Number(s) / 60)} min ${Math.round(Number(s) % 60)} s`);

const table = {
  theme: "grid",
  styles: { fontSize: SIZE.body, cellPadding: 1.3, textColor: INK, lineColor: LINE, lineWidth: 0.2, valign: "top" },
  headStyles: { fillColor: GREY, textColor: INK, fontStyle: "bold" },
  margin: { left: L, right: 210 - R },
};

function heading(doc, y, text) {
  if (y > 270) {
    doc.addPage();
    y = 16;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.head);
  doc.setTextColor(...INK);
  doc.text(safe(text), L, y);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(L, y + 1.4, R, y + 1.4);
  return y + 3.5;
}

function pairs(doc, autoTable, y, rows) {
  const body = [];
  for (let i = 0; i < rows.length; i += 2) body.push([rows[i][0], rows[i][1], rows[i + 1]?.[0] ?? "", rows[i + 1]?.[1] ?? ""].map(safe));
  autoTable(doc, { ...table, startY: y, body, columnStyles: { 0: { fontStyle: "bold", fillColor: GREY, cellWidth: 42 }, 2: { fontStyle: "bold", fillColor: GREY, cellWidth: 42 } } });
  return doc.lastAutoTable.finalY + 5;
}

export function costReportData({ program, rev, costing, when = new Date() }) {
  const c = costing || {};
  const s = program?.settings || {};
  return {
    title: program?.part_name || "",
    numbers: oNumber(program?.program_no),
    revision: rev ? `Rev ${rev.rev}${rev.source === "machine_copy" ? " (machine copy)" : ""}` : "",
    customer: program?.customer || "-",
    material: [program?.material, c.material && c.material !== program?.material ? `(cut as ${c.material})` : ""].filter(Boolean).join(" ") || "-",
    stock: program?.stock || "-",
    qty: c.qty ?? s.qty ?? 1,
    when: when.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    c,
    chargeAll: !!(c.charge_all_material ?? c.stock?.charge_all_material ?? s.charge_all_material),
    sell: sellingPrice(costing, s),
  };
}

export function drawCostReport({ doc, autoTable, data }) {
  const { c, sell } = data;
  let y = 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(SIZE.body);
  doc.setTextColor(...MUTED);
  doc.text("EAST RAND SUPPLIES · CNC COST REPORT · FOR ERS ONLY", L, y);
  doc.text(safe(data.when), R, y, { align: "right" });
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.title);
  doc.setTextColor(...INK);
  doc.text(safe(data.title), L, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(SIZE.body);
  doc.setTextColor(...MUTED);
  doc.text(safe(`${data.numbers}  ${data.revision}`), R, y, { align: "right" });
  y += 3;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(L, y, R, y);
  y += 4;

  y = pairs(doc, autoTable, y, [
    ["Customer", data.customer],
    ["Batch quantity", String(data.qty)],
    ["Material", data.material],
    ["Stock", data.stock],
  ]);

  // ---- prices first: what the reader came for
  y = heading(doc, y, "Price");
  y = pairs(doc, autoTable, y, [
    ["Cost per part (batch)", rand(c.price_per_part)],
    ["Selling per part (batch)", rand(sell?.perPart.sell)],
    ["Batch cost", rand(c.batch_total)],
    ["Batch selling", rand(sell?.batch.sell)],
    ["1-off cost incl. setup", rand(c.one_off_price)],
    ["1-off selling", rand(sell?.oneOff?.sell)],
    ["Markup", sell ? `material ${sell.markups.material}%, offcut ${sell.markups.offcut}%; machine time and setup at cost` : "-"],
    ["1-off material", c.one_off_material != null ? rand(c.one_off_material) : "-"],
  ]);

  // ---- time
  y = heading(doc, y, "Machine time");
  y = pairs(doc, autoTable, y, [
    ["Cycle time", minSec(c.cycle_s)],
    ["Time factor", c.time_factor != null ? `x ${c.time_factor}` : "-"],
    ["Machine time per part", minSec(c.machine_s ?? c.part_s)],
    ["Machine rate", c.rate_per_s != null ? `R ${c.rate_per_s}/s (R ${num(Number(c.rate_per_s) * 3600, 2)}/h)` : "-"],
    ["Clampings", num(c.clampings)],
    ["Tool blocks", num(c.tool_blocks)],
    ["Machining per part", rand(c.machining_per_part)],
    ["Setup (first-off)", `${rand(c.first_off)}${c.setup_price != null ? " (setup price per job)" : ""}`],
  ]);

  // ---- material
  y = heading(doc, y, "Material");
  const mat = [
    ["Priced at", c.material_price != null ? (c.material_unit === "billet" ? `R ${c.material_price} a piece` : `R ${c.material_price}${String(c.material_unit || "").replace(/^R/, "")}`) : "-"],
    ["Charged", data.chargeAll ? "all material bought, to this job" : "what the job uses"],
  ];
  if (c.stock) {
    mat.push(
      ["Stock bar", `${num(c.stock.stock_bars_needed)} x ${num(c.stock.stock_length_mm)} mm (${rand(c.stock.stock_bar_cost)} each)`],
      ["Puller bars", `${num(c.stock.puller_bars_needed)} used of ${num(Number(c.stock.puller_bars_per_stock_bar) * Number(c.stock.stock_bars_needed || 0))}, ${num(c.stock.puller_bar_mm)} mm`],
      ["Left over", `${num(c.stock.puller_bars_left)} puller bars, ${num(c.stock.unused_mm)} mm (${rand(c.stock.unused_cost)})`],
      ["Material charged", rand(c.stock.charged_cost)]
    );
  }
  if (c.offcut) {
    mat.push(
      ["Bar / parts per bar", `${num(c.offcut.bar_length_mm)} mm · ${num(c.offcut.parts_per_bar)} per bar`],
      ["Offcut for the order", `${num(c.offcut.batch_offcut_mm ?? c.offcut.offcut_mm, 1)} mm${c.offcut.batch_cost != null ? ` (${rand(c.offcut.batch_cost)})` : ""}`]
    );
  }
  mat.push(["Material per part", rand(c.material_per_part)], ["Material for the batch", rand(c.material_total)]);
  y = pairs(doc, autoTable, y, mat);

  // ---- material and offcut, per part, at cost and selling
  const w = wastageRows(c.wastage, c.material_per_part);
  y = heading(doc, y, "Material and offcut (per part)");
  if (w && sell) {
    const [part, chips, kerf, offcut] = w.rows;
    const kg = [part, chips, kerf].reduce((t, r) => t + (r.kg || 0), 0);
    const p = sell.perPart;
    const bold = (x) => ({ content: safe(x), styles: { fontStyle: "bold" } });
    autoTable(doc, {
      ...table,
      startY: y,
      head: [["", "kg", "Cost", "Selling"]],
      body: [
        [`Material: the part, its chips and saw cut${w.stockMm != null ? ` (${num(w.stockMm, 1)} mm of bar)` : ""}, ${sell.markups.material}%`, num(kg, 3), rand(p.material), rand(p.materialSell)],
        [`Share of the offcut, ${sell.markups.offcut}%`, num(offcut.kg, 3), rand(p.offcut), rand(p.offcutSell)],
        ["Machine time and setup (at cost)", "", rand(p.atCost), rand(p.atCost)],
        [bold(`Per part, batch of ${sell.qty}`), "", bold(rand(p.cost)), bold(rand(p.sell))],
        [bold("Batch"), "", bold(rand(sell.batch.cost)), bold(rand(sell.batch.sell))],
      ].map((r) => r.map((x) => (typeof x === "string" ? safe(x) : x))),
      columnStyles: { 1: { halign: "right", cellWidth: 20 }, 2: { halign: "right", cellWidth: 28 }, 3: { halign: "right", cellWidth: 28 } },
    });
    y = doc.lastAutoTable.finalY + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(SIZE.body);
    doc.setTextColor(...(w.ok === false ? RED : INK));
    doc.text(
      safe(
        `${w.ok === false ? `Does not add up: ${rand(w.total)} against ${rand(w.costed)}.` : `Costed in: material and offcut add up to the material per part, ${rand(w.costed)}.`}  Offcut charged for the batch ${rand(sell.batch.offcut)}.`
      ),
      L,
      y + 3
    );
    y += 9;
  } else if (sell) {
    y = pairs(doc, autoTable, y, [
      [`Material (${sell.markups.material}%)`, `${rand(sell.perPart.material)} cost, ${rand(sell.perPart.materialSell)} selling`],
      ["Machine time and setup", `${rand(sell.perPart.atCost)} at cost`],
    ]);
  } else {
    y = note(doc, y, "No material figures with this price: press Price again on the Costing tab.");
  }

  // ---- to order, tools, what can change the cost
  const order = c.order || null;
  y = heading(doc, y, "To order for this job");
  if (order?.material) {
    const m = order.material;
    y = pairs(doc, autoTable, y, [
      ["Material", m.description || "-"],
      ["Pieces", `${num(m.pieces)} x ${num(m.length_mm)} mm = ${num(m.total_mm)} mm`],
      ["Weight", `${num(m.kg, 2)} kg`],
      ["Cost", rand(m.cost)],
      ...(m.note ? [["Note", m.note], ["", ""]] : []),
    ]);
  } else {
    y = note(doc, y, "Material to order comes with the engine's next update.");
  }
  if (order && Array.isArray(order.tools)) {
    y = heading(doc, y, "Tools to add");
    if (order.tools.length) {
      autoTable(doc, {
        ...table,
        startY: y,
        head: [["Tool", "Why", ""]],
        body: order.tools.map((t) => [safe(t.item), safe(t.why), { content: t.needed ? "NEEDED" : "recommended", styles: { textColor: t.needed ? RED : MUTED, fontStyle: t.needed ? "bold" : "normal" } }]),
        columnStyles: { 2: { cellWidth: 26 } },
      });
      y = doc.lastAutoTable.finalY + 5;
    } else y = note(doc, y, "Every tool needed is on hand.");
  }
  if (Array.isArray(c.impacts)) {
    y = heading(doc, y, "Can change the cost or stop the job");
    if (c.impacts.length) {
      autoTable(doc, {
        ...table,
        startY: y,
        body: c.impacts.map((i) => [{ content: safe(i.kind), styles: { fontStyle: "bold", textColor: i.kind === "stops the job" ? RED : INK } }, safe(i.text)]),
        columnStyles: { 0: { cellWidth: 30 } },
      });
      y = doc.lastAutoTable.finalY + 5;
    } else y = note(doc, y, "Nothing found.");
  }
  // The engine's list of what can change the cost carries its notes too;
  // the notes print on their own only when that list is not sent.
  if (!Array.isArray(c.impacts) && Array.isArray(c.notes) && c.notes.length) {
    y = heading(doc, y, "Engine notes");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(SIZE.body);
    doc.setTextColor(...INK);
    for (const n of c.notes) {
      const lines = doc.splitTextToSize(`-  ${safe(n)}`, W);
      if (y + lines.length * 3.8 > 285) {
        doc.addPage();
        y = 16;
      }
      doc.text(lines, L + 1, y + 3);
      y += lines.length * 3.8 + 0.5;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(SIZE.small);
    doc.setTextColor(...MUTED);
    doc.text(`${safe(data.title)} · ${safe(data.numbers)} · cost report · page ${p} / ${pages}`, R, 291, { align: "right" });
  }
  return { pages };
}

function note(doc, y, text) {
  doc.setFont("helvetica", "italic");
  doc.setFontSize(SIZE.body);
  doc.setTextColor(...MUTED);
  doc.text(safe(text), L, y + 3);
  doc.setFont("helvetica", "normal");
  return y + 8;
}
