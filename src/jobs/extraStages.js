// Extra stages: the steps a job line goes through after its first cut
// (its made-on) and before the stages every line goes to -- bending,
// drilling, machining sent out after an in-house cut -- in the line's own
// order. Decided with Heinrich 14-15 Sep 2026: one part is cut, machined,
// then bent; the next is cut, bent, then machined; so the factory flow
// alone cannot order them.
//
// A stage switched to "Only lines marked for it" (process_type_settings.
// only_marked) lists only the lines that name it in extra_stages
// (job_quote_items, remembered on stock_items). The list is ordered:
// ["Machining - External", "Bending"] means machined first, then bent.
// A list never set (null) sends the line to every such stage, so nothing
// is missed before somebody has looked at it; an empty list means nothing
// extra. A line with parts under it never goes to one: its parts do.
//
// App.jsx asks these through stageTakesItem (who lists a line),
// itemFlowLimit (how many of a line may pass: the line's own order wins
// between the stages it names) and blockingStages (two such stages never
// hold each other back whole; the per-line counts order them). Keep the
// three and this file in step.

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// The line's extra stages, or null when they were never set.
export function extraStagesOf(line) {
  return Array.isArray(line?.extra_stages) ? line.extra_stages : null;
}

// Whether a stage switched to "only marked" takes this line. `tag` is the
// stage's own "Cuts:" setting: such a stage can also be a line's first
// step, as Machining - External is for a part that comes from the supplier
// already machined. A line with parts is decided by the caller.
export function markedStageTakes(stageName, tag, line) {
  if (tag && (line?.made_on || "") === tag) return true;
  const list = extraStagesOf(line);
  if (list === null) return true;
  return list.some((n) => same(n, stageName));
}

// Where a stage sits on this line's own route, or null when the line does
// not place it and the factory flow decides. 0 is the first step, the
// stage that cuts the line's made-on; 1, 2 ... are its extra stages in
// the order listed.
export function routePosition(line, stageName, tag) {
  if (tag && (line?.made_on || "") === tag) return 0;
  const list = extraStagesOf(line);
  if (!list) return null;
  const i = list.findIndex((n) => same(n, stageName));
  return i === -1 ? null : i + 1;
}

// Whether stage `earlier` comes before stage `later` for this one line.
// When the line places both at different steps, its order wins, even
// against the factory flow. Otherwise -- one not on its route, or both its
// first step, as Nesting, Laser and Packer are for a laser part -- the
// factory flow decides, as it always has.
export function comesBeforeForLine(line, earlier, later, { flowRank, cutsMadeOn }) {
  const a = routePosition(line, earlier, cutsMadeOn(earlier));
  const b = routePosition(line, later, cutsMadeOn(later));
  if (a !== null && b !== null && a !== b) return a < b;
  return flowRank(earlier) < flowRank(later);
}

// The route as words, for the job sheet: "Laser > Machining - External >
// Bending". Plain ">" because the PDF's font has no arrows (an arrow
// letter-spaces the whole line). Blank when there is nothing to say.
export function routeText(firstStepLabel, line) {
  const list = extraStagesOf(line) || [];
  return [firstStepLabel, ...list].filter(Boolean).join(" > ");
}

// A list with one stage renamed, for when a stage is renamed in Stock
// Manager. Null stays null (never set is not the same as nothing extra).
export function renameInList(list, oldName, newName) {
  if (!Array.isArray(list)) return list ?? null;
  return list.map((n) => (same(n, oldName) ? newName : n));
}

// A list with one stage moved one place earlier (-1) or later (+1).
export function moveInList(list, index, step) {
  const next = [...(list || [])];
  const to = index + step;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
