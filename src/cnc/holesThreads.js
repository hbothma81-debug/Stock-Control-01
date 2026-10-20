// Holes and threads a model can't show (Heinrich 20 Oct 2026: "yes your
// recommendation on holes and threads"): a tapped or threaded hole, an H7
// hole to ream, a thread's number of starts and an inch thread's form. One
// line each on New program / Update program (HolesThreads.jsx); turned into
// the engine's job settings here. Pure rules, tested in holesThreads.test.js.
//
// Mirrors the engine's job.py (turnpath): id_thread {end, size, length},
// ream {dia, end, length}, thread_starts {end: n}, thread_form {end: form},
// knurl {dia, type, pitch, end, length};
// end = the model's end the hole or thread opens at, "0" or "L" (as "Side 1
// is the model's"). Sizes the engine reads: M8, M24x2, 1/2-13 UNC, 1/2 UNF,
// 1/2 BSW, G1/2 (id_thread.py parse_size, inch_thread.py parse).

export const HOLE_TYPES = [
  { value: "tap", label: "Tapped / threaded hole" },
  { value: "ream", label: "Ream H7" },
  { value: "starts", label: "Thread starts" },
  { value: "form", label: "Inch thread form" },
  { value: "knurl", label: "Knurl" },
];

// Knurls (engine knurl.py, Heinrich 20 Oct 2026: "knurling, straight and
// cross"): straight = DIN 82 RAA, cross = RGE 30 deg diamond; DIN 403 pitches.
export const KNURL_TYPES = [
  { value: "straight", label: "Straight" },
  { value: "cross", label: "Cross (diamond)" },
];
export const KNURL_PITCHES = ["0.5", "0.6", "0.8", "1.0", "1.2", "1.5", "1.6", "2.0"];

export const ENDS = [
  { value: "0", label: "0 end" },
  { value: "L", label: "L end" },
];

export const FORMS = [
  { value: "UNC", label: "UNC" },
  { value: "UNF", label: "UNF" },
  { value: "BSW", label: "BSW (Whitworth)" },
  { value: "BSPP", label: "BSPP (G, parallel pipe)" },
];

const COARSE = [3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 42, 45, 48, 52, 56, 60, 64];
const FINE = ["M8x1", "M10x1", "M10x1.25", "M12x1.25", "M12x1.5", "M14x1.5", "M16x1.5", "M18x1.5", "M20x1.5", "M22x1.5",
  "M24x1.5", "M24x2", "M27x2", "M30x2", "M33x2", "M36x3", "M42x3", "M48x3"];
const INCH = ["1/4", "5/16", "3/8", "7/16", "1/2", "9/16", "5/8", "3/4", "7/8", "1"];
const PIPE = ["1/8", "1/4", "3/8", "1/2", "3/4", "1", "1 1/4", "1 1/2", "2"];

// The size box's suggestions: metric coarse and common fine, UNC / UNF /
// BSW and BSPP G. Any other size the engine reads may be typed.
export const HOLE_SIZES = [
  ...COARSE.map((n) => `M${n}`),
  ...FINE,
  ...INCH.map((s) => `${s} UNC`),
  ...INCH.map((s) => `${s} UNF`),
  ...INCH.map((s) => `${s} BSW`),
  ...PIPE.map((s) => `G${s}`),
];

const num = (v) => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

export const newLine = (type) => ({ type, end: "0", size: "", dia: "", length: "", starts: "2", form: "UNC", knurl: "straight", pitch: "1.0" });

// The lines as job settings, and the lines that can't be sent (words).
export function holesToSettings(lines) {
  const out = {};
  const errors = [];
  const tap = [];
  const ream = [];
  const knurl = [];
  for (const l of lines || []) {
    const end = l.end === "L" ? "L" : "0";
    const length = num(l.length);
    if (Number.isNaN(length) || (length !== null && length <= 0)) {
      errors.push(`${label(l)}: length`);
      continue;
    }
    if (l.type === "tap") {
      const size = String(l.size || "").trim();
      if (!size) {
        errors.push("Tapped hole: its size");
        continue;
      }
      tap.push({ end, size, ...(length ? { length } : {}) });
    } else if (l.type === "ream") {
      const dia = num(l.dia);
      if (!dia || Number.isNaN(dia) || dia <= 0) {
        errors.push("Ream H7: its diameter");
        continue;
      }
      ream.push({ dia, end, ...(length ? { length } : {}) });
    } else if (l.type === "knurl") {
      const dia = num(l.dia);
      const pitch = num(l.pitch);
      if (!dia || Number.isNaN(dia) || dia <= 0 || !pitch || Number.isNaN(pitch) || pitch <= 0) {
        errors.push("Knurl: its diameter and pitch");
        continue;
      }
      knurl.push({ dia, type: l.knurl === "cross" ? "cross" : "straight", pitch, end, ...(length ? { length } : {}) });
    } else if (l.type === "starts") {
      const n = num(l.starts);
      if (!Number.isInteger(n) || n < 1 || n > 6) {
        errors.push("Thread starts: a whole number 1 to 6");
        continue;
      }
      (out.thread_starts ||= {})[end] = n;
    } else if (l.type === "form") {
      if (!FORMS.some((f) => f.value === l.form)) {
        errors.push("Inch thread form");
        continue;
      }
      (out.thread_form ||= {})[end] = l.form;
    }
  }
  if (tap.length) out.id_thread = tap.length === 1 ? tap[0] : tap;
  if (ream.length) out.ream = ream.length === 1 ? ream[0] : ream;
  if (knurl.length) out.knurl = knurl.length === 1 ? knurl[0] : knurl;
  return { settings: out, errors };
}

const many = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Saved settings back into lines (Update program).
export function settingsToHoles(settings) {
  const s = settings || {};
  const lines = [];
  for (const t of many(s.id_thread)) {
    const size = t.size || (t.nominal ? `M${t.nominal}x${t.pitch}` : "");
    lines.push({ ...newLine("tap"), end: String(t.end ?? "0"), size, length: t.length != null ? String(t.length) : "" });
  }
  for (const r of many(s.ream)) {
    lines.push({ ...newLine("ream"), end: String(r.end ?? "0"), dia: String(r.dia ?? ""), length: r.length != null ? String(r.length) : "" });
  }
  for (const k of many(s.knurl)) {
    lines.push({
      ...newLine("knurl"),
      end: String(k.end ?? "0"),
      dia: String(k.dia ?? ""),
      knurl: k.type === "cross" ? "cross" : "straight",
      pitch: Number(k.pitch ?? 1).toFixed(1),
      length: k.length != null ? String(k.length) : "",
    });
  }
  for (const [end, n] of Object.entries(s.thread_starts || {})) lines.push({ ...newLine("starts"), end, starts: String(n) });
  for (const [end, f] of Object.entries(s.thread_form || {})) lines.push({ ...newLine("form"), end, form: f });
  return lines;
}

// The job keys these lines make, and a revision's settings with more lines
// added (Steps tab, + Add operation: Heinrich 20 Oct 2026).
export const HOLE_KEYS = ["id_thread", "ream", "knurl", "thread_starts", "thread_form"];

export function withLines(settings, lines) {
  const rest = Object.fromEntries(Object.entries(settings || {}).filter(([k]) => !HOLE_KEYS.includes(k)));
  const { settings: holes, errors } = holesToSettings([...settingsToHoles(settings), ...(lines || [])]);
  return { settings: { ...rest, ...holes }, errors };
}

// The engine's insert kind for a line: what can be added to a kept program
// (a machine copy or an edit) - a thread's starts or form change a thread
// already there, so they need the program made again.
export const INSERT_KIND = { tap: "tap", ream: "ream", knurl: "knurl" };

function label(l) {
  return HOLE_TYPES.find((t) => t.value === l.type)?.label || "Line";
}
