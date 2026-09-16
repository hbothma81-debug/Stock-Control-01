// The section types Stock Manager knows, the boxes each one asks for, and
// the name the app writes from them (Heinrich, 16 Sep 2026).
//
// Names are shop shorthand with no "mm": "SHS 50x50x3". The numbers are
// also kept on the row (master_factor_items.dimensions), so nothing ever
// has to read a size back out of a name.
//
// The list is fixed here on purpose: a type needs its boxes, and typed-in
// types were how loose entries crept in. A new type is a code change.
//
// Pure, no database, tested in a second by `npm test`.

// `old` holds the words a section's type was stored as before this list
// existed, so those rows still file under the right pill until step 5
// converts them.
export const SECTION_SHAPES = [
  { key: "SHS", label: "Square Tube", old: ["Square Tube"], boxes: [["a", "Size"], ["t", "Wall"]], name: (d) => `SHS ${d.a}x${d.a}x${d.t}` },
  { key: "RHS", label: "Rectangular Tube", old: ["Rectangular Tube"], boxes: [["a", "Height"], ["b", "Width"], ["t", "Wall"]], name: (d) => `RHS ${d.a}x${d.b}x${d.t}` },
  { key: "CHS", label: "Round Tube", old: ["Round Tube"], boxes: [["od", "Outside dia"], ["t", "Wall"]], name: (d) => `CHS ${d.od}x${d.t}` },
  { key: "PIPE", label: "Pipe", old: ["Seamless Pipe", "Welded Pipe", "Pipe"], boxes: null, name: pipeName },
  { key: "RB", label: "Round Bar", old: ["Round Bar"], boxes: [["a", "Diameter"]], name: (d) => `RB ${d.a}` },
  { key: "SB", label: "Square Bar", old: ["Square Bar"], boxes: [["a", "Size"]], name: (d) => `SB ${d.a}` },
  { key: "FB", label: "Flat Bar", old: ["Flat Bar"], boxes: [["a", "Width"], ["t", "Thickness"]], name: (d) => `FB ${d.a}x${d.t}` },
  { key: "HEX", label: "Hex Bar", old: ["Hex Bar"], boxes: [["a", "Across flats"]], name: (d) => `HEX ${d.a}` },
  { key: "EA", label: "Equal Angle", old: ["Equal Angle"], boxes: [["a", "Leg"], ["t", "Thickness"]], name: (d) => `EA ${d.a}x${d.a}x${d.t}` },
  { key: "UA", label: "Unequal Angle", old: ["Unequal Angle"], boxes: [["a", "Long leg"], ["b", "Short leg"], ["t", "Thickness"]], name: (d) => `UA ${d.a}x${d.b}x${d.t}` },
  { key: "PFC", label: "Parallel Flange Channel", old: ["Parallel Flange Channel", "PFC"], boxes: [["a", "Height"], ["b", "Width"]], name: (d) => `PFC ${d.a}x${d.b}` },
  { key: "LC", label: "Lipped Channel", old: ["Lipped Channel"], boxes: [["a", "Height"], ["b", "Width"], ["lip", "Lip"], ["t", "Thickness"]], name: (d) => `LC ${d.a}x${d.b}x${d.lip}x${d.t}` },
  { key: "CH", label: "Taper Flange Channel", old: ["Taper Flange Channel", "Channel"], boxes: [["a", "Height"], ["b", "Width"]], name: (d) => `CH ${d.a}x${d.b}` },
  { key: "UB", label: "I-Beam", old: ["I-Beam"], boxes: [["a", "Depth"], ["b", "Width"], ["kgm", "kg/m"]], name: (d) => `UB ${d.a}x${d.b}x${d.kgm}` },
  { key: "UC", label: "H-Beam", old: ["H-Beam"], boxes: [["a", "Depth"], ["b", "Width"], ["kgm", "kg/m"]], name: (d) => `UC ${d.a}x${d.b}x${d.kgm}` },
  { key: "IPE", label: "IPE Beam", old: ["IPE Beam", "IPE"], boxes: [["a", "Depth"]], name: (d) => `IPE ${d.a}` },
  { key: "T", label: "Tee", old: ["Tee", "T-Bar"], boxes: [["a", "Height"], ["b", "Width"], ["t", "Thickness"]], name: (d) => `T ${d.a}x${d.b}x${d.t}` },
];

// "SHS · Square Tube", for the pills.
export const shapeTitle = (shape) => `${shape.key} · ${shape.label}`;

// The shape a stored type belongs to, by its key, its label or an old word.
export function shapeForType(type) {
  const t = String(type || "").trim().toLowerCase();
  if (!t) return null;
  return (
    SECTION_SHAPES.find(
      (s) => s.key.toLowerCase() === t || s.label.toLowerCase() === t || s.old.some((o) => o.toLowerCase() === t)
    ) || null
  );
}

// ---------- Pipe ----------
//
// Three standards. Schedule and SANS 62 fix the outside diameter and wall
// from NB, so those come from the tables below; SABS 719 is welded to a
// stated outside diameter and wall, so both are typed.
//
// Checked by Heinrich 16 Sep 2026 (SCH5 to SCH160, STD, XS, SANS 62).
// Schedule is ASME B36.10M (SCH5 from B36.19); SANS 62 is ISO 65 (Light,
// Medium, Heavy). Live had "NB25 SCH40 (33.4x4.55mm)", whose wall is the
// SCH80 figure, and "NB15 Medium (21.7x2.3mm)", which matches neither.

export const PIPE_STANDARDS = [
  { key: "SCH", label: "Schedule (seamless)" },
  { key: "SANS62", label: "SANS 62" },
  { key: "SABS719", label: "SABS 719 welded" },
];

// Every schedule up to SCH160 (Heinrich, 16 Sep 2026); XXS is not used.
export const SCHEDULES = ["5", "10", "20", "30", "40", "60", "80", "100", "120", "140", "160", "STD", "XS"];
export const SANS62_CLASSES = ["Light", "Medium", "Heavy"];

// NB -> outside diameter (mm), ASME B36.10M.
export const SCHEDULE_OD = {
  6: 10.3, 8: 13.7, 10: 17.1, 15: 21.3, 20: 26.7, 25: 33.4, 32: 42.2, 40: 48.3, 50: 60.3, 65: 73, 80: 88.9,
  100: 114.3, 125: 141.3, 150: 168.3, 200: 219.1, 250: 273, 300: 323.8,
};

// NB -> wall (mm) per schedule. A size a schedule does not come in is absent.
export const SCHEDULE_WALL = {
  5: { 15: 1.65, 20: 1.65, 25: 1.65, 32: 1.65, 40: 1.65, 50: 1.65, 65: 2.11, 80: 2.11, 100: 2.11, 125: 2.77, 150: 2.77, 200: 2.77, 250: 3.4, 300: 3.96 },
  30: { 200: 7.04, 250: 7.8, 300: 8.38 },
  60: { 200: 10.31, 250: 12.7, 300: 14.27 },
  100: { 200: 15.09, 250: 18.26, 300: 21.44 },
  120: { 100: 11.13, 125: 12.7, 150: 14.27, 200: 18.26, 250: 21.44, 300: 25.4 },
  140: { 200: 20.62, 250: 25.4, 300: 28.58 },
  10: { 15: 2.11, 20: 2.11, 25: 2.77, 32: 2.77, 40: 2.77, 50: 2.77, 65: 3.05, 80: 3.05, 100: 3.05, 125: 3.4, 150: 3.4, 200: 3.76, 250: 4.19, 300: 4.57 },
  20: { 200: 6.35, 250: 6.35, 300: 6.35 },
  40: { 6: 1.73, 8: 2.24, 10: 2.31, 15: 2.77, 20: 2.87, 25: 3.38, 32: 3.56, 40: 3.68, 50: 3.91, 65: 5.16, 80: 5.49, 100: 6.02, 125: 6.55, 150: 7.11, 200: 8.18, 250: 9.27, 300: 10.31 },
  80: { 6: 2.41, 8: 3.02, 10: 3.2, 15: 3.73, 20: 3.91, 25: 4.55, 32: 4.85, 40: 5.08, 50: 5.54, 65: 7.01, 80: 7.62, 100: 8.56, 125: 9.53, 150: 10.97, 200: 12.7, 250: 15.09, 300: 17.48 },
  160: { 15: 4.78, 20: 5.56, 25: 6.35, 32: 6.35, 40: 7.14, 50: 8.74, 65: 9.53, 80: 11.13, 100: 13.49, 125: 15.88, 150: 18.26, 200: 23.01, 250: 28.58, 300: 33.32 },
  STD: { 6: 1.73, 8: 2.24, 10: 2.31, 15: 2.77, 20: 2.87, 25: 3.38, 32: 3.56, 40: 3.68, 50: 3.91, 65: 5.16, 80: 5.49, 100: 6.02, 125: 6.55, 150: 7.11, 200: 8.18, 250: 9.27, 300: 9.53 },
  XS: { 6: 2.41, 8: 3.02, 10: 3.2, 15: 3.73, 20: 3.91, 25: 4.55, 32: 4.85, 40: 5.08, 50: 5.54, 65: 7.01, 80: 7.62, 100: 8.56, 125: 9.53, 150: 10.97, 200: 12.7, 250: 12.7, 300: 12.7 },
};

// NB -> [outside diameter, Light wall, Medium wall, Heavy wall] (mm), ISO 65.
// Light is not made above NB100.
export const SANS62_SIZES = {
  6: [10.2, 1.8, 2, 2.65], 8: [13.5, 1.8, 2.35, 2.9], 10: [17.2, 1.8, 2.35, 2.9], 15: [21.3, 2, 2.65, 3.25],
  20: [26.9, 2.3, 2.65, 3.25], 25: [33.7, 2.6, 3.25, 4.05], 32: [42.4, 2.6, 3.25, 4.05], 40: [48.3, 2.9, 3.25, 4.05],
  50: [60.3, 2.9, 3.65, 4.5], 65: [76.1, 3.2, 3.65, 4.5], 80: [88.9, 3.2, 4.05, 4.85], 100: [114.3, 3.6, 4.5, 5.4],
  125: [139.7, null, 4.85, 5.4], 150: [165.1, null, 4.85, 5.4],
};

// The NB sizes offered for a pipe standard and its schedule or class.
export function pipeSizes(std, grade) {
  if (std === "SCH") return Object.keys(SCHEDULE_WALL[grade] || {}).map(Number).sort((a, b) => a - b);
  if (std === "SANS62") {
    const i = SANS62_CLASSES.indexOf(grade) + 1;
    return Object.entries(SANS62_SIZES).filter(([, row]) => i > 0 && row[i] != null).map(([nb]) => Number(nb)).sort((a, b) => a - b);
  }
  return [];
}

// Outside diameter and wall for a pipe, from the tables or as typed.
export function pipeSize(d) {
  if (d.std === "SCH") {
    const t = SCHEDULE_WALL[d.sch]?.[d.nb];
    return t != null && SCHEDULE_OD[d.nb] != null ? { od: SCHEDULE_OD[d.nb], t } : null;
  }
  if (d.std === "SANS62") {
    const row = SANS62_SIZES[d.nb];
    const i = SANS62_CLASSES.indexOf(d.cls) + 1;
    return row && i > 0 && row[i] != null ? { od: row[0], t: row[i] } : null;
  }
  if (d.std === "SABS719") return d.od && d.t ? { od: d.od, t: d.t } : null;
  return null;
}

function pipeName(d) {
  // SCH40, but STD / XS / XXS on their own, as they are said.
  if (d.std === "SCH") return `PIPE NB${d.nb} ${/^\d+$/.test(d.sch) ? "SCH" : ""}${d.sch}`;
  if (d.std === "SANS62") return `PIPE NB${d.nb} SANS62 ${d.cls}`;
  return `PIPE NB${d.nb} SABS719 ${d.t}`;
}

// ---------- Building a section ----------

// "50.0" and " 50 " are 50; a comma counts as a decimal point. Anything
// that is not a positive number is null.
export function cleanNumber(v) {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// What is still missing, in words, or [] when the section is complete.
export function missingBoxes(shape, d) {
  if (!shape) return ["Type"];
  if (shape.key !== "PIPE") return shape.boxes.filter(([k]) => cleanNumber(d[k]) == null).map(([, label]) => label);
  const out = [];
  if (!PIPE_STANDARDS.some((s) => s.key === d.std)) return ["Standard"];
  if (d.std === "SCH" && !SCHEDULES.includes(d.sch)) out.push("Schedule");
  if (d.std === "SANS62" && !SANS62_CLASSES.includes(d.cls)) out.push("Class");
  if (cleanNumber(d.nb) == null) out.push("NB");
  if (d.std === "SABS719") {
    if (cleanNumber(d.od) == null) out.push("Outside dia");
    if (cleanNumber(d.t) == null) out.push("Wall");
  }
  if (!out.length && !pipeSize(numbersOf(shape, d))) out.push("a size that standard comes in");
  return out;
}

function numbersOf(shape, d) {
  if (shape.key !== "PIPE") return Object.fromEntries(shape.boxes.map(([k]) => [k, cleanNumber(d[k])]));
  const out = { std: d.std, nb: cleanNumber(d.nb) };
  if (d.std === "SCH") out.sch = d.sch;
  if (d.std === "SANS62") out.cls = d.cls;
  if (d.std === "SABS719") Object.assign(out, { od: cleanNumber(d.od), t: cleanNumber(d.t) });
  return out;
}

// The section to store: { name, dimensions }, or null while a box is
// missing. Pipe dimensions carry the outside diameter and wall as well,
// whichever standard gave them.
export function buildSection(shape, d) {
  if (!shape || missingBoxes(shape, d).length) return null;
  const dims = numbersOf(shape, d);
  if (shape.key === "PIPE") Object.assign(dims, pipeSize(dims));
  return { name: shape.name(dims), dimensions: { shape: shape.key, ...dims } };
}
