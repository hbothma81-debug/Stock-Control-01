// The CNC tab's own Materials list (Heinrich 19 Oct 2026: "CNC has its own
// material types library apart from the stock manager, CNC should stay a
// separate engine that can function without the main app" - answer A, "yes
// own price"). Table cnc_materials, setup-cnc-19-own-materials.sql: copied
// once from Stock Manager's CNC Bar Grades, then kept here alone - its own
// R/kg, density and cutting data. Read once when the CNC tab opens.
//
// A database without the table (setup-cnc-19 not pasted) gives null and the
// CNC tab says so on Materials.

import { supabase } from "../lib/supabaseClient.js";

const COLUMNS = "id, name, full_name, density, price_per_kg, cutting_material";

// PostgREST's "no such table" (PGRST205), or Postgres's own (42P01).
function missingTable(error) {
  return error && (error.code === "PGRST205" || error.code === "42P01" || /cnc_materials/.test(error.message || "") && /not find|does not exist/.test(error.message || ""));
}

// A row as the CNC screens take a material: name (programs and bar prices
// are filed under it), fullName, price (R/kg, 0 = not priced), ownPrice,
// density and cuttingMaterial ("" = none linked: red, not offered).
export function materialFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name || r.name,
    price: Number(r.price_per_kg) || 0,
    ownPrice: Number(r.price_per_kg) || 0,
    density: Number(r.density) || 7.85,
    cuttingMaterial: r.cutting_material || "",
  };
}

// The list A to Z, or null when the database has no cnc_materials yet.
export async function loadCncMaterials() {
  const { data, error } = await supabase.from("cnc_materials").select(COLUMNS).order("name");
  if (missingTable(error)) return null;
  if (error) throw error;
  return (data || []).map(materialFromRow);
}

export async function addCncMaterial({ name, density, price, cuttingMaterial, userName }) {
  const { data, error } = await supabase
    .from("cnc_materials")
    .insert({ name, full_name: name, density: density || 7.85, price_per_kg: price || 0, cutting_material: cuttingMaterial || null, updated_by: userName || "" })
    .select(COLUMNS);
  if (error) throw new Error(error.code === "23505" ? `${name} is on the list already.` : `Not added: ${error.message}`);
  if (!data?.length) throw new Error("Not added: it needs the CNC Edit tick.");
  return materialFromRow(data[0]);
}

// One material's changes: { price } and/or { cuttingMaterial }.
export async function saveCncMaterial({ id, price, cuttingMaterial, userName }) {
  const changes = { updated_by: userName || "" };
  if (price !== undefined) changes.price_per_kg = price || 0;
  if (cuttingMaterial !== undefined) changes.cutting_material = cuttingMaterial || null;
  const { data, error } = await supabase.from("cnc_materials").update(changes).eq("id", id).select(COLUMNS);
  if (error) throw new Error(`Not saved: ${error.message}`);
  if (!data?.length) throw new Error("Not saved: it needs the CNC Edit tick.");
  return materialFromRow(data[0]);
}
