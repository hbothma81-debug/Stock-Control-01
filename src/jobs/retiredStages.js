// A stage that is no longer offered (Heinrich, 28 Sep 2026, for "Delivery
// Note": every invoice request makes its own note now, so the stage is a
// tick nobody needs on a new job).
//
// Taking a stage off the Job Process Types list is refused while any job
// carries it, and rightly: the list is what the Production tab is drawn
// from, so the open jobs would vanish from it. A retired stage stays on the
// list, in its place in the factory flow, and every job that has it keeps
// it, shown and ticked as before. It is only not offered: not in a job's
// stage picker unless the job already has it, not in a line's Then box, and
// not brought along by Copy job.
//
// process_type_settings.retired (setup-delivery-notes-per-request.sql), set
// under Stock Manager -> Job Process Types. The rules only; no database and
// no screen in here, so they can be tested: npm test.

export const isRetired = (settings, name) => !!settings?.[name]?.retired;

// Whether the database has the setting at all: read off a settings row.
// No row to look at, or none with the column, is "not yet".
export function retiredReady(settings) {
  return Object.values(settings || {}).some((row) => row && "retired" in row);
}

// The stages a job's picker shows: the list in its own order, without the
// retired ones this job does not have, then anything the job carries that
// the list no longer has. Each once.
export function stagesOffered(flow, settings, onJob) {
  const has = new Set(onJob || []);
  const offered = (flow || []).filter((name) => has.has(name) || !isRetired(settings, name));
  const orphans = [...has].filter((name) => !(flow || []).includes(name));
  return [...offered, ...orphans].filter((name, i, all) => all.indexOf(name) === i);
}

// The stages Copy job brings to the new job, and the names it left behind.
export function stagesToCopy(sourceProcesses, settings) {
  const kept = [];
  const left = [];
  for (const p of sourceProcesses || []) {
    if (isRetired(settings, p.process_name)) left.push(p.process_name);
    else kept.push(p);
  }
  return { kept, left: [...new Set(left)] };
}
