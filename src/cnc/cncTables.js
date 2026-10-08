// The CNC tab's data screens' calls (build step 5): machines and their
// cutting data (setup-cnc-10-machines-cutting-data.sql). Read by anyone
// with the CNC tick; changed by admins only (Heinrich, 8 Oct 2026), which
// the database enforces too. Cutting data loads when its screen opens,
// once per visit; it is a few hundred rows.

import { supabase } from "../lib/supabaseClient.js";

// Whether the engine reads these tables or still its own files is asked
// of the engine itself when a screen opens (EngineSource.jsx).

export async function loadMachines() {
  const { data, error } = await supabase.from("cnc_machines").select("*").order("sort").order("name");
  if (error) throw error;
  return data || [];
}

export async function loadCuttingData(machineId) {
  const [{ data: sheets, error: e1 }, rows] = await Promise.all([
    supabase.from("cnc_cutting_sheets").select("*").eq("machine_id", machineId).order("position"),
    (async () => {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("cnc_cutting_data")
          .select("id, sheet, row_no, data")
          .eq("machine_id", machineId)
          .order("id")
          .range(from, from + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      return all.sort((a, b) => (a.sheet === b.sheet ? a.row_no - b.row_no : a.sheet.localeCompare(b.sheet)));
    })(),
  ]);
  if (e1) throw e1;
  return { sheets: sheets || [], rows };
}

// A whole workbook in one save, all or nothing (cnc_replace_cutting_data).
export async function importWorkbook({ machineId, sheets, userName }) {
  const { data, error } = await supabase.rpc("cnc_replace_cutting_data", { p_machine: machineId, p_sheets: sheets, p_by: userName || "" });
  if (error) throw new Error(error.hint === "cnc_not_admin" ? error.message : `The cutting data was not imported: ${error.message}. Nothing was changed.`);
  return data;
}

// One row's cells, saved whole, and read back.
export async function saveCuttingRow({ id, data, userName }) {
  const { data: rows, error } = await supabase.from("cnc_cutting_data").update({ data, updated_by: userName || "" }).eq("id", id).select("id, sheet, row_no, data");
  if (error) throw new Error(`Not saved: ${error.message}`);
  if (!rows?.length) throw new Error("Not saved: only an admin may change cutting data.");
  return rows[0];
}

export async function addCuttingRow({ machineId, sheet, rowNo, data, userName }) {
  const { data: rows, error } = await supabase
    .from("cnc_cutting_data")
    .insert({ machine_id: machineId, sheet, row_no: rowNo, data, updated_by: userName || "" })
    .select("id, sheet, row_no, data");
  if (error) throw new Error(`Not added: ${error.message}`);
  return rows[0];
}

export async function removeCuttingRow(id) {
  const { data, error } = await supabase.from("cnc_cutting_data").delete().eq("id", id).select("id");
  if (error || !data?.length) throw new Error(`Not removed: ${error?.message || "only an admin may change cutting data"}`);
}

// A machine's figures, saved whole (its data keeps the engine's keys).
export async function saveMachine({ id, data, userName }) {
  const { data: rows, error } = await supabase.from("cnc_machines").update({ data, updated_by: userName || "" }).eq("id", id).select("*");
  if (error) throw new Error(`Not saved: ${error.message}`);
  if (!rows?.length) throw new Error("Not saved: only an admin may change a machine.");
  return rows[0];
}

// A new machine starts as a copy of one already there (its figures are
// then changed to the new machine's), so no figure the engine needs is
// missing. Its cutting data is imported separately.
export async function addMachine({ name, copyOf, userName }) {
  const data = { ...(copyOf?.data || {}), name };
  const { data: rows, error } = await supabase
    .from("cnc_machines")
    .insert({ name, data, sort: 99, updated_by: userName || "" })
    .select("*");
  if (error) throw new Error(error.code === "23505" ? `${name} is on the list already.` : `Not added: ${error.message}`);
  return rows[0];
}

// A machine's tools (setup-cnc-11-tools.sql), sorted as the engine lists
// them. Read when the Tools screen or a program's Tool crib opens.
export async function loadTools(machineId) {
  const { data, error } = await supabase.from("cnc_tools").select("*").eq("machine_id", machineId).order("sort").order("tool_key");
  if (error) throw error;
  return data || [];
}

export async function saveTool({ id, owned, data, userName }) {
  const { data: rows, error } = await supabase.from("cnc_tools").update({ owned, data, updated_by: userName || "" }).eq("id", id).select("*");
  if (error) throw new Error(`Not saved: ${error.message}`);
  if (!rows?.length) throw new Error("Not saved: only an admin may change tools.");
  return rows[0];
}

export async function addTool({ machineId, toolKey, owned, data, sort, userName }) {
  const { data: rows, error } = await supabase
    .from("cnc_tools")
    .insert({ machine_id: machineId, tool_key: toolKey, owned, data, sort: sort ?? 500, updated_by: userName || "" })
    .select("*");
  if (error) throw new Error(error.code === "23505" ? `A tool called ${toolKey} is on this machine already.` : `Not added: ${error.message}`);
  return rows[0];
}

export async function removeTool(id) {
  const { data, error } = await supabase.from("cnc_tools").delete().eq("id", id).select("id");
  if (error || !data?.length) throw new Error(`Not removed: ${error?.message || "only an admin may change tools"}`);
}
