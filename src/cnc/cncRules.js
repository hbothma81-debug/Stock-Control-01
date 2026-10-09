// The CNC tab's rules: what a program line says, what the search finds,
// what the questionnaire sends the engine. No React, no database: tested
// in cncRules.test.js.

import { CNC_FIELDS } from "./cncFields.js";

// The machine's own spelling of a program number: O and eight digits, as
// the engine writes it inside the program (O%08d) and as the hand programs
// are filed ("O00002001 BPW 10T ROCKER.txt").
export function oNumber(n) {
  return "O" + String(n ?? "").padStart(8, "0");
}

// A typed number: blank is null, a comma reads as the decimal point, and
// anything else that is not a number is NaN so the form can refuse it.
export function readNumber(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

// The questionnaire as typed (every value a string, or a boolean for a
// yes/no) turned into the engine's settings. Blank fields are left out,
// so the engine decides them and a field the live engine does not know
// yet is never sent unless somebody fills it in.
export function cleanSettings(form, fields = CNC_FIELDS) {
  const settings = {};
  const errors = [];
  for (const f of fields) {
    const v = form?.[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.kind === "number") {
      const n = readNumber(v);
      if (n === null) continue;
      if (Number.isNaN(n) || n < 0 || (f.whole && !Number.isInteger(n))) errors.push(f.label);
      else settings[f.key] = n;
    } else if (f.kind === "list") {
      // "63, 33" or "63 33" or "63;33" is two pulls; a comma with no space
      // after it is a decimal point ("63,5").
      const parts = String(v).replace(/,\s+/g, " ").split(/[;\s]+/).map((s) => s.trim()).filter(Boolean);
      const nums = parts.map(readNumber);
      if (nums.length === 0) continue;
      if (nums.some((n) => n === null || Number.isNaN(n) || n <= 0)) errors.push(f.label);
      else settings[f.key] = nums;
    } else if (f.kind === "yesno") {
      settings[f.key] = v === true || v === "true";
    } else {
      settings[f.key] = String(v).trim();
    }
  }
  return { settings, errors };
}

// Saved settings back into the form's strings (for Update program).
export function settingsToForm(settings, fields = CNC_FIELDS) {
  const form = {};
  for (const f of fields) {
    const v = settings?.[f.key];
    if (v === undefined || v === null) continue;
    if (f.kind === "list") form[f.key] = (Array.isArray(v) ? v : [v]).join(", ");
    else if (f.kind === "yesno") form[f.key] = v === true;
    else form[f.key] = String(v);
  }
  return form;
}

// One saved setting as the Settings tab shows it.
export function settingText(field, value) {
  if (value === undefined || value === null || value === "") return `Engine's choice: ${field.blank}`;
  if (field.choices) {
    const c = field.choices.find((x) => String(x.value) === String(value));
    if (c) return c.label;
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

// What the search box finds a program by: the part, the customer, the
// material and bar, the fault, the quote reference, the project name, the
// sales rep, and the O number typed any way at all ("1027", "O1027",
// "O00001027").
export function programMatches(p, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/^o/, "").replace(/^0+/, "");
  if (/^\d+$/.test(digits) && String(p.program_no).includes(digits)) return true;
  return [p.part_name, p.customer, p.material, p.stock, p.fault, p.quote_ref, p.project_name, p.created_by].some((s) =>
    String(s ?? "").toLowerCase().includes(q)
  );
}

// The sales rep of a program is whoever made it, from their login
// (Heinrich, 8 Oct 2026).
export const salesRepOf = (p) => String(p?.created_by ?? "").trim();

// The Programs list (Heinrich, 8 Oct 2026: one list with every program, no
// Not for machine / Ready pills; filters like the rest of the app): the
// search box, a customer and a sales rep, in program number order.
export function listPrograms(programs, { search = "", customer = "", rep = "" } = {}) {
  const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  return (programs || [])
    .filter((p) => programMatches(p, search) && (!customer || same(p.customer, customer)) && (!rep || same(salesRepOf(p), rep)))
    .sort((a, b) => a.program_no - b.program_no);
}

// The names the Customer and Sales rep filters offer: only those on the
// list, A to Z, each once.
export function filterChoices(programs) {
  const az = (list) =>
    [...new Map(list.filter(Boolean).map((s) => [s.toLowerCase(), s])).values()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
    );
  return {
    customers: az((programs || []).map((p) => String(p.customer ?? "").trim())),
    reps: az((programs || []).map(salesRepOf)),
  };
}

const mm = (n) => String(Math.round(Number(n) * 100) / 100);

// The bar a program is cut from, in shop words: "D50 bar", "D71 x 50
// tube", "Pipe 100NB SCH120". Taken from the engine's costing where it says
// (it knows the bar it picked), otherwise from what was typed. A pipe size
// is named in NB from the engine's pipe list when it is to hand.
export function stockText(settings = {}, costing = null, pipes = null) {
  const s = settings || {};
  if (s.stock_type === "schedule") {
    const pipe = (pipes || []).find((p) => String(p.nps) === String(s.nps ?? ""));
    const size = pipe?.nb ? `${pipe.nb}NB` : s.nps && `NPS ${s.nps}`;
    const words = ["Pipe", size, s.schedule && `SCH${String(s.schedule).replace(/^sch\s*/i, "")}`];
    return words.filter(Boolean).join(" ");
  }
  const od = costing?.bar_dia ?? s.bar_dia;
  const id = costing?.bar_id ?? s.bar_id;
  if (!od) return s.stock_type === "tube" ? "tube" : "";
  if (s.stock_type === "tube" || Number(id) > 0) return `D${mm(od)} x ${mm(id)} tube`;
  return `D${mm(od)} bar`;
}

// The line the shut pill shows for a program the engine would not pass.
// The engine's fails first; with none, its toolpath check's problems in
// short words with the tool (Heinrich, 9 Oct 2026: O1027 rev C read a bare
// "Not for machine", its reasons being problems, not fails).
export function faultText(result) {
  if (!result || result.ready) return "";
  const fails = (result.fails || []).map((f) => (typeof f === "string" ? f : JSON.stringify(f))).filter(Boolean);
  const problems = [...new Set((result.problems || []).map(problemWords).filter(Boolean))];
  const text = fails.length ? fails.join("; ") : problems.length ? problems.join("; ") : "Not for machine";
  return text.length > 300 ? text.slice(0, 297) + "…" : text;
}

// The engine's problem kinds (its simulate.py), in the shop's words.
const PROBLEM_WORDS = {
  RAPID: "rapid through material",
  JAWS: "too close to the jaws",
  CLEARANCE: "tool clearance",
  TRAVEL: "past the machine's travel",
  // Any cut with the spindle stopped (the engine's check from 9 Oct 2026).
  SPINDLE: "spindle not running",
};

// "RAPID: 3MM PARTING G54: G0 from …" -> "rapid through material (3MM PARTING)".
// A problem may come as text or as [kind, text]; a kind not listed keeps
// its own first words.
export function problemWords(p) {
  const raw = Array.isArray(p) ? `${p[0]}: ${p[1] ?? ""}` : String(p ?? "");
  const m = raw.match(/^([A-Z]+):\s*(.*)$/s);
  if (!m) return raw.trim().slice(0, 80);
  const words = PROBLEM_WORDS[m[1]];
  if (!words) return raw.trim().slice(0, 80);
  const tool = m[2].match(/^(.+?)\s+G5\d\b/)?.[1];
  return tool ? `${words} (${tool})` : words;
}

// The part name a STEP file suggests: its file name without the ending.
export function partNameFromFile(fileName) {
  return String(fileName ?? "").replace(/\.(step|stp)$/i, "").trim();
}

// A program file's name, as the hand programs are filed:
// "O00001027 BUSH.txt". Characters a file name may not hold are dropped.
export function programFileName(number, partName) {
  const part = String(partName ?? "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${oNumber(number)}${part ? " " + part : ""}.txt`;
}

// What to tell the person when the engine says no.
export function engineErrorText(status, body) {
  const said = body && typeof body === "object" && body.error ? String(body.error) : "";
  if (status === 401) return "The program engine says you are not signed in. Sign out and in again, then try once more.";
  if (status === 413) return said ? `The STEP file is too big for the engine: ${said}.` : "The STEP file is too big for the engine.";
  if (status === 400) return `The engine could not make a program from this: ${said || "it did not say why"}.`;
  if (status === 0) return "The program engine could not be reached. Check the internet connection and try again.";
  return `The program engine failed${said ? `: ${said}` : ` (${status})`}. Nothing was saved.`;
}

// The engine takes up to about 4 MB per request (ERS TURNING APP,
// api/generate.py MAX_BYTES). Checked before anything is sent.
export const MAX_STEP_BYTES = 3_900_000;

// The letter the next revision will get: A..Z, then AA. The database gives
// the real one (cnc_revision_letter in setup-cnc-3-revisions.sql: change
// both together); this only names the folder its STEP file is filed under
// and the button ("Save as rev B").
export function revisionLetter(count) {
  let n = count;
  let v = "";
  do {
    v = String.fromCharCode(65 + (n % 26)) + v;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return v;
}

// The file name each program goes out under: its O number and the title it
// carries on its O line ("O00001027(BPW 10t BUSH SIDE 1)" ->
// "O00001027 BPW 10t BUSH SIDE 1.txt"), as the hand programs are filed.
// A program with no title takes the part name.
export function programFiles(programs, partName) {
  return (programs || []).map((p) => {
    const title = (String(p.text ?? "").match(/^O\d+\((.*?)\)/m) || [])[1];
    return { name: programFileName(p.number, title || partName), text: String(p.text ?? "") };
  });
}

// Import machine copy: each file read off the stick is matched to this
// program by the O number on its O line, never by its file name (the
// operator may have renamed it). The program's own numbers are its two
// (program_no and the next) and any its current revision carries. A file
// for another program is refused and named; a program not among the files
// is kept from the current revision as it was. The hand program wins
// (0.RULES.md): its text is saved exactly as it came off the machine.
export function matchMachineCopies(files, programNo, currentPrograms = []) {
  const own = new Set([programNo, programNo + 1, ...currentPrograms.map((p) => p.number)]);
  const byNumber = new Map();
  const refused = [];
  for (const f of files) {
    const m = String(f.text ?? "").match(/^\s*O0*(\d+)/m);
    if (!m) {
      refused.push({ fileName: f.name, reason: "no O number in it" });
      continue;
    }
    const number = Number(m[1]);
    if (!own.has(number)) {
      refused.push({ fileName: f.name, reason: `it is ${oNumber(number)}, not this program` });
      continue;
    }
    byNumber.set(number, { number, text: String(f.text), fileName: f.name });
  }
  const numbers = [...new Set([...currentPrograms.map((p) => p.number), ...byNumber.keys()])].sort((a, b) => a - b);
  const programs = numbers.map((n) => (byNumber.has(n) ? { number: n, text: byNumber.get(n).text } : currentPrograms.find((p) => p.number === n)));
  return {
    programs,
    imported: [...byNumber.values()].map(({ number, fileName }) => ({ number, fileName })).sort((a, b) => a.number - b.number),
    kept: currentPrograms.filter((p) => !byNumber.has(p.number)).map((p) => p.number),
    refused,
  };
}

// The day a time falls on in South Africa, as 2026-10-08 (never the UTC
// day, which is a day early before 02:00).
export function dayInSA(iso) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return parts;
}

// Export to Excel: one row per program, in program number order, for
// review only (nothing reads the file back). cycleBy maps a program's id
// to its current revision's cycle time in seconds.
export function exportRows(programs, cycleBy = {}) {
  return [...(programs || [])]
    .sort((a, b) => a.program_no - b.program_no)
    .map((p) => {
      const s = cycleBy[p.id];
      return {
        "O number": oNumber(p.program_no),
        Part: p.part_name || "",
        Customer: p.customer || "",
        "Sales rep": salesRepOf(p),
        "Quote reference": p.quote_ref || "",
        "Project name": p.project_name || "",
        Material: p.material || "",
        Bar: p.stock || "",
        Revision: p.current_rev || "none",
        Status: p.status === "ready" ? "Ready" : "Not for machine",
        Fault: p.status === "ready" ? "" : p.fault || "",
        "Cycle time (min)": s == null ? "" : Math.round((Number(s) / 60) * 10) / 10,
        "Last changed": dayInSA(p.updated_at),
      };
    });
}

// A shape's typed sizes (the engine's own list, GET ?shapes=1: each field
// has a key, a label, a unit and maybe a default). A field with no default
// must be typed; an empty one with a default is left for the engine.
export function cleanSizes(shape, form) {
  const sizes = {};
  const missing = [];
  const bad = [];
  for (const f of shape?.fields || []) {
    const n = readNumber(form?.[f.key]);
    if (n === null) {
      if (f.default === undefined || f.default === null) missing.push(f.label);
      continue;
    }
    if (Number.isNaN(n) || n < 0) bad.push(f.label);
    else sizes[f.key] = n;
  }
  return { sizes, missing, bad };
}

// A pipe size as the shop says it: "100NB (4")".
export function pipeLabel(pipe) {
  return pipe?.nb ? `${pipe.nb}NB (${pipe.nps}")` : `${pipe?.nps}"`;
}

// What the Costing tab sets, kept with the program (its settings) and
// carried into every new revision, because the questionnaire does not show
// them: the batch quantity (Heinrich, 8 Oct 2026: keep the batch size, a
// change of quantity updates the price), the bar length and parts per bar.
//
// Also how the material is priced (price_by: kg, m or piece) and the
// price per piece, both per program (Heinrich, 8 Oct 2026); neither is an
// engine setting, so runEngine leaves them out of what it sends.
//
// And, per job (Heinrich, 8 Oct 2026): the setup price (Rand per job,
// R750 when a program has none) and the machine rate (rate_per_s, Rand per
// second, the engine's R0.21 when none), typed as R/s or R/h (rate_unit,
// how the box shows it; not sent).
//
// And the stock bar a bar-puller job is cut from (stock_length, 6000 by
// the engine when none) and whether every bar bought is charged to the job
// (charge_all_material, unticked by default): Heinrich, 8 Oct 2026, the B&W
// bolt bought as 2 x 6 m and cut into 998 mm puller bars.
//
// And the program's own turret from its Tool crib (turret: station -> tool
// key), kept until changed or handed back to the automatic pick (Heinrich,
// 8 Oct 2026: "can change tool crib later and recalculate").
// The ones the Tool crib sets, not the Costing tab: a re-price on the
// Costing tab keeps them (until 9 Oct 2026 it dropped the program's own
// layout, which fell back to the automatic pick).
// thread_pitch too (the pitch set per thread, Heinrich 9 Oct 2026).
export const CRIB_KEYS = ["turret", "thread_pitch"];
export const COSTING_KEYS = ["qty", "parts_per_bar", "bar_length", "price_by", "piece_price", "setup_price", "rate_per_s", "rate_unit", "stock_length", "charge_all_material", "turret", "thread_pitch", "markup_material", "markup_offcut"];

export function costingPart(settings) {
  const out = {};
  for (const k of COSTING_KEYS) if (settings?.[k] != null && settings[k] !== "") out[k] = settings[k];
  return out;
}

// The money and time a reviewer reads off the engine's costing block (plain
// numbers, ERS TURNING APP quote.py). Rand to the cent, time in seconds.
export function costingFigures(costing) {
  if (!costing) return null;
  const n = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    qty: n(costing.qty),
    machineS: n(costing.machine_s ?? costing.part_s ?? costing.cycle_s),
    cycleS: n(costing.cycle_s),
    kgPerPart: n(costing.kg_per_part),
    materialPerPart: n(costing.material_per_part),
    pricePerPart: n(costing.price_per_part),
    batchTotal: n(costing.batch_total),
    oneOff: n(costing.one_off_price),
    materialPrice: n(costing.material_price),
    materialUnit: costing.material_unit || "",
    barsNeeded: n(costing.bars_needed),
    notes: Array.isArray(costing.notes) ? costing.notes.map(String) : [],
  };
}

export function rand(v) {
  if (v == null) return "–";
  return "R " + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// A new program's setup price, Rand per job (Heinrich, 8 Oct 2026: "Default
// of 750 on all new programs but can change"). Sent to the engine as
// setup_price, which then stands in for the 45 min first-off.
export const DEFAULT_SETUP_PRICE = 750;

// The engine's own machine rate when a program sets none (quote.py).
export const DEFAULT_RATE_PER_S = 0.21;

// The Wastage tab, per part, from the engine's costing.wastage: where the
// material bought goes, kg and Rand, and the total that must equal the
// material per part (finished + chips + saw kerf + offcut share; the
// engine makes them add up exactly, quote.py). ok is false when the total
// is more than a cent off what the part was costed at.
export function wastageRows(w, materialPerPart) {
  if (!w) return null;
  const n = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const rows = [
    { what: "Finished part", mm: n(w.part_mm), kg: n(w.finished_kg), cost: n(w.finished_cost) },
    { what: "Chips (turned away)", mm: null, kg: n(w.chips_kg), cost: n(w.chips_cost) },
    { what: "Saw / part-off kerf", mm: n(w.kerf_mm), kg: n(w.kerf_kg), cost: n(w.kerf_cost) },
    { what: "Share of the bar offcut", mm: n(w.offcut_share_mm), kg: n(w.offcut_share_kg), cost: n(w.offcut_share_cost) },
  ];
  const total = rows.reduce((s, r) => s + (r.cost || 0), 0);
  const costed = n(materialPerPart);
  return {
    rows,
    total: Math.round(total * 100) / 100,
    costed,
    ok: costed == null ? null : Math.abs(total - costed) < 0.011,
    usedKg: n(w.used_kg),
    wasteKg: n(w.waste_kg),
    wastePct: n(w.waste_pct),
    stockMm: n(w.stock_mm),
    stockKg: n(w.stock_kg),
  };
}


// Update program (Heinrich, 9 Oct 2026: "if there is no changes it should
// not ask to save a new rev"): what the revision about to be saved changes
// against the current one, in words, empty when nothing. A change of price
// alone is a change (his answer). Where the costing's cutting data came
// from (data_source) is left out: a new table version that moves no figure
// is no change. next is the row saveUpdate would insert; newStep is true
// when another STEP file was chosen. ignore names settings left out of the
// comparison: Turn around's side1, because the other end that comes out
// the same as now is nothing to keep.
export function revisionChanges(current, next, newStep = false, ignore = []) {
  if (!current) return ["first revision"];
  const same = (a, b) => sameJson(a ?? null, b ?? null);
  const priced = (c) => {
    if (!c) return null;
    const { data_source: _s, ...rest } = c;
    return rest;
  };
  const out = [];
  if (newStep) out.push("STEP model");
  if (!same(current.quick, next.quick)) out.push("sizes");
  if (!same(current.programs || [], next.programs || [])) out.push("program lines");
  if (!same(current.cycle_s, next.cycle_s) || !same(current.tool_s, next.tool_s)) out.push("cycle time");
  if (!same(priced(current.costing), priced(next.costing))) out.push("price");
  if (!same(current.ready, next.ready) || !same(current.fault || "", next.fault || "")) out.push("ready for the machine");
  if (!same(current.fails || [], next.fails) || !same(current.problems || [], next.problems) || !same(current.warnings || [], next.warnings)) {
    out.push("warnings");
  }
  const kept = (s) => Object.fromEntries(Object.entries(s || {}).filter(([k]) => !ignore.includes(k)));
  if (!same(kept(current.settings), kept(next.settings))) out.push("settings");
  if (!same(current.report || "", next.report || "")) out.push("report");
  return out;
}

// The boxes Update program saves on the program itself, not on a revision.
export function detailChanges(program, { partName, customer, materialName }) {
  const out = [];
  if ((program?.part_name || "") !== (partName || "")) out.push("part name");
  if ((program?.customer || "") !== (customer || "")) out.push("customer");
  if ((program?.material || "") !== (materialName || "")) out.push("material");
  return out;
}

// Equal as the database keeps them: jsonb does not keep key order, and a
// key holding undefined is not saved at all.
function sameJson(a, b) {
  return stableJson(a) === stableJson(b);
}
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stableJson(x))).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}
