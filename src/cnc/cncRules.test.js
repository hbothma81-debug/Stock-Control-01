import { test } from "node:test";
import assert from "node:assert/strict";
import {
  oNumber, readNumber, cleanSettings, settingsToForm, settingText, programMatches, listPrograms, filterChoices,
  stockText, faultText, partNameFromFile, programFileName, engineErrorText, revisionChanges, detailChanges,
} from "./cncRules.js";
import { CNC_FIELDS } from "./cncFields.js";

test("O numbers are eight digits, as the machine writes them", () => {
  assert.equal(oNumber(1027), "O00001027");
  assert.equal(oNumber(2001), "O00002001");
});

test("a typed number reads a comma as the decimal point and refuses words", () => {
  assert.equal(readNumber(""), null);
  assert.equal(readNumber(" 12,5 "), 12.5);
  assert.ok(Number.isNaN(readNumber("12mm")));
});

test("only filled-in questions are sent to the engine, in its own types", () => {
  const { settings, errors } = cleanSettings({
    stock_type: "tube", bar_dia: "71", bar_id: "50", grip1: "", pulls: "63, 33", nose_comp: true, side1: "",
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(settings, { stock_type: "tube", bar_dia: 71, bar_id: 50, pulls: [63, 33], nose_comp: true });
});

test("pulls may be typed with spaces or semicolons, and a comma with no space is a decimal", () => {
  assert.deepEqual(cleanSettings({ pulls: "63 33;20" }).settings.pulls, [63, 33, 20]);
  assert.deepEqual(cleanSettings({ pulls: "63,5" }).settings.pulls, [63.5]);
});

test("a nonsense answer is named, not sent", () => {
  const { settings, errors } = cleanSettings({ bar_dia: "fifty", pulls: "63, x" });
  assert.deepEqual(settings, {});
  assert.deepEqual(errors, ["Bar / tube OD (mm)", "Pulls (mm each, e.g. 63, 33)"]);
});

test("saved settings come back into the form as typed", () => {
  const saved = { stock_type: "bar", bar_dia: 50, pulls: [63, 33], nose_comp: false };
  const form = settingsToForm(saved);
  assert.deepEqual(form, { stock_type: "bar", bar_dia: "50", pulls: "63, 33", nose_comp: false });
  assert.deepEqual(cleanSettings(form).settings, saved);
});

test("the Settings tab says what the engine chooses for an empty answer", () => {
  const holding = CNC_FIELDS.find((f) => f.key === "holding");
  assert.equal(settingText(holding, undefined), "Engine's choice: by size");
  assert.equal(settingText(holding, "bar puller"), "Bar puller");
  const nose = CNC_FIELDS.find((f) => f.key === "nose_comp");
  assert.equal(settingText(nose, false), "Off");
});

const P = [
  { program_no: 2001, part_name: "10t bush", customer: "BPW", material: "EN8", stock: "Pipe NPS 4 SCH80", status: "not_for_machine", fault: "bore too deep" },
  { program_no: 1013, part_name: "RS_BMHST-01 P-002", customer: "RSI", material: "EN8", stock: "D140 bar", status: "not_for_machine", fault: "no M24x3 insert" },
  { program_no: 1027, part_name: "Spacer", customer: "HPE", material: "Stainless 304", stock: "D50 bar", status: "ready", fault: "" },
];

test("the search finds a program by part, customer, material, fault or O number typed any way", () => {
  const found = (q) => P.filter((p) => programMatches(p, q)).map((p) => p.program_no);
  assert.deepEqual(found("bpw"), [2001]);
  assert.deepEqual(found("O00001027"), [1027]);
  assert.deepEqual(found("o1013"), [1013]);
  assert.deepEqual(found("1027"), [1027]);
  assert.deepEqual(found("stainless"), [1027]);
  assert.deepEqual(found("insert"), [1013]);
  assert.deepEqual(found(""), [2001, 1013, 1027]);
});

const Q = [
  { ...P[0], created_by: "Pieter", quote_ref: "Q-2041", project_name: "BPW axles" },
  { ...P[1], created_by: "anna", quote_ref: "", project_name: "" },
  { ...P[2], created_by: "Anna", quote_ref: "Q-2100", project_name: "" },
];

test("one list, every program in program number order, ready or not", () => {
  assert.deepEqual(listPrograms(P).map((p) => p.program_no), [1013, 1027, 2001]);
  assert.deepEqual(listPrograms(null), []);
});

test("the search also finds the quote reference, the project name and the sales rep", () => {
  const found = (search) => listPrograms(Q, { search }).map((p) => p.program_no);
  assert.deepEqual(found("q-2041"), [2001]);
  assert.deepEqual(found("axles"), [2001]);
  assert.deepEqual(found("pieter"), [2001]);
});

test("the customer and sales rep filters, capitals ignored, with the search", () => {
  assert.deepEqual(listPrograms(Q, { customer: "bpw" }).map((p) => p.program_no), [2001]);
  assert.deepEqual(listPrograms(Q, { rep: "ANNA" }).map((p) => p.program_no), [1013, 1027]);
  assert.deepEqual(listPrograms(Q, { rep: "Anna", search: "spacer" }).map((p) => p.program_no), [1027]);
  assert.deepEqual(listPrograms(Q, { rep: "Anna", customer: "BPW" }), []);
});

test("the filters offer only names on the list, A to Z, once each", () => {
  const c = filterChoices([...Q, { program_no: 3, customer: "", created_by: "" }]);
  assert.deepEqual(c.customers, ["BPW", "HPE", "RSI"]);
  assert.equal(c.reps.length, 2);
  assert.equal(c.reps[1], "Pieter");
});

test("the bar in shop words", () => {
  assert.equal(stockText({ bar_dia: 50 }), "D50 bar");
  assert.equal(stockText({ stock_type: "tube", bar_dia: 71, bar_id: 50 }), "D71 x 50 tube");
  assert.equal(stockText({}, { bar_dia: 140, bar_id: 0 }), "D140 bar");
  assert.equal(stockText({ stock_type: "schedule", nps: "4", schedule: "80" }), "Pipe NPS 4 SCH80");
  assert.equal(stockText({ stock_type: "schedule", nps: "4", schedule: "120" }, null, [{ nps: "4", nb: 100 }]), "Pipe 100NB SCH120");
  assert.equal(stockText({}), "");
});

test("the fault on a shut line", () => {
  assert.equal(faultText({ ready: true, fails: [] }), "");
  assert.equal(faultText({ ready: false, fails: ["no M24x3 insert", "bore too deep"] }), "no M24x3 insert; bore too deep");
  assert.equal(faultText({ ready: false, fails: [] }), "Not for machine");
  assert.equal(faultText({ ready: false, fails: ["x".repeat(400)] }).length, 298);
  // O1027 rev C on live (9 Oct 2026): no fails, the reasons are problems.
  assert.equal(
    faultText({
      ready: false,
      fails: [],
      problems: [
        "RAPID: 3MM PARTING G54: G0 from X12.800 Z0.900 to X12.800 Z-0.100 runs through material at X12.80 Z0.73",
        "CLEARANCE: WNMG R0.8 G54: with the tip at X11.800 Z9.500 the insert behind it runs into material",
        "JAWS: 3MM PARTING G54 comes 4.0 mm from the jaw face at Z-52.100 X6.800 (needs 20) - jaw clearance",
        ["JAWS", "3MM PARTING G54 X6.8 Z-52.1 is inside the jaws"],
        "TRAVEL: X160.0 is past the X travel (75 on radius)",
      ],
    }),
    "rapid through material (3MM PARTING); tool clearance (WNMG R0.8); too close to the jaws (3MM PARTING); past the machine's travel"
  );
  assert.equal(faultText({ ready: false, fails: ["no M24x3 insert"], problems: ["RAPID: T G54: x"] }), "no M24x3 insert");
  assert.equal(
    faultText({ ready: false, problems: [["SPINDLE", "WNMG R0.8 G54: cuts with the spindle stopped (no M3 in this tool block) from X11.800 Z9.500"]] }),
    "spindle not running (WNMG R0.8)"
  );
  assert.equal(faultText({ ready: false, problems: ["DECIMAL: WNMG R0.8 G54: no decimal point in G0X29Z5.0M8"] }), "no decimal point (WNMG R0.8)");
  assert.equal(faultText({ ready: false, problems: ["DECIMAL: O1031: no decimal point in G0X150Z80.0"] }), "no decimal point");
});

test("file names", () => {
  assert.equal(partNameFromFile("RS_BMHST-01 P-002.STEP"), "RS_BMHST-01 P-002");
  assert.equal(partNameFromFile("bush.stp"), "bush");
  assert.equal(programFileName(1027, "BUSH 50/30"), "O00001027 BUSH 50 30.txt");
  assert.equal(programFileName(2001, ""), "O00002001.txt");
  // The LEO 1600 refuses names over 26 (9 Oct 2026): words go from the front.
  assert.equal(programFileName(1027, "Reducing Bolt M16-M12"), "O00001027 Bolt M16-M12.txt");
  assert.equal(programFileName(1027, "Bolt M16-M12").length, 26);
  assert.equal(programFileName(1027, "Long Reducing Bolt M16X1.5-M12"), "O00001027 M16X1.5-M12.txt");
  assert.equal(programFileName(1027, "SUPERLONGPARTNAMEWITHNOSPACES"), "O00001027.txt");
});

test("the engine's refusals in plain words", () => {
  assert.match(engineErrorText(400, { error: "not a STEP file" }), /not a STEP file/);
  assert.match(engineErrorText(401, {}), /not signed in/);
  assert.match(engineErrorText(0, null), /could not be reached/);
  assert.match(engineErrorText(500, { error: "engine: StopIteration" }), /StopIteration/);
});

import { revisionLetter } from "./cncRules.js";

test("revision letters run as the database gives them", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(revisionLetter), ["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
});

import { programFiles } from "./cncRules.js";

test("each program goes out under its O number and its own title", () => {
  const files = programFiles(
    [
      { number: 1027, text: "%\nO00001027(BPW 10t BUSH SIDE 1)\nG21\n%" },
      { number: 1028, text: "%\nO00001028(BPW 10t BUSH SIDE 2)\n%" },
      { number: 1030, text: "%\nO00001030\n%" },
    ],
    "BPW 10t BUSH"
  );
  // Over 26 characters the title loses words from its front (the LEO 1600's limit).
  assert.deepEqual(files.map((f) => f.name), ["O00001027 BUSH SIDE 1.txt", "O00001028 BUSH SIDE 2.txt", "O00001030 BPW 10t BUSH.txt"]);
  assert.equal(files[0].text, "%\nO00001027(BPW 10t BUSH SIDE 1)\nG21\n%");
});

import { matchMachineCopies } from "./cncRules.js";

test("machine copies are matched by the O number inside, not the file name", () => {
  const current = [
    { number: 1027, text: "%\nO00001027(BUSH SIDE 1)\nG0Z5.\n%" },
    { number: 1028, text: "%\nO00001028(BUSH SIDE 2)\n%" },
  ];
  const r = matchMachineCopies(
    [
      { name: "renamed by operator.txt", text: "%\r\nO00001027(BUSH SIDE 1)\r\nG0Z4.5\r\n%\r\n" },
      { name: "other.txt", text: "%\nO00002001(BPW ROCKER)\n%" },
      { name: "notes.txt", text: "just words" },
    ],
    1027,
    current
  );
  assert.deepEqual(r.imported, [{ number: 1027, fileName: "renamed by operator.txt" }]);
  assert.deepEqual(r.kept, [1028]);
  assert.deepEqual(r.refused.map((x) => x.reason), ["it is O00002001, not this program", "no O number in it"]);
  assert.equal(r.programs[0].text, "%\r\nO00001027(BUSH SIDE 1)\r\nG0Z4.5\r\n%\r\n");
  assert.equal(r.programs[1], current[1]);
});

test("a machine copy may bring the second program a part did not have, and short O numbers read", () => {
  const r = matchMachineCopies([{ name: "x.nc", text: "%\nO1028\n%" }], 1027, [{ number: 1027, text: "%\nO00001027\n%" }]);
  assert.deepEqual(r.programs.map((p) => p.number), [1027, 1028]);
  assert.deepEqual(r.imported, [{ number: 1028, fileName: "x.nc" }]);
});

import { sourceTag, handEditsNote, editProblems } from "./cncRules.js";

test("a revision says when it was a machine copy or edited in the app", () => {
  assert.equal(sourceTag("generated"), "");
  assert.equal(sourceTag("machine_copy"), " (machine copy)");
  assert.equal(sourceTag("edited"), " (edited)");
});

test("a remake from the model warns only when the current revision has hand edits", () => {
  assert.equal(handEditsNote(null), "");
  assert.equal(handEditsNote({ rev: "B", source: "generated" }), "");
  assert.match(handEditsNote({ rev: "C", source: "edited" }), /^Rev C was edited in the app: .*drops those hand edits/);
  assert.match(handEditsNote({ rev: "D", source: "machine_copy" }), /^Rev D is a machine copy: /);
});

test("an edit keeps text and its own O number on each program", () => {
  assert.deepEqual(editProblems([{ number: 1027, text: "%\nO00001027(BUSH)\nG0X50.\n%" }, { number: 1028, text: "%\r\nO1028\r\n%" }]), []);
  assert.deepEqual(editProblems([{ number: 1027, text: "  \n" }]), ["O00001027 has no text."]);
  assert.deepEqual(editProblems([{ number: 1027, text: "%\nG0X50.\n%" }]), ['O00001027 has lost its O line: put "O00001027" back at the top.']);
  assert.deepEqual(editProblems([{ number: 1027, text: "%\nO00001030(BUSH)\n%" }]), ["The O line reads O00001030: it must stay O00001027."]);
});

import { exportRows, dayInSA } from "./cncRules.js";

test("the Excel rows: program number order, words a reviewer reads, minutes to one place", () => {
  const rows = exportRows(
    [
      { id: "b", program_no: 2001, part_name: "10t bush", customer: "BPW", material: "EN8", stock: "Pipe NPS 4 SCH80", current_rev: "A", status: "not_for_machine", fault: "bore too deep", updated_at: "2026-10-07T23:30:00Z" },
      { id: "a", program_no: 1027, part_name: "Spacer", customer: "HPE", material: "EN8", stock: "D50 bar", current_rev: "D", status: "ready", fault: "stale", updated_at: "2026-10-08T08:00:00Z" },
    ],
    { a: 2613.6 }
  );
  assert.deepEqual(rows.map((r) => r["O number"]), ["O00001027", "O00002001"]);
  assert.equal(rows[0].Status, "Ready");
  assert.equal(rows[0].Fault, "");
  assert.equal(rows[0]["Cycle time (min)"], 43.6);
  assert.equal(rows[1]["Cycle time (min)"], "");
  assert.equal(rows[1].Fault, "bore too deep");
  assert.equal(rows[1]["Last changed"], "2026-10-08");
});

test("a South African day, not the UTC one", () => {
  assert.equal(dayInSA("2026-10-07T22:30:00Z"), "2026-10-08");
  assert.equal(dayInSA(null), "");
});

import { cleanSizes, pipeLabel } from "./cncRules.js";

const FLANGED = {
  key: "flanged_bush",
  name: "Flanged bush",
  fields: [
    { key: "flange_od", label: "Flange OD", unit: "mm" },
    { key: "body_od", label: "Body OD", unit: "mm" },
    { key: "id", label: "ID (0 = solid)", unit: "mm", default: 0 },
    { key: "chamfer_od", label: "Outside end chamfers", unit: "mm", default: 0.5 },
  ],
};

test("shape sizes: a size with no default must be typed, one with a default may be left", () => {
  assert.deepEqual(cleanSizes(FLANGED, { flange_od: "80", body_od: "50,5", id: "" }), { sizes: { flange_od: 80, body_od: 50.5 }, missing: [], bad: [] });
  assert.deepEqual(cleanSizes(FLANGED, { flange_od: "80", chamfer_od: "x" }), { sizes: { flange_od: 80 }, missing: ["Body OD"], bad: ["Outside end chamfers"] });
  assert.deepEqual(cleanSizes(FLANGED, { flange_od: "80", body_od: "50", id: "0" }).sizes.id, 0);
});

test("pipe sizes in shop words", () => {
  assert.equal(pipeLabel({ nps: "4", nb: 100 }), '100NB (4")');
  assert.equal(pipeLabel({ nps: "1-1/4" }), '1-1/4"');
});

import { costingPart, costingFigures, rand } from "./cncRules.js";

test("the batch size and bar figures are carried; nothing else", () => {
  assert.deepEqual(costingPart({ qty: 20, bar_length: 3000, material: "EN8", parts_per_bar: "" }), { qty: 20, bar_length: 3000 });
  assert.deepEqual(costingPart(null), {});
});

test("the costing figures read off the engine's block", () => {
  const f = costingFigures({ qty: 20, machine_s: 252.4, cycle_s: 219.5, kg_per_part: 1.23, material_per_part: 36.9, price_per_part: 245.1, batch_total: 4902, one_off_price: 1012.5, material_price: 30, material_unit: "R/kg", notes: ["no material price sent - default R30/kg"] });
  assert.equal(f.pricePerPart, 245.1);
  assert.equal(f.oneOff, 1012.5);
  assert.equal(f.machineS, 252.4);
  assert.deepEqual(f.notes, ["no material price sent - default R30/kg"]);
  assert.equal(costingFigures(null), null);
});

test("Rand to the cent", () => {
  assert.match(rand(1012.5), /^R 1.012,50$|^R 1 012,50$|^R 1,012.50$/);
  assert.equal(rand(null), "–");
});

import { wastageRows, DEFAULT_SETUP_PRICE } from "./cncRules.js";

test("the wastage rows add up to the material per part", () => {
  const w = { finished_kg: 0.782, chips_kg: 1.585, kerf_mm: 3, kerf_kg: 0.118, offcut_share_mm: 0.83, offcut_share_kg: 0.033, part_mm: 55, used_kg: 2.519, waste_kg: 1.736, waste_pct: 68.944, finished_cost: 29.73, chips_cost: 60.259, kerf_cost: 4.499, offcut_share_cost: 1.245, stock_mm: 63, stock_kg: 2.486 };
  const r = wastageRows(w, 95.733);
  assert.equal(r.rows.length, 4);
  assert.equal(r.total, 95.73);
  assert.equal(r.ok, true);
  assert.equal(wastageRows(w, 99).ok, false);
  assert.equal(wastageRows(null, 1), null);
  assert.equal(DEFAULT_SETUP_PRICE, 750);
});

test("Update program: a run that comes out the same as the current revision changes nothing", () => {
  const current = {
    programs: [{ number: 1027, text: "O1027\nG0 X0\nM30" }],
    cycle_s: 95.5, tool_s: 12, ready: true, fault: "", fails: [], problems: [], warnings: ["Layout: T0101"],
    costing: { unit_total: 412.5, qty: 10, data_source: "test cnc_ tables, version 12" },
    settings: { program_no: 1027, material: "EN8", bar_dia: 71 },
    report: "plan", step_path: "x/A/part.step", step_name: "part.step",
  };
  // As the database hands it back: keys in another order.
  const next = {
    ...current,
    costing: { data_source: "test cnc_ tables, version 13", qty: 10, unit_total: 412.5 },
    settings: { bar_dia: 71, material: "EN8", program_no: 1027, nothing: undefined },
  };
  assert.deepEqual(revisionChanges(current, next), []);
  assert.deepEqual(revisionChanges(current, next, true), ["STEP model"]);
  assert.deepEqual(revisionChanges(null, next), ["first revision"]);
  assert.deepEqual(revisionChanges(current, { ...next, costing: { ...next.costing, unit_total: 420 } }), ["price"]);
  assert.deepEqual(
    revisionChanges(current, { ...next, programs: [{ number: 1027, text: "O1027\nG0 X1\nM30" }], cycle_s: 96 }),
    ["program lines", "cycle time"]
  );
  assert.deepEqual(revisionChanges(current, { ...next, settings: { ...next.settings, bar_dia: 75 } }), ["settings"]);
  assert.deepEqual(revisionChanges(current, { ...next, warnings: [] }), ["warnings"]);
  // Turn around: the other end that comes out the same is nothing to keep.
  const turned = { ...next, settings: { ...next.settings, side1: "L" } };
  assert.deepEqual(revisionChanges(current, turned), ["settings"]);
  assert.deepEqual(revisionChanges(current, turned, false, ["side1"]), []);
});

test("Update program: the part name, customer and material are the program's own", () => {
  const program = { part_name: "Bush", customer: "B&W", material: "EN8" };
  assert.deepEqual(detailChanges(program, { partName: "Bush", customer: "B&W", materialName: "EN8" }), []);
  assert.deepEqual(detailChanges(program, { partName: "Bush 2", customer: "", materialName: "EN8" }), ["part name", "customer"]);
});
