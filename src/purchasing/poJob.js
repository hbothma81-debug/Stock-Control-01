// Which job a purchase order raised from requisitions is for (7 Oct 2026).
//
// A request carries its job (requisitions.job_id / job_number; empty is
// Stores). One order can be set aside for one job only, so:
//   - every request for the same job, or for Stores and that one job:
//     the order starts on that job;
//   - requests for two or more jobs: the box starts empty and the names
//     are shown, for the person to pick one or leave it for stores;
//   - no job on any: empty, as before.

export function jobForPurchaseOrder(reqList) {
  const seen = new Map();
  for (const r of reqList || []) {
    if (r && r.jobId) seen.set(r.jobId, r.jobNumber || r.jobId);
  }
  if (seen.size === 1) {
    const [[id, job_number]] = seen;
    return { job: { id, job_number }, mixed: [] };
  }
  return { job: null, mixed: seen.size > 1 ? [...seen.values()] : [] };
}

export function mixedJobsWords(mixed) {
  if (!mixed || mixed.length === 0) return "";
  return `These requests are for ${mixed.length} jobs (${mixed.join(", ")}). One order is set aside for one job only: pick one, or leave it for stores.`;
}
