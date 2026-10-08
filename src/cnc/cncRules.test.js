import { test } from "node:test";
import assert from "node:assert/strict";
import {
  oNumber, readNumber, cleanSettings, settingsToForm, settingText, programMatches, splitPrograms,
  stockText, faultText, partNameFromFile, programFileName, engineErrorText,
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
    stock_type: "tube", bar_dia: "71", bar_id: "50", grip1: "", pulls: "63, 33", nose_comp: true, qty: "20", side1: "",
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(settings, { stock_type: "tube", bar_dia: 71, bar_id: 50, pulls: [63, 33], nose_comp: true, qty: 20 });
});

test("pulls may be typed with spaces or semicolons, and a comma with no space is a decimal", () => {
  assert.deepEqual(cleanSettings({ pulls: "63 33;20" }).settings.pulls, [63, 33, 20]);
  assert.deepEqual(cleanSettings({ pulls: "63,5" }).settings.pulls, [63.5]);
});

test("a nonsense answer is named, not sent", () => {
  const { settings, errors } = cleanSettings({ bar_dia: "fifty", qty: "2.5", pulls: "63, x" });
  assert.deepEqual(settings, {});
  assert.deepEqual(errors, ["Bar / tube OD (mm)", "Pulls (mm each, e.g. 63, 33)", "Quantity (for costing)"]);
});

test("saved settings come back into the form as typed", () => {
  const saved = { stock_type: "bar", bar_dia: 50, pulls: [63, 33], nose_comp: false };
  const form = settingsToForm(saved);
  assert.deepEqual(form, { stock_type: "bar", bar_dia: "50", pulls: "63, 33", nose_comp: false });
  assert.deepEqual(cleanSettings(form).settings, saved);
});

test("the Settings tab says what a blank means", () => {
  const holding = CNC_FIELDS.find((f) => f.key === "holding");
  assert.equal(settingText(holding, undefined), "blank (by size)");
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

test("Not for machine and Ready, each in program number order", () => {
  const { notForMachine, ready } = splitPrograms(P);
  assert.deepEqual(notForMachine.map((p) => p.program_no), [1013, 2001]);
  assert.deepEqual(ready.map((p) => p.program_no), [1027]);
  assert.equal(splitPrograms(P, "hpe").notForMachine.length, 0);
});

test("the bar in shop words", () => {
  assert.equal(stockText({ bar_dia: 50 }), "D50 bar");
  assert.equal(stockText({ stock_type: "tube", bar_dia: 71, bar_id: 50 }), "D71 x 50 tube");
  assert.equal(stockText({}, { bar_dia: 140, bar_id: 0 }), "D140 bar");
  assert.equal(stockText({ stock_type: "schedule", nps: "4", schedule: "80" }), "Pipe NPS 4 SCH80");
  assert.equal(stockText({}), "");
});

test("the fault on a shut line", () => {
  assert.equal(faultText({ ready: true, fails: [] }), "");
  assert.equal(faultText({ ready: false, fails: ["no M24x3 insert", "bore too deep"] }), "no M24x3 insert; bore too deep");
  assert.equal(faultText({ ready: false, fails: [] }), "Not for machine");
  assert.equal(faultText({ ready: false, fails: ["x".repeat(400)] }).length, 298);
});

test("file names", () => {
  assert.equal(partNameFromFile("RS_BMHST-01 P-002.STEP"), "RS_BMHST-01 P-002");
  assert.equal(partNameFromFile("bush.stp"), "bush");
  assert.equal(programFileName(1027, "BUSH 50/30"), "O00001027 BUSH 50 30.txt");
  assert.equal(programFileName(2001, ""), "O00002001.txt");
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
