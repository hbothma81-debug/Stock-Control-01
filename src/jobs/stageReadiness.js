// Whether a stage on a job is Ready, Partly ready or Waiting, and what it
// waits for. Tested in stageReadiness.test.js.
//
// ONE rule behind two screens: the Production tab's pills and cards
// (fetchProductionQueue in App.jsx) and the Jobs list's stage filter. It
// was written inline in fetchProductionQueue until 17 Sep 2026 and was
// lifted here unchanged so the Jobs list could ask the same question and
// never give a different answer.
//
// The rules about WHICH stage holds which -- blockingStages, itemFlowLimit,
// stageTakesItem, with the packer, tube and extra-stage rules under them --
// stay in App.jsx, because they read the stage settings and the factory
// flow held there. They are handed in as `rules`, so this file decides
// nothing about the floor by itself: it only adds the lines up.
//
// A stage on one tick is ready when nothing blocks it. A stage that counts
// per item is as ready as its lines are: the pieces its earlier stages have
// let through are real work now, whatever the stage as a whole still waits
// for. Ready when every piece still to do may go, partly ready when some
// may, waiting when none may -- so a card never reads Ready with every
// line held at nought (review, 16 Sep 2026), and a stage whose own lines
// are all clear does not read Waiting for a stage that only holds somebody
// else's lines (the tube laser, for a stage with no tube parts on it).

// The columns the rules read, for a screen that loads only what the
// question needs (the Jobs list). The Production tab loads whole rows.
// If a rule in App.jsx, packingFlow.js or extraStages.js starts reading
// another column, add it here or the Jobs list will quietly disagree.
export const READINESS_STAGE_COLUMNS =
  "id, job_id, process_name, is_complete, is_urgent, shortage_id, started_at, tracking_mode, sort_order";
export const READINESS_LINE_COLUMNS = "id, job_id, qty, made_on, extra_stages, parent_quote_item_id";
export const READINESS_COUNT_COLUMNS = "job_process_id, job_quote_item_id, qty_complete";

// rules: { blockingStages(process, jobProcesses),
//          stageTakesItem(processName, line, allLines),
//          itemFlowLimit(process, jobProcesses, jobItemProgress, line, allLines) }
export function stageReadiness(process, { jobProcesses, jobQuoteItems, jobItemProgress }, rules) {
  const blockers = rules.blockingStages(process, jobProcesses || []);
  let isReady = blockers.length === 0;
  let readyQty = 0;
  let totalQty = 0;
  let remainingQty = 0;
  let lineWaitsOn = null;
  if ((process.tracking_mode || "batch") === "each") {
    for (const it of jobQuoteItems || []) {
      if (!rules.stageTakesItem(process.process_name, it, jobQuoteItems)) continue;
      const qty = Number(it.qty) || 0;
      totalQty += qty;
      const { allowed, waitingOn: heldBy } = rules.itemFlowLimit(process, jobProcesses, jobItemProgress, it, jobQuoteItems);
      const doneHere = Number(
        (jobItemProgress || []).find((ip) => ip.job_process_id === process.id && ip.job_quote_item_id === it.id)?.qty_complete
      ) || 0;
      const toDo = Math.max(0, qty - doneHere);
      const mayGo = Math.min(toDo, Math.max(0, allowed - doneHere));
      remainingQty += toDo;
      readyQty += mayGo;
      if (toDo > 0 && mayGo <= 0 && heldBy && !lineWaitsOn) lineWaitsOn = heldBy;
    }
    if (remainingQty > 0) isReady = readyQty >= remainingQty;
  }
  return {
    isReady,
    partlyReady: !isReady && readyQty > 0,
    readyQty,
    totalQty,
    waitingOn: lineWaitsOn || blockers[0]?.process_name || null,
  };
}

// The words on a card or a row.
export function readinessLabel({ isReady, partlyReady, readyQty, totalQty, waitingOn }) {
  if (isReady) return "Ready";
  if (partlyReady) return `Partly ready: ${readyQty} of ${totalQty}`;
  return waitingOn ? `Waiting: ${waitingOn}` : "Waiting";
}

// Which pill a stage goes in. An open Info Request on the stage puts it in
// Standing and takes it out of the other two, so the numbers add up.
export function readinessGroup(readiness, isStanding) {
  if (isStanding) return "standing";
  return readiness.isReady || readiness.partlyReady ? "ready" : "waiting";
}

// One job at one stage, for a screen that lists jobs rather than cards
// (the Jobs list). A job can have the stage open more than once: its own
// run, and a re-cut's catch-up run. `rows` is one entry per open stage row,
// each { process, readiness, standing }. The job goes in the best pill any
// of its rows earns -- Standing first, because that is the one holding
// work up, then Ready, then Waiting. So the Jobs list counts jobs where the
// Production tab counts cards: a job with a re-cut at the stage is one row
// here and two cards there.
export function jobGroupAtStage(rows) {
  const groups = (rows || []).map((r) => readinessGroup(r.readiness, r.standing));
  if (groups.includes("standing")) return "standing";
  if (groups.includes("ready")) return "ready";
  return "waiting";
}
