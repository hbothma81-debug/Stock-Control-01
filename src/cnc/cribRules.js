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
