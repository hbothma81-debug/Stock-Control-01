// Which shift is on right now, and when it started and ends.
//
// The same sums the database does in shift_day_window (see
// setup-shift-lockout-2-the-rule.sql), redone here so a screen can say
// "this shift" without a round trip. Keep the two in step.
//
// A shift row carries a pair of times per day group: Mon-Thu, Friday,
// Saturday, Sunday. A null start means that day is off, and so does the
// day's name appearing in days_off -- the tick box on the Time Manager
// screen, which switches a day off while leaving its times alone. An end
// earlier than its start means the shift runs into the next morning --
// 18:00 to 06:00 is a night shift, not a mistake.
//
// NOT mirrored yet: days the whole shop is shut (public holidays, in
// public.shop_closures). The database rule skips them; this does not, so
// a counter using it will still show a window on a booked holiday. Fixing
// it means handing the closure dates to whichever screen calls this,
// which the cutting screen does not load today.
//
// Times are the phone's local time. The shop is in one place and so are
// the phones, so that is the shop's time.

function timeOn(date, hhmm) {
  const [h, m, s] = String(hhmm).split(":").map(Number);
  const d = new Date(date);
  d.setHours(h || 0, m || 0, s || 0, 0);
  return d;
}

// The window a shift works on a given calendar day, or null if that day
// is off. `day` is any Date on that day.
export function shiftDayWindow(shift, day) {
  const dow = day.getDay(); // 0 Sun .. 6 Sat
  const [start, end] =
    dow === 5
      ? [shift.friday_start, shift.friday_end]
      : dow === 6
      ? [shift.saturday_start, shift.saturday_end]
      : dow === 0
      ? [shift.sunday_start, shift.sunday_end]
      : [shift.weekday_start, shift.weekday_end];
  if (!start || !end) return null;

  const name =
    dow === 5 ? "friday" : dow === 6 ? "saturday" : dow === 0 ? "sunday" : "weekday";
  if ((shift.days_off || []).includes(name)) return null;

  const on = timeOn(day, start);
  let off = timeOn(day, end);
  if (off <= on) off = new Date(off.getTime() + 24 * 60 * 60 * 1000);
  return { start: on, end: off };
}

// Every window of a shift from `daysBack` days ago to today, oldest first.
function recentWindows(shift, now, daysBack = 9) {
  const out = [];
  for (let i = daysBack; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const w = shiftDayWindow(shift, day);
    if (w) out.push(w);
  }
  return out;
}

// The shift's window that contains `now`, and the one before it. Either
// can be null: nobody works Sunday, or the shift is brand new.
export function currentAndPreviousWindow(shift, now = new Date()) {
  const wins = recentWindows(shift, now);
  const current = wins.find((w) => now >= w.start && now < w.end) || null;
  const before = wins.filter((w) => w.end <= (current ? current.start : now));
  return { current, previous: before.length ? before[before.length - 1] : null };
}

// Which shift to count against: whichever is on the clock right now. If
// two overlap, the person's own shift wins. Nothing on the clock -- a
// Sunday, or no shifts set up yet -- gives null, and the screen says so.
export function pickShift(shifts, myShiftId, now = new Date()) {
  const on = (shifts || []).filter((s) => currentAndPreviousWindow(s, now).current);
  return on.find((s) => s.id === myShiftId) || on[0] || null;
}

// The shift that finished most recently, and the window it finished.
// For the gap between shifts -- the day shift ends 16:30, nights start
// 17:50 -- when nothing is on the clock but the figure the operator wants
// is what the shift that just ended managed. Null when no shift has ever
// had a window.
export function lastEndedShift(shifts, now = new Date()) {
  let best = null;
  for (const s of shifts || []) {
    const { previous } = currentAndPreviousWindow(s, now);
    if (previous && (!best || previous.end > best.window.end)) best = { shift: s, window: previous };
  }
  return best;
}

// 24-hour, the way the times are typed in under Time Manager.
export function fmtTime(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
