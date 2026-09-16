import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLines, groupJobLines } from "./lineOrder.js";

const names = (list) => list.map((it) => it.description);
const sorted = (list) => names([...list].sort(compareLines));
const shape = (groups) => groups.map((g) => [g.heading, ...g.rows.map((r) => (r.indent ? "  " : "") + r.item.description)]);

test("numbers inside a name are read as numbers", () => {
  assert.deepEqual(
    sorted([{ id: "a", description: "Part 10" }, { id: "b", description: "Part 2" }, { id: "c", description: "Part 1" }]),
    ["Part 1", "Part 2", "Part 10"]
  );
  // Sub-part numbers, as on JOB-0056's Tressel parts.
  assert.deepEqual(
    sorted([
      { id: "a", description: "Tressel P-001.10" },
      { id: "b", description: "Tressel P-001.2" },
      { id: "c", description: "Tressel P-001.1" },
    ]),
    ["Tressel P-001.1", "Tressel P-001.2", "Tressel P-001.10"]
  );
});

test("case is ignored", () => {
  assert.deepEqual(
    sorted([{ id: "a", description: "Bracket" }, { id: "b", description: "angle" }, { id: "c", description: "Brace" }]),
    ["angle", "Brace", "Bracket"]
  );
});

test("the same name goes shortest first, a part with no length before any length", () => {
  // BOOTH DOORS WS: five parts called the same, told apart by length.
  const list = [2525, 2859, null, 2500, 2802.4].map((len, i) => ({
    id: "p" + i,
    description: "MRSB_BOOTH-01 GATES TUBING_0",
    length_mm: len,
  }));
  assert.deepEqual(
    [...list].sort(compareLines).map((it) => it.length_mm),
    [null, 2500, 2525, 2802.4, 2859]
  );
});

test("a tie is settled the same way every time: code, then quote order, then id", () => {
  const a = { id: "b-id", description: "Plate", stock_code: "", sort_order: 5 };
  const b = { id: "a-id", description: "plate", stock_code: "", sort_order: 5 };
  const c = { id: "c-id", description: "Plate", stock_code: "", sort_order: 1 };
  const d = { id: "d-id", description: "Plate", stock_code: "X1", sort_order: 0 };
  assert.deepEqual([a, b, c, d].sort(compareLines).map((it) => it.id), ["c-id", "a-id", "b-id", "d-id"]);
  assert.deepEqual([d, c, b, a].sort(compareLines).map((it) => it.id), ["c-id", "a-id", "b-id", "d-id"]);
});

test("a row with no description sorts as the Item it shows", () => {
  assert.deepEqual(
    sorted([{ id: "a", description: "Jig" }, { id: "b", description: "" }, { id: "c", description: "Angle" }]),
    ["Angle", "", "Jig"]
  );
});

test("compareLines takes the name a screen shows when it is not the description", () => {
  const shown = { a: "Zed", b: "Alpha" };
  const list = [{ id: "a", description: "Alpha" }, { id: "b", description: "Zed" }];
  assert.deepEqual(
    [...list].sort((x, y) => compareLines(x, y, (it) => shown[it.id])).map((it) => it.id),
    ["b", "a"]
  );
});

// JOB-0078 on live: three bumpers, and parts with the same names under them.
const single = { id: "L1", description: "Ranger Single Recovery Bumper", sort_order: 1 };
const double = { id: "L2", description: "Ranger Double Recovery Bumper", sort_order: 2 };
const raptor = { id: "L3", description: "Raptor Single Recovery Bumper", sort_order: 3 };
const loose = { id: "L4", description: "Base plate", sort_order: 4 };
const part = (id, parent, description) => ({ id, parent_quote_item_id: parent.id, description });
const job = [
  single,
  double,
  raptor,
  loose,
  part("P1", single, "BRLG-RANG- BRKT-01 P-004"),
  part("P2", single, "BRLG-RANG- BRKT-01 P-001 LH"),
  part("P3", double, "BRLG-RANG- BRKT-01 P-004"),
  part("P4", double, "BRLG-RANG- BRKT-01 P-001 RH"),
  part("P5", raptor, "BRLG-RANG- BRKT-01 P-004"),
];

test("a cutting stage's parts sit under their line's name, lines A to Z, parts A to Z", () => {
  // What a cutting stage lists: the parts, and a line with no parts.
  const listed = job.filter((it) => it.parent_quote_item_id || it === loose).reverse();
  assert.deepEqual(shape(groupJobLines(listed, job)), [
    [null, "Base plate"],
    ["Ranger Double Recovery Bumper", "  BRLG-RANG- BRKT-01 P-001 RH", "  BRLG-RANG- BRKT-01 P-004"],
    ["Ranger Single Recovery Bumper", "  BRLG-RANG- BRKT-01 P-001 LH", "  BRLG-RANG- BRKT-01 P-004"],
    ["Raptor Single Recovery Bumper", "  BRLG-RANG- BRKT-01 P-004"],
  ]);
});

test("a stage that lists the lines themselves is plain A to Z, no headings", () => {
  assert.deepEqual(shape(groupJobLines([single, double, raptor, loose], job)), [
    [null, "Base plate"],
    [null, "Ranger Double Recovery Bumper"],
    [null, "Ranger Single Recovery Bumper"],
    [null, "Raptor Single Recovery Bumper"],
  ]);
});

test("a line listed together with its parts leads its group, parts indented under it", () => {
  // Laser Status with no packing stage lists every line on the job.
  assert.deepEqual(shape(groupJobLines([...job].reverse(), job)).slice(0, 2), [
    [null, "Base plate"],
    [null, "Ranger Double Recovery Bumper", "  BRLG-RANG- BRKT-01 P-001 RH", "  BRLG-RANG- BRKT-01 P-004"],
  ]);
});

test("a part whose line cannot be found stands on its own among the lines", () => {
  const listed = [part("P9", { id: "gone" }, "Gusset"), loose, part("P1", single, "Cleat")];
  assert.deepEqual(shape(groupJobLines(listed, [loose, ...listed])), [
    [null, "Base plate"],
    [null, "Cleat"],
    [null, "Gusset"],
  ]);
  // Without the whole job, no line is known: every row stands alone, A to Z.
  assert.deepEqual(shape(groupJobLines(listed)), [[null, "Base plate"], [null, "Cleat"], [null, "Gusset"]]);
});

test("two lines with the same name stay two groups, in quote order", () => {
  const first = { id: "T1", description: "Tube laser parts", sort_order: 1 };
  const second = { id: "T2", description: "Tube laser parts", sort_order: 2 };
  const all = [second, first, part("A", second, "Rail"), part("B", first, "Post")];
  assert.deepEqual(shape(groupJobLines(all.slice(2), all)), [
    ["Tube laser parts", "  Post"],
    ["Tube laser parts", "  Rail"],
  ]);
});

test("the heading is the first line of a long description only", () => {
  const quoted = { id: "Q", description: "F31 - LEP VT Cage APD — Notes:\nH.D.G\nDrawings to be supplied" };
  const all = [quoted, part("Q1", quoted, "B&W_VTCLOS URE_P-001.1")];
  assert.equal(groupJobLines(all.slice(1), all)[0].heading, "F31 - LEP VT Cage APD — Notes:");
});

test("nothing handed in is changed", () => {
  const listed = job.filter((it) => it.parent_quote_item_id);
  const before = listed.map((it) => it.id);
  groupJobLines(listed, job);
  assert.deepEqual(listed.map((it) => it.id), before);
  assert.deepEqual(groupJobLines([], job), []);
  assert.deepEqual(groupJobLines(null, null), []);
});
