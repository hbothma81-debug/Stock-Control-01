import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOL_KINDS, toolFromForm, formFromTool, toolLine, suggestKey, kindOf } from "./toolKinds.js";

test("every kind the engine picks by has its fields", () => {
  assert.deepEqual(TOOL_KINDS.map((k) => k.kind), ["od", "bar", "udrill", "hss", "groove", "part", "thread", "puller"]);
  assert.deepEqual(kindOf("bar").fields.map((f) => f.key), ["holder", "insert", "dia", "nose", "key", "home_z", "ap_min_mm"]);
  assert.equal(kindOf("udrill").long, true);
  assert.equal(kindOf("od").long, false);
});

test("a new boring bar from the form, numbers read, long set from its kind", () => {
  const { data, errors } = toolFromForm("bar", { name: "20MM BORING BAR", holder: "A20R SCLCR-09", insert: "CCMT 09T304 IC907", dia: "20", nose: "0,4", key: "A20R", home_z: "60" });
  assert.deepEqual(errors, []);
  assert.deepEqual(data, { name: "20MM BORING BAR", kind: "bar", long: true, holder: "A20R SCLCR-09", insert: "CCMT 09T304 IC907", dia: 20, nose: 0.4, key: "A20R", home_z: 60 });
});

test("what is missing or unreadable is named", () => {
  const { errors } = toolFromForm("thread", { name: "", holder: "SER 2525 M16", insert: "16ER ISO IC908", pitches_owned: "1, x", pitch_range: "" });
  assert.deepEqual(errors, ["Name (as the program header prints it)", "Pitches owned (mm, e.g. 1, 1.25, 1.5)", "Pitch range the holder takes (mm, e.g. 0.5, 3)"]);
  assert.deepEqual(toolFromForm("nonsense", {}).errors, ["Pick what kind of tool it is."]);
});

test("a tool back into the form and out again is the same tool, extra fields kept", () => {
  const t = { data: { name: "THREAD", kind: "thread", long: false, holder: "SER 2525 M16", insert: "16ER ISO IC908", pitches_owned: [1, 1.25, 1.5], pitch_range: [0.5, 3], grade: "IC908" } };
  const form = formFromTool(t);
  assert.equal(form.pitches_owned, "1, 1.25, 1.5");
  assert.deepEqual(form.extra, { grade: "IC908" });
  assert.deepEqual(toolFromForm("thread", form).data, t.data);
});

test("a tool's line and a key from its name", () => {
  assert.equal(toolLine({ data: { holder: "S32U MWLNL-08W", insert: "WNMG 080408-M3M IC830", dia: 32 } }), "S32U MWLNL-08W · WNMG 080408-M3M IC830 · D32");
  assert.equal(toolLine({ data: { holder: "MWLNR 2525M-08W", insert: "WNMG 080408-M3M IC830", nose: 0.8 } }), "MWLNR 2525M-08W · WNMG 080408-M3M IC830 · R0.8");
  assert.equal(suggestKey("20mm U-Drill"), "20MMUDRILL");
});

test("side reach and minimum depth of cut are optional: blank saves nothing, a number is kept", () => {
  const base = { name: "DNMG R0.4", holder: "PDJNR 2525M-11", insert: "DNMG 110404-NF IC907", nose: "0.4", key: "DNMG" };
  const blank = toolFromForm("od", { ...base, ap_min_mm: "" });
  assert.deepEqual(blank.errors, []);
  assert.equal("ap_min_mm" in blank.data, false);
  assert.equal(toolFromForm("od", { ...base, ap_min_mm: "0,4" }).data.ap_min_mm, 0.4);
  assert.deepEqual(toolFromForm("od", { ...base, ap_min_mm: "x" }).errors, ["Minimum depth of cut (mm, blank = 0.5)"]);
  const thread = { name: "THREAD", holder: "SER 2525 M16", insert: "16ER ISO IC908", pitches_owned: "1.5, 2", pitch_range: "0.5, 3" };
  assert.equal(toolFromForm("thread", { ...thread, side_reach_mm: "2.5" }).data.side_reach_mm, 2.5);
  assert.equal(formFromTool({ data: { kind: "thread", name: "T", side_reach_mm: 2.5 } }).side_reach_mm, "2.5");
  assert.equal(kindOf("bar").fields.some((f) => f.key === "ap_min_mm"), true);
});
