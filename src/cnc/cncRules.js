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
// material and bar, the fault, and the O number typed any way at all
// ("1027", "O1027", "O00001027").
export function programMatches(p, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/^o/, "").replace(/^0+/, "");
  if (/^\d+$/.test(digits) && String(p.program_no).includes(digits)) return true;
  return [p.part_name, p.customer, p.material, p.stock, p.fault].some((s) => String(s ?? "").toLowerCase().includes(q));
}

// The two pills, each sorted by program number.
export function splitPrograms(programs, query = "") {
  const shown = (programs || []).filter((p) => programMatches(p, query)).sort((a, b) => a.program_no - b.program_no);
  return {
    notForMachine: shown.filter((p) => p.status !== "ready"),
    ready: shown.filter((p) => p.status === "ready"),
  };
}

const mm = (n) => String(Math.round(Number(n) * 100) / 100);

// The bar a program is cut from, in shop words: "D50 bar", "D71 x 50
// tube", "NPS 2 SCH80 pipe". Taken from the engine's costing where it says
// (it knows the bar it picked), otherwise from what was typed.
export function stockText(settings = {}, costing = null) {
  const s = settings || {};
  if (s.stock_type === "schedule") {
    const words = ["Pipe", s.nps && `NPS ${s.nps}`, s.schedule && `SCH${String(s.schedule).replace(/^sch\s*/i, "")}`];
    return words.filter(Boolean).join(" ");
  }
  const od = costing?.bar_dia ?? s.bar_dia;
  const id = costing?.bar_id ?? s.bar_id;
  if (!od) return s.stock_type === "tube" ? "tube" : "";
  if (s.stock_type === "tube" || Number(id) > 0) return `D${mm(od)} x ${mm(id)} tube`;
  return `D${mm(od)} bar`;
}

// The line the shut pill shows for a program the engine would not pass.
export function faultText(result) {
  if (!result || result.ready) return "";
  const fails = (result.fails || []).map((f) => (typeof f === "string" ? f : JSON.stringify(f))).filter(Boolean);
  const text = fails.length ? fails.join("; ") : "Not for machine";
  return text.length > 300 ? text.slice(0, 297) + "…" : text;
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
