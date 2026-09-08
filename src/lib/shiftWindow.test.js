// The shift-window sums, checked against what the shop expects.
//
// Run with:   npm test
//
// These use no database and no browser. Each one says: given this shift
// and this moment, here is the window the screen should be counting
// against. When the shift rule changes -- in the database function or
// in shiftWindow.js -- this is what says whether the two still agree.
//
// Dates are built with the local clock, the same way the screen reads
// them, so the answers do not depend on which time zone runs the test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDayWindow, currentAndPreviousWindow, pickShift, fmtTime } from "./shiftWindow.js";

// 2026-09-08 is a Tuesday. Month is zero-based in the Date constructor.
const at = (day, h, m = 0) => new Date(2026, 8, day, h, m, 0, 0);

const dayShift = {
  id: "day",
  name: "Day Shift",
  weekday_start: "07:20:00",
  weekday_end: "16:30:00",
  friday_start: "07:20:00",
  friday_end: "14:00:00",
  saturday_start: null,
  saturday_end: null,
  sunday_start: null,
  sunday_end: null,
  days_off: [],
};

const nightShift = {
  id: "night",
  name: "Night Shift",
  weekday_start: "17:50:00",
  weekday_end: "05:40:00",
  friday_start: "17:50:00",
  friday_end: "05:40:00",
  saturday_start: null,
  saturday_end: null,
  sunday_start: null,
  sunday_end: null,
  days_off: [],
};

test("a day shift on a Tuesday runs 07:20 to 16:30 that day", () => {
  const w = shiftDayWindow(dayShift, at(8, 12));
  assert.deepEqual([fmtTime(w.start), fmtTime(w.end)], ["07:20", "16:30"]);
  assert.equal(w.start.getDate(), 8);
  assert.equal(w.end.getDate(), 8);
});

test("a night shift ends the next morning, not before it starts", () => {
  const w = shiftDayWindow(nightShift, at(8, 12));
  assert.equal(w.start.getDate(), 8);
  assert.equal(fmtTime(w.start), "17:50");
  assert.equal(w.end.getDate(), 9);
  assert.equal(fmtTime(w.end), "05:40");
  assert.ok(w.end > w.start);
});

test("Friday uses the Friday hours, not Monday to Thursday's", () => {
  // 2026-09-11 is a Friday.
  const w = shiftDayWindow(dayShift, at(11, 12));
  assert.equal(fmtTime(w.end), "14:00");
});

test("a day with no hours set is off", () => {
  // 2026-09-12 is a Saturday.
  assert.equal(shiftDayWindow(dayShift, at(12, 12)), null);
});

test("a day ticked off under Time Manager is off even though its hours are still there", () => {
  const withMondayOff = { ...dayShift, days_off: ["weekday"] };
  assert.equal(shiftDayWindow(withMondayOff, at(8, 12)), null);
  // Friday is its own group, so it is not switched off with the weekdays.
  assert.ok(shiftDayWindow(withMondayOff, at(11, 12)));
});

test("at 03:00 on Wednesday the night shift that started on Tuesday is the one on the clock", () => {
  const { current } = currentAndPreviousWindow(nightShift, at(9, 3));
  assert.ok(current, "a window should be on");
  assert.equal(current.start.getDate(), 8);
  assert.equal(fmtTime(current.start), "17:50");
});

test("at 03:00 on Wednesday the day shift is not on the clock", () => {
  const { current } = currentAndPreviousWindow(dayShift, at(9, 3));
  assert.equal(current, null);
});

test("the previous shift is the one that ended most recently", () => {
  // Tuesday midday: this shift is Tuesday's, the previous one is Monday's.
  const { current, previous } = currentAndPreviousWindow(dayShift, at(8, 12));
  assert.equal(current.start.getDate(), 8);
  assert.equal(previous.start.getDate(), 7);
});

test("on a Monday the previous day shift is Friday's, skipping the weekend", () => {
  // 2026-09-07 is a Monday.
  const { previous } = currentAndPreviousWindow(dayShift, at(7, 12));
  assert.equal(previous.start.getDate(), 4);
  assert.equal(fmtTime(previous.end), "14:00");
});

test("with nothing on the clock, previous is still the last shift that finished", () => {
  // Tuesday 17:00: day shift over, night shift not yet started.
  const { current, previous } = currentAndPreviousWindow(dayShift, at(8, 17));
  assert.equal(current, null);
  assert.equal(previous.start.getDate(), 8);
});

test("pickShift returns whichever shift is on the clock", () => {
  assert.equal(pickShift([dayShift, nightShift], null, at(8, 12))?.id, "day");
  assert.equal(pickShift([dayShift, nightShift], null, at(8, 22))?.id, "night");
});

test("pickShift prefers the person's own shift when two overlap", () => {
  const laserDay = { ...dayShift, id: "laser-day", weekday_start: "06:00:00", weekday_end: "18:00:00" };
  assert.equal(pickShift([dayShift, laserDay], "laser-day", at(8, 12))?.id, "laser-day");
  assert.equal(pickShift([dayShift, laserDay], "day", at(8, 12))?.id, "day");
});

test("pickShift gives nothing when no shift is on, or none are set up", () => {
  // Saturday: neither shift works.
  assert.equal(pickShift([dayShift, nightShift], null, at(12, 12)), null);
  assert.equal(pickShift([], null, at(8, 12)), null);
});

test("a program finished at 05:30 belongs to the night shift that started the evening before", () => {
  const finished = at(9, 5, 30);
  const night = currentAndPreviousWindow(nightShift, finished).current;
  const day = currentAndPreviousWindow(dayShift, finished).current;
  assert.ok(night && finished >= night.start && finished < night.end);
  assert.equal(day, null);
});

test("fmtTime is 24-hour with two digits", () => {
  assert.equal(fmtTime(at(8, 7, 5)), "07:05");
  assert.equal(fmtTime(at(8, 16, 30)), "16:30");
});
