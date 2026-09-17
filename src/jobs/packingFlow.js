// The plate packer and the stages after it. Decided with Heinrich on 16 Sep
// 2026, for JOB-0068: most of the job was cut, packed and bent while four
// programs were still on the laser, and the app held Bending back because
// the Laser stage closes only when every program is cut. Corrected the same
// day after a review found the first version let whole-stage ticks through,
// released Nesting, and could close packing with programs still to cut.
//
// 1. A stage after the packer that counts per item stops waiting for the
//    plate Laser stage once cutting has started on the job, or the packer
//    has taken it, AND Nesting is ticked (nothing more to nest). Cutting has
//    started when the first sheet of any of the job's programs is ticked
//    cut: the laser hook keeps that on the Laser stage as started_at
//    (useLaserPrograms.js, syncLaserStagesFor). Once cutting has started
//    the packer stops holding those stages too, taken or not: Take job then
//    only says who is packing (Heinrich, 17 Sep 2026: jobs open as soon as
//    the laser starts, without waiting for Take job; JOB-0014). Only Laser
//    and the packer are released, never Nesting; never a stage on one tick
//    (it could be ticked done, or invoiced, with parts still on the laser);
//    never Invoicing; never a re-cut's run.
//
// 2. A part counted at a stage after the packer that has no machine of its
//    own (Bending, Drilling, Welding -- not Laser - External, not the tube
//    laser) has been packed: the packer's count rises to match, a line with
//    parts raising its parts in proportion. Packing never closes while
//    Nesting or Laser is still open (programs still to cut). Once they are
//    done it closes when every line it handles is counted, or when a later
//    stage that covers every one of them is done. Counts only rise.
//
// App.jsx asks these through blockingStages and itemFlowLimit (rule 1),
// and submitProcessItemProgress, toggleJobProcessComplete and the laser
// hook's syncLaserStagesFor (rule 2). The tube laser is not touched: its
// cutting stage is its packing stage.
//
// ctx: { flowRank, isNestingStage, isLaserCutStage, isPackingStage,
//        isTubeStage, cutsMadeOn, stageIsCleared, neverRelease }

const ownRun = (p) => !!p && !p.shortage_id;
const knownRank = (ctx, name) => {
  const r = ctx.flowRank(name);
  return Number.isFinite(r) && r >= 0 && r < Number.MAX_SAFE_INTEGER;
};

// The job's own plate packing stage (not a re-cut's), or null.
export function ownPackingStage(jobProcesses, ctx) {
  return (jobProcesses || []).find((p) => ownRun(p) && ctx.isPackingStage(p.process_name)) || null;
}

// Nothing more to nest: the job's own plate Nesting stage exists and every
// copy of it is ticked.
export function nestingDone(jobProcesses, ctx) {
  const rows = (jobProcesses || []).filter((p) => ownRun(p) && ctx.isNestingStage(p.process_name));
  return rows.length > 0 && rows.every((p) => !!p.is_complete);
}

// Nothing left on the plate laser for the job's own run: every Nesting and
// Laser stage it carries is done. The packer may close only then.
export function laserWorkDone(jobProcesses, ctx) {
  return (jobProcesses || [])
    .filter((p) => ownRun(p) && (ctx.isNestingStage(p.process_name) || ctx.isLaserCutStage(p.process_name)))
    .every((p) => !!p.is_complete);
}

// Cutting has started on the job's own plate work: its Laser stage carries
// a start, or is done. The laser hook writes the start when the first sheet
// of any of the job's programs is ticked cut, and takes it back if every
// sheet is un-cut (useLaserPrograms.js, syncLaserStagesFor).
export function cuttingStarted(jobProcesses, ctx) {
  return (jobProcesses || []).some(
    (p) => ownRun(p) && ctx.isLaserCutStage(p.process_name) && !ctx.isPackingStage(p.process_name) && (!!p.started_at || !!p.is_complete)
  );
}

// Rule 1. Whether `earlier`, a stage that would otherwise hold `process`
// back, is released: the plate Laser stage once cutting has started or the
// packer has taken the job, and the packer itself once cutting has started.
export function packerReleases(earlier, process, jobProcesses, ctx) {
  if (!ownRun(earlier) || !ownRun(process)) return false;
  if ((process.tracking_mode || "batch") !== "each") return false;
  if (ctx.neverRelease && ctx.neverRelease(process.process_name)) return false;
  const packing = ownPackingStage(jobProcesses, ctx);
  if (!packing || packing.id === process.id) return false;
  const isPacker = earlier.id === packing.id;
  if (!isPacker && (!ctx.isLaserCutStage(earlier.process_name) || ctx.isPackingStage(earlier.process_name))) return false;
  if (![earlier, packing, process].every((p) => knownRank(ctx, p.process_name))) return false;
  const [e, pk, pr] = [earlier, packing, process].map((p) => ctx.flowRank(p.process_name));
  if (!(pk < pr) || (!isPacker && !(e < pk))) return false;
  if (!nestingDone(jobProcesses, ctx)) return false;
  const started = cuttingStarted(jobProcesses, ctx);
  // A packer nobody has taken holds the stages after it only until the
  // laser starts; a taken one is already cleared (stageIsCleared).
  if (isPacker) return started;
  return started || !!ctx.stageIsCleared(packing);
}

// Rule 2. The packing stage a count or tick at `stage` carries through to,
// or null: the job's own open packer, when `stage` is its own-run stage
// after the packer with no machine of its own and not a laser stage.
export function packingCarriedFrom(stage, jobProcesses, ctx) {
  if (!ownRun(stage)) return null;
  const name = stage.process_name;
  if (ctx.isPackingStage(name) || ctx.isNestingStage(name) || ctx.isLaserCutStage(name) || ctx.isTubeStage(name)) return null;
  // Any stage with "laser" in its name, Laser - External included, is kept
  // out by name as well as by its Cuts: setting, so a stage left on every
  // item never reaches the plate packer (review, 16 Sep 2026).
  if (ctx.isAnyLaserStage && ctx.isAnyLaserStage(name)) return null;
  if (ctx.cutsMadeOn(name)) return null;
  const packing = ownPackingStage(jobProcesses, ctx);
  if (!packing || packing.is_complete || packing.id === stage.id) return null;
  if (!knownRank(ctx, name) || !knownRank(ctx, packing.process_name)) return null;
  return ctx.flowRank(packing.process_name) < ctx.flowRank(name) ? packing : null;
}

const qtyOf = (it) => Number(it?.qty) || 0;
const countIn = (progress, id) => Number(progress?.get ? progress.get(id) : progress?.[id]) || 0;

// Rule 2, one count. The packer counts to raise when `line` has reached
// `newDone` at a later stage: [{ itemId, qty }], only where the packer's
// count is lower. `packingTakes(item)` is the packer's stageTakesItem;
// `progress` maps item id to the packer's current count.
export function packingRaises({ line, newDone, jobItems, packingTakes, progress }) {
  const done = Math.max(0, Number(newDone) || 0);
  if (packingTakes(line)) {
    const target = Math.min(done, qtyOf(line));
    return countIn(progress, line.id) < target ? [{ itemId: line.id, qty: target }] : [];
  }
  const lineQty = qtyOf(line);
  if (lineQty <= 0) return [];
  return (jobItems || [])
    .filter((c) => c.parent_quote_item_id === line.id && packingTakes(c))
    .map((c) => ({ itemId: c.id, qty: Math.min(qtyOf(c), Math.ceil((qtyOf(c) * Math.min(done, lineQty)) / lineQty)) }))
    .filter((r) => countIn(progress, r.itemId) < r.qty);
}

// Whether every line the packer handles is fully counted. False when it
// handles nothing, so an empty packer is never finished by accident.
export function packingIsFull({ jobItems, packingTakes, progress }) {
  const mine = (jobItems || []).filter((it) => packingTakes(it));
  return mine.length > 0 && mine.every((it) => countIn(progress, it.id) >= qtyOf(it));
}

// Whether a stage covers every line the packer handles: it takes the line
// itself, or the line the part sits under.
export function stageCoversPacking({ jobItems, packingTakes, stageTakes }) {
  const items = jobItems || [];
  const mine = items.filter((it) => packingTakes(it));
  if (mine.length === 0) return false;
  return mine.every((it) => {
    if (stageTakes(it)) return true;
    const parent = it.parent_quote_item_id ? items.find((p) => p.id === it.parent_quote_item_id) : null;
    return !!parent && stageTakes(parent);
  });
}

// For the packer's row: per line, the highest count at a stage packing is
// carried from, and that stage's name, so he can see what came from Bending
// and log only the rest. A count on a line with parts is shown on its parts,
// in the same proportion packingRaises uses, because the packer's rows are
// the parts. { [itemId]: { qty, stage } }
export function countedAfterPacking(jobProcesses, jobProgress, ctx, { jobItems = [], packingTakes = null } = {}) {
  const carriers = new Map(
    (jobProcesses || []).filter((p) => packingCarriedFrom(p, jobProcesses, ctx)).map((p) => [p.id, p.process_name])
  );
  const out = {};
  const note = (itemId, qty, stage) => {
    if (qty > 0 && (!out[itemId] || out[itemId].qty < qty)) out[itemId] = { qty, stage };
  };
  for (const row of jobProgress || []) {
    const stage = carriers.get(row.job_process_id);
    const qty = Number(row.qty_complete) || 0;
    if (!stage || qty <= 0) continue;
    const line = (jobItems || []).find((it) => it.id === row.job_quote_item_id);
    if (!line || !packingTakes || packingTakes(line)) {
      note(row.job_quote_item_id, qty, stage);
      continue;
    }
    for (const r of packingRaises({ line, newDone: qty, jobItems, packingTakes, progress: new Map() })) note(r.itemId, r.qty, stage);
  }
  return out;
}
