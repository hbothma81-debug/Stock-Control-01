// The order the Jobs list shows its rows in. Tested in jobOrder.test.js.
//
// Heinrich, 17 Sep 2026: "arrange by job number or by time in process".
// Job numbers are handed out as jobs are booked in, and "time in process"
// is days since booked in (the day count on each row), so both are the
// same list: oldest first. Due date is the third way to pick what to work
// on next. Newest first is what the list always did, and stays the default.
//
// The choice is remembered on the device (JOBS_ORDER_KEY), not on the
// person's profile: it is a habit of the screen, not a setting.

export const JOBS_ORDER_KEY = "stk-jobs-order";

export const JOB_ORDERS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first (longest in process)" },
  { value: "due", label: "Due date, soonest first" },
];

export function isJobOrder(value) {
  return JOB_ORDERS.some((o) => o.value === value);
}

function time(value) {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
}

// Blank dates go last whichever way the rest run.
function byDate(a, b, direction) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction * (a - b);
}

// A new list in the order asked for; the list handed in is left alone.
// Ties keep the order they came in, which is newest booked in first.
export function sortJobs(jobs, order) {
  const rows = (jobs || []).map((job, i) => ({ job, i }));
  const booked = (r) => time(r.job.created_at);
  const compare =
    order === "oldest"
      ? (a, b) => byDate(booked(a), booked(b), 1)
      : order === "due"
        ? (a, b) => byDate(time(a.job.due_date), time(b.job.due_date), 1) || byDate(booked(a), booked(b), 1)
        : (a, b) => byDate(booked(a), booked(b), -1);
  return rows.sort((a, b) => compare(a, b) || a.i - b.i).map((r) => r.job);
}
