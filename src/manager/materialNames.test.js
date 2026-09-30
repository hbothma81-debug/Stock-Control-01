import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  storedName, materialNamed, fullNameOf, withFullMaterial, shortNameRefusal, shortNameChanged,
  renameQuestion, renameSummary, renameRefusalWords, outOfLineByMaterial, outOfLineFor, outOfLineWords, bringInLineQuestion,
} from "./materialNames.js";

// Stock Manager's Material Types, as live has them.
const MATERIALS = [
  { name: "Mild Steel" },
  { name: "Stainless 304", shortName: "SS304" },
  { name: "Galvanised", shortName: "Galv" },
  { name: "3CR12", shortName: "" },
];
const MS = [{ name: "Mild Steel", shortName: "MS" }, ...MATERIALS.slice(1)];

test("a material is stored by its short name where it has one", () => {
  assert.equal(storedName({ name: "Mild Steel" }), "Mild Steel");
  assert.equal(storedName({ name: "Mild Steel", shortName: " MS " }), "MS");
  assert.equal(storedName({ name: "3CR12", shortName: "" }), "3CR12");
  assert.equal(storedName(null), "");
});

test("a material is found by either name, whatever the capitals", () => {
  assert.equal(materialNamed(MS, "ms").name, "Mild Steel");
  assert.equal(materialNamed(MS, " MILD STEEL ").name, "Mild Steel");
  assert.equal(materialNamed(MS, "SS304").name, "Stainless 304");
  assert.equal(materialNamed(MS, "Brass"), null);
  assert.equal(materialNamed(MS, ""), null);
  // A material with no short name is not found by an empty one.
  assert.equal(materialNamed(MATERIALS, ""), null);
});

test("paper going out prints the full name", () => {
  assert.equal(fullNameOf(MS, "MS"), "Mild Steel");
  assert.equal(fullNameOf(MS, "Mild Steel"), "Mild Steel");
  assert.equal(fullNameOf(MS, "SS304"), "Stainless 304");
  assert.equal(fullNameOf(MS, "Brass"), "Brass");
  assert.equal(fullNameOf(null, "MS"), "MS");
});

test("a purchase order line starts with its material in full", () => {
  assert.equal(withFullMaterial(MS, "MS — SHS 50x50x3"), "Mild Steel — SHS 50x50x3");
  assert.equal(withFullMaterial(MS, "MS — SHS 50x50x3 — 6m lengths"), "Mild Steel — SHS 50x50x3 — 6m lengths");
  assert.equal(withFullMaterial(MS, "SS304 — 3mm 2500x1250"), "Stainless 304 — 3mm 2500x1250");
  // Already in full, not a material, no dash at all: as it is.
  assert.equal(withFullMaterial(MS, "Mild Steel — SHS 50x50x3"), "Mild Steel — SHS 50x50x3");
  assert.equal(withFullMaterial(MS, "Acme — M8x40 bolt"), "Acme — M8x40 bolt");
  assert.equal(withFullMaterial(MS, "Grinding discs"), "Grinding discs");
  assert.equal(withFullMaterial(MS, ""), "");
  assert.equal(withFullMaterial(MS, null), "");
});

test("a short name another material answers to is refused", () => {
  assert.equal(shortNameRefusal(MATERIALS, "Mild Steel", "MS"), null);
  assert.equal(shortNameRefusal(MATERIALS, "Mild Steel", ""), null);
  assert.match(shortNameRefusal(MATERIALS, "Mild Steel", "ss304"), /already the name or the short name of Stainless 304/);
  assert.match(shortNameRefusal(MATERIALS, "Mild Steel", "galvanised"), /of Galvanised/);
  // Its own names are its own.
  assert.equal(shortNameRefusal(MS, "Mild Steel", "MS"), null);
  assert.equal(shortNameRefusal(MS, "Mild Steel", "Mild Steel"), null);
  // Taking Stainless's short name away would write it "Stainless 304": free.
  assert.equal(shortNameRefusal(MS, "Stainless 304", ""), null);
  assert.match(shortNameRefusal(MS, "Brass", "BR"), /no material called "Brass"/);
  assert.match(shortNameRefusal(MS, "Mild Steel", "M — S"), /long dash/);
});

test("the box changed something, or it did not", () => {
  assert.equal(shortNameChanged({ name: "Mild Steel" }, "MS"), true);
  assert.equal(shortNameChanged({ name: "Mild Steel" }, "  "), false);
  assert.equal(shortNameChanged({ name: "Mild Steel", shortName: "MS" }, " MS "), false);
  assert.equal(shortNameChanged({ name: "Mild Steel", shortName: "MS" }, ""), true);
});

test("the question says what changes, what does not, and when to do it", () => {
  const q = renameQuestion({ name: "Mild Steel" }, "MS");
  assert.match(q, /^Write Mild Steel as "MS" everywhere\?/);
  assert.match(q, /that says "Mild Steel" will say "MS"/);
  assert.match(q, /All of it changes together, or none of it/);
  assert.match(q, /purchase orders already raised/);
  assert.match(q, /go on printing "Mild Steel" in full/);
  assert.match(q, /must reload the app afterwards/);
  // Taking a short name away puts the full name back.
  const back = renameQuestion({ name: "Mild Steel", shortName: "MS" }, "");
  assert.match(back, /^Write Mild Steel as "Mild Steel" everywhere\?/);
  assert.match(back, /that says "MS" will say "Mild Steel"/);
});

test("what was done, from the database's answer", () => {
  assert.equal(
    renameSummary({
      material: "Mild Steel", was: "Mild Steel", now: "MS",
      changed: { "laser_programs.material": 3, "stock_items.grade": 12, "requisitions.item_grade": 1, "requisitions.item_label": 1, "master_factor_items.grade": 40 },
    }),
    'Mild Steel is now written "MS". Changed: 12 stock lines, 40 sections, 1 requisition, 3 laser programs.'
  );
  assert.equal(renameSummary({ material: "Mild Steel", now: "MS", changed: {} }), 'Mild Steel is now written "MS". Nothing else held the old name.');
  // A place the database knows and this file does not yet is still said.
  assert.match(renameSummary({ material: "Mild Steel", now: "MS", changed: { "new_table.material": 2 } }), /2 in new_table\.material/);
});

test("the words for every way the database says no", () => {
  assert.match(renameRefusalWords({ code: "PGRST202", message: "Could not find the function public.set_material_short_name" }), /setup-material-short-name\.sql/);
  assert.match(renameRefusalWords({ code: "P0001", hint: "material_rows_refused", message: "3 row(s) of laser_programs could not be changed, so nothing was." }), /3 row\(s\) of laser_programs[\s\S]*An admin has to do this/);
  assert.match(renameRefusalWords({ code: "P0001", hint: "material_name_taken", message: '"SS304" is already the name or the short name of another material.' }), /another material\. Nothing was changed\./);
  assert.match(renameRefusalWords({ message: "Failed to fetch" }), /check your connection/);
  for (const e of [{ code: "PGRST202" }, { hint: "material_rows_refused", message: "x" }, { hint: "material_not_allowed", message: "x" }, {}]) {
    assert.match(renameRefusalWords(e), /Nothing was changed/);
  }
});

test("every place the database rewrites has its words here, or is counted with another", () => {
  // material_places() in the setup file is the one copy of the places.
  const sql = readFileSync(new URL("../../setup-material-short-name.sql", import.meta.url), "utf8");
  const body = sql.slice(sql.indexOf("$places$"), sql.lastIndexOf("$places$"));
  const places = [...body.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',/g)].map((m) => `${m[1]}.${m[2]}`);
  assert.equal(places.length, 11);
  const counts = Object.fromEntries(places.map((p) => [p, 1]));
  const said = renameSummary({ material: "Mild Steel", now: "MS", changed: counts });
  assert.doesNotMatch(said, / in [a-z_]+\.[a-z_]+/, "a place has no words: " + said);
  assert.equal(said.split(",").length, 9);
});

// Live on 29 Sep 2026: the list said "MS", the rows still said "Mild Steel".
const OUT = [
  { material: "Mild Steel", place: "stock_items.grade", rows_out: 77 },
  { material: "Mild Steel", place: "master_factor_items.grade", rows_out: 19 },
  { material: "Mild Steel", place: "requisitions.item_grade", rows_out: 11 },
  { material: "Mild Steel", place: "requisitions.item_label", rows_out: 11 },
  { material: "Mild Steel", place: "laser_programs.material", rows_out: "279" },
  { material: "Stainless 304", place: "stock_items.grade", rows_out: 1 },
  { material: "Galvanised", place: "some_new_table.grade", rows_out: 2 },
  { material: "Galvanised", place: "stock_items.grade", rows_out: 0 },
];

test("rows out of line: one entry a material, a requisition's label not counted twice", () => {
  const by = outOfLineByMaterial(OUT);
  const ms = outOfLineFor(by, { name: "mild steel ", shortName: "MS" });
  assert.equal(ms.total, 386);
  assert.deepEqual(ms.parts, ["77 stock lines", "19 sections", "11 requisitions", "279 laser programs"]);
  assert.equal(outOfLineFor(by, { name: "Stainless 304" }).total, 1);
  assert.deepEqual(outOfLineFor(by, { name: "Galvanised" }).parts, ["2 in some_new_table.grade"]);
  assert.equal(outOfLineFor(by, { name: "Domex" }), null);
  assert.equal(outOfLineFor(null, { name: "Mild Steel" }), null);
  assert.equal(outOfLineByMaterial(null).size, 0);
});

test("rows out of line: the words on the row and the question", () => {
  const by = outOfLineByMaterial(OUT);
  const material = { name: "Mild Steel", shortName: "MS" };
  assert.equal(
    outOfLineWords(material, outOfLineFor(by, material)),
    '386 rows are not written "MS": 77 stock lines, 19 sections, 11 requisitions, 279 laser programs.'
  );
  const one = { name: "Stainless 304", shortName: "SS304" };
  assert.equal(outOfLineWords(one, outOfLineFor(by, one)), '1 row is not written "SS304": 1 stock line.');
  const q = bringInLineQuestion(material, outOfLineFor(by, material));
  assert.match(q, /^Write every row of Mild Steel as "MS"\?/);
  assert.match(q, /77 stock lines, 19 sections, 11 requisitions, 279 laser programs are written another way/);
  assert.match(q, /when the floor has stopped/);
  // A material with no short name is held by its full name.
  const domex = { name: "Domex" };
  assert.match(bringInLineQuestion(domex, { total: 1, parts: ["1 stock line"] }), /as "Domex"\?[\s\S]*1 stock line is written another way/);
});
