// Every call the CNC tab makes: the cnc_ tables, the cnc-files store and
// the program engine. Kept in the module (not borrowed from App.jsx) so the
// CNC tab can be lifted out whole and sold. The rules the database applies
// are in setup-cnc-1..5.sql; what they mean on screen is in cncRules.js.

import { supabase } from "../lib/supabaseClient.js";
import { barSizeOf, findBarPrice, kgPerMetre, materialPricing, sameSize } from "./pricing.js";
import { DEFAULT_SETUP_PRICE } from "./cncRules.js";
import { COSTING_KEYS, costingPart, dayInSA, engineErrorText, exportRows, faultText, stockText, MAX_STEP_BYTES } from "./cncRules.js";

// The engine (ERS TURNING APP, its own repository and Vercel project). It
// answers only a signed-in user of this app's databases, practice or live.
export const ENGINE_URL = "https://turnpath.vercel.app/api/generate";

const BUCKET = "cnc-files";

// What a list line needs, and nothing heavier: the settings, program text
// and STEP files are read only when a program is opened.
const LIST_COLUMNS = "id, program_no, part_name, customer, material, stock, current_rev, status, fault, updated_at, created_by";
// setup-cnc-12-program-refs.sql: asked for only where the database has them.
const REF_COLUMNS = ", quote_ref, project_name";

// Every program, a page at a time (a plain select stops at 1000 rows with
// no error), paged by id so no row is skipped or repeated where pages meet.
// hasRefs: whether the database keeps a quote reference and project name
// (a database without file 12 answers 42703 to the longer list, and the
// list is read without them).
export async function loadPrograms() {
  let columns = LIST_COLUMNS + REF_COLUMNS;
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("cnc_programs").select(columns).order("id").range(from, from + PAGE - 1);
    if (error && error.code === "42703" && columns !== LIST_COLUMNS) {
      columns = LIST_COLUMNS;
      rows.length = 0;
      from = -PAGE;
      continue;
    }
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return { rows, hasRefs: columns !== LIST_COLUMNS };
}

// A program's quote reference and project name, from its page (saved on
// leaving the box). Hands back the whole row.
export async function saveProgramRefs(id, changes) {
  const row = {};
  if (changes.quoteRef !== undefined) row.quote_ref = String(changes.quoteRef).trim().slice(0, 100);
  if (changes.projectName !== undefined) row.project_name = String(changes.projectName).trim().slice(0, 200);
  const { data, error } = await supabase.from("cnc_programs").update(row).eq("id", id).select("*");
  if (error) throw new Error(`Not saved: ${error.message}`);
  if (!data?.length) throw new Error("Not saved: the database changed nothing (the CNC Edit tick is needed).");
  return data[0];
}

// Export to Excel (review only): the programs on screen, with each one's
// current cycle time. Read when the button is pressed, never otherwise:
// three small columns of every revision, a page at a time.
export async function exportPrograms(programs, title) {
  const cycleBy = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("cnc_program_revisions").select("id, program_id, rev, cycle_s").order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data) {
      const p = programs.find((x) => x.id === r.program_id);
      if (p && p.current_rev === r.rev) cycleBy[p.id] = r.cycle_s;
    }
    if (data.length < PAGE) break;
  }
  let XLSX;
  try {
    XLSX = await import("xlsx");
  } catch {
    throw new Error("The spreadsheet builder could not load. The app has probably been updated: reload the page and try again.");
  }
  const ws = XLSX.utils.json_to_sheet(exportRows(programs, cycleBy));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CNC programs");
  XLSX.writeFile(wb, `${title}-${dayInSA(new Date().toISOString())}.xlsx`);
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

// The program's own settings that are not the engine's (how it is priced):
// kept with the program, never sent, because the engine refuses a key it
// does not know.
function forEngine(settings) {
  const { price_by: _b, piece_price: _p, rate_unit: _r, ...rest } = settings || {};
  return rest;
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
      body: JSON.stringify({ ...extra, name, step: stepText, settings: forEngine(settings) }),
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

// The engine's own lists (no sign-in, no data of ours): the Shapes
// (GET ?shapes=1) and the pipe sizes with their schedules (GET ?pipes=1).
// Read once per page load. An engine that does not have a list yet answers
// its health check instead, and that reads as null: the Shapes screen says
// so, and Pipe size and Schedule stay typed boxes.
const engineLists = {};
export function loadEngineList(kind) {
  if (!engineLists[kind]) {
    engineLists[kind] = fetch(`${ENGINE_URL}?${kind}=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => (Array.isArray(body?.[kind]) ? body[kind] : null))
      .catch(() => null)
      .then((list) => {
        if (!list) delete engineLists[kind];
        return list;
      });
  }
  return engineLists[kind];
}

// The price of each bar size of a grade (cnc_bar_prices,
// setup-cnc-9-bar-prices.sql): read when the CNC tab opens and after a
// price is saved, held here for every engine run. A database without the
// table reads as no prices, and every bar then takes its grade's R/kg.
let barPricesHeld = [];
export function getBarPrices() {
  return barPricesHeld;
}
export async function loadBarPrices() {
  const { data, error } = await supabase.from("cnc_bar_prices").select("*").order("id").range(0, 4999);
  if (error) {
    console.warn("CNC bar prices could not be read:", error.message);
    barPricesHeld = [];
  } else barPricesHeld = data || [];
  return barPricesHeld;
}

// A bar size's price, as typed: added, or changed when the size has one.
export async function saveBarPrice({ grade, size, price, unit, userName }) {
  const { error } = await supabase
    .from("cnc_bar_prices")
    .upsert({ grade, od: size.od, id_mm: size.id, price, unit, updated_by: userName || "" }, { onConflict: "grade,od,id_mm" })
    .select("id");
  if (error) throw new Error(`The bar price was not saved: ${error.message}`);
  return loadBarPrices();
}

export async function removeBarPrice(id) {
  const { data, error } = await supabase.from("cnc_bar_prices").delete().eq("id", id).select("id");
  if (error || !data?.length) throw new Error(`The bar price was not removed: ${error?.message || "the database changed nothing"}`);
  return loadBarPrices();
}

// The settings sent to the engine: the questionnaire plus the material,
// its weight (CNC Bar Grades) and its price by the way the program is
// priced (pricing.js materialPricing): the bar size's own price, else the
// grade's R/kg, else nothing and the engine's R30/kg. size is the bar the
// program is cut from, when known.
export function engineSettings({ settings, material, programNo, size = null }) {
  // The price and weight are always today's: an old one kept in saved
  // settings is dropped first.
  const { material_price: _p, price_unit: _u, density: _d, ...rest } = settings || {};
  const out = { ...rest, program_no: programNo };
  if (material?.name) out.material = material.name;
  if (Number(material?.density) > 0) out.density = Number(material.density);
  const { send } = materialPricing({
    priceBy: rest.price_by || "kg",
    piecePrice: rest.piece_price,
    sizeRow: findBarPrice(barPricesHeld, material?.name, size),
    gradePrice: material?.price,
    kgm: size ? kgPerMetre(size.od, size.id, material?.density) : 0,
  });
  // Setup: the program's own price per job, else R750 for every program,
  // old ones included (Heinrich, 8 Oct 2026). Machine rate: the program's
  // own, else none sent and the engine's R0.21/s.
  const extraCost = { setup_price: Number(rest.setup_price) > 0 ? Number(rest.setup_price) : DEFAULT_SETUP_PRICE };
  if (!(Number(rest.rate_per_s) > 0)) delete out.rate_per_s;
  return { ...out, ...send, ...extraCost };
}

// One engine run priced for the bar it is cut from. The bar is often only
// known from the engine's answer (it picks the smallest that fits), so
// when that bar has a price of its own that differs from what was sent,
// the engine is asked once more with it.
async function runPriced({ name, stepText, settings, material, programNo, extra = {}, barHint = null }) {
  const size = barSizeOf(settings, null) || barHint;
  let sent = engineSettings({ settings, material, programNo, size });
  let result = await runEngine({ name, stepText, settings: sent, extra });
  const actual = barSizeOf(settings, result.costing);
  if (actual && !sameSize(actual, size)) {
    const again = engineSettings({ settings, material, programNo, size: actual });
    if (again.material_price !== sent.material_price || again.price_unit !== sent.price_unit) {
      result = await runEngine({ name, stepText, settings: again, extra });
      sent = again;
    }
  }
  return { result, sent };
}

// The engine's costing as saved, with where its cutting data and machine
// came from (answer.data_source: "test cnc_ tables, version 12 (10
// sheets)" or "engine files", from the engine's aefdd21) kept inside it,
// so the Program and Costing tabs can say so. No new column.
function withSource(result) {
  if (!result?.costing) return null;
  return result.data_source ? { ...result.costing, data_source: result.data_source } : result.costing;
}

// A revision row from the engine's answer. The letter is the database's
// (setup-cnc-3-revisions.sql), which also makes it the program's current
// revision in the same save.
// A shape program's revision also keeps its shape and sizes (quick); the
// key is left off a STEP program's row, so saving one never needs the
// column (setup-cnc-7-shapes.sql).
function revisionRow({ programId, result, settings, stepPath, stepName, userName, quick = null }) {
  return {
    ...(quick ? { quick } : {}),
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
    costing: withSource(result),
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
//
// A program made from a shape (quick = { shape, sizes }) has no STEP: the
// engine is sent the shape and sizes instead.
export async function createProgram({ partName, customer, material, settings, programNo, stepFile = null, quick = null, quoteRef = "", projectName = "", userName }) {
  if (stepFile && stepFile.size > MAX_STEP_BYTES) {
    throw new Error(`The STEP file is ${Math.round(stepFile.size / 1000)} kB; the engine takes up to ${MAX_STEP_BYTES / 1000} kB.`);
  }
  const stepText = stepFile ? await stepFile.text() : undefined;
  let number = programNo;
  if (!number) {
    const { data, error } = await supabase.rpc("take_cnc_program_number");
    if (error) throw new Error(error.hint === "cnc_not_allowed" ? error.message : `No program number could be taken: ${error.message}`);
    number = data;
  }
  const { result, sent } = await runPriced({ name: partName, stepText, settings, material, programNo: number, extra: quick ? { quick } : {} });

  const id = crypto.randomUUID();
  const stepPath = stepFile ? `${id}/A/${stepFile.name}` : null;
  if (stepFile) {
    const up = await supabase.storage.from(BUCKET).upload(stepPath, stepFile, { contentType: "text/plain" });
    if (up.error) throw new Error(`The STEP file could not be stored: ${up.error.message}. Nothing was saved.`);
  }

  const { error: e1 } = await supabase.from("cnc_programs").insert({
    ...(quick ? { quick } : {}),
    // Sent only when typed, so a database without file 12 still saves.
    ...(quoteRef.trim() ? { quote_ref: quoteRef.trim().slice(0, 100) } : {}),
    ...(projectName.trim() ? { project_name: projectName.trim().slice(0, 200) } : {}),
    id,
    program_no: number,
    part_name: partName,
    customer: customer || "",
    material: material?.name || "",
    stock: stockText(sent, result.costing, await loadEngineList("pipes")),
    settings: sent,
    costing: withSource(result),
    created_by: userName || "",
  });
  if (e1) {
    if (stepPath) await supabase.storage.from(BUCKET).remove([stepPath]);
    throw new Error(e1.hint === "cnc_number_taken" ? e1.message : `The program could not be saved: ${e1.message}`);
  }
  const { error: e2 } = await supabase
    .from("cnc_program_revisions")
    .insert(revisionRow({ programId: id, result, settings: sent, stepPath, stepName: stepFile?.name || null, userName, quick }));
  if (e2) throw new Error(`O${number} was saved but its revision was not: ${e2.message}. Open it and press Update program.`);
  return id;
}

// The Costing tab: the program's current revision priced at a batch size,
// bar length and material price (the engine's check on the revision's own
// program text, so a machine copy is priced by what runs). Then saved with
// the program: the batch size in its settings and the price in costing
// (setup-cnc-8-costing.sql), which is what a quote reads.
export async function recost({ program, current, material, costingSettings }) {
  if (!current) throw new Error("This program has no revision to price: press Update program first.");
  const quick = current.quick || program.quick || null;
  const step = quick ? null : await storedStep(program.id, current);
  if (!step && !quick) throw new Error("No STEP file is stored for this program, so it cannot be priced.");
  // The Costing tab sends all three costing figures; one left out is cleared.
  const base = { ...(program.settings || {}) };
  for (const k of COSTING_KEYS) delete base[k];
  const { result, sent: settings } = await runPriced({
    name: program.part_name,
    stepText: step?.text,
    settings: { ...base, ...costingSettings },
    material,
    programNo: program.program_no,
    extra: { action: "check", programs: current.programs || [], ...(quick ? { quick } : {}) },
    barHint: barSizeOf({}, program.costing || current.costing),
  });
  if (!result.costing) throw new Error("The engine did not send a price back.");
  const { data, error } = await supabase
    .from("cnc_programs")
    .update({ settings, costing: withSource(result) })
    .eq("id", program.id)
    .select("*")
    .single();
  if (error) throw new Error(`The price was worked out but not saved: ${error.message}`);
  return data;
}

// The Toolpath tab: the engine's check on a revision's own program text
// (a machine copy is drawn as the operator edited it), for its moves, the
// material left after each side and the setup. Nothing is saved; the
// moves are not kept in the database (agreed with the engine, 8 Oct 2026).
export async function loadToolpath({ program, rev }) {
  if (!rev) throw new Error("This program has no revision to draw: press Update program first.");
  const quick = rev.quick || program.quick || null;
  const step = quick ? null : await storedStep(program.id, rev);
  if (!step && !quick) throw new Error("No STEP file is stored for this program, so the toolpath cannot be drawn.");
  return runEngine({
    name: program.part_name,
    stepText: step?.text,
    settings: rev.settings || program.settings || {},
    extra: { action: "check", programs: rev.programs || [], ...(quick ? { quick } : {}) },
  });
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
// A STEP already read (a second run of the same model, Turn around) may be
// handed in as step, so it is downloaded once.
export async function runUpdate({ program, partName, current, material, settings, stepFile, quick = null, step: stepRead = null }) {
  // The batch size and bar figures are set on the Costing tab, not in the
  // questionnaire: carried from the program so an update keeps them.
  const base = { ...costingPart(program.settings), ...settings };
  // turret: null hands the layout back to the engine's automatic pick.
  if (base.turret == null) delete base.turret;
  const barHint = barSizeOf({}, program.costing || current?.costing);
  const priced = (stepText, extra) =>
    runPriced({ name: partName || program.part_name, stepText, settings: base, material, programNo: program.program_no, extra, barHint });
  if (quick) {
    const { result, sent } = await priced(undefined, { quick });
    return { result, sent, step: null, quick };
  }
  let step;
  if (stepFile) {
    if (stepFile.size > MAX_STEP_BYTES) {
      throw new Error(`The STEP file is ${Math.round(stepFile.size / 1000)} kB; the engine takes up to ${MAX_STEP_BYTES / 1000} kB.`);
    }
    step = { file: stepFile, name: stepFile.name, text: await stepFile.text(), path: null };
  } else if (stepRead) {
    step = stepRead;
  } else {
    step = await storedStep(program.id, current);
    if (!step) throw new Error("No STEP file is stored for this program: choose one.");
  }
  const { result, sent } = await priced(step.text, {});
  return { result, sent, step, quick: null };
}

// Update program, second half: the new revision (the database gives its
// letter and makes it current), a new STEP filed under that letter, then
// the program's name, customer, material and bar. A STEP left as it was is
// pointed at, not copied.
export async function saveUpdate({ program, run, letter, partName, customer, material, userName }) {
  const { result, sent, step, quick } = run;
  let stepPath = step?.path || null;
  if (step?.file) {
    stepPath = `${program.id}/${letter}/${step.name}`;
    const up = await supabase.storage.from(BUCKET).upload(stepPath, step.file, { contentType: "text/plain", upsert: true });
    if (up.error) throw new Error(`The STEP file could not be stored: ${up.error.message}. Nothing was saved.`);
  }
  const { data: rev, error: e1 } = await supabase
    .from("cnc_program_revisions")
    .insert(revisionRow({ programId: program.id, result, settings: sent, stepPath, stepName: step?.name || null, userName, quick }))
    .select("rev")
    .single();
  if (e1) throw new Error(`The new revision could not be saved: ${e1.message}`);
  const { data: rows, error: e2 } = await supabase
    .from("cnc_programs")
    .update({
      ...(quick ? { quick } : {}),
      part_name: partName,
      customer: customer || "",
      material: material?.name || "",
      stock: stockText(sent, result.costing, await loadEngineList("pipes")),
      costing: withSource(result),
    })
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
  const settings = current?.settings || program.settings || {};
  const quick = current?.quick || program.quick || null;
  const step = quick ? null : await storedStep(program.id, current);
  if (!step && !quick) return { result: null, reason: "No STEP file is stored for this program, so the engine could not check it." };
  const result = await runEngine({
    name: program.part_name,
    stepText: step?.text,
    settings,
    extra: { action: "check", programs, previous: current?.programs || [], ...(quick ? { quick } : {}) },
  });
  return { result, step, settings, quick };
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
    ...(check?.quick ? { quick: check.quick } : {}),
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
    costing: r ? withSource(r) : null,
    settings: check?.settings || current?.settings || program.settings || null,
    step_path: current?.step_path || check?.step?.path || null,
    step_name: current?.step_name || check?.step?.name || null,
    note: `Imported from ${fileNames.join(", ")}`,
    created_by: userName || "",
  };
  const { data, error } = await supabase.from("cnc_program_revisions").insert(row).select("rev").single();
  if (error) throw new Error(`The machine copy could not be saved: ${error.message}`);
  if (r?.costing) {
    const { data: rows, error: e2 } = await supabase.from("cnc_programs").update({ costing: withSource(r) }).eq("id", program.id).select("id");
    if (e2 || !rows?.length) throw new Error(`Rev ${data.rev} was saved, but its price was not: ${e2?.message || "the database changed nothing"}.`);
  }
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

// Where the engine takes its cutting data and machine from, for the
// Cutting data and Machines screens (GET ?source=1, signed in; the
// engine's 6ba3ffc): "test cnc_ tables, version 702 (10 sheets)" or
// "engine files (...)". null when the engine cannot say (not live yet, or
// not reachable): the screens then say it still reads its own files.
export async function engineSource() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null;
    const res = await fetch(`${ENGINE_URL}?source=1`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.data_source === "string" ? body.data_source : null;
  } catch {
    return null;
  }
}

// The engine's ISO code reader for + New tool (GET ?iso=CODE): an insert
// code (WNMG 080408) or a holder code (MWLNR 2525M08) read into shape,
// size, nose radius, approach angle, shank. null when the engine cannot
// read it (or does not have the reader yet): the form is then filled in
// by hand.
export async function readIsoCode(code) {
  const c = String(code ?? "").replace(/\s+/g, "").toUpperCase();
  if (!c) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const res = await fetch(`${ENGINE_URL}?iso=${encodeURIComponent(c)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return null;
    const body = await res.json();
    // The engine names what it read (insert, holder, boring bar, thread
    // holder, thread insert); anything with a kind and no error is a reading.
    return body && typeof body === "object" && body.kind && !body.error ? body : null;
  } catch {
    return null;
  }
}
