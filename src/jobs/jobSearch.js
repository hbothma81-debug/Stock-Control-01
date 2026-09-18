// What the search box on the Jobs page and on the Production tab finds a
// job by. Tested in jobSearch.test.js.
//
// One rule behind both boxes, so the two screens cannot come to disagree:
// job number, SigmaNest number, customer, sales rep and, since 18 Sep 2026
// (Heinrich: "need to be able to search the PO number also"), the
// customer's PO number from the job's Overview.
//
// Part of a word or number is enough, capitals ignored. The PO number is
// also compared with its spaces, dashes and strokes taken out, because a
// customer's PO is written every which way: "4500 123" on the job is found
// by "4500123" read over the phone, and "PO-123/45" by "po123".
//
// Searches what the screen already holds; nothing is loaded for it.

const lower = (value) => String(value ?? "").toLowerCase();
const bare = (value) => lower(value).replace(/[^a-z0-9]/g, "");

// True when the typed text is found in the job's customer PO. The Jobs
// list and the Production list show the PO on a row while this is true, so
// nobody wonders why a job came up.
export function poMatchesSearch(job, query) {
  const q = lower(query).trim();
  const po = lower(job?.customer_po);
  if (!q || !po) return false;
  if (po.includes(q)) return true;
  const bareQ = bare(q);
  if (bareQ === "") return false;
  const barePo = bare(po);
  if (barePo.includes(bareQ)) return true;
  // "PO 4500123" typed, "4500123" on the job: the PO said in front of a
  // number is dropped. Only in front of a number, or the first letters of
  // "Porsche" would find every PO with an "r" in it.
  const afterPo = /^po(\d.*)$/.exec(bareQ);
  return !!afterPo && barePo.includes(afterPo[1]);
}

// The words for that row label: "PO 4500123". A PO that was typed onto
// the job with its own "PO" in front ("PO-4500123", "P.O. 77") is shown as
// it stands, never "PO PO-4500123".
export function poLabel(job) {
  const po = String(job?.customer_po ?? "").trim();
  if (!po) return "";
  return /^p\.?\s?o\.?(?![a-z])/i.test(po) ? po : `PO ${po}`;
}

// True when the typed text finds the job. Nothing typed finds every job.
export function jobMatchesSearch(job, query) {
  const q = lower(query).trim();
  if (!q) return true;
  return (
    lower(job?.job_number).includes(q) ||
    // The SigmaNest number is what the laser side quotes back, so it has
    // to find the job as readily as ours.
    lower(job?.laser_job_reference).includes(q) ||
    lower(job?.customer).includes(q) ||
    lower(job?.sales_rep).includes(q) ||
    poMatchesSearch(job, q)
  );
}
