import { test } from "node:test";
import assert from "node:assert/strict";
import { printModel, fmtMm, nestLabel } from "./nestingPrint.js";

// MARCH as the import keeps it: 25 lengths, three nests.
const MARCH = {
  program_number: "00003",
  nesting_name: "MARCH",
  material: "CHS 19.05x1.5 304",
  sheets_required: 25,
  jobs: [{ job_id: "j1", job_number: "JOB-0004", customer: "Acme" }],
  parts: [
    { id: 1, name: "SSD-5-HOLE-POST THRU", qty: 100, length: 1000 },
    { id: 2, name: "SSD-7-HOLE-POST THRU", qty: 50, length: 1000 },
  ],
  nests: [
    { name: "Round tube R19.05mm_Nest 1", qty: 8, tubeLength: 6010, remnant: 7, parts: [{ id: 2, name: "SSD-7-HOLE-POST THRU", qty: 6, length: 1000 }] },
    {
      name: "Round tube R19.05mm_Nest 2",
      qty: 1,
      tubeLength: 6010,
      remnant: 7,
      parts: [
        { id: 1, name: "SSD-5-HOLE-POST THRU", qty: 4, length: 1000 },
        { id: 2, name: "SSD-7-HOLE-POST THRU", qty: 2, length: 1000 },
      ],
    },
    { name: "Round tube R19.05mm_Nest 3", qty: 16, tubeLength: 6010, remnant: 7, parts: [{ id: 1, name: "SSD-5-HOLE-POST THRU", qty: 6, length: 1000 }] },
  ],
};

const LINES = [
  { id: "parent", job_id: "j1", description: "MARCH", parent_quote_item_id: null },
  { id: "c1", job_id: "j1", description: "SSD-5-HOLE-POST THRU", parent_quote_item_id: "parent", stock_code: "SSD-5" },
  { id: "other", job_id: "j9", description: "SSD-7-HOLE-POST THRU", parent_quote_item_id: "x", stock_code: "WRONG-JOB" },
];

test("page 1: marks, drawings, the job line's code, and what to draw", () => {
  const m = printModel(MARCH, LINES);
  assert.equal(m.number, "00003");
  assert.deepEqual(m.draw, { lengths: 25, material: "CHS 19.05x1.5 304", tubeLength: 6010 });
  assert.deepEqual(
    m.parts.map((p) => [p.mark, p.drawing, p.code, p.qty, p.length]),
    [
      ["1", "SSD-5-HOLE-POST THRU", "SSD-5", 100, 1000],
      // A line on another job is never matched.
      ["2", "SSD-7-HOLE-POST THRU", "", 50, 1000],
    ]
  );
  assert.equal(m.showJob, false);
});

test("each nest: tubes, offcut, per tube and what it makes", () => {
  const m = printModel(MARCH, LINES);
  assert.deepEqual(m.nests.map((n) => [n.label, n.tubes, n.remnant]), [["Nest 1", 8, 7], ["Nest 2", 1, 7], ["Nest 3", 16, 7]]);
  assert.deepEqual(m.nests[0].parts.map((p) => [p.mark, p.perTube, p.makes]), [["2", 6, 48]]);
  assert.deepEqual(m.nests[2].parts.map((p) => p.makes), [96]);
});

test("parts not put on the job: page 1 is added up from the nests", () => {
  const m = printModel({ ...MARCH, parts: [] }, []);
  assert.deepEqual(m.parts.map((p) => [p.mark, p.qty]), [["1", 100], ["2", 50]]);
});

test("a program made before nests were kept prints page 1 only", () => {
  const old = { ...MARCH, nests: undefined, parts: [{ name: "POST", qty: 10, length: 1200 }] };
  const m = printModel(old, []);
  assert.equal(m.nests.length, 0);
  assert.deepEqual(m.parts.map((p) => [p.mark, p.drawing, p.qty]), [["", "POST", 10]]);
  assert.equal(m.draw.tubeLength, null);
});

test("two jobs: each part says which job it is on", () => {
  const two = { ...MARCH, jobs: [...MARCH.jobs, { job_id: "j9", job_number: "JOB-0009" }] };
  const m = printModel(two, LINES);
  assert.equal(m.showJob, true);
  // SSD-7 is now on j9's lines, and so matched there.
  assert.deepEqual(m.parts.map((p) => [p.drawing, p.job, p.code]), [
    ["SSD-5-HOLE-POST THRU", "JOB-0004", "SSD-5"],
    ["SSD-7-HOLE-POST THRU", "JOB-0009", "WRONG-JOB"],
  ]);
});

test("lengths read 2 525 and 2 802.4; nest names shorten", () => {
  assert.equal(fmtMm(2525), "2 525");
  assert.equal(fmtMm("2802.40"), "2 802.4");
  assert.equal(fmtMm(null), "");
  assert.equal(nestLabel("Square tube Width50.8mm X R3mm_Nest 12", 0), "Nest 12");
  assert.equal(nestLabel("odd", 2), "Nest 3");
});
