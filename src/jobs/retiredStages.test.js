import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetired, retiredReady, stagesOffered, stagesToCopy } from "./retiredStages.js";

const flow = ["Nesting", "Laser", "Welding", "Assembly", "Delivery Note", "Invoicing"];
const settings = {
  Laser: { process_name: "Laser", cuts_made_on: "laser", retired: false },
  "Delivery Note": { process_name: "Delivery Note", retired: true },
};

test("retired: only a stage whose setting says so", () => {
  assert.equal(isRetired(settings, "Delivery Note"), true);
  assert.equal(isRetired(settings, "Laser"), false);
  assert.equal(isRetired(settings, "Welding"), false, "a stage with no settings row");
  assert.equal(isRetired(null, "Delivery Note"), false);
  assert.equal(isRetired({ "Delivery Note": { retired: null } }, "Delivery Note"), false);
});

test("whether the database has the setting: read off a row", () => {
  assert.equal(retiredReady(settings), true);
  assert.equal(retiredReady({ Laser: { process_name: "Laser", cuts_made_on: "laser" } }), false);
  assert.equal(retiredReady({}), false);
  assert.equal(retiredReady(null), false);
});

test("a job without the retired stage is not offered it", () => {
  assert.deepEqual(stagesOffered(flow, settings, ["Laser", "Welding"]), ["Nesting", "Laser", "Welding", "Assembly", "Invoicing"]);
});

test("a job that has the retired stage keeps it, in its place in the flow", () => {
  assert.deepEqual(stagesOffered(flow, settings, ["Laser", "Delivery Note"]), flow);
});

test("a stage on the job that the list no longer has is still shown, last", () => {
  assert.deepEqual(stagesOffered(flow, settings, ["Laser", "Old Stage"]), ["Nesting", "Laser", "Welding", "Assembly", "Invoicing", "Old Stage"]);
});

test("nothing retired, or no settings: the whole list, as before", () => {
  assert.deepEqual(stagesOffered(flow, {}, []), flow);
  assert.deepEqual(stagesOffered(flow, null, null), flow);
  assert.deepEqual(stagesOffered(null, null, null), []);
});

test("Copy job leaves a retired stage behind and says which", () => {
  const source = [
    { process_name: "Laser", sort_order: 0 },
    { process_name: "Delivery Note", sort_order: 1 },
    { process_name: "Invoicing", sort_order: 2 },
    { process_name: "Delivery Note", sort_order: 3 },
  ];
  const { kept, left } = stagesToCopy(source, settings);
  assert.deepEqual(kept.map((p) => p.process_name), ["Laser", "Invoicing"]);
  assert.deepEqual(left, ["Delivery Note"]);
  assert.deepEqual(stagesToCopy(source, {}), { kept: source, left: [] });
  assert.deepEqual(stagesToCopy(null, settings), { kept: [], left: [] });
});
