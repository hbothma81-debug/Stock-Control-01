// A CNC Bar Grade's link to the engine's cutting data (Heinrich, 17 Oct
// 2026: "cutting data and material should be linked"). Each grade carries
// the cutting-data material it is machined by (master_factor_items.
// cutting_material, setup-cnc-17-grade-cutting-data.sql), picked on the CNC
// tab's Materials list. A grade can't be added there without it, and a
// grade without it can't be used for a program ("should not be able to
// create this"). The engine uses the link before its own name table
// (turnpath data/material_names.json, kept only for callers that send no
// link; turnpath 6462442). The seed in the SQL file mirrors that name
// table: a grade renamed there is matched the same way here.
//
// App.jsx puts cuttingMaterial on every grade only when the database keeps
// the link (a loaded row showed the column). Until the SQL is pasted the
// key is missing and everything works as before: every grade offered,
// nothing checked, nothing sent.

// The code the engine knows a cutting-data material by: its first word, as
// the engine's own lookup takes it ("EN19 (QT ~280HB)" -> "EN19",
// "6082 aluminium" -> "6082", "A106/A53 pipe" -> "A106").
export function cuttingCode(material) {
  return String(material ?? "").trim().split(/[\s/]+/)[0] || "";
}

// The picker's choices from the Material names of the cutting data's
// TURNING rows: one per code, shown by its full name, A to Z.
export function cuttingChoices(names) {
  const byCode = new Map();
  for (const n of names || []) {
    const label = String(n ?? "").trim();
    const value = cuttingCode(label);
    if (value && !byCode.has(value)) byCode.set(value, label);
  }
  return [...byCode]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
}

// Whether the database keeps the links at all (see the top).
export function keepsLinks(materials) {
  return (materials || []).some((m) => m && "cuttingMaterial" in m);
}

// A grade that may be used for a program: linked, or on a database that
// keeps no links yet.
export function isLinked(material) {
  return !material || !("cuttingMaterial" in material) || !!material.cuttingMaterial;
}

export function gradesForPrograms(materials) {
  return (materials || []).filter(isLinked);
}

// Why a grade can't be used for a program, in words, or "" when it can.
export function gradeProblem(material) {
  if (isLinked(material)) return "";
  return `${material.name} has no cutting data linked: pick its cutting data under CNC → Materials first.`;
}

// How a link reads on screen: the full name the cutting data gives the code.
export function cuttingLabel(code, choices) {
  if (!code) return "";
  return (choices || []).find((c) => c.value === code)?.label || code;
}
