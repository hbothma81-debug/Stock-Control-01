import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNestingList, nestsNote, referenceFromFileName, findNestingListSheet } from "./nestingReport.js";

// MARCH.xlsx, the simple export, as its Nesting List sheet reads.
const MARCH = [
  ["Nesting List", "", "", "", "", ""],
  ["", "Section:Round tube R19.05mm", "Tube Count:25", "Part Count:150", "", ""],
  ["Nesting Name", "Qty", "Parts per tube", "Tube Length(mm)", "Remnant Length(mm)", "Utilization"],
  ["Round tube R19.05mm_Nest 1", 8, 6, "6010.00", "7.00", "100.0%"],
  ["ID", "Part Name", "Qty", "Identical parts per tube", "Part Length(mm)", ""],
  [2, "SSD-7-HOLE-POST THRU", 6, 6, "1000.00", ""],
  ["Round tube R19.05mm_Nest 2", 1, 6, "6010.00", "7.00", "100.0%"],
  ["ID", "Part Name", "Qty", "Identical parts per tube", "Part Length(mm)", ""],
  [1, "SSD-5-HOLE-POST THRU", 4, 4, "1000.00", ""],
  [2, "SSD-7-HOLE-POST THRU", 2, 2, "1000.00", ""],
  ["Round tube R19.05mm_Nest 3", 16, 6, "6010.00", "7.00", "100.0%"],
  ["ID", "Part Name", "Qty", "Identical parts per tube", "Part Length(mm)", ""],
  [1, "SSD-5-HOLE-POST THRU", 6, 6, "1000.00", ""],
];

test("one section, three nests, 25 tubes", () => {
  const { sections } = parseNestingList(MARCH);
  assert.equal(sections.length, 1);
  const s = sections[0];
  assert.equal(s.reportSection, "Round tube R19.05mm");
  assert.equal(s.tubes, 25);
  assert.deepEqual(s.nests.map((n) => n.qty), [8, 1, 16]);
  assert.deepEqual(s.nests[1].parts.map((p) => p.name), ["SSD-5-HOLE-POST THRU", "SSD-7-HOLE-POST THRU"]);
});

test("two sections in the detailed export become two programs' worth", () => {
  const rows = [
    ["Nesting List"],
    ["", "Section:Square tube Width50.8mm X R3mm", "Tube Count:5", "Part Count:10"],
    ["Nesting Name", "Qty", "Parts per tube", "Tube Length(mm)", "Remnant Length(mm)", "Utilization", "QR Code", "Contour Qty", "Cut Length(mm)"],
    ["Square tube Width50.8mm X R3mm_Nest 1", 1, 2, "6000.00", "276.73", "97.1%", "", 4, "947.11"],
    ["ID", "Part Name", "Qty", "Identical parts per tube", "Part Length(mm)", "Thumbnail"],
    [3, "MRSB_BOOTH-01 GATES TUBING_05", 2, 2, "2878.00"],
    ["Square tube Width50.8mm X R3mm_Nest 2", 4, 2, "6000.00", "320.73", "96.3%", "", 4, "911.48"],
    ["ID", "Part Name", "Qty", "Identical parts per tube", "Part Length(mm)", "Thumbnail"],
    [2, "MRSB_BOOTH-01 GATES TUBING_03", 2, 2, "2856.00"],
    ["", "Section:L tube(L) Width50mm X Height50mm", "Tube Count:3", "Part Count:8"],
    ["Nesting Name", "Qty", "Parts per tube", "Tube Length(mm)"],
    ["L tube(L) Width50mm X Height50mm_Nest 1", 3, 3, "6000.00"],
    ["ID", "Part Name", "Qty", "Identical parts per tube", "Part Length(mm)", "Thumbnail"],
    [6, "MRSB_BOOTH-01 GATES ANGLE", 2, 2, "1828.18"],
  ];
  const { sections } = parseNestingList(rows);
  assert.deepEqual(
    sections.map((s) => [s.reportSection, s.tubes, s.nests.length]),
    [
      ["Square tube Width50.8mm X R3mm", 5, 2],
      ["L tube(L) Width50mm X Height50mm", 3, 1],
    ]
  );
});

test("a header count that disagrees with the nests is refused, not guessed", () => {
  const rows = [
    ["", "Section:Round tube R19.05mm", "Tube Count:9"],
    ["Nesting Name", "Qty"],
    ["Round tube R19.05mm_Nest 1", 8],
  ];
  assert.throws(() => parseNestingList(rows), /says 9 tubes, but its nests add up to 8/);
});

test("no header count: the nests decide", () => {
  const rows = [
    ["", "Section:Round tube R19.05mm"],
    ["Nesting Name", "Qty"],
    ["Round tube R19.05mm_Nest 1", 8],
    ["Round tube R19.05mm_Nest 2", 2],
  ];
  assert.equal(parseNestingList(rows).sections[0].tubes, 10);
});

test("a sheet with no sections is refused in plain words", () => {
  assert.throws(() => parseNestingList([["Part Info"], ["ID", "Part Name"]]), /No sections found/);
  assert.throws(() => parseNestingList([]), /No sections found/);
});

test("the note reads Nest 1 × 8 tubes, Nest 2 × 1 tube", () => {
  const { sections } = parseNestingList(MARCH);
  assert.equal(nestsNote(sections[0]), "Nest 1 × 8 tubes, Nest 2 × 1 tube, Nest 3 × 16 tubes");
});

test("the file name without its extension is the reference", () => {
  assert.equal(referenceFromFileName("MARCH.xlsx"), "MARCH");
  assert.equal(referenceFromFileName("4 SHELF DISPLAY WS.xlsx"), "4 SHELF DISPLAY WS");
  assert.equal(referenceFromFileName("38x38x1.6 LONG PARTS WS 294 sets.xlsx"), "38x38x1.6 LONG PARTS WS 294 sets");
});

test("the Nesting List sheet is found however it is spaced", () => {
  assert.equal(findNestingListSheet(["Part Info", "Tube Info", "Nesting  Summary", "Nesting List"]), "Nesting List");
  assert.equal(findNestingListSheet(["Part Info", "nesting list"]), "nesting list");
  assert.equal(findNestingListSheet(["Part Info", "Tube Info"]), null);
});
