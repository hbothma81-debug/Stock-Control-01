// The plate packer and the stages after it. Decided with Heinrich on 16 Sep
// 2026, for JOB-0068: most of the job was cut, packed and bent while four
// programs were still on the laser, and the app held Bending back because
// the Laser stage closes only when every program is cut.
//
// 1. A stage after the packer opens the moment the packer takes the job.
//    The plate laser stages before the packer (Nesting, Laser) stop holding
//    it back, as a whole and line by line. Nothing else changes: other
//    stages still hold it, and a job whose packer nobody has taken waits as
//    before.
//
// 2. A part counted at any stage after the packer has been packed -- it
//    could not be there otherwise. The packer's count for that part rises
//    to match (a line with parts raises its parts in proportion), and when
//    every line the packer handles is full, packing is done. Ticking such a
//    stage done ticks packing done, when that stage covers every line the
//    packer handles. Counts only ever rise through this.
//
// App.jsx asks these through blockingStages and itemFlowLimit (rule 1) and
// submitProcessItemProgress and the stage ticks (rule 2). The tube laser is
// not touched: its cutting stage is its packing stage.

const runOf = (p) => p?.shortage_id || null;
const sameRun = (a, b) => runOf(a) === runOf(b);

// The job's plate packing stage for `process`: same run (a re-cut's
// catch-up stages are their own run), earlier in the factory flow, and not
// in the other laser's lane. Null when there is none.
export function packingStageFor(process, jobProcesses, { flowRank, isPackingStage, inOtherLane }) {
  const mine = flowRank(process.process_name);
  return (
    (jobProcesses || []).find(
      (pk) =>
        pk.id !== process.id &&
        sameRun(pk, process) &&
        isPackingStage(pk.process_name) &&
        flowRank(pk.process_name) < mine &&
        !(inOtherLane && inOtherLane(process.process_name, pk.process_name))
    ) || null
  );
}

// Rule 1. Whether `earlier` -- a stage that would otherwise hold `process`
// back -- is a plate laser stage that the job's taken packer has released.
export function packerReleases(earlier, process, jobProcesses, ctx) {
  const { flowRank, isPlateLaserStage, isPackingStage, stageIsCleared } = ctx;
  if (!earlier || !isPlateLaserStage(earlier.process_name) || isPackingStage(earlier.process_name)) return false;
  if (!sameRun(earlier, process)) return false;
  const packing = packingStageFor(process, jobProcesses, ctx);
  if (!packing || packing.id === earlier.id) return false;
  return flowRank(earlier.process_name) < flowRank(packing.process_name) && stageIsCleared(packing);
}

const qtyOf = (it) => Number(it?.qty) || 0;

// Rule 2, one count. The packer counts to raise when `line` has reached
// `newDone` at a later stage: [{ itemId, qty }], only where the packer's
// count is lower. `packingTakes(item)` is the packer's stageTakesItem;
// `progress` maps item id to the packer's current count.
export function packingRaises({ line, newDone, jobItems, packingTakes, progress }) {
  const done = Math.max(0, Number(newDone) || 0);
  const current = (id) => Number(progress?.get ? progress.get(id) : progress?.[id]) || 0;
  if (packingTakes(line)) {
    const target = Math.min(done, qtyOf(line));
    return current(line.id) < target ? [{ itemId: line.id, qty: target }] : [];
  }
  const lineQty = qtyOf(line);
  if (lineQty <= 0) return [];
  return (jobItems || [])
    .filter((c) => c.parent_quote_item_id === line.id && packingTakes(c))
    .map((c) => ({ itemId: c.id, qty: Math.min(qtyOf(c), Math.ceil((qtyOf(c) * Math.min(done, lineQty)) / lineQty)) }))
    .filter((r) => current(r.itemId) < r.qty);
}

// Whether every line the packer handles is fully counted. False when it
// handles nothing, so an empty packer is never finished by accident.
export function packingIsFull({ jobItems, packingTakes, progress }) {
  const mine = (jobItems || []).filter((it) => packingTakes(it));
  if (mine.length === 0) return false;
  const current = (id) => Number(progress?.get ? progress.get(id) : progress?.[id]) || 0;
  return mine.every((it) => current(it.id) >= qtyOf(it));
}

// Rule 2, a whole tick. Whether a stage covers every line the packer
// handles: it takes the line itself, or the line the part sits under.
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
