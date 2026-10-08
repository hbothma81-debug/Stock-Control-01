// The setup sheet's paper (A4, portrait): what is drawn where, from the
// sheet's words (setupSheetData.js) and the toolpath frames
// (toolpathGeom.js). The PDF document and its table plug-in are handed in,
// so the layout is tested with the real thing (setupSheetPdf.test.js).
// Laid out as the engine's own sheet (ERS TURNING APP setup_sheet.py):
// page 1 heading, status, facts and the turret; then each side with its
// tool lines and picture; then the checks, warnings and notes; "page n / N"
// on every page. Doubles as the job card (Heinrich, 8 Oct 2026).

import { movePoints, toolColour } from "./toolpathGeom.js";

export const SHEET = { left: 14, right: 196, top: 14, bottom: 283, pageH: 297 };
const W = SHEET.right - SHEET.left;
const SIZE = { title: 16, head: 11, body: 8.5, small: 7.5 };
const GREY = [238, 236, 230];
const LINE = [190, 190, 190];
const INK = [30, 30, 30];
const MUTED = [110, 110, 110];

function hexRgb(hex) {
  const h = String(hex).replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// The PDF's standard fonts print "·" but not arrows or the en-ZA thin space.
const safe = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/[→]/g, "->");

function heading(doc, y, text) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.head);
  doc.setTextColor(...INK);
  doc.text(safe(text), SHEET.left, y);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.line(SHEET.left, y + 1.5, SHEET.right, y + 1.5);
  return y + 4;
}

function room(doc, y, need) {
  if (y + need <= SHEET.bottom) return y;
  doc.addPage();
  return SHEET.top;
}

const tableStyle = {
  theme: "grid",
  styles: { fontSize: SIZE.body, cellPadding: 1.4, textColor: INK, lineColor: LINE, lineWidth: 0.2, valign: "top" },
  headStyles: { fillColor: GREY, textColor: INK, fontStyle: "bold" },
  margin: { left: SHEET.left, right: 210 - SHEET.right },
};

// One side's picture, in a box x, y, w, h (mm), as the Toolpath tab draws it.
export function drawPicture(doc, frame, tools, x, y, w, h) {
  const { view } = frame;
  const vw = view.zMax - view.zMin;
  const vh = view.rMax + 4;
  const s = Math.min(w / vw, (h - 6) / vh);
  const ox = x + (w - vw * s) / 2;
  const oy = y + 6;
  const px = (Z, r) => [ox + (Z - view.zMin) * s, oy + (view.rMax - r) * s];
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  // axis
  doc.setDrawColor(170, 170, 170);
  doc.setLineDashPattern([2, 1], 0);
  doc.line(...px(view.zMin, 0), ...px(view.zMax, 0));
  doc.setLineDashPattern([], 0);
  // raw bar
  const rw = frame.raw;
  const [rx0, ry0] = px(rw.z0, rw.r1);
  doc.setDrawColor(170, 170, 170);
  doc.rect(rx0, ry0, (rw.z1 - rw.z0) * s, (rw.r1 - rw.r0) * s);
  // material left after the side
  doc.setFillColor(222, 220, 214);
  for (const b of frame.blocks) {
    const [bx, by] = px(b.z0, b.r1);
    doc.rect(bx, by, Math.max((b.z1 - b.z0) * s, 0.05), (b.r1 - b.r0) * s, "F");
  }
  // jaws
  if (frame.jaws) {
    const j = frame.jaws;
    const [jx, jy] = px(j.z0, j.r1);
    doc.setFillColor(140, 140, 140);
    doc.setDrawColor(60, 60, 60);
    doc.rect(jx, jy, (j.z1 - j.z0) * s, (j.r1 - j.r0) * s, "FD");
    doc.setFontSize(SIZE.small);
    doc.setTextColor(...INK);
    doc.text("JAWS", jx, jy - 0.8);
  }
  // moves
  for (const m of frame.moves) {
    const pts = movePoints(m, view).map(([Z, r]) => px(Z, r));
    if (pts.length < 2) continue;
    if (m.kind === "G0") {
      doc.setDrawColor(214, 58, 58);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([1.2, 0.9], 0);
    } else {
      doc.setDrawColor(...hexRgb(toolColour(tools, m.tool)));
      doc.setLineWidth(0.35);
      doc.setLineDashPattern([], 0);
    }
    for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  doc.setLineDashPattern([], 0);
  // key and labels
  // The key sits top right, clear of the jaws at the chuck end.
  doc.setFontSize(SIZE.small);
  const kx = x + w - 42;
  let ky = y + 3;
  for (const t of tools) {
    doc.setFillColor(...hexRgb(toolColour(tools, t)));
    doc.rect(kx, ky - 2, 3, 2, "F");
    doc.setTextColor(...INK);
    doc.text(safe(t), kx + 4.5, ky - 0.3);
    ky += 3.2;
  }
  doc.setDrawColor(214, 58, 58);
  doc.setLineDashPattern([1.2, 0.9], 0);
  doc.line(kx, ky - 1, kx + 3, ky - 1);
  doc.setLineDashPattern([], 0);
  doc.text("rapid G0", kx + 4.5, ky - 0.3);
  doc.setTextColor(...MUTED);
  doc.text("chuck side", x + 2, y + h - 1.5);
  doc.text("Z0 (this face)", x + w - 2, y + h - 1.5, { align: "right" });
}

export function drawSetupSheet({ doc, autoTable, data, frames = [], tools = [] }) {
  // ---- heading
  let y = SHEET.top + 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(SIZE.body);
  doc.setTextColor(...MUTED);
  doc.text("EAST RAND SUPPLIES · LEO 1600 SETUP SHEET / JOB CARD", SHEET.left, y);
  doc.text(safe(data.numbers), SHEET.right, y, { align: "right" });
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.title);
  doc.setTextColor(...INK);
  doc.text(safe(data.title), SHEET.left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(SIZE.body);
  doc.setTextColor(...MUTED);
  doc.text(safe(`${data.revision}  ${data.when}`), SHEET.right, y, { align: "right" });
  y += 3;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(SHEET.left, y, SHEET.right, y);
  y += 4;

  // ---- status
  const ok = data.ready;
  doc.setDrawColor(...(ok ? [47, 122, 80] : [194, 61, 38]));
  doc.setLineWidth(0.5);
  doc.rect(SHEET.left, y, W, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SIZE.body + 0.5);
  doc.setTextColor(...(ok ? [47, 122, 80] : [194, 61, 38]));
  doc.text(doc.splitTextToSize(safe(data.status), W - 6)[0], SHEET.left + 3, y + 5.3);
  y += 12;

  // ---- facts, two tables side by side
  const half = (W - 4) / 2;
  const factStyle = { ...tableStyle, columnStyles: { 0: { fontStyle: "bold", fillColor: GREY, cellWidth: 28 } } };
  autoTable(doc, { ...factStyle, startY: y, body: data.left.map(([k, v]) => [safe(k), safe(v)]), tableWidth: half, margin: { left: SHEET.left } });
  const leftEnd = doc.lastAutoTable.finalY;
  autoTable(doc, { ...factStyle, startY: y, body: data.right.map(([k, v]) => [safe(k), safe(v)]), tableWidth: half, margin: { left: SHEET.left + half + 4 } });
  y = Math.max(leftEnd, doc.lastAutoTable.finalY) + 6;

  // ---- turret
  y = heading(doc, y, "Turret T1-T8");
  autoTable(doc, {
    ...tableStyle,
    startY: y,
    head: [["T", "Tool", "Holder / insert", "Speed", "Feed", "Used", "Time"]],
    body: data.turret.map((t) =>
      t.empty
        ? [{ content: `T${t.station}`, styles: { textColor: MUTED, fontStyle: "italic" } }, { content: "empty", colSpan: 6, styles: { textColor: MUTED, fontStyle: "italic" } }]
        : [`T${t.station}`, { content: safe(t.tool), styles: { fontStyle: "bold", textColor: t.used ? INK : MUTED } }, safe(t.holder), safe(t.speed), safe(t.feed), safe(t.sidesText), safe(t.time)]
    ),
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 30 }, 2: { cellWidth: 42 }, 6: { cellWidth: 16, halign: "right" } },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ---- sides
  // Sides from page 2, as many to a page as fit (a side is about 115 mm).
  const PICTURE_H = 68;
  data.sides.forEach((sd, i) => {
    if (i === 0) {
      doc.addPage();
      y = SHEET.top + 4;
    } else {
      y = room(doc, y + 2, 40 + sd.blocks.length * 6 + PICTURE_H);
      if (y === SHEET.top) y += 4;
    }
    y = heading(doc, y, sd.title);
    const facts = [];
    for (let i = 0; i < sd.facts.length; i += 2) facts.push([sd.facts[i][0], sd.facts[i][1], sd.facts[i + 1]?.[0] || "", sd.facts[i + 1]?.[1] || ""].map(safe));
    autoTable(doc, {
      ...tableStyle,
      startY: y,
      body: facts,
      columnStyles: { 0: { fontStyle: "bold", fillColor: GREY, cellWidth: 30 }, 2: { fontStyle: "bold", fillColor: GREY, cellWidth: 30 } },
    });
    y = doc.lastAutoTable.finalY + 2;
    autoTable(doc, {
      ...tableStyle,
      startY: y,
      head: [["N", "T", "Tool", "Speed", "Feed mm/rev", "Time"]],
      body: sd.blocks.length ? sd.blocks.map((b) => [b.n, b.t, b.tool, b.speed, b.feed, b.time].map(safe)) : [[{ content: "No tool lines for this side.", colSpan: 6 }]],
      columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 10 }, 5: { cellWidth: 18, halign: "right" } },
    });
    y = doc.lastAutoTable.finalY + 4;
    const frame = frames.find((f) => f.side === sd.side);
    if (frame) {
      const h = Math.min(PICTURE_H, SHEET.bottom - y);
      if (h > 40) drawPicture(doc, frame, tools, SHEET.left, y, W, h);
      y += h + 4;
    }
  });

  // ---- checks, warnings, notes
  y = room(doc, y, 30);
  y = heading(doc, y + 2, "Checks");
  autoTable(doc, {
    ...tableStyle,
    startY: y,
    body: data.checks.length
      ? data.checks.map((c) => [{ content: c.pass ? "PASS" : "FAIL", styles: { textColor: c.pass ? [47, 122, 80] : [194, 61, 38], fontStyle: "bold" } }, safe(c.name), safe(c.detail)])
      : [[{ content: "No checks failed.", colSpan: 3 }]],
    columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 70 } },
  });
  y = doc.lastAutoTable.finalY + 6;
  for (const [title, items] of [["Warnings", data.warnings], ["Notes", data.notes]]) {
    if (!items.length) continue;
    y = room(doc, y + 3, 14);
    y = heading(doc, y + 2, title);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(SIZE.body);
    doc.setTextColor(...INK);
    for (const it of items) {
      const lines = doc.splitTextToSize(`-  ${safe(it)}`, W - 2);
      y = room(doc, y, lines.length * 3.8 + 1);
      doc.text(lines, SHEET.left + 1, y + 3);
      y += lines.length * 3.8 + 1;
    }
    y += 3;
  }
  y = room(doc, y, 10);
  doc.setFontSize(SIZE.small);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(safe(data.footnote), W), SHEET.left, y + 3);

  // ---- page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(SIZE.small);
    doc.setTextColor(...MUTED);
    doc.text(`${safe(data.title)} · ${safe(data.numbers)} · page ${p} / ${pages}`, SHEET.right, 291, { align: "right" });
  }
  return { pages };
}
