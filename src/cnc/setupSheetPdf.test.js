import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { drawSetupSheet } from "./setupSheetPdf.js";
import { setupSheetData } from "./setupSheetData.js";
import { toolList, toolpathFrames } from "./toolpathGeom.js";

// The practice flanged bush, cut down (two sides, three tools).
const ANSWER = {
  ready: true,
  cycle_s: 461,
  warnings: ["Side 1 must turn 40.5 deep to reach the D80"],
  fails: [],
  moves: [
    { kind: "G0", side: "L", tool: "WNMG R0.8", pts: [[150, 200], [5, 84]] },
    { kind: "cycle", side: "L", tool: "WNMG R0.8", pts: [[5, 84], [0, 84], [0, -1.6], [5, 84]] },
    { kind: "feed", side: "L", tool: "20MM U-DRILL", pts: [[3, 0], [-30, 0]] },
    { kind: "G0", side: "0", tool: "WNMG R0.8", pts: [[80, 150], [6, 84]] },
    { kind: "cycle", side: "0", tool: "WNMG R0.8", pts: [[6, 84], [0, 84], [0, 26], [6, 84]] },
  ],
  stock: { G54: [[-3, [[10.1, 40]]], [10, [[15.1, 40]]]], G55: [[1, [[15.1, 40]]], [13, [[15.1, 24.9]]]] },
  setup: {
    machine: "LEO 1600",
    programs: [1029, 1030],
    part: { name: "Flanged bush", max_dia: 80, length: 55, min_bore_dia: 30 },
    bar: { dia: 80, id: 0, stock_len_mm: 60 },
    tools: [
      { station: 1, used: true, name: "WNMG R0.8", holder: "MWLNR 2525M-08W", insert: "WNMG 080408-M3M IC830", sides: [1, 2], s_mode: "G96", s: 140, s_finish: 160, g50_max_rpm: 1500, feeds_mm_rev: [0.15, 0.2], time_s: 300 },
      { station: 3, used: true, name: "20MM U-DRILL", holder: "DR200-100-25-06-5D-N", insert: "SOMX 060304-DT IC908", sides: [1], s_mode: "G97", s: 1800, feeds_mm_rev: [0.08], time_s: 60 },
      { station: 4, empty: true },
    ],
    sides: [
      { side: 1, program_no: 1029, offset: "G54", holding: "double-chucked", z0_end: 55, grip_mm: 7.5, clamp_depth_mm: 7.5, clamp_dia_mm: 80, stick_out_mm: 52.5, face_stock_mm: 2, z0_note: "Z0 on the z=55 end" },
      { side: 2, program_no: 1030, offset: "G55", holding: "double-chucked", z0_end: 0, grip_mm: 22, clamp_depth_mm: 22, clamp_dia_mm: 50, stick_out_mm: 33, face_stock_mm: 3, soft_jaws: true, z0_note: "Z0 on the z=0 end" },
    ],
    times: { cycle_s: 461, per_side: [{ side: 1, s: 300 }, { side: 2, s: 161 }] },
    material: { grade: "EN8", cutting_name: "EN8" },
    settings: { edge_break: 0.5, nose_comp: false, finish_mode: "T1" },
    notes: ["Edge break 0.5x45 on 6 sharp outside corner(s)"],
    hand_notes: [],
  },
};

function draw() {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const printed = [];
  const text = doc.text.bind(doc);
  doc.text = (t, x, y, o) => {
    printed.push({ page: doc.getCurrentPageInfo().pageNumber, text: [].concat(t).join(" "), y });
    return text(t, x, y, o);
  };
  const data = setupSheetData({ program: { part_name: "Flanged bush", material: "EN8", stock: "D80 bar", settings: { qty: 20 } }, rev: { rev: "C", source: "generated" }, answer: ANSWER });
  const report = drawSetupSheet({ doc, autoTable, data, frames: toolpathFrames(ANSWER), tools: toolList(ANSWER) });
  return { doc, printed, report };
}

test("the sheet draws: page 1, a page per side, every page numbered", () => {
  const { printed, report } = draw();
  assert.equal(report.pages, 3);
  const all = printed.map((p) => p.text).join(" | ");
  for (const want of ["SETUP SHEET / JOB CARD", "Flanged bush", "O00001029 / O00001030", "MACHINE READY - all checks pass", "Batch quantity", "20", "Turret T1-T8", "WNMG R0.8", "empty", "Side 1 · G54 · O00001029", "Side 2 · G55 · O00001030", "JAWS", "Checks", "Warnings", "Notes", "page 3 / 3"]) {
    assert.ok(all.includes(want), `printed: ${want}`);
  }
});

test("both sides share page 2, each with its picture", () => {
  const { printed } = draw();
  assert.equal(printed.find((p) => p.text.startsWith("Side 1 ·")).page, 2);
  assert.equal(printed.find((p) => p.text.startsWith("Side 2 ·")).page, 2);
  assert.equal(printed.filter((p) => p.text === "JAWS").map((p) => p.page).join(","), "2,2");
  assert.ok(printed.every((p) => p.y == null || p.y <= 292), "nothing printed off the page");
});
