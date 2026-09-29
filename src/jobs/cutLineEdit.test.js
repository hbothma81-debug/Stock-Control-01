import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cutHasStarted, blankDraft, draftOfLine, sectionOnList, gradesOfSection, draftWithSection,
  checkCutDraft, cutLineChanges, changesMaterial, pileStillUsed, materialAsListed,
  NO_TYPE, typeOfSection, typeChoices, sizeChoices, materialChoices, draftWithType, draftWithMaterial,
} from "./cutLineEdit.js";

// Stock Manager's Sections list: a row per size and material.
const SECTIONS = [
  { name: "SHS 50x50x3", grade: "300WA", type: "Square tube" },
  { name: "SHS 50x50x3", grade: "304", type: "Square tube" },
  { name: "EA 50x50x5", grade: "300WA", type: "Equal angle" },
  { name: "SHS 100x100x4", grade: "300WA", type: "Square tube" },
  { name: "FB 40x5", grade: "", type: "Flat bar" },
];

const LINE = {
  id: "l1", drawing_no: "P-001", section: "SHS 50x50x3", grade: "300WA",
  cut_length_mm: 1200, qty: 4, qty_cut: 0, stock_length_m: 6, trim_front: true, note: "",
};

const draft = (over) => ({ ...draftOfLine(LINE, SECTIONS), ...over });

test("a line is locked once a piece of it has been cut", () => {
  assert.equal(cutHasStarted({ qty_cut: 0 }), false);
  assert.equal(cutHasStarted({ qty_cut: null }), false);
  assert.equal(cutHasStarted({}), false);
  assert.equal(cutHasStarted({ qty_cut: 1 }), true);
  assert.equal(cutHasStarted({ qty_cut: "3" }), true);
});

test("the boxes of a new line and of a line being changed", () => {
  assert.deepEqual(blankDraft(), {
    drawingNo: "", sectionType: "", section: "", grade: "", cutLengthMm: "", qty: "", stockLengthM: "6", trimFront: true, note: "",
  });
  // The type is found from the size, on the list: the line does not hold it.
  assert.deepEqual(draftOfLine(LINE, SECTIONS), {
    drawingNo: "P-001", sectionType: "Square Tube", section: "SHS 50x50x3", grade: "300WA",
    cutLengthMm: "1200", qty: "4", stockLengthM: "6", trimFront: true, note: "",
  });
  assert.equal(draftOfLine({ ...LINE, section: "50x50 sq tube" }, SECTIONS).sectionType, "");
  assert.equal(draftOfLine({ ...LINE, trim_front: false }, SECTIONS).trimFront, false);
  assert.equal(draftOfLine({ ...LINE, stock_length_m: null }, SECTIONS).stockLengthM, "6");
});

// As a list grows in the wild: pipes under an old word, a size whose
// second row lost its type, a size filed under a word of its own, and
// one under nothing.
const WILD = [
  ...SECTIONS,
  { name: "PIPE NB25 SCH40 33.4OD 26.64ID 3.38WT", grade: "300WA", type: "Seamless Pipe" },
  { name: "PIPE NB50 SCH40 60.3OD 52.48ID 3.91WT", grade: "300WA", type: "Pipe" },
  { name: "PIPE NB50 SCH40 60.3OD 52.48ID 3.91WT", grade: "304", type: "" },
  { name: "Grating 30x3", grade: "300WA", type: "Grating" },
  { name: "75x75x6", grade: "300WA", type: "" },
];

test("type and size are two boxes: the types offered", () => {
  const plain = typeChoices(SECTIONS);
  // The eighteen fixed types, in Stock Manager's order, whatever is on the list.
  assert.equal(plain.length, 18);
  assert.deepEqual(plain.slice(0, 4), [
    { value: "Square Tube", label: "Square Tube", hint: "SHS" },
    { value: "Rectangular Tube", label: "Rectangular Tube", hint: "RHS" },
    { value: "Round Tube", label: "Round Tube", hint: "CHS" },
    { value: "Pipe", label: "Pipe", hint: "PIPE" },
  ]);
  assert.equal(typeChoices(null).length, 18);
  // Then any other word in use, then the sizes under no type.
  const wild = typeChoices(WILD);
  assert.deepEqual(wild.slice(18), [
    { value: "Grating", label: "Grating", hint: "" },
    { value: NO_TYPE, label: NO_TYPE, hint: "sizes filed under no type" },
  ]);
  // An old word for a fixed type is not a type of its own.
  assert.equal(wild.some((t) => t.value === "Seamless Pipe"), false);
});

test("the type of a size: its shape's word, an old word read as its shape, the first row that has one", () => {
  assert.equal(typeOfSection(WILD, "SHS 50x50x3"), "Square Tube");
  assert.equal(typeOfSection(WILD, "shs 50x50x3"), "Square Tube");
  assert.equal(typeOfSection(WILD, "PIPE NB25 SCH40 33.4OD 26.64ID 3.38WT"), "Pipe");
  assert.equal(typeOfSection(WILD, "PIPE NB50 SCH40 60.3OD 52.48ID 3.91WT"), "Pipe");
  assert.equal(typeOfSection(WILD, "Grating 30x3"), "Grating");
  assert.equal(typeOfSection(WILD, "75x75x6"), NO_TYPE);
  assert.equal(typeOfSection(WILD, "not on the list"), "");
  assert.equal(typeOfSection(null, "SHS 50x50x3"), "");
});

test("the Size box offers the sizes of the type picked, and nothing until one is", () => {
  assert.deepEqual(sizeChoices(WILD, "", ""), []);
  assert.deepEqual(sizeChoices(WILD, "Square Tube", ""), ["SHS 50x50x3", "SHS 100x100x4"]);
  assert.deepEqual(sizeChoices(WILD, "square tube", ""), ["SHS 50x50x3", "SHS 100x100x4"]);
  // A pipe is found under Pipe, and nowhere else.
  assert.deepEqual(sizeChoices(WILD, "Pipe", ""), ["PIPE NB25 SCH40 33.4OD 26.64ID 3.38WT", "PIPE NB50 SCH40 60.3OD 52.48ID 3.91WT"]);
  assert.deepEqual(sizeChoices(WILD, "Round Tube", ""), []);
  assert.deepEqual(sizeChoices(WILD, "Grating", ""), ["Grating 30x3"]);
  assert.deepEqual(sizeChoices(WILD, NO_TYPE, ""), ["75x75x6"]);
});

test("with a material picked, the Size box offers the sizes held in it", () => {
  assert.deepEqual(sizeChoices(WILD, "Square Tube", "304"), ["SHS 50x50x3"]);
  assert.deepEqual(sizeChoices(WILD, "Square Tube", "300wa"), ["SHS 50x50x3", "SHS 100x100x4"]);
  assert.deepEqual(sizeChoices(WILD, "Pipe", "304"), ["PIPE NB50 SCH40 60.3OD 52.48ID 3.91WT"]);
  assert.deepEqual(sizeChoices(WILD, "Square Tube", "S355"), []);
  // A size held with no material is offered only while none is picked.
  assert.deepEqual(sizeChoices(WILD, "Flat Bar", ""), ["FB 40x5"]);
  assert.deepEqual(sizeChoices(WILD, "Flat Bar", "300WA"), []);
});

test("the Material box offers Stock Manager's materials, by the name the list holds them under", () => {
  const materials = [{ name: "Stainless 304", shortName: "304" }, { name: "Mild Steel", shortName: "MS" }, { name: "3CR12", shortName: "" }, { name: "ms" }];
  assert.deepEqual(materialChoices(materials, SECTIONS), ["3CR12", "304", "MS"]);
  // Without them, the materials the list's sizes are held in.
  assert.deepEqual(materialChoices(null, SECTIONS), ["300WA", "304"]);
  assert.deepEqual(materialChoices([], null), []);
});

test("another type takes the size with it and leaves the material", () => {
  const d = { ...blankDraft(), sectionType: "Square Tube", section: "SHS 50x50x3", grade: "300WA", qty: "4" };
  assert.deepEqual(draftWithType(d, "Pipe"), { ...d, sectionType: "Pipe", section: "" });
  assert.deepEqual(draftWithType(d, ""), { ...d, sectionType: "", section: "" });
  // The same type again changes nothing.
  assert.deepEqual(draftWithType(d, "Square Tube"), d);
});

test("another material keeps the size where it is held in that one too", () => {
  const d = { ...blankDraft(), sectionType: "Square Tube", section: "SHS 50x50x3", grade: "300WA" };
  assert.deepEqual(draftWithMaterial(d, SECTIONS, "304"), { ...d, grade: "304" });
  assert.deepEqual(draftWithMaterial(d, SECTIONS, "S355"), { ...d, grade: "S355", section: "" });
  assert.deepEqual(draftWithMaterial(d, SECTIONS, ""), { ...d, grade: "" });
  // No size yet, or a size from before the rule: only the material moves.
  assert.deepEqual(draftWithMaterial({ ...d, section: "" }, SECTIONS, "S355"), { ...d, section: "", grade: "S355" });
  assert.deepEqual(draftWithMaterial({ ...d, section: "50x50 sq tube" }, SECTIONS, "S355"), { ...d, section: "50x50 sq tube", grade: "S355" });
});

test("a section is on the list whatever its capitals, and comes back as the list spells it", () => {
  assert.equal(sectionOnList(SECTIONS, "shs 50x50x3"), "SHS 50x50x3");
  assert.equal(sectionOnList(SECTIONS, " SHS 50x50x3 "), "SHS 50x50x3");
  assert.equal(sectionOnList(SECTIONS, "SHS 50 x 50 x 3"), null);
  assert.equal(sectionOnList(SECTIONS, ""), null);
});

test("the materials a size is held in", () => {
  assert.deepEqual(gradesOfSection(SECTIONS, "SHS 50x50x3"), ["300WA", "304"]);
  assert.deepEqual(gradesOfSection(SECTIONS, "ea 50x50x5"), ["300WA"]);
  assert.deepEqual(gradesOfSection(SECTIONS, "FB 40x5"), []);
  assert.deepEqual(gradesOfSection(SECTIONS, "not there"), []);
});

test("picking a size sets its type where none was picked", () => {
  assert.equal(draftWithSection(blankDraft(), SECTIONS, "EA 50x50x5").sectionType, "Equal Angle");
  assert.equal(draftWithSection({ ...blankDraft(), sectionType: "Square Tube" }, SECTIONS, "SHS 50x50x3").sectionType, "Square Tube");
});

test("picking a size fills in its only material, keeps one it shares, clears one it has not", () => {
  assert.equal(draftWithSection(blankDraft(), SECTIONS, "EA 50x50x5").grade, "300WA");
  assert.equal(draftWithSection(blankDraft(), SECTIONS, "SHS 50x50x3").grade, "");
  assert.equal(draftWithSection({ ...blankDraft(), grade: "304" }, SECTIONS, "SHS 50x50x3").grade, "304");
  assert.equal(draftWithSection({ ...blankDraft(), grade: "304" }, SECTIONS, "EA 50x50x5").grade, "300WA");
  assert.equal(draftWithSection({ ...blankDraft(), grade: "304" }, SECTIONS, "FB 40x5").grade, "");
});

test("a new line: read from the boxes as the table holds it", () => {
  const got = checkCutDraft(
    { drawingNo: " P-7 ", section: "shs 50x50x3", grade: "300wa", cutLengthMm: "1250", qty: "6", stockLengthM: "6", trimFront: false, note: " mitre " },
    SECTIONS
  );
  assert.deepEqual(got, {
    ok: true,
    values: { drawing_no: "P-7", section: "SHS 50x50x3", grade: "300WA", cut_length_mm: 1250, qty: 6, stock_length_m: 6, trim_front: false, note: "mitre" },
  });
});

test("a section is picked, never typed: one that is not on the list is refused", () => {
  const got = checkCutDraft(draft({ section: "50x50x3 square" }), SECTIONS);
  assert.equal(got.ok, false);
  assert.match(got.why, /50x50x3 square is not on the Sections list/);
  assert.match(got.why, /New size/);
  assert.equal(checkCutDraft(draft({ section: "" }), SECTIONS).why, "Pick the size.");
  assert.equal(checkCutDraft(blankDraft(), SECTIONS).why, "Pick the section type, then the size.");
});

test("the material is one the size is held in", () => {
  const got = checkCutDraft(draft({ grade: "S355" }), SECTIONS);
  assert.equal(got.ok, false);
  assert.equal(got.why, "Pick the material for SHS 50x50x3: 300WA, 304.");
  assert.equal(checkCutDraft(draft({ grade: "" }), SECTIONS).ok, false);
  // A size held with no material takes none.
  assert.equal(checkCutDraft(draft({ section: "FB 40x5", grade: "" }), SECTIONS).ok, true);
  assert.match(checkCutDraft(draft({ section: "FB 40x5", grade: "300WA" }), SECTIONS).why, /no material/);
});

test("the numbers: a length, a whole number of pieces, a bar", () => {
  assert.equal(checkCutDraft(draft({ cutLengthMm: "" }), SECTIONS).why, "Give the cut length, in millimetres.");
  assert.equal(checkCutDraft(draft({ cutLengthMm: "0" }), SECTIONS).ok, false);
  assert.equal(checkCutDraft(draft({ qty: "" }), SECTIONS).why, "How many? A whole number of pieces.");
  assert.equal(checkCutDraft(draft({ qty: "2.5" }), SECTIONS).ok, false);
  assert.equal(checkCutDraft(draft({ qty: "-1" }), SECTIONS).ok, false);
  assert.equal(checkCutDraft(draft({ stockLengthM: "" }), SECTIONS).why, "Give the stock length, in metres.");
  assert.equal(checkCutDraft(draft({ cutLengthMm: "1200.5", qty: "12", stockLengthM: "13.5" }), SECTIONS).ok, true);
});

test("a line from before the rule keeps its own section while the section is left alone", () => {
  const old = { ...LINE, section: "50x50x3 SQ TUBE", grade: "mild" };
  const kept = checkCutDraft({ ...draftOfLine(old, SECTIONS), qty: "9" }, SECTIONS, old);
  assert.equal(kept.ok, true);
  assert.equal(kept.values.section, "50x50x3 SQ TUBE");
  assert.equal(kept.values.grade, "mild");
  assert.equal(kept.values.qty, 9);
  // As a new line it could not be saved.
  assert.equal(checkCutDraft(draftOfLine(old, SECTIONS), SECTIONS).ok, false);
  // Changed to another spelling that is not on the list: refused.
  assert.equal(checkCutDraft({ ...draftOfLine(old, SECTIONS), section: "50x50x3 tube" }, SECTIONS, old).ok, false);
  // Moved on to the list: its material must then be one of the size's.
  assert.equal(checkCutDraft({ ...draftOfLine(old, SECTIONS), section: "SHS 50x50x3" }, SECTIONS, old).ok, false);
  assert.equal(checkCutDraft({ ...draftOfLine(old, SECTIONS), section: "SHS 50x50x3", grade: "304" }, SECTIONS, old).ok, true);
});

test("what a save changes, in columns and in words", () => {
  const values = checkCutDraft(draft({ cutLengthMm: "1250", qty: "6", note: "mitre one end" }), SECTIONS, LINE).values;
  assert.deepEqual(cutLineChanges(LINE, values), {
    patch: { cut_length_mm: 1250, qty: 6, note: "mitre one end" },
    words: ["cut length 1200 to 1250 mm", "quantity 4 to 6", "note nothing to mitre one end"],
  });
});

test("nothing changed is an empty save, whatever the boxes hold the numbers as", () => {
  const values = checkCutDraft(draft({ cutLengthMm: "1200.0", qty: "4", stockLengthM: "6.00" }), SECTIONS, LINE).values;
  assert.deepEqual(cutLineChanges({ ...LINE, cut_length_mm: "1200", qty: "4.00" }, values), { patch: {}, words: [] });
});

test("section, material, bar and trim in words", () => {
  const values = checkCutDraft(draft({ section: "EA 50x50x5", grade: "300WA", stockLengthM: "13", trimFront: false, drawingNo: "" }), SECTIONS, LINE).values;
  const got = cutLineChanges(LINE, values);
  assert.deepEqual(got.patch, { drawing_no: "", section: "EA 50x50x5", stock_length_m: 13, trim_front: false });
  assert.deepEqual(got.words, ["drawing no P-001 to nothing", "section SHS 50x50x3 to EA 50x50x5", "stock length 6 to 13 m", "front trim off"]);
  assert.deepEqual(cutLineChanges({ ...LINE, trim_front: false }, { trim_front: true }).words, ["front trim on"]);
  // A line saved before the trim column had a value reads as trimmed.
  assert.deepEqual(cutLineChanges({ ...LINE, trim_front: null }, { trim_front: true }), { patch: {}, words: [] });
});

test("a change of section, material or bar moves the line to another pile", () => {
  assert.equal(changesMaterial({ qty: 6, note: "x" }), false);
  assert.equal(changesMaterial({ section: "EA 50x50x5" }), true);
  assert.equal(changesMaterial({ grade: "304" }), true);
  assert.equal(changesMaterial({ stock_length_m: 13 }), true);
  assert.equal(changesMaterial(null), false);
});

test("whether another line still draws on the pile a line was on", () => {
  const other = { ...LINE, id: "l2", cut_length_mm: 800 };
  assert.equal(pileStillUsed([LINE, other], LINE), true);
  assert.equal(pileStillUsed([LINE], LINE), false);
  assert.equal(pileStillUsed([LINE, { ...other, grade: "304" }], LINE), false);
  assert.equal(pileStillUsed([LINE, { ...other, stock_length_m: 13 }], LINE), false);
  assert.equal(pileStillUsed([LINE, { ...other, section: "shs 50x50x3" }], LINE), true);
});

test("a material under its long name is the one the list holds by its short name", () => {
  const materials = [{ name: "Mild Steel", shortName: "MS" }, { name: "Stainless 304", shortName: "304" }, { name: "3CR12", shortName: "" }];
  const sections = [
    { name: "SHS 50x50x2", grade: "MS", type: "Square Tube" },
    { name: "SHS 50x50x2", grade: "304", type: "Square Tube" },
    { name: "FB 40x5", grade: "Mild Steel", type: "Flat Bar" },
  ];
  // Practice, 29 Sep 2026: the line read "Mild Steel", the list "MS".
  assert.equal(materialAsListed(materials, sections, "SHS 50x50x2", "Mild Steel"), "MS");
  assert.equal(materialAsListed(materials, sections, "shs 50x50x2", "mild steel"), "MS");
  assert.equal(materialAsListed(materials, sections, "SHS 50x50x2", "ms"), "MS");
  assert.equal(materialAsListed(materials, sections, "SHS 50x50x2", "Stainless 304"), "304");
  // The other way round: the list holds the long name.
  assert.equal(materialAsListed(materials, sections, "FB 40x5", "MS"), "Mild Steel");
  // A material the size is not held in, or one nobody knows: left as it is.
  assert.equal(materialAsListed(materials, sections, "FB 40x5", "304"), "304");
  assert.equal(materialAsListed(materials, sections, "SHS 50x50x2", "mild"), "mild");
  assert.equal(materialAsListed(materials, sections, "SHS 50x50x2", "3CR12"), "3CR12");
  assert.equal(materialAsListed(null, sections, "SHS 50x50x2", "Mild Steel"), "Mild Steel");
  assert.equal(materialAsListed(materials, sections, "SHS 50x50x2", ""), "");
});
