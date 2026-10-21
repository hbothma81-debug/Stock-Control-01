// How long a stage has been waiting at its department, for the job cards
// on the Production tab (Heinrich, 21 Oct 2026: "a days in waiting for
// each process"). Shown on the cards inside a department only, never on
// the department list, by his answer.
//
// Counted from when the stage before it was finished: the latest
// completed_at among the job's stages placed above it (sort_order) in the
// same run. A re-cut's catch-up stages are their own run, so they count
// from the re-cut's own stages, never the job's. With nothing above it
// finished, it counts from when the run began: the job booked in, or the
// shortage flagged (job_processes has no created_at). Nothing records when a stage became workable, so a
// stage released early by the packer rules still counts from the last
// finish above it.

const DAY_MS = 86400000;

const time = (v) => {
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) && t > 0 ? t : 0;
};

export function waitingSince(process, jobProcesses, job, shortage) {
  if (!process) return null;
  const run = process.shortage_id || null;
  const order = Number(process.sort_order || 0);
  let latest = 0;
  for (const p of jobProcesses || []) {
    if (p.id === process.id) continue;
    if ((p.shortage_id || null) !== run) continue;
    if (Number(p.sort_order || 0) >= order) continue;
    if (!p.is_complete) continue;
    latest = Math.max(latest, time(p.completed_at));
  }
  if (latest) return latest;
  const start = run ? time(shortage?.created_at) : time(job?.created_at);
  return start || null;
}

export function daysWaiting(process, jobProcesses, job, shortage, now = Date.now()) {
  const since = waitingSince(process, jobProcesses, job, shortage);
  if (!since) return null;
  return Math.max(0, Math.floor((now - since) / DAY_MS));
}

export function daysWaitingText(days) {
  if (days === null || days === undefined) return "";
  if (days === 0) return "Waiting since today";
  return `${days} day${days === 1 ? "" : "s"} waiting`;
}
