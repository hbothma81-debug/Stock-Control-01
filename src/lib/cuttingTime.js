// Sums about how long programs take to cut.
//
// A program carries cut_minutes: the planned time for ONE sheet, typed in
// by whoever nested it off the SigmaNest estimate. A program run three
// times off the same material takes three times that. Null means nobody
// gave a time, which is not the same as zero, so these return null for
// it rather than quietly counting it as nothing.

// Minutes for the whole program, all its sheets.
export function plannedMinutes(p) {
  if (p.cut_minutes == null || p.cut_minutes === "") return null;
  const per = Number(p.cut_minutes);
  if (!Number.isFinite(per)) return null;
  return per * Math.max(1, Number(p.sheets_required) || 1);
}

// Minutes for the sheets still to cut.
export function outstandingMinutes(p) {
  if (p.cut_minutes == null || p.cut_minutes === "") return null;
  const per = Number(p.cut_minutes);
  if (!Number.isFinite(per)) return null;
  const required = Math.max(1, Number(p.sheets_required) || 1);
  const done = Math.min(Math.max(0, Number(p.sheets_cut) || 0), required);
  return per * (required - done);
}

// The shifts a laser cuts on: those ticked under Time Manager. The
// factory keeps other hours, and a factory shift overlapping the laser's
// would otherwise claim the laser's programs too. With nothing ticked
// yet, every shift is used, as before, and `fallback` says so, so the
// screen can tell the reader why two day shifts are showing.
//
// `flag` is which tick: cuts_laser for the plate laser, cuts_tube_laser
// for the tube laser. Each machine keeps its own, because they do not
// necessarily run the same hours.
export function laserShifts(shifts, flag = "cuts_laser") {
  const all = shifts || [];
  const ticked = all.filter((s) => s[flag]);
  return ticked.length ? { shifts: ticked, fallback: false } : { shifts: all, fallback: all.length > 0 };
}

// How many repeats a program still has to cut: sheets on the plate
// laser, lengths on the tube laser. The tube counter adds these up
// because the tube software gives no cutting time to add up instead.
export function outstandingUnits(p) {
  const required = Math.max(1, Number(p.sheets_required) || 1);
  const done = Math.min(Math.max(0, Number(p.sheets_cut) || 0), required);
  return required - done;
}

// "45 min" up to an hour, "3h 20m" past it. Read across a workshop, so
// no decimals once it is in hours.
export function fmtMinutes(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const m = Math.round(Number(n));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}
