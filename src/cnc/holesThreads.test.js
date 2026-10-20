import { test } from "node:test";
import assert from "node:assert/strict";
import { holesToSettings, newLine, settingsToHoles } from "./holesThreads.js";

test("one line of each kind becomes the engine's job settings", () => {
  const { settings, errors } = holesToSettings([
    { ...newLine("tap"), size: "M8", length: "12" },
    { ...newLine("ream"), dia: "12", end: "L" },
    { ...newLine("starts"), starts: "2" },
    { ...newLine("form"), end: "L", form: "BSW" },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(settings, {
    id_thread: { end: "0", size: "M8", length: 12 },
    ream: { dia: 12, end: "L" },
    thread_starts: { 0: 2 },
    thread_form: { L: "BSW" },
  });
});

test("two holes of a kind go as a list; none sends nothing", () => {
  const { settings } = holesToSettings([{ ...newLine("tap"), size: "G1/2" }, { ...newLine("tap"), size: "M6", end: "L" }]);
  assert.deepEqual(settings.id_thread, [{ end: "0", size: "G1/2" }, { end: "L", size: "M6" }]);
  assert.deepEqual(holesToSettings([]).settings, {});
});

test("a line that can't be sent is named, not sent", () => {
  const { settings, errors } = holesToSettings([newLine("tap"), { ...newLine("ream"), dia: "abc" }, { ...newLine("starts"), starts: "9" }]);
  assert.deepEqual(settings, {});
  assert.equal(errors.length, 3);
});

test("saved settings come back as the same lines", () => {
  const lines = [{ ...newLine("tap"), size: "1/2-13 UNC", end: "L", length: "20" }, { ...newLine("ream"), dia: "16" }, { ...newLine("form"), form: "UNF" }];
  const back = settingsToHoles(holesToSettings(lines).settings);
  assert.deepEqual(holesToSettings(back).settings, holesToSettings(lines).settings);
});
