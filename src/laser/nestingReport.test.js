import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNestingList, nestsNote, referenceFromFileName, findNestingListSheet, parsePartInfo, parseTypedParts, findSheet } from "./nestingReport.js";

// MARCH.xlsx, Part Info sheet.
const MARCH_PARTS = [
  ["Part Info", "", "", ""],
  ["", "Section:Round tube R19.05mm", "Part Type:2", "Part Count:150"],
  ["ID", "Part Name", "Qty", "Part Length(mm)"],
  [1, "SSD-5-HOLE-POST THRU", "100/100", "1000.00"],
  [2, "SSD-7-HOLE-POST THRU", "50/50", "1000.00"],
];

test("the parts: name, total quantity and length, per section", () => {
  const { sections } = parsePartInfo(MARCH_PARTS);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].partCount, 150);
  assert.deepEqual(sections[0].parts, [
    { name: "SSD-5-HOLE-POST THRU", qty: 100, length: 1000 },
    { name: "SSD-7-HOLE-POST THRU", qty: 50, length: 1000 },
  ]);
});

test("a part not fully nested is refused, saying which", () => {
  const rows = MARCH_PARTS.map((r) => (r[1] === "SSD-7-HOLE-POST THRU" ? [2, r[1], "40/50", "1000.00"] : r));
  assert.throws(() => parsePartInfo(rows), /SSD-7-HOLE-POST THRU.*40 of 50/);
});

test("two sections on the detailed export keep their parts apart", () => {
  const rows = [
    ["Part Info"],
    ["", "Section:Square tube Width50.8mm X R3mm", "Part Type:1", "Part Count:2"],
    ["ID", "Part Name", "Qty", "Part Length(mm)", "Contour Qty", "Cut Length(mm)", "Price(元)"],
    [1, "MRSB_BOOTH-01 GATES TUBING_02", "2/2", "2525.00", 4, "570.32", "0.00"],
    ["", "Section:L tube(L) Width50mm X Height50mm", "Part Type:1", "Part Count:2"],
    ["ID", "Part Name", "Qty", "Part Length(mm)", "Contour Qty", "Cut Length(mm)", "Price(元)"],
    [6, "MRSB_BOOTH-01 GATES ANGLE", "2/2", "1828.18", 4, "252.74", "0.00"],
  ];
  const { sections } = parsePartInfo(rows);
  assert.deepEqual(sections.map((s) => [s.reportSection, s.parts.length, s.parts[0].length]), [
    ["Square tube Width50.8mm X R3mm", 1, 2525],
    ["L tube(L) Width50mm X Height50mm", 1, 1828.18],
  ]);
});

test("hand-typed parts: name, qty, length per line; length optional; bad lines named", () => {
  assert.deepEqual(parseTypedParts("POST, 10, 1000\nBRACE, 4\n\nRAIL; 2; 2500mm"), [
    { name: "POST", qty: 10, length: 1000 },
    { name: "BRACE", qty: 4, length: null },
    { name: "RAIL", qty: 2, length: 2500 },
  ]);
  assert.deepEqual(parseTypedParts(""), []);
  assert.throws(() => parseTypedParts("POST, ten"), /Could not read "POST, ten"/);
});

test("the Part Info sheet is found like the Nesting List", () => {
  assert.equal(findSheet(["Part Info", "Tube Info", "Nesting List"], "Part Info"), "Part Info");
  assert.equal(findSheet(["Tube Info"], "Part Info"), null);
});

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
