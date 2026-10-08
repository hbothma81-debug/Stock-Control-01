// Every call the CNC tab makes: the cnc_ tables, the cnc-files store and
// the program engine. Kept in the module (not borrowed from App.jsx) so the
// CNC tab can be lifted out whole and sold. The rules the database applies
// are in setup-cnc-1..5.sql; what they mean on screen is in cncRules.js.

import { supabase } from "../lib/supabaseClient.js";
import { engineErrorText, faultText, stockText, MAX_STEP_BYTES } from "./cncRules.js";

// The engine (ERS TURNING APP, its own repository and Vercel project). It
// answers only a signed-in user of this app's databases, practice or live.
export const ENGINE_URL = "https://turnpath.vercel.app/api/generate";

const BUCKET = "cnc-files";

// What a list line needs, and nothing heavier: the settings, program text
// and STEP files are read only when a program is opened.
const LIST_COLUMNS = "id, program_no, part_name, customer, material, stock, current_rev, status, fault, updated_at";

// Every program, a page at a time (a plain select stops at 1000 rows with
// no error), paged by id so no row is skipped or repeated where pages meet.
export async function loadPrograms() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("cnc_programs").select(LIST_COLUMNS).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// One program, opened: its row and every revision, oldest first.
export async function loadProgram(id) {
  const [{ data: program, error: e1 }, { data: revisions, error: e2 }] = await Promise.all([
    supabase.from("cnc_programs").select("*").eq("id", id).single(),
    supabase.from("cnc_program_revisions").select("*").eq("program_id", id).order("created_at"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { program, revisions };
}

// The engine, with the signed-in person's token. Throws an Error whose
// message is already in plain words.
export async function runEngine({ name, stepText, settings, extra = {} }) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(engineErrorText(401, null));
  let res;
  try {
    res = await fetch(ENGINE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...extra, name, step: stepText, settings }),
    });
  } catch {
    throw new Error(engineErrorText(0, null));
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body) throw new Error(engineErrorText(res.status, body));
  return body;
}

// The settings sent to the engine: the questionnaire plus the material,
// its price and weight from Stock Manager's CNC Bar Grades (Heinrich,
// 8 Oct 2026: one list). No price is sent for a grade without one, and the
// engine then costs it at R30/kg.
export function engineSettings({ settings, material, programNo }) {
  const out = { ...settings, program_no: programNo };
  if (material?.name) out.material = material.name;
  if (Number(material?.price) > 0) {
    out.material_price = Number(material.price);
    out.price_unit = "R/kg";
  }
  if (Number(material?.density) > 0) out.density = Number(material.density);
  return out;
}

// A revision row from the engine's answer. The letter is the database's
// (setup-cnc-3-revisions.sql), which also makes it the program's current
// revision in the same save.
function revisionRow({ programId, result, settings, stepPath, stepName, userName }) {
  return {
    program_id: programId,
    source: "generated",
    programs: result.programs || [],
    report: typeof result.report === "string" ? result.report : JSON.stringify(result.report ?? ""),
    ready: !!result.ready,
    fault: faultText(result),
    fails: result.fails || [],
    warnings: result.warnings || [],
    problems: result.problems || [],
    cycle_s: result.cycle_s ?? null,
    tool_s: result.tool_s ?? null,
    costing: result.costing ?? null,
    settings,
    step_path: stepPath,
    step_name: stepName,
    created_by: userName || "",
  };
}

// New program: the next free number (or the one typed), the engine, the
// STEP file, the program row, revision A. The number is taken first
// because the engine writes it into the program; a number taken for an
// engine run that then fails is simply skipped. A page closed between the
// program row and its revision leaves a program with no revision, which
// the program screen says and Update program mends.
export async function createProgram({ partName, customer, material, settings, programNo, stepFile, userName }) {
  if (stepFile.size > MAX_STEP_BYTES) {
    throw new Error(`The STEP file is ${Math.round(stepFile.size / 1000)} kB; the engine takes up to ${MAX_STEP_BYTES / 1000} kB.`);
  }
  const stepText = await stepFile.text();
  let number = programNo;
  if (!number) {
    const { data, error } = await supabase.rpc("take_cnc_program_number");
    if (error) throw new Error(error.hint === "cnc_not_allowed" ? error.message : `No program number could be taken: ${error.message}`);
    number = data;
  }
  const sent = engineSettings({ settings, material, programNo: number });
  const result = await runEngine({ name: partName, stepText, settings: sent });

  const id = crypto.randomUUID();
  const stepPath = `${id}/A/${stepFile.name}`;
  const up = await supabase.storage.from(BUCKET).upload(stepPath, stepFile, { contentType: "text/plain" });
  if (up.error) throw new Error(`The STEP file could not be stored: ${up.error.message}. Nothing was saved.`);

  const { error: e1 } = await supabase.from("cnc_programs").insert({
    id,
    program_no: number,
    part_name: partName,
    customer: customer || "",
    material: material?.name || "",
    stock: stockText(sent, result.costing),
    settings: sent,
    created_by: userName || "",
  });
  if (e1) {
    await supabase.storage.from(BUCKET).remove([stepPath]);
    throw new Error(e1.hint === "cnc_number_taken" ? e1.message : `The program could not be saved: ${e1.message}`);
  }
  const { error: e2 } = await supabase
    .from("cnc_program_revisions")
    .insert(revisionRow({ programId: id, result, settings: sent, stepPath, stepName: stepFile.name, userName }));
  if (e2) throw new Error(`O${number} was saved but its revision was not: ${e2.message}. Open it and press Update program.`);
  return id;
}

// The STEP model a program was last made from: the shown revision's file,
// or for a program whose revision was never saved, the file filed under it.
export async function storedStep(programId, rev) {
  let path = rev?.step_path || null;
  if (!path) path = (await programFiles(programId)).find((p) => /\.(step|stp)$/i.test(p)) || null;
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`The STEP file could not be read: ${error.message}`);
  return { path, name: path.split("/").pop(), text: await data.text() };
}

// Update program, first half: run the engine on the changed answers (and
// the new STEP, when one is chosen) with the program's own number. Nothing
// is saved: the screen shows what changed, and saveUpdate saves it.
export async function runUpdate({ program, partName, current, material, settings, stepFile }) {
  let step;
  if (stepFile) {
    if (stepFile.size > MAX_STEP_BYTES) {
      throw new Error(`The STEP file is ${Math.round(stepFile.size / 1000)} kB; the engine takes up to ${MAX_STEP_BYTES / 1000} kB.`);
    }
    step = { file: stepFile, name: stepFile.name, text: await stepFile.text(), path: null };
  } else {
    step = await storedStep(program.id, current);
    if (!step) throw new Error("No STEP file is stored for this program: choose one.");
  }
  const sent = engineSettings({ settings, material, programNo: program.program_no });
  const result = await runEngine({ name: partName || program.part_name, stepText: step.text, settings: sent });
  return { result, sent, step };
}

// Update program, second half: the new revision (the database gives its
// letter and makes it current), a new STEP filed under that letter, then
// the program's name, customer, material and bar. A STEP left as it was is
// pointed at, not copied.
export async function saveUpdate({ program, run, letter, partName, customer, material, userName }) {
  const { result, sent, step } = run;
  let stepPath = step.path;
  if (step.file) {
    stepPath = `${program.id}/${letter}/${step.name}`;
    const up = await supabase.storage.from(BUCKET).upload(stepPath, step.file, { contentType: "text/plain", upsert: true });
    if (up.error) throw new Error(`The STEP file could not be stored: ${up.error.message}. Nothing was saved.`);
  }
  const { data: rev, error: e1 } = await supabase
    .from("cnc_program_revisions")
    .insert(revisionRow({ programId: program.id, result, settings: sent, stepPath, stepName: step.name, userName }))
    .select("rev")
    .single();
  if (e1) throw new Error(`The new revision could not be saved: ${e1.message}`);
  const { data: rows, error: e2 } = await supabase
    .from("cnc_programs")
    .update({ part_name: partName, customer: customer || "", material: material?.name || "", stock: stockText(sent, result.costing) })
    .eq("id", program.id)
    .select("id");
  if (e2 || !rows?.length) {
    throw new Error(`Rev ${rev.rev} was saved, but the part name, customer and material were not: ${e2?.message || "the database changed nothing"}.`);
  }
  return rev.rev;
}

// Import machine copy, first half: the engine's check of the hand program
// against the model the program was made from (action 'check', live on the
// engine since 8 Oct 2026): rapids into the stock, the jaws, the travel,
// the cycle time and costing, and where the program and the model differ.
// Nothing is saved. A program with no STEP stored is not checked.
export async function checkMachineCopy({ program, current, programs }) {
  const step = await storedStep(program.id, current);
  if (!step) return { result: null, reason: "No STEP file is stored for this program, so the engine could not check it." };
  const settings = current?.settings || program.settings || {};
  const result = await runEngine({
    name: program.part_name,
    stepText: step.text,
    settings,
    extra: { action: "check", programs, previous: current?.programs || [] },
  });
  return { result, step, settings };
}

// Import machine copy, second half: the made revision. Ready, by
// Heinrich's answer (8 Oct 2026: what ran on the machine is what is made);
// whatever the check found is kept with it and shown. The STEP and the
// answers stay those of the revision it came from.
export async function saveMachineCopy({ program, current, programs, check, fileNames, userName }) {
  const r = check?.result || null;
  const differences = (r?.differences || []).map(String);
  const report = [
    `Machine copy imported from ${fileNames.join(", ")}${current ? ` over rev ${current.rev}` : ""}.`,
    r ? "" : check?.reason || "The engine did not check it.",
    differences.length ? "Where the hand program and the model differ (the program wins):" : "",
    ...differences.map((d) => "- " + d),
  ].filter(Boolean).join("\n");
  const row = {
    program_id: program.id,
    source: "machine_copy",
    programs,
    report,
    ready: true,
    fault: "",
    fails: r?.fails || [],
    warnings: r?.warnings || [],
    problems: r?.problems || [],
    cycle_s: r?.cycle_s ?? null,
    tool_s: r?.tool_s ?? null,
    costing: r?.costing ?? null,
    settings: check?.settings || current?.settings || program.settings || null,
    step_path: current?.step_path || check?.step?.path || null,
    step_name: current?.step_name || check?.step?.name || null,
    note: `Imported from ${fileNames.join(", ")}`,
    created_by: userName || "",
  };
  const { data, error } = await supabase.from("cnc_program_revisions").insert(row).select("rev").single();
  if (error) throw new Error(`The machine copy could not be saved: ${error.message}`);
  return data.rev;
}

// Every file filed under a program (<id>/<rev>/<file>), including one left
// by a save that stopped before its revision was written.
async function programFiles(programId) {
  const store = supabase.storage.from(BUCKET);
  const { data: revs } = await store.list(programId);
  const paths = [];
  for (const r of revs || []) {
    if (r.id) {
      paths.push(`${programId}/${r.name}`);
      continue;
    }
    const { data: files } = await store.list(`${programId}/${r.name}`);
    for (const f of files || []) paths.push(`${programId}/${r.name}/${f.name}`);
  }
  return paths;
}

// Delete a program: the row (its revisions go with it), then its files.
// Only admins and the delete tick may; the database refuses anyone else
// and nothing is removed.
export async function deleteProgram(program) {
  const paths = await programFiles(program.id);
  const { data, error } = await supabase.from("cnc_programs").delete().eq("id", program.id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The database did not delete it: only admins and people with the CNC delete tick may.");
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}
