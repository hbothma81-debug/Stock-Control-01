// A program's History tab in words (Heinrich, 8 Oct 2026: "a program
// history tab for safety to see who changed what"). The lines are written
// by the database (setup-cnc-13-program-history.sql: made, revision,
// changed, each change { field, from, to }); here they are grouped and
// said. No React, no database: historyRules.test.js.
//
// The fields the database writes are named in cnc_log_program() in that
// file: a field added there gets its words here.

import { CNC_FIELDS } from "./cncFields.js";
import { rand, settingText } from "./cncRules.js";

const PROGRAM_WORDS = {
  part_name: "Part name",
  customer: "Customer",
  material: "Material",
  quote_ref: "Quote reference",
  project_name: "Project name",
  status: "Status",
  fault: "Fault",
  price_per_part: "Cost per part",
};

const COSTING_WORDS = {
  qty: "Batch quantity",
  parts_per_bar: "Parts per bar",
  bar_length: "Bar length (mm)",
  price_by: "Material priced by",
  piece_price: "Price per piece",
  setup_price: "Setup price per job",
  rate_per_s: "Machine rate",
  rate_unit: "Machine rate shown in",
  stock_length: "Stock length (mm)",
  charge_all_material: "Charge all material to this job",
  turret: "Tool crib",
  markup_material: "Material markup",
  markup_offcut: "Offcut markup",
};

// Changes whose values are money: shown only with "Can see Rand values".
const MONEY = new Set(["price_per_part", "settings.piece_price", "settings.setup_price", "settings.rate_per_s", "settings.markup_material", "settings.markup_offcut"]);

const blank = (v) => v === undefined || v === null || v === "";
const minSec = (s) => `${Math.floor(Number(s) / 60)} min ${Math.round(Number(s) % 60)} s`;

export function fieldWords(field) {
  if (PROGRAM_WORDS[field]) return PROGRAM_WORDS[field];
  const key = String(field).replace(/^settings\./, "");
  if (COSTING_WORDS[key]) return COSTING_WORDS[key];
  const f = CNC_FIELDS.find((x) => x.key === key);
  return f ? f.label : key.replace(/_/g, " ");
}

function valueWords(field, v) {
  const key = String(field).replace(/^settings\./, "");
  if (field === "status") return v === "ready" ? "Ready for the machine" : "Not for machine";
  if (field === "price_per_part" || key === "piece_price" || key === "setup_price") return blank(v) ? "none" : rand(v);
  if (key === "rate_per_s") return blank(v) ? "the default" : `R ${v}/s`;
  if (key.startsWith("markup_")) return blank(v) ? "60% (default)" : `${v}%`;
  if (typeof v === "boolean") return v ? "yes" : "no";
  const f = CNC_FIELDS.find((x) => x.key === key);
  if (f && field.startsWith("settings.")) return settingText(f, v);
  return blank(v) ? "none" : String(v);
}

// One change in words. canSeeValue false: money changes say only that
// they changed.
export function changeWords(c, { canSeeValue = true } = {}) {
  const field = String(c?.field ?? "");
  if (field === "source") return c.to === "machine_copy" ? "Machine copy imported" : "Made by the engine";
  if (field === "cycle_s") return blank(c.to) ? "" : `Cycle time ${minSec(c.to)}`;
  if (field === "settings.turret") {
    if (blank(c.to)) return "Tool crib handed back to the automatic pick";
    return blank(c.from) ? "Tool crib set by hand" : "Tool crib changed";
  }
  if (field === "fault" && blank(c.to)) return "Fault cleared";
  const name = fieldWords(field);
  if (MONEY.has(field) && !canSeeValue) return `${name} changed`;
  const tail = field === "price_per_part" && !blank(c.qty) ? ` (batch of ${c.qty})` : "";
  return `${name}: ${valueWords(field, c.from)} → ${valueWords(field, c.to)}${tail}`;
}

// The lines one save made, and those the same person made within two
// minutes (an Update program is a revision, then the program's new price
// a moment later), as one entry; but never two revisions in one entry,
// each revision is a line of its own. Rows come newest first; entries too.
export function historyEntries(rows, { withinS = 120 } = {}) {
  const sorted = [...(rows || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || Number(b.seq || 0) - Number(a.seq || 0));
  const entries = [];
  for (const r of sorted) {
    const last = entries[entries.length - 1];
    const t = new Date(r.created_at).getTime();
    const secondRevision = r.kind === "revision" && last?.rows.some((x) => x.kind === "revision");
    if (last && !secondRevision && last.who === (r.changed_by || "") && (last.oldest - t) / 1000 <= withinS) {
      last.rows.push(r);
      last.oldest = t;
    } else {
      entries.push({ at: r.created_at, who: r.changed_by || "", rows: [r], oldest: t });
    }
  }
  return entries.map(({ oldest: _o, ...e }) => {
    const made = e.rows.some((r) => r.kind === "made");
    const revs = e.rows.filter((r) => r.kind === "revision").map((r) => r.rev).filter(Boolean).reverse();
    const changes = e.rows.filter((r) => r.kind !== "made").reverse().flatMap((r) => r.changes || []);
    return { ...e, made, revs, changes };
  });
}

// The entry's one line: what happened, shortest first.
export function entryHeadline(e, { canSeeValue = true } = {}) {
  const bits = [];
  if (e.made) bits.push("Program made");
  if (e.revs.length) bits.push(`Rev ${e.revs.join(", ")} saved`);
  const named = [...new Set(e.changes.filter((c) => !["source", "cycle_s", "status", "fault"].includes(c.field)).map((c) => fieldWords(c.field)))];
  const price = e.changes.find((c) => c.field === "price_per_part");
  if (price && canSeeValue && !blank(price.to)) bits.push(`cost per part ${rand(price.to)}`);
  const rest = named.filter((n) => n !== PROGRAM_WORDS.price_per_part);
  if (rest.length) bits.push(`changed ${rest.slice(0, 3).join(", ").toLowerCase()}${rest.length > 3 ? ` and ${rest.length - 3} more` : ""}`);
  const status = [...e.changes].reverse().find((c) => c.field === "status");
  if (status) bits.push(status.to === "ready" ? "now ready for the machine" : "now not for machine");
  return bits.join(" · ") || "Changed";
}
