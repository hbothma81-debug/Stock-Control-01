// The kinds of tool a machine holds and the fields each kind must have for
// the engine to use it (the engine's own list, 8 Oct 2026: it picks tools
// by kind and size, so a new tool without its kind's fields is never
// picked). Mirrors the engine's tool entries (ERS TURNING APP settings.py
// TOOLS, setup_data.py DRILLS / BARS): change both together. No React:
// tested in toolKinds.test.js.

const F = {
  name: { key: "name", label: "Name (as the program header prints it)", type: "text" },
  holder: { key: "holder", label: "Holder", type: "text" },
  insert: { key: "insert", label: "Insert", type: "text" },
  nose: { key: "nose", label: "Nose radius (mm)", type: "number" },
  dia: { key: "dia", label: "Diameter (mm)", type: "number" },
  key: { key: "key", label: "Cutting data key (as the cutting data names it)", type: "text" },
  home_z: { key: "home_z", label: "Home Z (mm)", type: "number" },
  width: { key: "width", label: "Width (mm)", type: "number" },
  cdx: { key: "cdx", label: "Max depth CDX (mm)", type: "number" },
  max_dia: { key: "max_dia", label: "Largest diameter it parts off (mm)", type: "number" },
  op: { key: "op", label: "Cutting data operation (as PART-GROOVE names it)", type: "text" },
  pitches_owned: { key: "pitches_owned", label: "Pitches owned (mm, e.g. 1, 1.25, 1.5)", type: "list" },
  pitch_range: { key: "pitch_range", label: "Pitch range the holder takes (mm, e.g. 0.5, 3)", type: "list" },
  puller: { key: "puller", label: "Puller type", type: "choice", choices: ["bar", "magnet"] },
  // Read by the engine when a tool has them (9 Oct 2026); left blank, the
  // engine's own figure is used and nothing is saved.
  side_reach: { key: "side_reach_mm", label: "Side reach past the tip (mm, blank = 3)", type: "number", optional: true },
  ap_min: { key: "ap_min_mm", label: "Minimum depth of cut (mm, blank = 0.5)", type: "number", optional: true },
};

export const TOOL_KINDS = [
  { kind: "od", label: "Turning (OD)", long: false, fields: [F.holder, F.insert, F.nose, F.key, F.ap_min] },
  { kind: "bar", label: "Boring bars", long: true, fields: [F.holder, F.insert, F.dia, F.nose, F.key, F.home_z, F.ap_min] },
  { kind: "udrill", label: "U-drills", long: true, fields: [F.dia, F.key, F.home_z, F.holder, F.insert] },
  { kind: "hss", label: "HSS drills", long: true, fields: [F.dia] },
  { kind: "groove", label: "Grooving", long: false, fields: [F.holder, F.insert, F.width, F.cdx, F.op] },
  { kind: "part", label: "Parting", long: false, fields: [F.holder, F.insert, F.width, F.max_dia, F.op] },
  { kind: "thread", label: "Threading", long: false, fields: [F.holder, F.insert, F.pitches_owned, F.pitch_range, F.side_reach] },
  { kind: "puller", label: "Bar puller", long: false, fields: [F.puller] },
];

// Fields the engine does not need but a tool may carry (filled by the ISO
// reader): shown, never required.
export const OPTIONAL_FIELDS = ["grade", "approach_deg", "shank_mm", "ic_mm", "thickness_mm", "shape", "hand", "notes"];

export const kindOf = (kind) => TOOL_KINDS.find((k) => k.kind === kind) || null;

// A tool's line in the list: holder, insert and its size.
export function toolLine(t) {
  const d = t?.data || {};
  const size = d.dia != null ? `D${d.dia}` : d.width != null ? `${d.width} wide` : d.nose != null ? `R${d.nose}` : "";
  return [d.holder, d.insert, size].filter(Boolean).join(" · ");
}

function readList(text) {
  return String(text ?? "")
    .replace(/,\s+/g, " ")
    .split(/[;\s]+/)
    .filter(Boolean)
    .map((x) => Number(x.replace(",", ".")));
}

// The New / change tool form back into a tool's data, and what is missing
// or unreadable. The form holds strings.
export function toolFromForm(kind, form) {
  const k = kindOf(kind);
  const errors = [];
  if (!k) return { data: null, errors: ["Pick what kind of tool it is."] };
  const name = String(form.name ?? "").trim();
  if (!name) errors.push(F.name.label);
  const data = { ...(form.extra || {}), name, kind, long: k.long };
  for (const f of k.fields) {
    const raw = form[f.key];
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      if (f.optional) continue;
      errors.push(f.label);
      continue;
    }
    if (f.type === "number") {
      const n = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) errors.push(f.label);
      else data[f.key] = n;
    } else if (f.type === "list") {
      const nums = readList(raw);
      if (!nums.length || nums.some((n) => !Number.isFinite(n) || n <= 0)) errors.push(f.label);
      else data[f.key] = nums;
    } else data[f.key] = String(raw).trim();
  }
  return { data, errors };
}

// A tool's data into the form's strings, for changing it.
export function formFromTool(t) {
  const d = t?.data || {};
  const form = { name: d.name || "", extra: {} };
  const k = kindOf(d.kind);
  const known = new Set(["name", "kind", "long", ...(k ? k.fields.map((f) => f.key) : [])]);
  for (const [key, v] of Object.entries(d)) {
    if (known.has(key)) form[key] = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
    else form.extra[key] = v;
  }
  return form;
}

// A tool key from a name, when the person does not type one: capitals and
// digits only ("20MM U-DRILL" -> "20MMUDRILL"), kept short.
export function suggestKey(name) {
  return String(name ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 24);
}

// Duplicate on the Tools screen (Heinrich, 9 Oct 2026: a second SER 2525
// M16 holder): the same tool under the next free key, the number added to
// its name too ("THREAD" -> "THREAD2", "THREAD 2").
export function copyOfTool(tool, tools) {
  const key = tool?.tool_key || "";
  const taken = new Set((tools || []).map((t) => t.tool_key));
  let n = 2;
  while (taken.has(`${key}${n}`)) n++;
  return { toolKey: `${key}${n}`, name: `${tool?.data?.name || key} ${n}` };
}
