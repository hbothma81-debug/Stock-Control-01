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
// gripped too.
export const PROCESS_BOXES = {
  cut: ["stock_extra", "grip1", "grip2"],
  puller: ["pulls", "pull_max_ld", "back_op", "grip2"],
};

export const FINISH_BOXES = ["edge_break", "finish_mode", "nose_comp", "side1"];

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
