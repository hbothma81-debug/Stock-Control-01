import { test } from "node:test";
import assert from "node:assert/strict";
import { cuttingChoices, cuttingCode, cuttingLabel, gradeProblem, gradesForPrograms, isLinked, keepsLinks } from "./gradeLink.js";

test("a cutting-data material is known by its first word, as the engine takes it", () => {
  assert.equal(cuttingCode("EN19 (QT ~280HB)"), "EN19");
  assert.equal(cuttingCode("6082 aluminium"), "6082");
  assert.equal(cuttingCode("A106/A53 pipe"), "A106");
  assert.equal(cuttingCode("HDPE/UHMWPE"), "HDPE");
  assert.equal(cuttingCode("SS303"), "SS303");
  assert.equal(cuttingCode(""), "");
  assert.equal(cuttingCode(null), "");
});

test("the picker offers one choice per code, shown by its full name, A to Z", () => {
  const rows = ["SS304", "EN19 (QT ~280HB)", "SS304", "CZ121 brass", "", "EN8", "EN19 (QT ~280HB)"];
  assert.deepEqual(cuttingChoices(rows), [
    { value: "CZ121", label: "CZ121 brass" },
    { value: "EN8", label: "EN8" },
    { value: "EN19", label: "EN19 (QT ~280HB)" },
    { value: "SS304", label: "SS304" },
  ]);
  assert.equal(cuttingLabel("EN19", cuttingChoices(rows)), "EN19 (QT ~280HB)");
  assert.equal(cuttingLabel("XX1", cuttingChoices(rows)), "XX1");
  assert.equal(cuttingLabel("", cuttingChoices(rows)), "");
});

test("before the SQL is pasted every grade is offered, as before", () => {
  const before = [{ name: "EN8" }, { name: "Stainless 303" }];
  assert.equal(keepsLinks(before), false);
  assert.deepEqual(gradesForPrograms(before), before);
  assert.equal(gradeProblem(before[1]), "");
});

test("once links are kept, a grade without one can't be used for a program", () => {
  const after = [{ name: "EN8", cuttingMaterial: "EN8" }, { name: "Duplex 2205", cuttingMaterial: "" }];
  assert.equal(keepsLinks(after), true);
  assert.equal(isLinked(after[0]), true);
  assert.equal(isLinked(after[1]), false);
  assert.deepEqual(gradesForPrograms(after).map((m) => m.name), ["EN8"]);
  assert.match(gradeProblem(after[1]), /Duplex 2205 has no cutting data linked/);
  assert.equal(gradeProblem(null), "");
});
