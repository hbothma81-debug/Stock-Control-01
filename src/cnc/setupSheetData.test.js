import { test } from "node:test";
import assert from "node:assert/strict";
import { setupSheetData, speedText, feedText } from "./setupSheetData.js";

// Cut down from the engine's real answer for practice O1027 (8 Oct 2026).
const T1 = { station: 1, empty: false, used: true, name: "WNMG R0.8", insert: "WNMG 080408-M3M IC830", holder: "MWLNR 2525M-08W", sides: [1, 2], s_mode: "G96", s: 140, s_finish: 160, g50_max_rpm: 1500, feeds_mm_rev: [0.15, 0.2], time_s: 499.628 };
const T2 = { station: 2, empty: false, used: false, name: "DNMG R0.4", insert: "DNMG 110404-NF IC907", holder: "PDJNR 2525M-11", sides: [], s: null, feeds_mm_rev: [], time_s: 0 };
const T5 = { station: 5, empty: false, used: true, name: "32MM BORING BAR", insert: "WNMG 080408-M3M IC830", holder: "S32U MWLNL-08W", sides: [1, 2], s_mode: "G96", s: 120, s_finish: 120, g50_max_rpm: 1500, feeds_mm_rev: [0.15, 0.16], time_s: 339.5 };
const ANSWER = {
  ready: true,
  cycle_s: 839.145,
  warnings: ["Side 1 32MM BORING BAR 132.0 deep - over its 4xD overhang 128 (check stick-out)"],
  fails: [],
  setup: {
    machine: "LEO 1600",
    programs: [1027],
    part: { name: "BPW 10t BUSH", max_dia: 112, length: 130, min_bore_dia: 94.3 },
    tools: [T1, T2, { station: 4, empty: true }, T5],
    sides: [
      { side: 1, program_no: 1027, offset: "G54", holding: "double-chucked", clamp_depth_mm: 30, clamp_dia_mm: 114.3, stick_out_mm: 105, face_stock_mm: 2, soft_jaws: false, z0_note: "Z0 on the z=130 end of the part" },
      { side: 2, program_no: 1027, offset: "G55", holding: "double-chucked", clamp_depth_mm: 30, clamp_dia_mm: 112, stick_out_mm: 100, face_stock_mm: 3, soft_jaws: true, z0_note: "Z0 on the z=0 end of the part" },
    ],
    times: { cycle_s: 839.145, per_side: [{ side: 1, s: 633.178 }, { side: 2, s: 205.968 }] },
    material: { grade: "EN8", cutting_name: "EN8" },
    settings: { edge_break: 0.5, nose_comp: false, finish_mode: "T1" },
    notes: ["Through bore, smallest D94.30"],
    hand_notes: [],
  },
};
const PROGRAM = { part_name: "BPW 10t BUSH", material: "EN8", stock: "Pipe 100NB SCH120", settings: { qty: 20 } };
const REV = { rev: "D", source: "generated", programs: [{ number: 1027 }] };

test("speed and feed as the sheet prints them", () => {
  assert.equal(speedText(T1), "Vc 140; Vc 160 finish\nG50 1500");
  assert.equal(speedText({ s_mode: "G97", s: 800 }), "S 800");
  assert.equal(speedText(T2), "-");
  assert.equal(feedText(T1), "F 0.15, 0.2");
  assert.equal(feedText(T2), "-");
});

test("page 1: heading, status, facts with the batch quantity, the turret T1 to T8", () => {
  const d = setupSheetData({ program: PROGRAM, rev: REV, answer: ANSWER, when: new Date("2026-10-08T10:46:00Z") });
  assert.equal(d.title, "BPW 10t BUSH");
  assert.equal(d.numbers, "O00001027");
  assert.equal(d.revision, "Rev D");
  assert.equal(d.status, "MACHINE READY - all checks pass");
  assert.deepEqual(d.left.find((r) => r[0] === "Batch quantity"), ["Batch quantity", "20"]);
  assert.deepEqual(d.left.find((r) => r[0] === "Part"), ["Part", "D112 x 130 long, bore D94.3"]);
  assert.match(d.left.find((r) => r[0] === "Cycle time (est.)")[1], /^14 min per part \(1 program\)$/);
  assert.equal(d.turret.length, 8);
  assert.equal(d.turret[0].sidesText, "side 1, side 2");
  assert.equal(d.turret[1].sidesText, "not used");
  assert.equal(d.turret[3].empty, true);
  assert.equal(d.turret[5].empty, true);
  assert.equal(d.turret[4].tool, "32MM BORING BAR");
});

test("each side: clamp, stick-out, time, and its tools until the engine sends the lines", () => {
  const d = setupSheetData({ program: PROGRAM, rev: REV, answer: ANSWER });
  assert.equal(d.sides.length, 2);
  assert.equal(d.sides[0].title, "Side 1 · G54 · O00001027 · Z0 on the z=130 end of the part");
  assert.deepEqual(d.sides[0].facts[0], ["Clamp on", "D114.3"]);
  assert.deepEqual(d.sides[0].facts[4], ["Side time (est.)", "10.6 min"]);
  assert.deepEqual(d.sides[0].blocks.map((b) => b.t), ["T1", "T5"]);
  assert.equal(d.checksComplete, false);
});

test("the engine's own sheet wording is printed as sent", () => {
  const a = JSON.parse(JSON.stringify(ANSWER));
  a.setup.machine_lines = [{ label: "Machine", text: "LEO 1600 · Doosan Fanuc i Plus" }];
  a.setup.stock_text = "Schedule tube 4in Sch120 (D114.3 x 11.13 wall), 135 mm per part billet";
  a.setup.batch_qty = 50;
  a.setup.sides[0].clamp_on = "D114.3 raw stock";
  a.setup.sides[0].blocks = [{ n: 1, station: 1, tool: "WNMG R0.8", speed: "Vc 140; Vc 160 finish", feeds: "0.176, 0.15", time_s: 336 }];
  a.setup.checks = [{ name: "No rapid through stock", pass: true, detail: "" }, { name: "Machine travel", pass: false, detail: "X max 200" }];
  const d = setupSheetData({ program: PROGRAM, rev: { ...REV, source: "machine_copy" }, answer: a });
  assert.deepEqual(d.right, [["Machine", "LEO 1600 · Doosan Fanuc i Plus"]]);
  assert.match(d.left[1][1], /^Schedule tube 4in Sch120/);
  assert.deepEqual(d.left.find((r) => r[0] === "Batch quantity"), ["Batch quantity", "50"]);
  assert.deepEqual(d.sides[0].facts[0], ["Clamp on", "D114.3 raw stock"]);
  assert.deepEqual(d.sides[0].blocks[0], { n: "N1", t: "T1", tool: "WNMG R0.8", speed: "Vc 140; Vc 160 finish", feed: "0.176, 0.15", time: "5.6 min" });
  assert.equal(d.checks[1].pass, false);
  assert.equal(d.checksComplete, true);
  assert.equal(d.revision, "Rev D (machine copy)");
});

test("not for machine says why", () => {
  const d = setupSheetData({ program: PROGRAM, rev: REV, answer: { ...ANSWER, ready: false, fails: ["Rapid into stock at N40"] } });
  assert.equal(d.status, "NOT FOR MACHINE - Rapid into stock at N40");
  assert.deepEqual(d.checks, [{ pass: false, name: "Rapid into stock at N40", detail: "" }]);
});
