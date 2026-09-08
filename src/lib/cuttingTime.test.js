// The cutting-time sums: what the Cutting counter and the Shifts report
// add up. Run with:   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedMinutes, outstandingMinutes, fmtMinutes, laserShifts } from "./cuttingTime.js";

test("planned time is minutes per sheet times the sheets required", () => {
  assert.equal(plannedMinutes({ cut_minutes: 12, sheets_required: 2 }), 24);
  assert.equal(plannedMinutes({ cut_minutes: 12, sheets_required: 1 }), 12);
});

test("a program with no sheets count still counts as one sheet", () => {
  assert.equal(plannedMinutes({ cut_minutes: 12 }), 12);
  assert.equal(plannedMinutes({ cut_minutes: 12, sheets_required: 0 }), 12);
});

test("no time given is 'not given', never zero", () => {
  assert.equal(plannedMinutes({ cut_minutes: null, sheets_required: 3 }), null);
  assert.equal(plannedMinutes({ sheets_required: 3 }), null);
  assert.equal(plannedMinutes({ cut_minutes: "", sheets_required: 3 }), null);
  assert.equal(outstandingMinutes({ cut_minutes: null, sheets_required: 3, sheets_cut: 1 }), null);
});

test("a time typed as text still adds up", () => {
  assert.equal(plannedMinutes({ cut_minutes: "7.5", sheets_required: 2 }), 15);
});

test("outstanding time is only the sheets still to cut", () => {
  assert.equal(outstandingMinutes({ cut_minutes: 12, sheets_required: 2, sheets_cut: 1 }), 12);
  assert.equal(outstandingMinutes({ cut_minutes: 12, sheets_required: 2, sheets_cut: 0 }), 24);
  assert.equal(outstandingMinutes({ cut_minutes: 12, sheets_required: 2, sheets_cut: 2 }), 0);
});

test("outstanding time never goes negative, however the count was typed", () => {
  assert.equal(outstandingMinutes({ cut_minutes: 12, sheets_required: 2, sheets_cut: 5 }), 0);
  assert.equal(outstandingMinutes({ cut_minutes: 12, sheets_required: 2, sheets_cut: -1 }), 24);
});

test("minutes read as minutes under an hour and hours past it", () => {
  assert.equal(fmtMinutes(45), "45 min");
  assert.equal(fmtMinutes(60), "1h");
  assert.equal(fmtMinutes(90), "1h 30m");
  assert.equal(fmtMinutes(200), "3h 20m");
  assert.equal(fmtMinutes(0), "0 min");
});

test("fractions of a minute are rounded, not shown", () => {
  assert.equal(fmtMinutes(44.6), "45 min");
  assert.equal(fmtMinutes(89.4), "1h 29m");
});

test("a missing figure prints as a dash", () => {
  assert.equal(fmtMinutes(null), "—");
  assert.equal(fmtMinutes(undefined), "—");
  assert.equal(fmtMinutes("abc"), "—");
});

test("with nothing ticked for the laser, every shift is used and the screen is told", () => {
  const shifts = [{ id: "a", cuts_laser: false }, { id: "b", cuts_laser: false }];
  const r = laserShifts(shifts);
  assert.deepEqual(r.shifts.map((s) => s.id), ["a", "b"]);
  assert.equal(r.fallback, true);
});

test("with shifts ticked for the laser, only those are used", () => {
  const shifts = [{ id: "a", cuts_laser: false }, { id: "b", cuts_laser: true }, { id: "c", cuts_laser: true }];
  const r = laserShifts(shifts);
  assert.deepEqual(r.shifts.map((s) => s.id), ["b", "c"]);
  assert.equal(r.fallback, false);
});

test("no shifts at all is not a fallback, it is nothing", () => {
  assert.deepEqual(laserShifts([]), { shifts: [], fallback: false });
  assert.deepEqual(laserShifts(null), { shifts: [], fallback: false });
});
