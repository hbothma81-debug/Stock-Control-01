import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cutHasStarted, blankDraft, draftOfLine, sectionOnList, sectionChoices, gradesOfSection, draftWithSection,
  checkCutDraft, cutLineChanges, changesMaterial, pileStillUsed, materialAsListed,
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

const draft = (over) => ({ ...draftOfLine(LINE), ...over });

test("a line is locked once a piece of it has been cut", () => {
  assert.equal(cutHasStarted({ qty_cut: 0 }), false);
  assert.equal(cutHasStarted({ qty_cut: null }), false);
  assert.equal(cutHasStarted({}), false);
  assert.equal(cutHasStarted({ qty_cut: 1 }), true);
  assert.equal(cutHasStarted({ qty_cut: "3" }), true);
});

test("the boxes of a new line and of a line being changed", () => {
  assert.deepEqual(blankDraft(), { drawingNo: "", section: "", grade: "", cutLengthMm: "", qty: "", stockLengthM: "6", trimFront: true, note: "" });
  assert.deepEqual(draftOfLine(LINE), {
    drawingNo: "P-001", section: "SHS 50x50x3", grade: "300WA", cutLengthMm: "1200", qty: "4", stockLengthM: "6", trimFront: true, note: "",
  });
  assert.equal(draftOfLine({ ...LINE, trim_front: false }).trimFront, false);
  assert.equal(draftOfLine({ ...LINE, stock_length_m: null }).stockLengthM, "6");
});

test("the Section box offers every size once, numbers read as numbers, with its type", () => {
  assert.deepEqual(sectionChoices(SECTIONS), [
    { value: "EA 50x50x5", label: "EA 50x50x5", hint: "Equal angle" },
    { value: "FB 40x5", label: "FB 40x5", hint: "Flat bar" },
    { value: "SHS 50x50x3", label: "SHS 50x50x3", hint: "Square tube" },
    { value: "SHS 100x100x4", label: "SHS 100x100x4", hint: "Square tube" },
  ]);
  assert.deepEqual(sectionChoices(null), []);
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

test("picking a section fills in its only material, keeps one it shares, clears one it has not", () => {
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
  assert.equal(checkCutDraft(draft({ section: "" }), SECTIONS).why, "Pick a section first.");
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
  const kept = checkCutDraft({ ...draftOfLine(old), qty: "9" }, SECTIONS, old);
  assert.equal(kept.ok, true);
  assert.equal(kept.values.section, "50x50x3 SQ TUBE");
  assert.equal(kept.values.grade, "mild");
  assert.equal(kept.values.qty, 9);
  // As a new line it could not be saved.
  assert.equal(checkCutDraft(draftOfLine(old), SECTIONS).ok, false);
  // Changed to another spelling that is not on the list: refused.
  assert.equal(checkCutDraft({ ...draftOfLine(old), section: "50x50x3 tube" }, SECTIONS, old).ok, false);
  // Moved on to the list: its material must then be one of the size's.
  assert.equal(checkCutDraft({ ...draftOfLine(old), section: "SHS 50x50x3" }, SECTIONS, old).ok, false);
  assert.equal(checkCutDraft({ ...draftOfLine(old), section: "SHS 50x50x3", grade: "304" }, SECTIONS, old).ok, true);
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
