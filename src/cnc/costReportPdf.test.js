import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { costReportData, drawCostReport } from "./costReportPdf.js";

// Shaped like the engine's costing for practice O1031 (bar puller, 70 off).
const COSTING = {
  qty: 70, rate_per_s: 0.21, cycle_s: 61.2, time_factor: 1.15, machine_s: 70.4, clampings: 1, tool_blocks: 4, machining_per_part: 14.78, first_off: 750, setup_price: 750,
  material: "EN8", material_unit: "R/kg", material_price: 40, material_per_part: 2.703, material_total: 189.21, price_per_part: 28.2, batch_total: 1974, one_off_price: 828.4, one_off_material: 63.13,
  stock: { stock_length_mm: 6000, saw_kerf_mm: 1, puller_bars_per_stock_bar: 6, puller_bar_mm: 998, puller_bars_needed: 3, stock_bars_needed: 1, puller_bars_left: 3, unused_mm: 3003, unused_cost: 189.59, stock_bar_cost: 378.8, charged_cost: 189.21, charge_all_material: false },
  offcut: { bar_length_mm: 998, parts_per_bar: 28, offcut_mm: 57.2, batch_offcut_mm: 645, batch_cost: 40.72, puller_waste_mm: 30 },
  wastage: { part_mm: 30, finished_kg: 0.047, chips_kg: 0.004, kerf_mm: 3, kerf_kg: 0.005, offcut_share_mm: 9.2, offcut_share_kg: 0.015, used_kg: 0.071, waste_kg: 0.024, waste_pct: 33.8, finished_cost: 1.79, chips_cost: 0.15, kerf_cost: 0.18, offcut_share_cost: 0.583, waste_cost: 0.913, batch_waste_cost: 63.91 },
  notes: ["bar puller: 1000 mm default, 30 mm puller waste"],
};

function draw(costing) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const printed = [];
  const text = doc.text.bind(doc);
  doc.text = (t, x, y, o) => {
    printed.push([].concat(t).join(" "));
    return text(t, x, y, o);
  };
  const autoTableSpy = (d, opts) => {
    for (const row of [...(opts.head || []), ...(opts.body || [])]) printed.push(row.map((c) => (typeof c === "object" && c ? c.content : c)).join(" | "));
    return autoTable(d, opts);
  };
  const data = costReportData({ program: { part_name: "TEST PIN 16x30", program_no: 1031, customer: "BPW", material: "EN8", stock: "D16 bar", settings: { qty: 70 } }, rev: { rev: "A", source: "generated" }, costing });
  const report = drawCostReport({ doc, autoTable: autoTableSpy, data });
  return { all: printed.join("\n"), report };
}

test("the report: heading, price, time, both bar sections, material and offcut that add up", () => {
  const { all, report } = draw(COSTING);
  assert.equal(report.pages, 1);
  for (const want of ["CNC COST REPORT · FOR ERS ONLY", "TEST PIN 16x30", "O00001031", "Batch quantity | 70", "Cost per part (batch)", "1-off material", "Machine rate", "1 x 6,000 mm", "3 puller bars, 3,003 mm", "what the job uses", "Material and offcut (per part)", "Costed in: material and offcut add up"]) {
    assert.ok(all.includes(want), `printed: ${want}`);
  }
  // The chips are not printed as waste any more.
  assert.ok(!all.includes("Chips (turned away)"));
  assert.ok(!all.includes("of the steel bought"));
});

test("the markups and selling price, as the Costing tab shows them", () => {
  const { all } = draw(COSTING);
  for (const want of ["Selling per part (batch)", "Batch selling", "1-off selling", "material 60%, offcut 60%; machine time and setup at cost", "saw cut", "| 0.056 |", "Share of the offcut, 60% | 0.015 |", "Machine time and setup (at cost)", "Offcut charged for the batch"]) {
    assert.ok(all.includes(want), `printed: ${want}`);
  }
  // The money is markup.js's (Rand is printed in the PC's own way, so the
  // amounts are checked as numbers): material 1.79 + 0.15 + 0.18 = 2.12 at
  // 60% = 3.39; offcut 0.583 at 60% = 0.93; machine and setup 25.50.
  const { sell } = costReportData({ program: { settings: {} }, costing: COSTING });
  assert.deepEqual([sell.perPart.material, sell.perPart.materialSell, sell.perPart.offcut, sell.perPart.offcutSell, sell.perPart.atCost], [2.12, 3.39, 0.58, 0.93, 25.5]);
});

test("until the engine sends them, the order and impacts say so; once sent they print", () => {
  assert.ok(draw(COSTING).all.includes("Material to order comes with the engine's next update."));
  const withOrder = {
    ...COSTING,
    order: { material: { description: "Bar D16 EN8", pieces: 1, length_mm: 6000, total_mm: 6000, kg: 9.47, cost: 378.8, note: "" }, tools: [{ item: "CXMU 060204-F3P IC807", why: "stainless bore", needed: false }, { item: "SER 2525 M16 + 16ER 1.50 ISO", why: "M16 thread", needed: true }] },
    impacts: [{ kind: "stops the job", text: "No 1.5 pitch thread insert" }, { kind: "costing", text: "Bar puller default 1000 mm used" }],
  };
  const { all } = draw(withOrder);
  for (const want of ["Bar D16 EN8", "1 x 6,000 mm = 6,000 mm", "Tools to add", "NEEDED", "recommended", "Can change the cost or stop the job", "stops the job | No 1.5 pitch thread insert"]) {
    assert.ok(all.includes(want), `printed: ${want}`);
  }
});
