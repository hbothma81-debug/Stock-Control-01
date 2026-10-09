// A program's Tool crib: its turret, T1 to T8, as a list of eight tool keys
// (null = empty). The engine picks one automatically (its answer's
// setup.turret); Heinrich reviews it and moves, changes, adds or removes
// tools (8 Oct 2026), and the program is made again with exactly that
// layout (setting turret, station -> tool key). No React: tested in
// cribRules.test.js.

export const STATIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// The layout to show: the program's own crib when it has one, otherwise
// the engine's automatic pick.
export function layoutFrom(ownTurret, engineTurret) {
  const src = ownTurret && typeof ownTurret === "object" ? ownTurret : engineTurret || {};
  return STATIONS.map((st) => src[String(st)] ?? null);
}

export function toTurret(layout) {
  return Object.fromEntries(STATIONS.map((st, i) => [String(st), layout[i] ?? null]));
}

export function sameLayout(a, b) {
  return STATIONS.every((_, i) => (a?.[i] ?? null) === (b?.[i] ?? null));
}

// ↑ / ↓: swap a station with the one above or below.
export function moveStation(layout, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= layout.length) return layout;
  const next = [...layout];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Change / Add: put a tool in a station. A tool already in another station
// moves here (one tool, one station); the station it left is emptied.
export function putTool(layout, i, key) {
  const next = layout.map((k) => (key && k === key ? null : k));
  next[i] = key || null;
  return next;
}

export function removeTool(layout, i) {
  const next = [...layout];
  next[i] = null;
  return next;
}

// The engine's warnings that are about the crib: tools it had to place,
// tools not owned, turret rules broken.
export function cribWarnings(answer) {
  const all = [...(answer?.warnings || []), ...(answer?.fails || [])].map((w) => (typeof w === "string" ? w : JSON.stringify(w)));
  return all.filter((w) => /tool crib|not owned|not on the/i.test(w));
}

// Holders (Heinrich, 9 Oct 2026; the engine's settings.station_holders):
// each station holds an OD holder or a boring holder. Boring bars, drills
// and the bar puller go in a boring holder, every other kind in an OD
// holder; a tool in the wrong one is Not for machine. The machine row keeps
// them as data.turret.holders; a station it does not name takes the LEO
// 1600's own layout below. Mirrors the engine: change both.
export const DEFAULT_HOLDERS = { 1: "od", 2: "od", 3: "bore", 4: "bore", 5: "bore", 6: "od", 7: "bore", 8: "od" };
const BORE_KINDS = ["bar", "udrill", "hss", "puller"];
export const HOLDER_NAME = { od: "OD holder", bore: "Boring holder" };
export const A_HOLDER = { od: "an OD holder", bore: "a boring holder" };

// Station -> "od" / "bore", from the machine row's turret.holders or the
// engine's answer (setup.holders), whichever is handed in.
export function holdersFrom(saved) {
  const hs = saved && typeof saved === "object" ? saved : {};
  return Object.fromEntries(STATIONS.map((st) => [st, hs[String(st)] === "od" || hs[String(st)] === "bore" ? hs[String(st)] : DEFAULT_HOLDERS[st]]));
}

export const holderForKind = (kind) => (BORE_KINDS.includes(kind) ? "bore" : "od");

// Whether a tool (a cnc_tools row) fits a holder. A key not on the tool
// list is not judged here: the engine says so in its own words.
export function toolFits(tool, holder) {
  return !tool || holderForKind(tool.data?.kind) === holder;
}

// The stations with a holder, as the shop writes them: "T3/T4/T5/T7".
export function stationsWith(holders, holder) {
  return STATIONS.filter((st) => holders[st] === holder).map((st) => `T${st}`).join("/");
}

// ↑ / ↓ with holders: swap with the next station up or down whose holder
// fits the tool in this station (a tool in the wrong holder so moves
// towards the stations it goes in); an empty station keeps to its own
// holder. No such station: nothing moves.
export function moveToHolder(layout, i, dir, holders, toolOf) {
  const tool = layout[i] ? toolOf(layout[i]) : null;
  const want = tool ? holderForKind(tool.data?.kind) : holders[STATIONS[i]];
  for (let j = i + dir; j >= 0 && j < layout.length; j += dir) {
    if (holders[STATIONS[j]] === want) {
      const next = [...layout];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }
  }
  return layout;
}

// Tools screen: a station's holder changed. A default-turret tool that no
// longer fits comes off the station (his answer, 9 Oct 2026); removed names
// it, so the screen can say so.
export function changeHolder(data, station, holder, toolOf) {
  const holders = { ...holdersFrom(data?.turret?.holders), [station]: holder };
  const turretDefault = { ...(data?.turret_default || {}) };
  const key = turretDefault[String(station)] ?? null;
  const tool = key ? toolOf(key) : null;
  const removed = tool && !toolFits(tool, holder) ? key : null;
  if (removed) turretDefault[String(station)] = null;
  const asSaved = Object.fromEntries(STATIONS.map((st) => [String(st), holders[st]]));
  return { data: { ...data, turret: { ...(data?.turret || {}), holders: asSaved }, turret_default: turretDefault }, removed };
}

// Thread pitch per thread (Heinrich, 9 Oct 2026; the engine's setting
// thread_pitch = { end: pitch }, end being the model end the thread opens
// at, "0" or "L"). One T number cuts one pitch; the pitch set here is cut
// in place of the one read from the model. A pitch set back to the
// model's is taken off the setting, so the setting holds only real
// changes; none left is null.
export function setThreadPitch(saved, end, pitch, modelPitch) {
  const next = { ...(saved || {}) };
  if (modelPitch != null && Number(pitch) === Number(modelPitch)) delete next[end];
  else next[end] = Number(pitch);
  return Object.keys(next).length ? next : null;
}

export function samePitches(a, b) {
  const x = a || {};
  const y = b || {};
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys].every((k) => Number(x[k]) === Number(y[k]));
}

// The pitches offered for a thread: the tool's pitches owned, the pitch
// cut now and the model's, smallest first.
export function pitchChoices(tool, thread) {
  const owned = Array.isArray(tool?.data?.pitches_owned) ? tool.data.pitches_owned : [];
  const all = [...owned, thread?.pitch, thread?.model_pitch].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(all)].sort((p, q) => p - q);
}

// The pitch read from the model: the engine says (model_pitch, turnpath
// 36d3785); an older answer only does when no pitch was set for that end.
export function modelPitchOf(thread, saved) {
  if (thread?.model_pitch != null) return Number(thread.model_pitch);
  return saved && saved[thread?.end] != null ? null : Number(thread?.pitch);
}
