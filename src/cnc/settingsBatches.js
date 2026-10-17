// The questionnaire in small batches (Heinrich, 11 Oct 2026: "break up the
// settings into smaller batches so people with less experience don't get
// confused"). Stock and Process are picked first, and must be before
// Generate; each pick opens only its own boxes. The rest sits shut under
// More settings. Pure rules, tested in settingsBatches.test.js.
//
// Cut to size is the engine's "double-chucked" (a sawn billet, side 1 then
// turned round); the magnet puller is a choice under Bar puller.

export const STOCK_BOXES = {
  bar: ["bar_dia"],
  tube: ["bar_dia", "bar_id"],
  schedule: ["nps", "schedule"],
};

export const PROCESSES = [
  { value: "cut", label: "Cut to size" },
  { value: "puller", label: "Bar puller" },
];

export const PULLERS = [
  { value: "bar puller", label: "Normal puller" },
  { value: "magnet puller", label: "Magnet puller" },
];

// The holding a Process pick sets; Bar puller starts on the normal puller.
export const HOLDING_OF = { cut: "double-chucked", puller: "bar puller" };

// Jaw grip side 2 is in both: the part-and-turn back end of bar work is
// gripped too. Inside only belongs to Cut to size (a part held in the
// chuck, never bar work) and comes first, where it is seen.
export const PROCESS_BOXES = {
  cut: ["id_only", "stock_extra", "grip1", "grip2", "side2_own_program"],
  puller: ["pulls", "pull_max_ld", "parts_per_pull", "back_op", "grip2", "side2_own_program"],
};

export const FINISH_BOXES = ["edge_break", "finish_mode", "nose_comp", "side1"];

// One answer typed. More than one part per pull needs the back end Part
// only (each part is parted off; with Part and turn the engine makes one
// per pull), so typing it sets that too: the same action sets up what it
// needs.
export function withAnswer(form, key, value) {
  const next = { ...form, [key]: value };
  if (key === "parts_per_pull" && morePerPull(next)) next.back_op = "part only";
  return next;
}

// Whether the form asks for more than one part per pull.
export const morePerPull = (form) => Number(String(form?.parts_per_pull ?? "").replace(",", ".")) > 1;

// The Process an engine holding belongs to, "" when none is picked.
export function processOf(holding) {
  if (holding === "double-chucked") return "cut";
  if (holding === "bar puller" || holding === "magnet puller") return "puller";
  return "";
}

// Whether Stock and Process are both picked, so Generate may run.
export function stockAndProcessPicked(form) {
  return !!STOCK_BOXES[form?.stock_type] && !!processOf(form?.holding);
}

// The answers that apply to what is picked. A box shut by another pick is
// not sent, so a Tube ID typed before switching to Solid bar never reaches
// the engine; switching back still shows what was typed.
export function keepShown(form) {
  const keys = new Set([
    "stock_type",
    "holding",
    ...(STOCK_BOXES[form?.stock_type] || []),
    ...(PROCESS_BOXES[processOf(form?.holding)] || []),
    ...FINISH_BOXES,
  ]);
  return Object.fromEntries(Object.entries(form || {}).filter(([k]) => keys.has(k)));
}
