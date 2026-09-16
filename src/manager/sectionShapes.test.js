import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_SHAPES, shapeForType, shapeTitle, buildSection, missingBoxes, cleanNumber, pipeSizes } from "./sectionShapes.js";

const shape = (key) => SECTION_SHAPES.find((s) => s.key === key);

test("seventeen types, each key once", () => {
  assert.equal(SECTION_SHAPES.length, 17);
  assert.equal(new Set(SECTION_SHAPES.map((s) => s.key)).size, 17);
});

test("old stored type words find their shape", () => {
  assert.equal(shapeForType("Square Tube").key, "SHS");
  assert.equal(shapeForType("seamless pipe").key, "PIPE");
  assert.equal(shapeForType("Welded Pipe").key, "PIPE");
  assert.equal(shapeForType("H-Beam").key, "UC");
  assert.equal(shapeForType("I-Beam").key, "UB");
  assert.equal(shapeForType("SHS").key, "SHS");
  assert.equal(shapeForType(""), null);
  assert.equal(shapeForType("Something else"), null);
  assert.equal(shapeTitle(shape("SHS")), "SHS · Square Tube");
});

test("names are shop shorthand, no mm, no trailing zeros", () => {
  assert.equal(buildSection(shape("SHS"), { a: "50", t: "3.0" }).name, "SHS 50x50x3");
  assert.equal(buildSection(shape("RHS"), { a: "76", b: "50", t: "4,5" }).name, "RHS 76x50x4.5");
  assert.equal(buildSection(shape("CHS"), { od: "38.1", t: "2" }).name, "CHS 38.1x2");
  assert.equal(buildSection(shape("EA"), { a: 50, t: 5 }).name, "EA 50x50x5");
  assert.equal(buildSection(shape("LC"), { a: 100, b: 50, lip: 20, t: 2 }).name, "LC 100x50x20x2");
  assert.equal(buildSection(shape("UB"), { a: 254, b: 146, kgm: 37 }).name, "UB 254x146x37");
  assert.equal(buildSection(shape("RB"), { a: 12 }).name, "RB 12");
});

test("the numbers are stored with the shape", () => {
  assert.deepEqual(buildSection(shape("RHS"), { a: "76", b: "50", t: "4.5" }).dimensions, { shape: "RHS", a: 76, b: 50, t: 4.5 });
});

test("a missing or bad box names itself and builds nothing", () => {
  assert.deepEqual(missingBoxes(shape("RHS"), { a: "76", b: "", t: "-1" }), ["Width", "Wall"]);
  assert.equal(buildSection(shape("RHS"), { a: "76" }), null);
  assert.equal(cleanNumber("abc"), null);
  assert.equal(cleanNumber("0"), null);
});

test("pipe to schedule takes its size from the table", () => {
  const s = buildSection(shape("PIPE"), { std: "SCH", sch: "160", nb: "20" });
  assert.equal(s.name, "PIPE NB20 SCH160");
  assert.deepEqual(s.dimensions, { shape: "PIPE", std: "SCH", nb: 20, sch: "160", od: 26.7, t: 5.56 });
  assert.equal(buildSection(shape("PIPE"), { std: "SCH", sch: "XS", nb: 25 }).name, "PIPE NB25 XS");
  assert.equal(buildSection(shape("PIPE"), { std: "SCH", sch: "120", nb: 150 }).dimensions.t, 14.27);
  assert.deepEqual(missingBoxes(shape("PIPE"), { std: "SCH", sch: "XXS", nb: 25 }), ["Schedule"]);
});

test("pipe to SANS 62 takes its size from the class", () => {
  const s = buildSection(shape("PIPE"), { std: "SANS62", cls: "Medium", nb: 15 });
  assert.equal(s.name, "PIPE NB15 SANS62 Medium");
  assert.equal(s.dimensions.od, 21.3);
  assert.equal(s.dimensions.t, 2.65);
});

test("pipe to SABS 719 is typed", () => {
  const s = buildSection(shape("PIPE"), { std: "SABS719", nb: 200, od: 219.1, t: 6 });
  assert.equal(s.name, "PIPE NB200 SABS719 6");
  assert.deepEqual(missingBoxes(shape("PIPE"), { std: "SABS719", nb: 200 }), ["Outside dia", "Wall"]);
});

test("a pipe size the standard does not make is refused", () => {
  assert.deepEqual(missingBoxes(shape("PIPE"), { std: "SCH", sch: "20", nb: 15 }), ["a size that standard comes in"]);
  assert.deepEqual(missingBoxes(shape("PIPE"), {}), ["Standard"]);
  assert.ok(!pipeSizes("SANS62", "Light").includes(150));
  assert.ok(pipeSizes("SANS62", "Heavy").includes(150));
});
