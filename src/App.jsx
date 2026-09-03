import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./lib/supabaseClient.js";
import {
  Plus, Minus, Search, Trash2, PackagePlus, AlertTriangle, X,
  ChevronDown, ChevronUp, ChevronRight, ChevronLeft, User, UserCheck, ShieldCheck, Lock, Database, Truck,
  Download, Pencil, Copy, Filter as FilterIcon, Paperclip, FileText, Image as ImageIcon,
  Wrench, Users, Eye, EyeOff, ShoppingCart, ClipboardList, Check, Package, Upload, RefreshCw,
} from "lucide-react";
import { F, C, S, THEME_CSS } from "./theme.js";
import { TABS, NAV_TABS, TAB_GROUPS, LASER_MACHINE } from "./constants.js";
import UserManagement from "./UserManagement.jsx";
import CompanyDetails from "./manager/CompanyDetails.jsx";
import EditableName from "./EditableName.jsx";
import NestingView from "./laser/NestingView.jsx";

// window.storage is installed in main.jsx before this component ever
// renders — backed by Supabase. See src/lib/storage.js.

const MANAGER_TABS = [
  { key: "sizes", label: "Sheet Sizes" },
  { key: "sections", label: "Sections" },
  { key: "sectionTypes", label: "Section Types" },
  { key: "grades", label: "Material Types" },
  { key: "cncGrades", label: "CNC Bar Grades" },
  { key: "staffDepartments", label: "Staff Departments" },
  { key: "jobProcessTypes", label: "Job Process Types" },
  { key: "laserMaterials", label: "Laser Materials" },
  { key: "customers", label: "Customers" },
  { key: "stockCodes", label: "Stock Codes" },
  { key: "storeCategories", label: "Store Categories" },
  { key: "fastenerCategories", label: "Fastener Types" },
  { key: "fastenerGrades", label: "Fastener Grades" },
  { key: "fastenerFinishes", label: "Fastener Finishes" },
  { key: "suppliers", label: "Suppliers" },
  { key: "sheetNames", label: "Sheet Names" },
  { key: "storesCatalog", label: "Stores Catalog" },
  { key: "companyDetails", label: "Company Details" },
  { key: "departments", label: "User Management" },
];

const FACTOR_TABLES = ["grades", "sections", "cncGrades"];

const CUSTOM = "__custom__";

const noPerm = () => ({ view: false, edit: false });
const fullPerm = () => ({ view: true, edit: true });
const viewOnly = () => ({ view: true, edit: false });

function blankPermissions() {
  return {
    plate: noPerm(),
    structural: noPerm(),
    cncBar: noPerm(),
    custom: noPerm(),
    stores: noPerm(),
    fasteners: noPerm(),
    assets: noPerm(),
    drawings: noPerm(),
    jobs: noPerm(),
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// stock_items is a real table (snake_case columns); everywhere else in the
// app works with items as camelCase JS objects, exactly as it always has —
// these are the only two places that need to know the table's column
// names at all. The third element is the column's real type, so a missing
// field gets the correct default (0 / false / "") rather than guessing
// from a value that's already absent.
const ITEM_DB_FIELDS = [
  ["mainCat", "main_cat", "text"], ["loc", "loc", "text"], ["low", "low", "num"], ["salesPerson", "sales_person", "text"],
  ["customer", "customer", "text"], ["supplier", "supplier", "text"], ["grade", "grade", "text"], ["size", "size", "text"],
  ["thickness", "thickness", "text"], ["name", "name", "text"], ["sheetName", "sheet_name", "text"], ["stockType", "stock_type", "text"],
  ["comment", "comment", "text"], ["unit", "unit", "text"], ["trackLength", "track_length", "bool"], ["length", "length", "num"],
  ["qty", "qty", "num"], ["diameter", "diameter", "text"], ["partNumber", "part_number", "text"], ["manufacturer", "manufacturer", "text"],
  ["serialNumber", "serial_number", "text"], ["purchaseDate", "purchase_date", "text"], ["value", "value", "num"],
  ["serviceMode", "service_mode", "text"], ["serviceIntervalMonths", "service_interval_months", "num"],
  ["serviceIntervalHours", "service_interval_hours", "num"], ["serviceIntervalKm", "service_interval_km", "num"],
  ["lastServiceDate", "last_service_date", "text"], ["lastServiceReading", "last_service_reading", "num"],
  ["currentReading", "current_reading", "num"], ["status", "status", "text"], ["fastenerType", "fastener_type", "text"],
  ["fastenerGrade", "fastener_grade", "text"], ["finish", "finish", "text"], ["attachmentType", "attachment_type", "text"],
  ["attachmentName", "attachment_name", "text"], ["storesKind", "stores_kind", "text"],
];
function dbRowToItem(row) {
  const item = { id: row.id };
  for (const [jsKey, dbKey] of ITEM_DB_FIELDS) item[jsKey] = row[dbKey];
  return item;
}
function itemToDbRow(item) {
  const row = { id: item.id };
  for (const [jsKey, dbKey, type] of ITEM_DB_FIELDS) {
    const v = item[jsKey];
    const fallback = type === "num" ? 0 : type === "bool" ? false : "";
    row[dbKey] = v === undefined || v === null ? fallback : v;
  }
  return row;
}

const MASTER_STRING_LISTS = [
  "sizes", "sectionTypes", "salesPeople", "customers", "staffDepartments", "jobProcessTypes",
  "storeCategories", "fastenerCategories", "fastenerGrades", "fastenerFinishes", "sheetNames",
  "laserMaterials",
];
// Lists where the order on screen is the order that matters, not just how
// they happen to be stored. Job Process Types is the factory flow: the
// floor can't start a process until everything before it is complete, so
// its sequence is real production instruction, not presentation. These get
// reorder controls in the manager, and their positions are written back to
// sort_order. Every other list keeps its existing add-to-the-end
// behaviour, which also avoids rewriting hundreds of rows on lists like
// customers every time one is added.
//
// Laser Materials is ordered for a different reason: it sets how the
// cut list groups programs at the machine. Left alphabetical, 10mm
// would sort next to 1.2mm, so the order has to be the shop's, not the
// alphabet's.
const ORDERED_STRING_LISTS = ["jobProcessTypes", "laserMaterials"];

// Which department a shortage goes to was decided by comparing the process
// name against the exact strings "Nesting" and "Laser Operator". Process
// types are free text that each shop types in for itself, so anything else
// -- "nesting", "Tube Laser Operator", "Laser - External" -- failed the
// comparison, and the shortage was saved and then shown to nobody. It
// looked like shortages did not work; in fact they were invisible.
//
// Matching on the recognisable part of the name instead means a shortage
// reaches the right people whatever the shop calls the stage.
const isNestingProcess = (name) => /nest/i.test(name || "");
const isLaserProcess = (name) => /laser/i.test(name || "");

// A shortage can cover several missing parts. Older ones, and any saved
// before the app could hold more than one, carry a single description and
// quantity instead — so read items where they exist and fall back to the
// pair otherwise, rather than showing only the first of three.
function shortageLines(s) {
  if (Array.isArray(s?.items) && s.items.length > 0) return s.items;
  return s?.description ? [{ description: s.description, qty: s.qty }] : [];
}
const shortageSummary = (s) =>
  shortageLines(s)
    .map((i) => `${i.description} × ${i.qty}`)
    .join(", ");
const MASTER_FACTOR_LISTS = ["sections", "grades", "cncGrades"];
const MASTER_COUNTERS = ["nextJobNumber", "nextDeliveryNoteNumber", "nextFastenerNumber", "nextToolNumber", "nextPoNumber"];
const EMPTY_COMPANY_DETAILS = { name: "", address: "", phone: "", email: "", vatNumber: "", regNumber: "" };

// Supabase (via PostgREST) silently caps any plain .select() at 1000 rows
// — no error, just a truncated result — unless the query explicitly pages
// through with .range(). This shop's stock_items table alone already
// holds over 1000 rows, so an unpaginated select was quietly dropping
// everything past that cutoff on every single load — which is exactly
// what made specific categories (structural, stores) appear to vanish
// entirely: they simply never made it into the fetch to begin with.
// Every table here that can plausibly grow past 1000 rows over time uses
// this helper instead of a bare .select(), so this can't recur elsewhere
// as any of them grow. Requires a stable sort column (defaults to "id")
// — .range() pagination isn't reliable page-to-page without one, since
// Postgres doesn't otherwise guarantee the same row order twice.
async function fetchAllRows(table, { select = "*", orderBy = "id", ascending = true, filter = null } = {}) {
  const pageSize = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).order(orderBy, { ascending }).range(from, from + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    allRows = allRows.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

// master lives across 8 real tables now, grouped by shape rather than one
// table per field — this is the only place that needs to know that. Once
// assembled, the rest of the app sees the exact same master shape it
// always has.
async function loadMasterFromTables() {
  const [stringLists, factorItems, suppliers, supplierContacts, storesCatalog, customerContacts, companyRows, counters] = await Promise.all([
    // Explicitly ordered: without an ORDER BY, Postgres makes no promise
    // about row order, so the factory process sequence could quietly
    // reshuffle between loads. created_at is the tiebreak so lists that
    // have never been ordered still come back in the order they were
    // added, exactly as before.
    supabase.from("master_string_lists").select("*").order("sort_order").order("created_at"),
    supabase.from("master_factor_items").select("*"),
    supabase.from("master_suppliers").select("*"),
    supabase.from("master_supplier_contacts").select("*"),
    supabase.from("master_stores_catalog").select("*"),
    supabase.from("master_customer_contacts").select("*"),
    supabase.from("master_company_details").select("*"),
    supabase.from("master_counters").select("*"),
  ]);
  for (const r of [stringLists, factorItems, suppliers, supplierContacts, storesCatalog, customerContacts, companyRows, counters]) {
    if (r.error) throw r.error;
  }

  const result = {};
  for (const listName of MASTER_STRING_LISTS) {
    result[listName] = (stringLists.data || []).filter((r) => r.list_name === listName).map((r) => r.value);
  }
  for (const listName of MASTER_FACTOR_LISTS) {
    result[listName] = (factorItems.data || [])
      .filter((r) => r.list_name === listName)
      .map((r) => {
        const entry = { name: r.name, factor: Number(r.factor), price: Number(r.price) };
        if (r.type != null) entry.type = r.type;
        if (r.short_name) entry.shortName = r.short_name;
        return entry;
      });
  }

  const contactsBySupplier = {};
  for (const c of supplierContacts.data || []) {
    (contactsBySupplier[c.supplier_id] ||= []).push({ id: c.id, name: c.name, email: c.email });
  }
  result.suppliers = (suppliers.data || []).map((s) => ({
    id: s.id, name: s.name, email: s.email, phone: s.phone, address: s.address, logo: s.logo, vatNumber: s.vat_number,
    contacts: contactsBySupplier[s.id] || [],
  }));

  result.storesCatalog = (storesCatalog.data || []).map((r) => ({
    id: r.id, code: r.code, name: r.name, category: r.category, supplier: r.supplier, price: Number(r.price),
  }));

  const contactsByCustomer = {};
  for (const c of customerContacts.data || []) {
    (contactsByCustomer[c.customer_name] ||= []).push({ id: c.id, name: c.name, email: c.email, phone: c.phone });
  }
  result.customerContacts = contactsByCustomer;

  const companyRow = (companyRows.data || [])[0];
  result.companyDetails = companyRow
    ? { name: companyRow.name, address: companyRow.address, phone: companyRow.phone, email: companyRow.email, vatNumber: companyRow.vat_number, regNumber: companyRow.reg_number }
    : EMPTY_COMPANY_DETAILS;

  const counterMap = {};
  for (const c of counters.data || []) counterMap[c.counter_name] = c.value;
  for (const name of MASTER_COUNTERS) result[name] = counterMap[name] ?? 1;

  result.stockCodes = []; // retired — anything left over was migrated straight into stock_items by the SQL migration

  return { master: result };
}

// requisitions is a real table now (snake_case columns) — same
// translation-helper pattern as stock_items above.
const REQ_DB_FIELDS = [
  ["mainCat", "main_cat"], ["itemId", "item_id"], ["itemLabel", "item_label"], ["itemGrade", "item_grade"],
  ["itemRawName", "item_raw_name"], ["qty", "qty"], ["notes", "notes"], ["requestedBy", "requested_by"],
  ["dateRequested", "date_requested"], ["status", "status"], ["supplier", "supplier"], ["orderedBy", "ordered_by"],
  ["dateOrdered", "date_ordered"], ["receivedBy", "received_by"], ["dateReceived", "date_received"],
  ["dateFulfilled", "date_fulfilled"], ["poNumber", "po_number"],
];
function dbRowToRequisition(row) {
  const r = { id: row.id };
  for (const [jsKey, dbKey] of REQ_DB_FIELDS) r[jsKey] = row[dbKey];
  return r;
}
function requisitionToDbRow(r) {
  const row = { id: r.id };
  for (const [jsKey, dbKey] of REQ_DB_FIELDS) row[dbKey] = r[jsKey] ?? "";
  return row;
}

// purchase_orders is a real table now — scalar fields translate the same
// way as requisitions; lineItems / receivedLineItems / linkedRequisitionIds
// are jsonb columns, so the Supabase client serializes/deserializes those
// automatically — no manual JSON handling needed for them here.
const PO_DB_FIELDS = [
  ["poNumber", "po_number", "text"], ["supplierId", "supplier_id", "text"], ["supplierName", "supplier_name", "text"],
  ["dateCreated", "date_created", "text"], ["createdBy", "created_by", "text"], ["exclusiveTotal", "exclusive_total", "num"],
  ["vatRate", "vat_rate", "num"], ["vatTotal", "vat_total", "num"], ["totalValue", "total_value", "num"],
  ["deliveryDate", "delivery_date", "text"], ["reference", "reference", "text"], ["salesPerson", "sales_person", "text"],
  ["notes", "notes", "text"], ["status", "status", "text"], ["receivedBy", "received_by", "text"], ["receivedDate", "received_date", "text"],
  ["deliveryNoteNumber", "delivery_note_number", "text"],
];
function dbRowToPo(row) {
  const po = {
    id: row.id,
    lineItems: row.line_items || [],
    linkedRequisitionIds: row.linked_requisition_ids || [],
  };
  if (row.received_line_items != null) po.receivedLineItems = row.received_line_items;
  for (const [jsKey, dbKey] of PO_DB_FIELDS) po[jsKey] = row[dbKey];
  return po;
}
function poToDbRow(po) {
  const row = {
    id: po.id,
    line_items: po.lineItems || [],
    linked_requisition_ids: po.linkedRequisitionIds || [],
    received_line_items: po.receivedLineItems ?? null,
  };
  for (const [jsKey, dbKey, type] of PO_DB_FIELDS) {
    const v = po[jsKey];
    row[dbKey] = v === undefined || v === null ? (type === "num" ? 0 : "") : v;
  }
  return row;
}

// usage_log is a real table now — same translation-helper pattern as the
// others above. cutLength/cutPieces are only ever present on entries from
// the Track Length cutting flow — omit ?? undefined so they don't show up
// as 0 on every other entry that never had them at all.
const USAGE_LOG_DB_FIELDS = [
  ["itemId", "item_id"], ["itemName", "item_name"], ["mainCat", "main_cat"], ["qty", "qty"],
  ["direction", "direction"], ["by", "by"], ["jobNumber", "job_number"], ["customer", "customer"],
  ["note", "note"], ["lineCost", "line_cost"], ["timestamp", "timestamp"],
];
function dbRowToUsageLogEntry(row) {
  const e = { id: row.id };
  for (const [jsKey, dbKey] of USAGE_LOG_DB_FIELDS) e[jsKey] = row[dbKey];
  if (row.cut_length != null) e.cutLength = row.cut_length;
  if (row.cut_pieces != null) e.cutPieces = row.cut_pieces;
  return e;
}
function usageLogEntryToDbRow(e) {
  const row = { id: e.id, cut_length: e.cutLength ?? null, cut_pieces: e.cutPieces ?? null };
  for (const [jsKey, dbKey] of USAGE_LOG_DB_FIELDS) row[dbKey] = e[jsKey] ?? (jsKey === "qty" || jsKey === "lineCost" ? 0 : "");
  return row;
}

function formatToolNumber(n) {
  return "ERT-" + String(n).padStart(4, "0");
}

function formatPoNumber(n) {
  return "PO-" + String(n).padStart(4, "0");
}

function formatJobNumber(n) {
  return "JOB-" + String(n).padStart(4, "0");
}

function formatDeliveryNoteNumber(n) {
  return "DN-" + String(n).padStart(4, "0");
}

function formatFastenerNumber(n) {
  return "FST-" + String(n).padStart(4, "0");
}

function plateName(size, thickness) {
  return `${size} × ${thickness}`;
}

function parseSize(size) {
  const cleaned = (size || "").toLowerCase().replace(/mm/g, "").trim();
  const parts = cleaned.split(/x/).map((s) => parseFloat(s.trim()));
  if (parts.length !== 2 || parts.some((n) => isNaN(n))) return null;
  return parts;
}

function parseThickness(t) {
  const n = parseFloat(String(t || "").toLowerCase().replace("mm", "").trim());
  return isNaN(n) ? null : n;
}

// Downscale + recompress a photo before it goes anywhere near storage —
// a phone photo can be several MB, which blows past what's reasonable to
// keep for hundreds of stock lines.
function compressImage(file, maxDim = 1600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Starting reference data — all fully editable from Stock Manager.
// Densities in g/cm³ (== kg per m² per mm thickness). Section weights in kg/m,
// pulled from the actual supplier price list where available.
const DEFAULT_MASTER = {
  // Length x Width, e.g. "3000x1500mm" — Length (the longer edge) first.
  sizes: [
    "2400x1200mm", "2438x1219mm", "2450x1225mm", "2500x1250mm",
    "3000x1500mm", "2000x1000mm", "2440x1220mm", "3000x1000mm",
    "3200x1300mm",
  ],
  sections: [
    { name: "SHS 30x30x3mm", factor: 2.58, price: 0, type: "Square Tube" },
    { name: "SHS 32x32x2mm", factor: 1.83, price: 0, type: "Square Tube" },
    { name: "SHS 32x32x3mm", factor: 2.77, price: 0, type: "Square Tube" },
    { name: "SHS 38.1x38.1x2mm", factor: 2.30, price: 0, type: "Square Tube" },
    { name: "SHS 40x40x3mm", factor: 3.53, price: 0, type: "Square Tube" },
    { name: "SHS 50x50x3mm", factor: 4.48, price: 0, type: "Square Tube" },
    { name: "SHS 76x76x2mm", factor: 4.59, price: 0, type: "Square Tube" },
    { name: "SHS 76.2x76.2x2mm", factor: 4.72, price: 0, type: "Square Tube" },
    { name: "SHS 100x100x2mm", factor: 6.23, price: 0, type: "Square Tube" },
    { name: "RHS 50x25x2mm", factor: 2.26, price: 0, type: "Rectangular Tube" },
    { name: "RHS 76x50x4.5mm", factor: 8.37, price: 0, type: "Rectangular Tube" },
    { name: "RHS 60x30x3mm", factor: 4.01, price: 0, type: "Rectangular Tube" },
    { name: "RHS 76.2x50.8x2mm", factor: 3.91, price: 0, type: "Rectangular Tube" },
    { name: "Round Tube 19mm x 2mm wall", factor: 0.84, price: 0, type: "Round Tube" },
    { name: "Round Tube 63.5mm x 4mm wall", factor: 5.91, price: 0, type: "Round Tube" },
    { name: "Round Tube 76.2mm x 2mm wall", factor: 3.68, price: 0, type: "Round Tube" },
    { name: "Round Tube 88.9mm x 2mm wall", factor: 4.31, price: 0, type: "Round Tube" },
    { name: "Round Tube 152mm x 3mm wall", factor: 11.09, price: 0, type: "Round Tube" },
    { name: "Round Tube 25mm x 2mm wall", factor: 1.14, price: 0, type: "Round Tube" },
    { name: "Round Bar 12mm", factor: 0.888, price: 0, type: "Round Bar" },
    { name: "Round Bar 20mm", factor: 2.47, price: 0, type: "Round Bar" },
    { name: "Round Bar 10mm", factor: 0.62, price: 0, type: "Round Bar" },
    { name: "Round Bar 6mm", factor: 0.22, price: 0, type: "Round Bar" },
    { name: "Round Bar 8mm", factor: 0.39, price: 0, type: "Round Bar" },
    { name: "Round Bar 30mm", factor: 5.55, price: 0, type: "Round Bar" },
    { name: "Seamless Pipe NB25 SCH40 (33.4x4.55mm)", factor: 3.24, price: 0, type: "Seamless Pipe" },
    { name: "Seamless Pipe NB40 SCH80 (48.26x5.08mm)", factor: 5.41, price: 0, type: "Seamless Pipe" },
    { name: "Welded Pipe NB15 Medium (21.7x2.3mm)", factor: 1.093, price: 0, type: "Welded Pipe" },
    { name: "Equal Angle 80x80x6mm", factor: 7.34, price: 0, type: "Equal Angle" },
    { name: "Equal Angle 100x100x8mm", factor: 12.24, price: 0, type: "Equal Angle" },
    { name: "Equal Angle 40x40x3mm", factor: 1.84, price: 0, type: "Equal Angle" },
    { name: "Round Tube 19.05mm x 1.5mm wall", factor: 0.65, price: 0, type: "Round Tube" },
    { name: "Round Tube 38.1mm x 2mm wall", factor: 1.79, price: 0, type: "Round Tube" },
    { name: "Round Tube 38.1mm x 1.5mm wall", factor: 1.36, price: 0, type: "Round Tube" },
    { name: "Round Tube 41.27mm x 1.2mm wall", factor: 1.19, price: 0, type: "Round Tube" },
    { name: "Round Tube 22.2mm x 1.2mm wall", factor: 0.63, price: 0, type: "Round Tube" },
    { name: "Round Bar 5mm", factor: 0.154, price: 0, type: "Round Bar" },
    { name: "Round Tube 38.1mm x 3.18mm wall", factor: 0.95, price: 0, type: "Round Tube" },
    { name: "Round Tube 38.1mm x 1.6mm wall", factor: 0.50, price: 0, type: "Round Tube" },
  ],
  sectionTypes: ["Square Tube", "Rectangular Tube", "Round Tube", "Round Bar", "Seamless Pipe", "Welded Pipe", "Equal Angle"],
  grades: [
    { name: "Mild Steel", factor: 7.85, price: 0 },
    { name: "Stainless 304", factor: 7.93, price: 0 },
    { name: "Stainless 304 2B", factor: 7.93, price: 0 },
    { name: "Stainless 316 2B", factor: 7.93, price: 0 },
    { name: "Stainless 316 N4 PVC", factor: 7.93, price: 0 },
    { name: "Stainless 430 BA PVC", factor: 7.70, price: 0 },
    { name: "3CR12", factor: 7.70, price: 0 },
    { name: "DOMEX 700", factor: 7.85, price: 0 },
    { name: "Aluminium", factor: 2.71, price: 0 },
  ],
  // Density (g/cm³) — CNC bar is priced per kg like Plate, but stocked and
  // ordered per millimetre, since it's round stock cut to length on the lathe.
  cncGrades: [
    { name: "EN8", factor: 7.85, price: 0 },
    { name: "EN9", factor: 7.85, price: 0 },
    { name: "EN19", factor: 7.85, price: 0 },
    { name: "EN21", factor: 7.85, price: 0 },
    { name: "EN1A Leaded", factor: 7.85, price: 0 },
    { name: "BMS (Bright Mild Steel)", factor: 7.85, price: 0 },
    { name: "Brass", factor: 8.50, price: 0 },
    { name: "Stainless 304", factor: 7.93, price: 0 },
    { name: "Stainless 316", factor: 7.98, price: 0 },
  ],
  salesPeople: [],
  customers: ["HPE", "BPW"],
  // Contacts per customer, kept separate from the plain name list above so
  // every existing place that treats customers as simple strings keeps
  // working untouched — this is purely additive.
  customerContacts: {},
  staffDepartments: ["Sales", "Floor Manager", "Laser", "CNC", "Welding", "Fabrication", "Finishing", "Office", "Dispatch"],
  // Seeded straight from the actual paper job-process sheet, so nothing
  // gets lost in translation — admin can add/retire types later.
  jobProcessTypes: [
    "Nesting", "Laser Operator", "Tube Laser Operator", "Packer", "Laser - External",
    "Bending", "Rolling", "Cut To Size", "Machine/Drilling", "Machining - External",
    "Welding", "Grinding/Polishing", "Wet Spray", "Powder Coating", "Galvanising",
    "Plating", "Buy - out", "Assembly", "Quality Check", "Dispatch",
  ],
  // What a laser program is cut from, e.g. "1.2mm MS". Deliberately
  // empty: these are thickness-and-grade combinations only the shop
  // knows, and a guessed list would just be wrong.
  laserMaterials: [],
  nextJobNumber: 1,
  nextDeliveryNoteNumber: 1,
  nextFastenerNumber: 1,
  stockCodes: [],
  storeCategories: ["Electrical", "CNC Tooling", "Welding Consumables", "PPE"],
  fastenerCategories: ["Hex Bolt", "Nut", "Washer", "Socket Screw", "Self-Tapping Screw", "Threaded Rod"],
  fastenerGrades: ["4.6", "8.8", "10.9"],
  fastenerFinishes: ["Black", "ZP", "YP"],
  nextToolNumber: 1,
  nextPoNumber: 1,
  suppliers: [],
  companyDetails: { name: "", address: "", phone: "", email: "", vatNumber: "", regNumber: "" },
  sheetNames: [],
  storesCatalog: [],
};

const emptyForm = {
  id: "",
  mainCat: "plate",
  grade: "",
  customGrade: "",
  size: "",
  customSize: "",
  comment: "",
  thickness: "",
  section: "",
  customSection: "",
  sectionType: "",
  customSectionType: "",
  trackLength: false,
  length: "",
  qty: "",
  low: "",
  loc: "",
  salesPerson: "",
  customSalesPerson: "",
  customer: "",
  customCustomer: "",
  partNumber: "",
  name: "",
  value: "",
  attachmentType: "",
  attachmentName: "",
  supplier: "",
  customSupplier: "",
  sheetName: "",
  customSheetName: "",
  stockType: "full",
  offcutLength: "",
  offcutWidth: "",
  storesKind: "consumable",
  diameter: "",
  manufacturer: "",
  serialNumber: "",
  purchaseDate: "",
  serviceMode: "none",
  serviceIntervalMonths: "",
  serviceIntervalHours: "",
  serviceIntervalKm: "",
  lastServiceDate: "",
  lastServiceReading: "",
  currentReading: "",
  fastenerType: "",
  customFastenerType: "",
  fastenerGrade: "",
  fastenerFinish: "",
};

function LibraryField({ label, options, value, onChange, customValue, onCustomChange, placeholder, showComment, comment, onCommentChange, allowNone }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <select style={S.input} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowNone ? <option value="">— None —</option> : <option value="" disabled>Choose…</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={CUSTOM}>+ Add new…</option>
      </select>
      {value === CUSTOM && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            style={S.input}
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          {showComment && (
            <input
              style={S.input}
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Comment (optional) — e.g. odd offcut from job #123"
            />
          )}
        </div>
      )}
    </div>
  );
}


// "Each"-tracked process control — a running count against the item's
// total quantity, not a checkbox. Logging a batch subtracts against the
// remaining total; the process completes itself once the count reaches it.
// "Each"-tracked process control — one row per item on the job, matching
// the printed process sheet, each with its own running count against that
// item's own quantity. Never lumps different items into one shared total.
function QtyProgressControl({ process, job, quoteItems, itemProgress, limitFor, onSubmit }) {
  const [inputs, setInputs] = useState({});
  if (process.is_complete) {
    return <span style={{ ...S.roleHint, color: C.accentFinished, fontWeight: 600 }}>Complete — all items</span>;
  }
  if (!quoteItems || quoteItems.length === 0) {
    return <span style={S.roleHint}>No items listed on this job yet.</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {quoteItems.map((item) => {
        const progress = itemProgress.find((ip) => ip.job_quote_item_id === item.id);
        const done = Number(progress?.qty_complete) || 0;
        const itemQty = Number(item.qty) || 0;
        const remaining = Math.max(itemQty - done, 0);
        const itemDone = remaining === 0 && itemQty > 0;
        // Per item rather than per stage: this row opens as soon as this
        // item has cleared the stages before it, even while the rest of
        // the job has not. flow.allowed is how many of this item those
        // stages have released; done is how many have already been
        // logged here.
        const flow = limitFor ? limitFor(item) : { allowed: itemQty, waitingOn: null };
        const canLog = Math.max(Math.min(remaining, flow.allowed - done), 0);
        return (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, flex: "1 1 140px", color: itemDone ? C.accentFinished : C.text }}>
              {item.description || "Item"} — {done}/{itemQty}
            </span>
            {itemDone ? (
              <span style={{ fontSize: 12, color: C.accentFinished, fontWeight: 600 }}>Done</span>
            ) : canLog <= 0 ? (
              <span style={{ fontSize: 12, color: C.muted }}>
                {flow.waitingOn ? "Waiting on " + flow.waitingOn : "Waiting"}
              </span>
            ) : (
              <>
                <input
                  type="number"
                  min="0"
                  max={canLog}
                  style={{ ...S.input, width: 64, fontSize: 13.5, padding: "5px 6px" }}
                  value={inputs[item.id] || ""}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Qty"
                />
                <button
                  type="button"
                  className="stk-btn"
                  style={S.reqActionBtn}
                  disabled={canLog <= 0}
                  onClick={() => {
                    const qty = Math.min(parseFloat(inputs[item.id]) || 0, canLog);
                    if (qty > 0) onSubmit(process, job, item, qty, progress, quoteItems, itemProgress);
                    setInputs((prev) => ({ ...prev, [item.id]: "" }));
                  }}
                >
                  Log
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Optional per-process notes — starts as a compact one-line prompt/preview,
// expands into a full textarea on click, saves on blur. Meant to sit on
// every process card, not just specific process types.
function ExpandableProcessNotes({ value, onCommit }) {
  const [expanded, setExpanded] = useState(false);
  const [val, setVal] = useState(value || "");
  useEffect(() => setVal(value || ""), [value]);
  if (!expanded) {
    return (
      <button
        type="button"
        className="stk-btn"
        style={{ ...S.roleHint, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", width: "100%" }}
        onClick={() => setExpanded(true)}
      >
        {value ? `Note: ${value}` : "+ Add note"}
      </button>
    );
  }
  return (
    <textarea
      autoFocus
      style={{ ...S.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        setExpanded(false);
        if (val !== (value || "")) onCommit(val);
      }}
      placeholder="Add a note…"
    />
  );
}

const REQ_FLAG_LABEL = { pending: "Ordering", ordered: "On order", received: "Arrived" };

function ReqFlag({ req, onClick }) {
  return (
    <button
      type="button"
      className="stk-btn"
      style={{ ...S.reqFlag, ...S["reqFlag_" + req.status] }}
      onClick={onClick}
      title={
        req.status === "pending"
          ? "Waiting to be ordered"
          : req.status === "ordered"
          ? "Ordered — waiting for delivery"
          : "Arrived — tap to view, adding stock clears this"
      }
    >
      {REQ_FLAG_LABEL[req.status]}
    </button>
  );
}

// Finding a stock item without leaving the job — pick the department, then
// the item. Used both to book material out from a process and to set it
// aside for one, so it lives here rather than being written twice.
//
// Module level, not inside StockControl: a component redefined on every
// render remounts, and the search box would lose focus on each keystroke.
function StockPicker({ items, allowedDepts, onPick, emptyMessage }) {
  const [dept, setDept] = useState(null);
  const [search, setSearch] = useState("");

  if (allowedDepts.length === 0) return <div style={S.empty}>{emptyMessage}</div>;

  if (dept === null) {
    return (
      <>
        <div style={S.roleHint}>Which department is the material in?</div>
        <div style={S.managerListFullPage}>
          {allowedDepts.map((t) => (
            <button
              key={t.key}
              type="button"
              className="stk-btn"
              style={S.managerMenuRow}
              onClick={() => { setDept(t.key); setSearch(""); }}
            >
              {t.label}
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </>
    );
  }

  const deptLabel = TABS.find((t) => t.key === dept)?.label || dept;
  const q = search.trim().toLowerCase();
  const matches = (items || [])
    .filter((it) => it.mainCat === dept)
    .filter((it) => !q || (it.name || "").toLowerCase().includes(q) || (it.loc || "").toLowerCase().includes(q));
  // Capped rather than paged: this is a "find the thing in front of you"
  // list, so if it is still hundreds long the answer is to type more.
  const shown = matches.slice(0, 60);

  return (
    <>
      <button
        type="button"
        className="stk-btn"
        style={{ ...S.prominentBackBtn, marginBottom: 8 }}
        onClick={() => { setDept(null); setSearch(""); }}
      >
        <ChevronLeft size={18} strokeWidth={2.5} /> All departments
      </button>
      <input
        autoFocus
        style={S.input}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${deptLabel.toLowerCase()}…`}
      />
      <div style={S.managerListFullPage}>
        {matches.length === 0 && <div style={S.empty}>Nothing in {deptLabel} matches that.</div>}
        {shown.map((it) => (
          <button
            key={it.id}
            type="button"
            className="stk-btn"
            style={S.managerMenuRow}
            onClick={() => onPick(it)}
          >
            <span style={{ flex: 1, textAlign: "left" }}>{it.name}</span>
            <span style={{ fontFamily: F.mono, fontSize: 12.5, color: Number(it.qty) > 0 ? C.muted : C.danger }}>
              {it.qty}{it.loc ? ` · ${it.loc}` : ""}
            </span>
          </button>
        ))}
        {matches.length > shown.length && (
          <div style={S.empty}>{matches.length - shown.length} more — keep typing to narrow it down.</div>
        )}
      </div>
    </>
  );
}

export default function StockControl() {
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState({});
  const [loadRetriesExhausted, setLoadRetriesExhausted] = useState(false);
  const [master, setMaster] = useState(null);
  const [requisitions, setRequisitions] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState(null);
  const [usageLog, setUsageLog] = useState(null);
  // These track each dataset's last-known-saved state, for the diff-based
  // saves below. Declared here, immediately after their state, rather
  // than lower in the file near the save functions that primarily use
  // them — deliberately, after finding a real bug from exactly the
  // opposite choice: a background refresh needs to update these directly
  // (see loadAllData) to correctly tell "the source of truth just
  // changed" apart from "the person changed something that needs saving"
  // — and every place that touches them needs to close over the same
  // ref, regardless of where in the file it's defined.
  const lastSavedItemsRef = useRef(null);
  const lastSavedMasterRef = useRef(null);
  const lastSavedRequisitionsRef = useRef(null);
  const lastSavedPurchaseOrdersRef = useRef(null);
  const lastSavedUsageLogRef = useRef(null);
  const [usageModal, setUsageModal] = useState(null); // { item, direction: "add" | "use", qty, jobNumber, customer, note }
  // Picking stock from inside a process, so an operator never has to leave
  // the job to find the material they've just used. { job, process, dept, search }
  const [pullStockModal, setPullStockModal] = useState(null);
  // Setting material aside for a stage of a job, from the job screen.
  // { job, process, item } — item is null until one is picked, which is
  // what switches the modal from the picker to the quantity step.
  const [allocateModal, setAllocateModal] = useState(null);
  const [allocateQty, setAllocateQty] = useState("");
  // Looking at what is reserved on a stock item, and dealing with it —
  // either handing it back or booking it out against its job. { item }
  const [reservedModal, setReservedModal] = useState(null);
  const [reservedUseQty, setReservedUseQty] = useState({});
  // The operator confirming they've used their material, and saying what
  // came back. { allocation, item, qty, offcut }
  const [useAllocationModal, setUseAllocationModal] = useState(null);
  const [assetRemoveModal, setAssetRemoveModal] = useState(null); // { item, reason, date }
  const [showAssetArchive, setShowAssetArchive] = useState(false);
  const [poBuilder, setPoBuilder] = useState(null); // { supplierId, lineItems: [...], linkedRequisitionIds: [...], notes }
  const [poSearchQuery, setPoSearchQuery] = useState("");
  const [poSupplierFilter, setPoSupplierFilter] = useState("");
  // Same compact-line, tap-to-expand pattern as Requisitions — null shows
  // every PO as a single line (number, value, status); tapping one opens
  // the real detail (raised by, lines, notes, actions) in place.
  const [expandedPoId, setExpandedPoId] = useState(null);
  const [receivingSearchQuery, setReceivingSearchQuery] = useState("");
  // Same compact-line, tap-to-expand pattern as Purchase Orders and
  // Requisitions.
  const [expandedReceivingId, setExpandedReceivingId] = useState(null);
  // The receiving-history view, moved here from Records → Usage Log →
  // Received — dedicated state, separate from Usage Log's own, since
  // they're now two independent places in the app rather than one shared
  // view.
  const [showReceivingHistory, setShowReceivingHistory] = useState(false);
  const [receivingHistoryDateFrom, setReceivingHistoryDateFrom] = useState("");
  const [receivingHistoryDateTo, setReceivingHistoryDateTo] = useState("");
  const [receivingHistorySearchQuery, setReceivingHistorySearchQuery] = useState("");
  const [shortageSearchQuery, setShortageSearchQuery] = useState("");
  const [showPoReport, setShowPoReport] = useState(false);
  const [showCompletedPOs, setShowCompletedPOs] = useState(false);
  const [receivingPo, setReceivingPo] = useState(null);
  const [receivingLines, setReceivingLines] = useState([]);
  const [receivingDeliveryNote, setReceivingDeliveryNote] = useState("");
  const [receivingAdjustingIdx, setReceivingAdjustingIdx] = useState(null);
  const [assetHistoryItem, setAssetHistoryItem] = useState(null);
  const [assetHistoryEntries, setAssetHistoryEntries] = useState(null);
  const [assetHistoryNote, setAssetHistoryNote] = useState("");
  const [assetHistoryFile, setAssetHistoryFile] = useState(null);
  const [assetHistoryReading, setAssetHistoryReading] = useState("");
  const [assetHistoryBusy, setAssetHistoryBusy] = useState(false);
  // Assets tab navigation: manufacturer list -> that manufacturer's assets
  // -> one asset's own full detail page. Same list-then-detail pattern as
  // Production, Sections, and Stock Manager elsewhere in the app.
  const [assetManufacturerOpen, setAssetManufacturerOpen] = useState(null);
  const [assetDetailOpen, setAssetDetailOpen] = useState(null);
  // "Service now" — records a completed service: consumables used (from
  // Stores, deducting real stock, or typed as custom entries that don't
  // touch stock), an optional document, and for hours/km-tracked assets,
  // the reading at time of service (the new baseline for the interval).
  const [serviceNowItem, setServiceNowItem] = useState(null);
  const [serviceNowConsumables, setServiceNowConsumables] = useState([]);
  const [serviceNowConsumableSearch, setServiceNowConsumableSearch] = useState("");
  const [serviceNowCustomName, setServiceNowCustomName] = useState("");
  const [serviceNowCustomQty, setServiceNowCustomQty] = useState("");
  const [serviceNowReading, setServiceNowReading] = useState("");
  const [serviceNowFile, setServiceNowFile] = useState(null);
  const [serviceNowNote, setServiceNowNote] = useState("");
  const [serviceNowBusy, setServiceNowBusy] = useState(false);
  // Set while the Add Item form is open specifically to create a new
  // Stores item for a service consumable that wasn't in Stores yet — on
  // save, the new item is linked into serviceNowConsumables as a real,
  // stock-deducting entry instead of the normal add-item flow (open a
  // requisition for a zero-qty item, etc). The qty they wanted is held
  // here since the Add Item form itself doesn't carry it.
  const [addingServiceConsumableQty, setAddingServiceConsumableQty] = useState(null);
  // Set while the Add Item form is open specifically from the requisition
  // picker's "not found" path — on save, walks straight into requesting
  // stock for that brand-new item instead of leaving the picker stranded.
  const [addingItemForRequisition, setAddingItemForRequisition] = useState(false);
  // Repair list — per-asset, like History, but with real open/resolved
  // state rather than being a permanent log.
  const [repairListItem, setRepairListItem] = useState(null);
  const [repairListEntries, setRepairListEntries] = useState(null);
  const [repairListDescription, setRepairListDescription] = useState("");
  const [repairListBusy, setRepairListBusy] = useState(false);
  const [repairListResolvedOpen, setRepairListResolvedOpen] = useState(false);
  const [jobsList, setJobsList] = useState(null);
  const [productionQueue, setProductionQueue] = useState(null);
  // Everything the Laser 4kw tab needs: the programs, which jobs are on
  // them, and the job stages so "waiting to be nested" can be worked out.
  const [laserData, setLaserData] = useState(null);
  const [invoicedSectionOpen, setInvoicedSectionOpen] = useState(false);
  const [notificationsViewedOpen, setNotificationsViewedOpen] = useState(false);
  const [jobsCompletedSectionOpen, setJobsCompletedSectionOpen] = useState(false);
  const [jobsSearchQuery, setJobsSearchQuery] = useState("");
  const [jobsCustomerFilter, setJobsCustomerFilter] = useState("");
  const [jobsSalesRepFilter, setJobsSalesRepFilter] = useState("");
  const [shortagesResolvedOpen, setShortagesResolvedOpen] = useState(false);
  const [productionSelectedDept, setProductionSelectedDept] = useState(null);
  // Which specific job card is open within the current department — null
  // shows the compact list (job number, SigmaNest number, customer, sales
  // rep only); selecting a card opens that one job's full management view
  // in its own right. This is a pattern to reuse across other tabs going
  // forward too, not just here.
  const [productionSelectedProcessId, setProductionSelectedProcessId] = useState(null);
  const [productionSearchQuery, setProductionSearchQuery] = useState("");
  const [shortageModal, setShortageModal] = useState(null);
  const [productionLoading, setProductionLoading] = useState(false);
  const [jobInvoiceRequests, setJobInvoiceRequests] = useState([]);
  const [allDeliveryNotes, setAllDeliveryNotes] = useState([]);
  const [generatedDocuments, setGeneratedDocuments] = useState(null);
  const [deliveryNotesSearchQuery, setDeliveryNotesSearchQuery] = useState("");
  const [deliveryNotesDateFrom, setDeliveryNotesDateFrom] = useState("");
  const [deliveryNotesDateTo, setDeliveryNotesDateTo] = useState("");
  const [invoiceRequestsSearchQuery, setInvoiceRequestsSearchQuery] = useState("");
  const [invoiceRequestsDateFrom, setInvoiceRequestsDateFrom] = useState("");
  const [invoiceRequestsDateTo, setInvoiceRequestsDateTo] = useState("");
  const [processSheetsSearchQuery, setProcessSheetsSearchQuery] = useState("");
  const [processSheetsDateFrom, setProcessSheetsDateFrom] = useState("");
  const [processSheetsDateTo, setProcessSheetsDateTo] = useState("");
  const [poReportsDateFrom, setPoReportsDateFrom] = useState("");
  const [poReportsDateTo, setPoReportsDateTo] = useState("");
  const [allJobQuoteItems, setAllJobQuoteItems] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobDetail, setJobDetail] = useState(null); // { job, processes, documents }
  // Which sub-section of the job detail page is showing — a full page now,
  // not a popup, broken into tabs given how much lives on one job.
  const [jobDetailTab, setJobDetailTab] = useState("overview");
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [newStockItemModal, setNewStockItemModal] = useState(null);
  const [markInvoicedModal, setMarkInvoicedModal] = useState(null);
  const [invoiceQtyInputs, setInvoiceQtyInputs] = useState({}); // { [quoteItemId]: "3" }
  const [deliveryNoteBatchModal, setDeliveryNoteBatchModal] = useState(null);
  const [copyJobModal, setCopyJobModal] = useState(null);
  const [editProcessesModal, setEditProcessesModal] = useState(null); // { job, selected: Set<string> }
  const [showAddStockItemModal, setShowAddStockItemModal] = useState(false);
  const [showStockImportModal, setShowStockImportModal] = useState(false);
  const [newJobForm, setNewJobForm] = useState(null);
  // Create Job does several awaited round trips — job, processes, quote
  // items, notifications. Without this the button stays live throughout,
  // and a second click part way through creates a whole second job.
  const [jobSubmitting, setJobSubmitting] = useState(false);
  const [newJobItemSuggestOpen, setNewJobItemSuggestOpen] = useState(null); // which quote item row index has its suggestion dropdown open
  const [notificationsList, setNotificationsList] = useState(null);
  const [shortagesList, setShortagesList] = useState(null);
  // Every allocation still outstanding, across all jobs — so a stock item
  // can show what of it is already spoken for, not just the job screen.
  const [allocationsList, setAllocationsList] = useState(null);
  const [drawingSearchQuery, setDrawingSearchQuery] = useState("");
  const [drawingSearchResults, setDrawingSearchResults] = useState(null);
  const [drawingCustomerFilter, setDrawingCustomerFilter] = useState("");
  const [drawingLookup, setDrawingLookup] = useState({}); // { [partNumber]: { id, description } } — current revisions only, loaded once for fast "does this part have a drawing" checks elsewhere in the app
  const [drawingSearchLoading, setDrawingSearchLoading] = useState(false);
  const [expandedDrawingHistory, setExpandedDrawingHistory] = useState({});
  const [showDrawingUpload, setShowDrawingUpload] = useState(false);
  const [drawingUploadCustomer, setDrawingUploadCustomer] = useState("");
  const [drawingUploadFiles, setDrawingUploadFiles] = useState([]); // [{file, partNumber, skip}]
  const [drawingUploadBusy, setDrawingUploadBusy] = useState(false);
  const [drawingUploadResult, setDrawingUploadResult] = useState(null);
  const [poReportFrom, setPoReportFrom] = useState("");
  const [poReportTo, setPoReportTo] = useState("");
  const [poReportSupplier, setPoReportSupplier] = useState("");
  const [poReportStatus, setPoReportStatus] = useState("");
  const [selectedReqIds, setSelectedReqIds] = useState([]);
  const [requisitionTarget, setRequisitionTarget] = useState(null);
  // Set when the requisition form is editing an existing request rather
  // than creating a new one — lets someone correct a mistake (wrong qty,
  // supplier, or notes) instead of cancelling and starting over.
  const [editingRequisitionId, setEditingRequisitionId] = useState(null);
  const [requisitionQty, setRequisitionQty] = useState("");
  const [requisitionNotes, setRequisitionNotes] = useState("");
  const [requisitionSupplier, setRequisitionSupplier] = useState("");
  // A dedicated way to start a requisition for an item that isn't visible
  // in the normal browsing list — most notably anything already at zero
  // quantity, which is exactly the case that most needs a new request but
  // is hidden from the everyday view by design. Search here is
  // deliberately unfiltered by quantity, unlike the tab list.
  const [showRequisitionPicker, setShowRequisitionPicker] = useState(false);
  const [requisitionPickerQuery, setRequisitionPickerQuery] = useState("");
  // Searches across every section of the Requisitions tab at once —
  // pending, ordered, and the completed archive — by item, supplier, or
  // who requested it.
  const [requisitionsSearchQuery, setRequisitionsSearchQuery] = useState("");
  const [requisitionsSupplierFilter, setRequisitionsSupplierFilter] = useState("");
  // Which requisition's full detail is expanded — null shows every
  // requisition as a compact line (name plus the Add to PO tick box
  // only); tapping one opens its real detail (qty, notes, price, actions)
  // in place, simpler than a card with everything showing at once.
  const [expandedReqId, setExpandedReqId] = useState(null);
  // Which customer/supplier is currently open in its own detail view within
  // Stock Manager — null shows the plain list of names, matching the same
  // list-then-detail pattern used for Sections and Production.
  const [managerCustomerOpen, setManagerCustomerOpen] = useState(null);
  const [managerSupplierOpen, setManagerSupplierOpen] = useState(null);
  // Which specific item is open in its own full detail view within the
  // current stock tab — null shows compact cards (name, quantity, and any
  // low-stock/requisition flags only); selecting one opens everything
  // about that item — comments, full specs, and every action — on its own,
  // matching the same list-then-detail pattern used everywhere else now.
  const [selectedItemDetail, setSelectedItemDetail] = useState(null);
  // Which grade/customer/manufacturer group is open, showing that group's
  // compact item cards — the middle level between the group list and one
  // item's own detail page.
  const [selectedGradeGroup, setSelectedGradeGroup] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);
  const [archiveTypeFilter, setArchiveTypeFilter] = useState("");
  const [archiveDateFrom, setArchiveDateFrom] = useState("");
  const [archiveDateTo, setArchiveDateTo] = useState("");
  const [usageTypeFilter, setUsageTypeFilter] = useState("");
  const [usageDirectionFilter, setUsageDirectionFilter] = useState("");
  const [usageDateFrom, setUsageDateFrom] = useState("");
  const [usageDateTo, setUsageDateTo] = useState("");
  const [usageSearchQuery, setUsageSearchQuery] = useState("");
  const [usageViewMode, setUsageViewMode] = useState("log"); // "log" | "jobCosting"
  const [jobCostQuery, setJobCostQuery] = useState("");
  const [session, setSession] = useState(undefined); // undefined = still checking, null = signed out
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  // Moved this early deliberately, not left where it naturally first got
  // written — several functions defined well before the old declaration
  // point reference these via closure (fetchNotifications, shortage
  // flagging). That's normally fine in JS — a function body only actually
  // runs after the whole component has rendered once, by which point the
  // late declaration would already be assigned — but production
  // minification exposed a real "cannot access before initialization"
  // error from exactly this ordering. Declaring these immediately after
  // the state they depend on removes the risk entirely, for every
  // function that closes over them regardless of where it's defined.
  const currentUser = session?.user || null;
  const roleLabel = profile?.name || currentUser?.email || "Someone";
  const [people, setPeople] = useState(null);
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup"
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [tab, setTab] = useState("jobs");
  const [stockMenuOpen, setStockMenuOpen] = useState(null); // holds the open group's label, or null
  const mainTabsRef = useRef(null);
  const [query, setQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState(null);
  const [sectionTypeFilter, setSectionTypeFilter] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  // A brief inline "✓ Saved" confirmation next to whichever field just
  // saved successfully — { key, at } so a field can check "was that me,
  // and was it recent" without a separate state var per field.
  const [lastSaved, setLastSaved] = useState(null);
  function flashSaved(key) {
    setLastSaved({ key, at: Date.now() });
  }
  function SavedCheck({ fieldKey }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
      if (lastSaved?.key === fieldKey && Date.now() - lastSaved.at < 1600) {
        setVisible(true);
        const t = setTimeout(() => setVisible(false), 1600);
        return () => clearTimeout(t);
      }
    }, [lastSaved, fieldKey]);
    if (!visible) return null;
    return <Check size={13} strokeWidth={3} style={{ color: C.accentFinished, marginLeft: 4, flexShrink: 0 }} />;
  }
  const [form, setForm] = useState(emptyForm);
  const [showManager, setShowManager] = useState(false);
  const [managerTab, setManagerTab] = useState(null);
  const [managerInput, setManagerInput] = useState("");
  const [managerFactor, setManagerFactor] = useState("");
  const [managerShortName, setManagerShortName] = useState("");
  const [managerPrice, setManagerPrice] = useState("");
  const [stockCodeQuery, setStockCodeQuery] = useState("");
  const [stockCodeCustomerFilter, setStockCodeCustomerFilter] = useState("");
  const [storesCatalogCategoryFilter, setStoresCatalogCategoryFilter] = useState("");
  const [managerSearchQuery, setManagerSearchQuery] = useState("");
  const [sectionTypeFilterInManager, setSectionTypeFilterInManager] = useState("");
  const [scForm, setScForm] = useState({ stockCode: "", description: "", price: "", recommendedStock: "", customer: "", revision: "" });
  const [scCatalogForm, setScCatalogForm] = useState({ code: "", name: "", category: "", supplier: "", price: "" });
  const [storesCatalogQuery, setStoresCatalogQuery] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [importFileLabel, setImportFileLabel] = useState("");
  const [importCustomer, setImportCustomer] = useState("");
  const [importReplaceAll, setImportReplaceAll] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [priceUnitMode, setPriceUnitMode] = useState("perUnit"); // "perUnit" (sheet/metre) or "perKg"

  const [showFilters, setShowFilters] = useState(false);
  const [showCustomerChips, setShowCustomerChips] = useState(false);
  const customerChipsRef = useRef(null);
  const [filterGrade, setFilterGrade] = useState("");
  const [filterFastenerType, setFilterFastenerType] = useState("");
  const [filterFastenerDiameter, setFilterFastenerDiameter] = useState("");
  const [filterFastenerGrade, setFilterFastenerGrade] = useState("");
  const [filterFastenerFinish, setFilterFastenerFinish] = useState("");
  const [filterWidth, setFilterWidth] = useState("");
  const [filterLength, setFilterLength] = useState("");
  const [filterAreaMin, setFilterAreaMin] = useState("");
  const [filterAreaMax, setFilterAreaMax] = useState("");
  const [filterWeightMin, setFilterWeightMin] = useState("");
  const [filterWeightMax, setFilterWeightMax] = useState("");
  const [filterThickness, setFilterThickness] = useState("");
  const [filterPieceLength, setFilterPieceLength] = useState("");
  const [filterStockType, setFilterStockType] = useState("");

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  // Shared by the initial load and both the manual and automatic refresh.
  // isInitialLoad only controls whether a problem here should show the
  // blocking error screen (first load) versus fail quietly and retry next
  // cycle (a background refresh, where the current on-screen data should
  // stay put rather than flash an error).
  //
  // Critically: an empty-but-successful response is treated with the exact
  // same suspicion as a thrown error — NEVER filled in with seed/example
  // data or empty defaults. This app has real, long-standing production
  // data; there is no legitimate scenario anymore where "nothing came
  // back" should be read as "brand new install, start fresh." Silently
  // seeding on an empty response was a leftover from early development,
  // and it caused real data loss whenever a fetch came back empty for any
  // reason (a misconfigured deploy, a transient hiccup) — since saves are
  // immediate, that fake/empty state would get written straight back over
  // whatever was actually there.
  async function loadAllData(isInitialLoad) {
    let loadedItems = null; // shared across the items/master blocks below, so
    // the Stock Codes → real item migration (further down) can see both.
    let hadError = false; // tracked locally rather than read back from
    // loadError state, since state updates from setLoadError calls below
    // haven't flushed yet by the time this function returns — a caller
    // checking loadError immediately after awaiting this would race it.
    try {
      const itemRows = await fetchAllRows("stock_items");
      if (itemRows && itemRows.length > 0) {
        loadedItems = itemRows.map(dbRowToItem);
        // Migration: Tools used to live in Stores as a "storesKind" — they
        // now have their own Assets category with different fields
        // (manufacturer, serial number, purchase date, one-at-a-time
        // tracking). Move any existing ones over automatically.
        loadedItems = loadedItems.map((it) =>
          it.mainCat === "stores" && it.storesKind === "tool"
            ? {
                ...it,
                mainCat: "assets",
                storesKind: undefined,
                manufacturer: it.manufacturer || "",
                serialNumber: it.serialNumber || "",
                purchaseDate: it.purchaseDate || "",
                status: it.status || "active",
                qty: 1,
              }
            : it
        );
        // Migration: Fasteners used to just be a Store Category, mixed in
        // with everything else in Stores — they're now their own division,
        // since they're resale stock, not something the shop consumes.
        loadedItems = loadedItems.map((it) =>
          it.mainCat === "stores" && it.customer === "Fasteners" ? { ...it, mainCat: "fasteners", customer: "" } : it
        );
        setItems(loadedItems);
        lastSavedItemsRef.current = loadedItems;
        setLoadError((prev) => ({ ...prev, items: false }));
      } else {
        // A real table now, not the old shared blob — a successful query
        // returning zero rows is a trustworthy, unambiguous answer (there
        // genuinely aren't any items right now), not the ambiguous signal
        // it used to be. Nothing left to silently overwrite by trusting
        // it, so there's nothing to refuse here anymore.
        setItems(loadedItems || []);
        lastSavedItemsRef.current = loadedItems || [];
        setLoadError((prev) => ({ ...prev, items: false }));
      }
    } catch (err) {
      console.error("Failed to load items:", err);
      if (isInitialLoad) {
        setLoadError((prev) => ({ ...prev, items: true }));
        hadError = true;
      }
    }
    try {
      const { master: loadedMaster } = await loadMasterFromTables();
      // Same reasoning as items above — a real set of tables now, so an
      // empty result is trustworthy on its own, not something to refuse.
      setMaster(loadedMaster);
      lastSavedMasterRef.current = loadedMaster;
      setLoadError((prev) => ({ ...prev, master: false }));
    } catch (err) {
      console.error("Failed to load master data:", err);
      if (isInitialLoad) {
        setLoadError((prev) => ({ ...prev, master: true }));
        hadError = true;
      }
    }
    try {
      const reqRows = await fetchAllRows("requisitions");
      const loadedReqs = (reqRows || []).map(dbRowToRequisition);
      setRequisitions(loadedReqs);
      lastSavedRequisitionsRef.current = loadedReqs;
      setLoadError((prev) => ({ ...prev, requisitions: false }));
    } catch (err) {
      console.error("Failed to load requisitions:", err);
      if (isInitialLoad) {
        setLoadError((prev) => ({ ...prev, requisitions: true }));
        hadError = true;
      }
    }
    try {
      const poRows = await fetchAllRows("purchase_orders");
      const loadedPos = (poRows || []).map(dbRowToPo);
      setPurchaseOrders(loadedPos);
      lastSavedPurchaseOrdersRef.current = loadedPos;
      setLoadError((prev) => ({ ...prev, purchaseOrders: false }));
    } catch (err) {
      console.error("Failed to load purchase orders:", err);
      if (isInitialLoad) {
        setLoadError((prev) => ({ ...prev, purchaseOrders: true }));
        hadError = true;
      }
    }
    try {
      const usageRows = await fetchAllRows("usage_log");
      const loadedUsage = (usageRows || []).map(dbRowToUsageLogEntry);
      setUsageLog(loadedUsage);
      lastSavedUsageLogRef.current = loadedUsage;
      setLoadError((prev) => ({ ...prev, usageLog: false }));
    } catch (err) {
      console.error("Failed to load usage log:", err);
      if (isInitialLoad) {
        setLoadError((prev) => ({ ...prev, usageLog: true }));
        hadError = true;
      }
    }
    setLastRefreshedAt(new Date());
    return hadError;
  }

  async function manualRefresh() {
    setIsRefreshing(true);
    await loadAllData(false);
    setIsRefreshing(false);
  }

  // Retries the initial load several times with a pause before showing the
  // blocking "couldn't load" screen — on a slow-but-working connection, 5
  // separate requests all needing to succeed in one pass can need more
  // than a couple of quick tries to all land.
  //
  // Critically: the blocking screen must only appear once every attempt
  // has been exhausted, not the instant the first one hits trouble — the
  // per-request loadError state gets set (and cleared) mid-attempt, so
  // reading it directly made the blocking screen appear within seconds of
  // the very first failure, hiding the retry loop's entire benefit behind
  // a scary screen the user saw well before the app had actually given up.
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    async function loadWithRetry() {
      for (let attempt = 0; attempt < 6; attempt++) {
        const hadError = await loadAllData(true);
        if (cancelled) return;
        if (!hadError) {
          setLoadRetriesExhausted(false);
          return;
        }
        if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      if (!cancelled) setLoadRetriesExhausted(true);
    }
    loadWithRetry();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Automatic background refresh — every 60 seconds, only while the tab is
  // actually visible, so a phone with the app backgrounded isn't quietly
  // burning battery/data on a screen nobody's looking at.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadAllData(false);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Real sign-in via Supabase Auth, replacing the old shared-PIN system.
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setSession(null);
      return;
    }
    let settled = false;
    // A network hiccup exactly during this initial check previously left
    // the app stuck on "Checking your session…" forever — getSession()
    // had no .catch() and nothing timed it out, so a failure here meant
    // no login page ever appeared, with no way out but a manual refresh.
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error("Session check timed out — falling back to signed-out state.");
        setSession(null);
        setAuthLoading(false);
      }
    }, 10000);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        setSession(data.session || null);
        setAuthLoading(false);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.error("Failed to check session:", err);
        setSession(null);
        setAuthLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });
    return () => {
      clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(
          data
            ? {
                id: data.id,
                name: data.name || data.email,
                email: data.email,
                isAdmin: !!data.is_admin,
                permissions: data.permissions || blankPermissions(),
                canAddItems: !!data.can_add_items,
                canEditItems: !!data.can_edit_items,
                canRequisition: !!data.can_requisition,
                canMarkReceived: !!data.can_mark_received,
                canSeeValue: !!data.can_see_value,
                canAccessStockManager: !!data.can_access_stock_manager,
                canManageRequisitions: !!data.can_manage_requisitions,
                canRaisePO: !!data.can_raise_po,
                canViewUsageLog: !!data.can_view_usage_log,
                canManageInvoicing: !!data.can_manage_invoicing,
                allowedProcessTypes: data.allowed_process_types || [],
                isSalesPerson: !!data.is_sales_person,
                isShortageHandler: !!data.is_shortage_handler,
                theme: data.theme || "dark",
                department: data.department || "",
              }
            : null
        );
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // stock_items is a real table now — each row is independent, so unlike
  // the shared-blob data below, there's no whole-dataset overwrite risk to
  // guard against here at all. This only needs to work out this specific
  // change (added / removed / edited, by id) since the last save, and
  // apply exactly that as its own targeted insert/update/delete — nothing
  // here can ever collide with or erase a change someone else made.
  async function saveItemsToDb(prevRef, newItems) {
    const prev = prevRef.current;
    if (prev === null) {
      prevRef.current = newItems;
      return;
    }
    const prevById = new Map(prev.map((it) => [it.id, it]));
    const nextById = new Map(newItems.map((it) => [it.id, it]));
    const added = newItems.filter((it) => !prevById.has(it.id));
    const removedIds = prev.filter((it) => !nextById.has(it.id)).map((it) => it.id);
    const modified = newItems.filter((it) => prevById.has(it.id) && JSON.stringify(prevById.get(it.id)) !== JSON.stringify(it));
    prevRef.current = newItems;
    if (added.length || modified.length) {
      const { error } = await supabase.from("stock_items").upsert([...added, ...modified].map(itemToDbRow));
      if (error) throw error;
    }
    if (removedIds.length) {
      const { error } = await supabase.from("stock_items").delete().in("id", removedIds);
      if (error) throw error;
    }
  }
  useEffect(() => {
    if (items === null) return;
    setSaveState("saving");
    saveItemsToDb(lastSavedItemsRef, items)
      .then(() => {
        setSaveState("saved");
        flashSaved("core");
      })
      .catch((err) => {
        console.error("Failed to save items:", err);
        setSaveState("error");
      });
  }, [items]);

  async function saveMasterToTables(prevRef, newMaster) {
    const prev = prevRef.current;
    if (prev === null) {
      prevRef.current = newMaster;
      return;
    }
    prevRef.current = newMaster;
    const ops = [];

    // Simple string lists: identity is the value itself within its list —
    // added values get a fresh row, removed values get deleted by match.
    for (const listName of MASTER_STRING_LISTS) {
      const prevList = prev[listName] || [];
      const nextList = newMaster[listName] || [];
      if (JSON.stringify(prevList) === JSON.stringify(nextList)) continue;
      const added = nextList.filter((v) => !prevList.includes(v));
      const removed = prevList.filter((v) => !nextList.includes(v));
      if (added.length) {
        // sort_order comes from where the value actually sits in the list.
        // For unordered lists additions always land at the end, so this is
        // the same append behaviour as before — it just records it.
        ops.push(
          supabase.from("master_string_lists").insert(
            added.map((v) => ({ id: uid(), list_name: listName, value: v, sort_order: nextList.indexOf(v) }))
          )
        );
      }
      if (removed.length) {
        ops.push(supabase.from("master_string_lists").delete().eq("list_name", listName).in("value", removed));
      }
      // Moving an item changes no values at all, so the added/removed diff
      // above cannot express a reorder — the positions have to be written
      // back separately. Only for lists where order carries meaning, and
      // only when something changed (identical lists returned above), so
      // this stays a handful of rows. These run after the insert, since
      // ops are executed in sequence, so a value moved into a new position
      // always exists by the time it is updated.
      if (ORDERED_STRING_LISTS.includes(listName)) {
        nextList.forEach((v, i) => {
          ops.push(
            supabase.from("master_string_lists").update({ sort_order: i }).eq("list_name", listName).eq("value", v)
          );
        });
      }
    }

    // name/factor/price lists: identity is the name within its list — a
    // same-name entry with a changed factor/price/type is a real update,
    // not a remove+add, so its row (and history) survives in place.
    for (const listName of MASTER_FACTOR_LISTS) {
      const prevList = prev[listName] || [];
      const nextList = newMaster[listName] || [];
      if (JSON.stringify(prevList) === JSON.stringify(nextList)) continue;
      const prevByName = new Map(prevList.map((e) => [e.name, e]));
      const nextByName = new Map(nextList.map((e) => [e.name, e]));
      const added = nextList.filter((e) => !prevByName.has(e.name));
      const removedNames = prevList.filter((e) => !nextByName.has(e.name)).map((e) => e.name);
      const modified = nextList.filter((e) => prevByName.has(e.name) && JSON.stringify(prevByName.get(e.name)) !== JSON.stringify(e));
      if (added.length) {
        ops.push(
          supabase.from("master_factor_items").insert(added.map((e) => ({ id: uid(), list_name: listName, name: e.name, factor: e.factor || 0, price: e.price || 0, type: e.type ?? null, short_name: e.shortName || null })))
        );
      }
      if (removedNames.length) {
        ops.push(supabase.from("master_factor_items").delete().eq("list_name", listName).in("name", removedNames));
      }
      for (const e of modified) {
        ops.push(
          supabase.from("master_factor_items").update({ factor: e.factor || 0, price: e.price || 0, type: e.type ?? null, short_name: e.shortName || null }).eq("list_name", listName).eq("name", e.name)
        );
      }
    }

    // Suppliers and their nested contacts — both have real, stable ids
    // already, same as stock items.
    if (JSON.stringify(prev.suppliers) !== JSON.stringify(newMaster.suppliers)) {
      const prevSuppliers = prev.suppliers || [];
      const nextSuppliers = newMaster.suppliers || [];
      const prevById = new Map(prevSuppliers.map((s) => [s.id, s]));
      const nextById = new Map(nextSuppliers.map((s) => [s.id, s]));
      const toRow = (s) => ({ id: s.id, name: s.name, email: s.email || "", phone: s.phone || "", address: s.address || "", logo: s.logo || "", vat_number: s.vatNumber || "" });
      const added = nextSuppliers.filter((s) => !prevById.has(s.id));
      const removedIds = prevSuppliers.filter((s) => !nextById.has(s.id)).map((s) => s.id);
      const modified = nextSuppliers.filter((s) => {
        const before = prevById.get(s.id);
        return before && JSON.stringify({ ...before, contacts: undefined }) !== JSON.stringify({ ...s, contacts: undefined });
      });
      if (added.length || modified.length) ops.push(supabase.from("master_suppliers").upsert([...added, ...modified].map(toRow)));
      if (removedIds.length) ops.push(supabase.from("master_suppliers").delete().in("id", removedIds));

      const prevContacts = prevSuppliers.flatMap((s) => (s.contacts || []).map((c) => ({ ...c, supplierId: s.id })));
      const nextContacts = nextSuppliers.flatMap((s) => (s.contacts || []).map((c) => ({ ...c, supplierId: s.id })));
      const prevContactById = new Map(prevContacts.map((c) => [c.id, c]));
      const nextContactById = new Map(nextContacts.map((c) => [c.id, c]));
      const addedContacts = nextContacts.filter((c) => !prevContactById.has(c.id));
      const removedContactIds = prevContacts.filter((c) => !nextContactById.has(c.id)).map((c) => c.id);
      const modifiedContacts = nextContacts.filter((c) => prevContactById.has(c.id) && JSON.stringify(prevContactById.get(c.id)) !== JSON.stringify(c));
      const contactRow = (c) => ({ id: c.id, supplier_id: c.supplierId, name: c.name || "", email: c.email || "" });
      if (addedContacts.length || modifiedContacts.length)
        ops.push(supabase.from("master_supplier_contacts").upsert([...addedContacts, ...modifiedContacts].map(contactRow)));
      if (removedContactIds.length) ops.push(supabase.from("master_supplier_contacts").delete().in("id", removedContactIds));
    }

    // Stores catalog — same real-id pattern as stock items.
    if (JSON.stringify(prev.storesCatalog) !== JSON.stringify(newMaster.storesCatalog)) {
      const prevList = prev.storesCatalog || [];
      const nextList = newMaster.storesCatalog || [];
      const prevById = new Map(prevList.map((r) => [r.id, r]));
      const nextById = new Map(nextList.map((r) => [r.id, r]));
      const added = nextList.filter((r) => !prevById.has(r.id));
      const removedIds = prevList.filter((r) => !nextById.has(r.id)).map((r) => r.id);
      const modified = nextList.filter((r) => prevById.has(r.id) && JSON.stringify(prevById.get(r.id)) !== JSON.stringify(r));
      const toRow = (r) => ({ id: r.id, code: r.code || "", name: r.name || "", category: r.category || "", supplier: r.supplier || "", price: r.price || 0 });
      if (added.length || modified.length) ops.push(supabase.from("master_stores_catalog").upsert([...added, ...modified].map(toRow)));
      if (removedIds.length) ops.push(supabase.from("master_stores_catalog").delete().in("id", removedIds));
    }

    // Customer contacts — a dictionary of arrays; flatten to a single list
    // (each contact already has its own real id) for the same id-based diff.
    if (JSON.stringify(prev.customerContacts) !== JSON.stringify(newMaster.customerContacts)) {
      const flatten = (dict) =>
        Object.entries(dict || {}).flatMap(([customerName, contacts]) => (contacts || []).map((c) => ({ ...c, customerName })));
      const prevContacts = flatten(prev.customerContacts);
      const nextContacts = flatten(newMaster.customerContacts);
      const prevById = new Map(prevContacts.map((c) => [c.id, c]));
      const nextById = new Map(nextContacts.map((c) => [c.id, c]));
      const added = nextContacts.filter((c) => !prevById.has(c.id));
      const removedIds = prevContacts.filter((c) => !nextById.has(c.id)).map((c) => c.id);
      const modified = nextContacts.filter((c) => prevById.has(c.id) && JSON.stringify(prevById.get(c.id)) !== JSON.stringify(c));
      const toRow = (c) => ({ id: c.id, customer_name: c.customerName, name: c.name || "", email: c.email || "", phone: c.phone || "" });
      if (added.length || modified.length) ops.push(supabase.from("master_customer_contacts").upsert([...added, ...modified].map(toRow)));
      if (removedIds.length) ops.push(supabase.from("master_customer_contacts").delete().in("id", removedIds));
    }

    // Company details — a single fixed row.
    if (JSON.stringify(prev.companyDetails) !== JSON.stringify(newMaster.companyDetails)) {
      const c = newMaster.companyDetails || EMPTY_COMPANY_DETAILS;
      ops.push(
        supabase.from("master_company_details").upsert({ id: 1, name: c.name || "", address: c.address || "", phone: c.phone || "", email: c.email || "", vat_number: c.vatNumber || "", reg_number: c.regNumber || "" })
      );
    }

    // Running counters — one row per counter, so bumping the job number
    // can never touch or race against the PO number.
    for (const counterName of MASTER_COUNTERS) {
      if (prev[counterName] !== newMaster[counterName]) {
        ops.push(supabase.from("master_counters").upsert({ counter_name: counterName, value: newMaster[counterName] ?? 1 }));
      }
    }

    for (const op of ops) {
      const { error } = await op;
      if (error) throw error;
    }
  }
  useEffect(() => {
    if (master === null) return;
    saveMasterToTables(lastSavedMasterRef, master)
      .then(() => {
        setSaveState("saved");
        flashSaved("core");
      })
      .catch((err) => {
        console.error("Failed to save master data:", err);
        setSaveState("error");
      });
  }, [master]);

  // requisitions is a real table now — same reasoning and same pattern as
  // stock_items above: each row is independent, so this only needs to work
  // out this specific change since the last save and apply it directly.
  async function saveRequisitionsToDb(prevRef, newList) {
    const prev = prevRef.current;
    if (prev === null) {
      prevRef.current = newList;
      return;
    }
    const prevById = new Map(prev.map((it) => [it.id, it]));
    const nextById = new Map(newList.map((it) => [it.id, it]));
    const added = newList.filter((it) => !prevById.has(it.id));
    const removedIds = prev.filter((it) => !nextById.has(it.id)).map((it) => it.id);
    const modified = newList.filter((it) => prevById.has(it.id) && JSON.stringify(prevById.get(it.id)) !== JSON.stringify(it));
    prevRef.current = newList;
    if (added.length || modified.length) {
      const { error } = await supabase.from("requisitions").upsert([...added, ...modified].map(requisitionToDbRow));
      if (error) throw error;
    }
    if (removedIds.length) {
      const { error } = await supabase.from("requisitions").delete().in("id", removedIds);
      if (error) throw error;
    }
  }
  useEffect(() => {
    if (requisitions === null) return;
    saveRequisitionsToDb(lastSavedRequisitionsRef, requisitions)
      .then(() => {
        setSaveState("saved");
        flashSaved("core");
      })
      .catch((err) => {
        console.error("Failed to save requisitions:", err);
        setSaveState("error");
      });
  }, [requisitions]);

  // purchase_orders is a real table now — same pattern as requisitions and
  // stock_items: each PO is independent, so this only needs to work out
  // this specific change since the last save and apply it directly.
  async function savePurchaseOrdersToDb(prevRef, newList) {
    const prev = prevRef.current;
    if (prev === null) {
      prevRef.current = newList;
      return;
    }
    const prevById = new Map(prev.map((it) => [it.id, it]));
    const nextById = new Map(newList.map((it) => [it.id, it]));
    const added = newList.filter((it) => !prevById.has(it.id));
    const removedIds = prev.filter((it) => !nextById.has(it.id)).map((it) => it.id);
    const modified = newList.filter((it) => prevById.has(it.id) && JSON.stringify(prevById.get(it.id)) !== JSON.stringify(it));
    prevRef.current = newList;
    if (added.length || modified.length) {
      const { error } = await supabase.from("purchase_orders").upsert([...added, ...modified].map(poToDbRow));
      if (error) throw error;
    }
    if (removedIds.length) {
      const { error } = await supabase.from("purchase_orders").delete().in("id", removedIds);
      if (error) throw error;
    }
  }
  useEffect(() => {
    if (purchaseOrders === null) return;
    savePurchaseOrdersToDb(lastSavedPurchaseOrdersRef, purchaseOrders)
      .then(() => {
        setSaveState("saved");
        flashSaved("core");
      })
      .catch((err) => {
        console.error("Failed to save purchase orders:", err);
        setSaveState("error");
      });
  }, [purchaseOrders]);

  // usage_log is a real table now — same pattern as the others above.
  // Purely append-only in practice (verified: no code path ever edits or
  // removes an existing entry), but the same generic add/remove/modify
  // diff is used anyway for consistency — it costs nothing extra and
  // stays correct if that ever changes.
  async function saveUsageLogToDb(prevRef, newList) {
    const prev = prevRef.current;
    if (prev === null) {
      prevRef.current = newList;
      return;
    }
    const prevById = new Map(prev.map((it) => [it.id, it]));
    const nextById = new Map(newList.map((it) => [it.id, it]));
    const added = newList.filter((it) => !prevById.has(it.id));
    const removedIds = prev.filter((it) => !nextById.has(it.id)).map((it) => it.id);
    const modified = newList.filter((it) => prevById.has(it.id) && JSON.stringify(prevById.get(it.id)) !== JSON.stringify(it));
    prevRef.current = newList;
    if (added.length || modified.length) {
      const { error } = await supabase.from("usage_log").upsert([...added, ...modified].map(usageLogEntryToDbRow));
      if (error) throw error;
    }
    if (removedIds.length) {
      const { error } = await supabase.from("usage_log").delete().in("id", removedIds);
      if (error) throw error;
    }
  }
  useEffect(() => {
    if (usageLog === null) return;
    saveUsageLogToDb(lastSavedUsageLogRef, usageLog)
      .then(() => {
        setSaveState("saved");
        flashSaved("core");
      })
      .catch((err) => {
        console.error("Failed to save usage log:", err);
        setSaveState("error");
      });
  }, [usageLog]);

  // Drawings live in their own real table, not window.storage — load the
  // first time the tab is opened so browsing works without typing anything,
  // rather than only showing results once you start a search.
  useEffect(() => {
    if (tab === "drawings" && drawingSearchResults === null) {
      refreshDrawings(drawingSearchQuery, drawingCustomerFilter);
    }
  }, [tab]);

  // A detail view open in one tab shouldn't carry over into a different
  // one after switching — same reasoning as the department/job navigation
  // elsewhere in the app.
  useEffect(() => {
    setSelectedItemDetail(null);
    setSelectedGradeGroup(null);
    setAssetManufacturerOpen(null);
    setAssetDetailOpen(null);
    setProductionSearchQuery("");
    setExpandedReqId(null);
    setExpandedPoId(null);
    setReceivingSearchQuery("");
    setShortageSearchQuery("");
    setExpandedReceivingId(null);
  }, [tab]);

  // The part-number → drawing lookup is used on Customer Stock rows and the
  // Add form regardless of which tab is open, so load it once at startup.
  useEffect(() => {
    if (session?.user) loadDrawingLookup();
  }, [session]);

  // Loaded eagerly, not just when the Jobs tab opens — the Use modal
  // (reachable from every item, everywhere) needs the real job list to
  // populate its job picker regardless of which tab someone's on.
  useEffect(() => {
    if (session?.user && jobsList === null) fetchJobs();
  }, [session, jobsList]);

  useEffect(() => {
    if (tab === "production" && productionQueue === null && profile?.allowedProcessTypes?.length) fetchProductionQueue();
  }, [tab, profile]);

  useEffect(() => {
    if (tab === "laser4kw" && laserData === null) fetchLaserData();
  }, [tab, laserData]);

  // Dropdown menus (the Stock/Procurement/Records group menus, the
  // customer/section-type filter) should always close on an outside
  // click, same as any standard dropdown — unlike modals, there's no data
  // entry to lose here, so this is safe to do automatically. Real click
  // detection via a ref, not the old blanket invisible-overlay approach,
  // which was catching clicks too broadly and closing menus unexpectedly.
  useEffect(() => {
    function handleOutsideClick(e) {
      if (stockMenuOpen && mainTabsRef.current && !mainTabsRef.current.contains(e.target)) {
        setStockMenuOpen(null);
      }
      if (showCustomerChips && customerChipsRef.current && !customerChipsRef.current.contains(e.target)) {
        setShowCustomerChips(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [stockMenuOpen, showCustomerChips]);

  useEffect(() => {
    if ((tab === "processSheets" || tab === "poReports") && generatedDocuments === null && supabase) fetchGeneratedDocuments();
  }, [tab]);

  // Makes the phone/browser back action close whatever's open (Job Detail,
  // a preview, any modal) instead of leaving the app entirely — the app
  // wasn't registering these as a "page" the browser knew how to step back
  // into, so back had nothing to do but exit. Deliberately closes
  // everything open on one back press rather than one layer at a time —
  // simpler and more reliable than tracking exact nesting order, and it
  // directly fixes the actual complaint (leaving the app), not a polish
  // detail on top of it.
  const anyModalOpen = !!(
    usageModal || assetRemoveModal || shortageModal || jobDetail || newStockItemModal ||
    markInvoicedModal || deliveryNoteBatchModal || copyJobModal || previewItem ||
    showAddStockItemModal || showStockImportModal || editProcessesModal || productionSelectedDept ||
    productionSelectedProcessId || showManager || requisitionTarget || showRequisitionPicker ||
    assetManufacturerOpen || assetDetailOpen || serviceNowItem || repairListItem ||
    selectedGradeGroup || selectedItemDetail
  );
  const modalWasOpenRef = useRef(false);
  const closingViaBackRef = useRef(false);

  function closeAllModals() {
    setUsageModal(null);
    setAssetRemoveModal(null);
    setShortageModal(null);
    setJobDetail(null);
    setNewStockItemModal(null);
    setMarkInvoicedModal(null);
    setDeliveryNoteBatchModal(null);
    setCopyJobModal(null);
    setPreviewItem(null);
    setShowAddStockItemModal(false);
    setShowStockImportModal(false);
    setEditProcessesModal(null);
    setProductionSelectedDept(null);
    setProductionSelectedProcessId(null);
    setShowManager(false);
    setManagerTab(null);
    closeRequisition();
    closeRequisitionPicker();
    setSelectedGradeGroup(null);
    setSelectedItemDetail(null);
    setAssetManufacturerOpen(null);
    setAssetDetailOpen(null);
    closeServiceNow();
    closeRepairList();
  }

  useEffect(() => {
    if (anyModalOpen && !modalWasOpenRef.current) {
      window.history.pushState({ stkModalOpen: true }, "");
    } else if (!anyModalOpen && modalWasOpenRef.current && !closingViaBackRef.current) {
      if (window.history.state?.stkModalOpen) window.history.back();
    }
    modalWasOpenRef.current = anyModalOpen;
  }, [anyModalOpen]);

  useEffect(() => {
    function handlePopState() {
      if (modalWasOpenRef.current) {
        closingViaBackRef.current = true;
        closeAllModals();
        modalWasOpenRef.current = false;
        setTimeout(() => {
          closingViaBackRef.current = false;
        }, 0);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Loaded eagerly (not just when the tab's opened) so the unread badge on
  // the header button is accurate the moment someone signs in.
  useEffect(() => {
    if (profile && notificationsList === null) fetchNotifications();
  }, [profile]);

  // Also eager — needed both for Production (to show shortages under
  // Nesting/Laser Operator) and the Shortage Center tab, so it can't wait
  // for either to be opened first.
  useEffect(() => {
    if (profile && shortagesList === null) fetchShortages();
    if (profile && allocationsList === null) fetchAllocations();
  }, [profile]);

  // Belt-and-suspenders on top of the immediate saves above: the moment this
  // tab/app gets backgrounded or closed — phone locking, switching apps,
  // closing the tab — re-fire every save with whatever's current right then.
  // Covers the (much smaller) remaining risk of a save being mid-flight
  // right when that happens.
  //
  // This goes through the same real, per-row save functions as the primary
  // saves, not a direct write of a whole dataset — every one of these five
  // is a real table now, so there's no shared blob left for a raw write to
  // risk overwriting in the first place.
  const itemsRef = useRef(items);
  const masterRef = useRef(master);
  const requisitionsRef = useRef(requisitions);
  const purchaseOrdersRef = useRef(purchaseOrders);
  const usageLogRef = useRef(usageLog);
  itemsRef.current = items;
  masterRef.current = master;
  requisitionsRef.current = requisitions;
  purchaseOrdersRef.current = purchaseOrders;
  usageLogRef.current = usageLog;

  useEffect(() => {
    function flushAll() {
      if (itemsRef.current !== null) saveItemsToDb(lastSavedItemsRef, itemsRef.current).catch(() => {});
      if (masterRef.current !== null) saveMasterToTables(lastSavedMasterRef, masterRef.current).catch(() => {});
      if (requisitionsRef.current !== null)
        saveRequisitionsToDb(lastSavedRequisitionsRef, requisitionsRef.current).catch(() => {});
      if (purchaseOrdersRef.current !== null)
        savePurchaseOrdersToDb(lastSavedPurchaseOrdersRef, purchaseOrdersRef.current).catch(() => {});
      if (usageLogRef.current !== null) saveUsageLogToDb(lastSavedUsageLogRef, usageLogRef.current).catch(() => {});
    }
    document.addEventListener("visibilitychange", flushAll);
    window.addEventListener("pagehide", flushAll);
    return () => {
      document.removeEventListener("visibilitychange", flushAll);
      window.removeEventListener("pagehide", flushAll);
    };
  }, []);

  async function signUp(e) {
    e.preventDefault();
    setAuthError("");
    if (!authName.trim() || !authEmail.trim() || !authPassword) {
      setAuthError("Fill in your name, email, and a password.");
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
      options: { data: { name: authName.trim() } },
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setAuthError("Account created. If asked, check your email to confirm — otherwise you're signed in already.");
    }
  }

  async function signIn(e) {
    e.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
    setAuthBusy(false);
    if (error) setAuthError(error.message);
  }

  async function signOutUser() {
    await supabase.auth.signOut();
  }

  // ---- Drawing Management foundation ----
  // A real Postgres table + Storage bucket, not the JSON-blob pattern the
  // rest of the app uses — see setup-drawings.sql for why. Everything here
  // is plumbing for the upload flows and viewer built in later phases;
  // nothing calls these yet.

  async function uploadDrawingFile(file, partNumber, revisionNumber) {
    if (!supabase) return null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${partNumber}/rev${revisionNumber}-${safeName}`;
    const { error } = await supabase.storage.from("drawings").upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  }

  async function getDrawingSignedUrl(storagePath) {
    if (!supabase) return null;
    // Valid for an hour — plenty for viewing one drawing, short enough that
    // a link doesn't stay usable indefinitely if it ever leaked.
    const { data, error } = await supabase.storage.from("drawings").createSignedUrl(storagePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async function getNextInternalRevision(partNumber) {
    if (!supabase) return 1;
    const { data, error } = await supabase
      .from("drawings")
      .select("internal_revision")
      .eq("part_number", partNumber)
      .order("internal_revision", { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data.length ? data[0].internal_revision + 1 : 1;
  }

  async function supersedeOldRevisions(partNumber) {
    if (!supabase) return;
    const { error } = await supabase
      .from("drawings")
      .update({ status: "superseded" })
      .eq("part_number", partNumber)
      .eq("status", "current");
    if (error) throw error;
  }

  // The one function later phases actually call to record a new drawing —
  // handles superseding the old "current" revision and working out the next
  // internal revision number automatically, so callers don't have to.
  async function insertDrawingRecord({ partNumber, customer, customerRevision, storagePath, fileName, linkedItemId, description, price }) {
    if (!supabase) return null;
    const nextRevision = await getNextInternalRevision(partNumber);
    await supersedeOldRevisions(partNumber);
    const { data, error } = await supabase
      .from("drawings")
      .insert({
        part_number: partNumber,
        customer: customer || null,
        internal_revision: nextRevision,
        customer_revision: customerRevision || null,
        storage_path: storagePath,
        file_name: fileName,
        status: "current",
        linked_item_id: linkedItemId || null,
        description: description || null,
        price: price != null ? price : null,
        uploaded_by: roleLabel,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ---- Drawings tab: search, view, and bulk upload ----

  async function refreshDrawings(query, customer) {
    if (!supabase) {
      setDrawingSearchResults([]);
      return;
    }
    setDrawingSearchLoading(true);
    try {
      let q = supabase.from("drawings").select("*").order("part_number").order("internal_revision", { ascending: false });
      if (query && query.trim()) {
        const term = query.trim().replace(/[%,]/g, "");
        q = q.or(`part_number.ilike.%${term}%,description.ilike.%${term}%`);
      }
      if (customer === "__internal__") q = q.is("customer", null);
      else if (customer) q = q.eq("customer", customer);
      const { data, error } = await q;
      if (error) throw error;
      // Group by part number so each part shows its current revision plus
      // any older ones tucked away in a collapsible history.
      const grouped = {};
      (data || []).forEach((d) => {
        if (!grouped[d.part_number]) grouped[d.part_number] = [];
        grouped[d.part_number].push(d);
      });
      setDrawingSearchResults(Object.entries(grouped));
    } catch (err) {
      console.error("Loading drawings failed:", err);
      setDrawingSearchResults([]);
    }
    setDrawingSearchLoading(false);
  }

  // A lightweight lookup of every current drawing's part number → description,
  // loaded once so any item row anywhere can instantly check "does this part
  // have a drawing on file" without a query per row.
  async function loadDrawingLookup() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("drawings")
        .select("id, part_number, description, internal_revision, customer_revision")
        .eq("status", "current");
      if (error) throw error;
      const map = {};
      (data || []).forEach((d) => {
        map[d.part_number.trim()] = {
          id: d.id,
          description: d.description,
          internalRevision: d.internal_revision,
          customerRevision: d.customer_revision,
        };
      });
      setDrawingLookup(map);
    } catch (err) {
      console.error("Failed to load drawing lookup:", err);
    }
  }

  async function openDrawingPreviewByPartNumber(partNumber) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("drawings")
        .select("*")
        .eq("part_number", partNumber.trim())
        .eq("status", "current")
        .maybeSingle();
      if (error) throw error;
      if (data) openDrawingPreview(data);
    } catch (err) {
      console.error("Couldn't open drawing:", err);
    }
  }

  // ---- Asset maintenance history ----

  async function fetchAssetHistory(itemId) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("asset_history")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function uploadAssetAttachment(file, itemId) {
    if (!supabase) return null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${itemId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("asset-attachments").upload(path, file);
    if (error) throw error;
    return path;
  }

  async function getAssetAttachmentUrl(path) {
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from("asset-attachments").createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async function addAssetHistoryEntry({ itemId, entryType, note, reading, attachmentFile, serviceMode, consumables }) {
    if (!supabase) return;
    let attachmentPath = null;
    let attachmentName = null;
    if (attachmentFile) {
      attachmentPath = await uploadAssetAttachment(attachmentFile, itemId);
      attachmentName = attachmentFile.name;
    }
    const row = {
      item_id: itemId,
      entry_type: entryType,
      note: note || null,
      hours_reading: entryType === "meter_reading" && serviceMode === "hours" ? reading : null,
      km_reading: entryType === "meter_reading" && serviceMode === "km" ? reading : null,
      attachment_path: attachmentPath,
      attachment_name: attachmentName,
      logged_by: roleLabel,
      consumables: consumables && consumables.length ? consumables : null,
    };
    const { error } = await supabase.from("asset_history").insert(row);
    if (error) throw error;
    // A logged reading is also the asset's new "current" reading, used for
    // the service-due calculation.
    if (entryType === "meter_reading") {
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, currentReading: reading } : it)));
    }
  }

  async function deleteAssetHistoryEntry(entry) {
    if (!supabase) return;
    const ok = window.confirm("Delete this history entry permanently? This can't be undone.");
    if (!ok) return;
    try {
      if (entry.attachment_path) await supabase.storage.from("asset-attachments").remove([entry.attachment_path]);
      const { error } = await supabase.from("asset_history").delete().eq("id", entry.id);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error("Failed to delete history entry:", err);
      alert("Couldn't delete that entry — check your connection and try again.");
      return false;
    }
  }

  // ---- Asset repair list — per-asset, open/resolved, separate from the
  // permanent History log above ----

  async function fetchAssetRepairs(itemId) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("asset_repairs")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function openRepairList(item) {
    setRepairListItem(item);
    setRepairListEntries(null);
    setRepairListDescription("");
    setRepairListResolvedOpen(false);
    try {
      setRepairListEntries(await fetchAssetRepairs(item.id));
    } catch (err) {
      console.error("Failed to load repair list:", err);
      setRepairListEntries([]);
    }
  }

  function closeRepairList() {
    setRepairListItem(null);
    setRepairListEntries(null);
    setRepairListDescription("");
  }

  async function refreshRepairList() {
    if (!repairListItem) return;
    try {
      setRepairListEntries(await fetchAssetRepairs(repairListItem.id));
    } catch (err) {
      console.error("Failed to refresh repair list:", err);
    }
  }

  async function submitRepairEntry(e) {
    e.preventDefault();
    if (!repairListDescription.trim()) return;
    setRepairListBusy(true);
    try {
      const { error } = await supabase.from("asset_repairs").insert({
        item_id: repairListItem.id,
        description: repairListDescription.trim(),
        status: "open",
        logged_by: roleLabel,
      });
      if (error) throw error;
      setRepairListDescription("");
      await refreshRepairList();
    } catch (err) {
      console.error("Failed to add repair entry:", err);
      alert("Couldn't save that — check your connection and try again.");
    }
    setRepairListBusy(false);
  }

  async function resolveRepairEntry(entry) {
    try {
      const { error } = await supabase
        .from("asset_repairs")
        .update({ status: "resolved", resolved_by: roleLabel, resolved_at: new Date().toISOString() })
        .eq("id", entry.id);
      if (error) throw error;
      await refreshRepairList();
    } catch (err) {
      console.error("Failed to resolve repair entry:", err);
      alert("Couldn't save that — check your connection and try again.");
    }
  }

  async function deleteRepairEntry(entry) {
    const ok = window.confirm("Delete this repair note permanently? This can't be undone.");
    if (!ok) return;
    try {
      const { error } = await supabase.from("asset_repairs").delete().eq("id", entry.id);
      if (error) throw error;
      await refreshRepairList();
    } catch (err) {
      console.error("Failed to delete repair entry:", err);
      alert("Couldn't delete that — check your connection and try again.");
    }
  }

  // ---- "Service now" — records a completed service, deducts any Stores
  // consumables used from real stock, and advances the service interval ----

  function openServiceNow(item) {
    setServiceNowItem(item);
    setServiceNowConsumables([]);
    setServiceNowConsumableSearch("");
    setServiceNowCustomName("");
    setServiceNowCustomQty("");
    setServiceNowReading(String(item.currentReading || ""));
    setServiceNowFile(null);
    setServiceNowNote("");
  }

  function closeServiceNow() {
    setServiceNowItem(null);
    setServiceNowConsumables([]);
    setServiceNowConsumableSearch("");
    setServiceNowCustomName("");
    setServiceNowCustomQty("");
    setServiceNowReading("");
    setServiceNowFile(null);
    setServiceNowNote("");
    setAddingServiceConsumableQty(null);
  }

  function addServiceConsumableFromStores(it) {
    setServiceNowConsumables((prev) => [
      ...prev,
      { source: "stores", itemId: it.id, name: it.name, qty: "1", unit: it.unit || "" },
    ]);
    setServiceNowConsumableSearch("");
  }

  function addServiceConsumableCustom() {
    const name = serviceNowCustomName.trim();
    if (!name) return;
    // Opens the real Add Item form, pre-filled for Stores — not the
    // current tab, since servicing an asset happens from the Assets tab.
    // On successful save, this new item gets linked into the consumables
    // list as a real, stock-deducting entry rather than a throwaway note.
    setAddingServiceConsumableQty(serviceNowCustomQty.trim() || "1");
    setForm({ ...emptyForm, id: uid(), mainCat: "stores", name });
    setEditingId(null);
    setAllowDuplicate(false);
    setShowAdd(true);
    setServiceNowCustomName("");
    setServiceNowCustomQty("");
  }

  function updateServiceConsumableQty(idx, qty) {
    setServiceNowConsumables((prev) => prev.map((c, i) => (i === idx ? { ...c, qty } : c)));
  }

  function removeServiceConsumable(idx) {
    setServiceNowConsumables((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitServiceNow(e) {
    e.preventDefault();
    if (!serviceNowItem) return;
    setServiceNowBusy(true);
    try {
      const item = serviceNowItem;
      const nowIso = new Date().toISOString();

      // Deduct real stock for every Stores consumable used — same effect
      // as a normal "Use" action, logged the same way, for the same
      // reason: this is genuine stock leaving the shelf, not just a note.
      const storesUsed = serviceNowConsumables.filter((c) => c.source === "stores");
      if (storesUsed.length > 0) {
        setItems((prev) =>
          prev.map((it) => {
            const used = storesUsed.find((c) => c.itemId === it.id);
            return used ? { ...it, qty: Math.max(0, Number(it.qty) - (Number(used.qty) || 0)) } : it;
          })
        );
        setUsageLog((prev) => [
          ...prev,
          ...storesUsed.map((c) => ({
            id: uid(),
            itemId: c.itemId,
            itemName: c.name,
            mainCat: "stores",
            qty: Number(c.qty) || 0,
            direction: "use",
            by: roleLabel,
            jobNumber: "",
            customer: "",
            note: `Used servicing ${item.name} (${item.partNumber || "no part number"})`,
            lineCost: 0,
            timestamp: nowIso,
          })),
        ]);
      }

      // Log the service itself as a history entry, carrying the full
      // consumables list (Stores and custom together) and any document.
      await addAssetHistoryEntry({
        itemId: item.id,
        entryType: "service",
        note: serviceNowNote.trim(),
        attachmentFile: serviceNowFile,
        consumables: serviceNowConsumables,
      });

      // Advance the service interval — by-date resets the last-serviced
      // date to now; by-hours/km takes the reading entered here as the new
      // baseline the next interval counts from.
      const reading = parseFloat(serviceNowReading);
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== item.id) return it;
          if (it.serviceMode === "months") return { ...it, lastServiceDate: nowIso.slice(0, 10) };
          if ((it.serviceMode === "hours" || it.serviceMode === "km") && !isNaN(reading)) {
            return { ...it, lastServiceReading: reading, currentReading: reading };
          }
          return it;
        })
      );

      closeServiceNow();
    } catch (err) {
      console.error("Failed to record service:", err);
      alert("Couldn't save that — check your connection and try again.");
    }
    setServiceNowBusy(false);
  }

  // ---- Jobs ----

  async function fetchJobs() {
    if (!supabase) return;
    setJobsLoading(true);
    // Four independent queries, run in parallel but each handled on its
    // own — Promise.allSettled rather than Promise.all specifically so a
    // failure in one (job_invoice_requests, quote items, or delivery
    // notes) never masks jobs that loaded successfully. Production's own,
    // separate query only touches the jobs table directly, which is
    // exactly why it could keep working while this combined fetch was
    // failing as a whole and silently showing nothing.
    const [jobsResult, invReqResult, quoteItemsResult, deliveryNotesResult] = await Promise.allSettled([
      fetchAllRows("jobs", { orderBy: "created_at", ascending: false }),
      fetchAllRows("job_invoice_requests", { orderBy: "submitted_at", ascending: false }),
      fetchAllRows("job_quote_items", { select: "id, job_id, item_status, qty, qty_invoiced" }),
      fetchAllRows("delivery_notes", { orderBy: "delivery_note_number", ascending: false }),
    ]);

    if (jobsResult.status === "fulfilled") {
      setJobsList(jobsResult.value || []);
    } else {
      console.error("Failed to load jobs:", jobsResult.reason);
      setJobsList([]);
    }
    if (invReqResult.status === "fulfilled") {
      setJobInvoiceRequests(invReqResult.value || []);
    } else {
      console.error("Failed to load invoice requests:", invReqResult.reason);
      setJobInvoiceRequests([]);
    }
    if (quoteItemsResult.status === "fulfilled") {
      setAllJobQuoteItems(quoteItemsResult.value || []);
    } else {
      console.error("Failed to load quote items:", quoteItemsResult.reason);
      setAllJobQuoteItems([]);
    }
    if (deliveryNotesResult.status === "fulfilled") {
      setAllDeliveryNotes(deliveryNotesResult.value || []);
    } else {
      console.error("Failed to load delivery notes:", deliveryNotesResult.reason);
      setAllDeliveryNotes([]);
    }
    setJobsLoading(false);
  }

  function openNewJob() {
    setNewJobForm({
      customer: "",
      newCustomerName: "",
      newCustomerContactName: "",
      newCustomerContactEmail: "",
      quoteExcelFile: null,
      description: "",
      quotedValue: "",
      dueDate: "",
      quoteReference: "",
      customerPo: "",
      laserJobReference: "",
      materialLocation: "",
      buyOutNotes: "",
      selectedProcesses: [],
      quoteItems: [],
    });
    setShowNewJob(true);
  }

  function addNewJobQuoteItem() {
    setNewJobForm((f) => ({ ...f, quoteItems: [...f.quoteItems, { description: "", qty: "", unitPrice: "", linkedItemId: null }] }));
  }

  function updateNewJobQuoteItem(idx, field, value) {
    setNewJobForm((f) => ({
      ...f,
      quoteItems: f.quoteItems.map((it, i) => {
        if (i !== idx) return it;
        // Typing a new description un-links from whatever was matched
        // before — a fresh match gets re-established on blur.
        if (field === "description") return { ...it, description: value, linkedItemId: null };
        return { ...it, [field]: value };
      }),
    }));
    // Editing price on an already-linked item pushes the new price back to
    // the actual stock record, not just this quote line.
    if (field === "unitPrice") {
      const item = newJobForm.quoteItems[idx];
      if (item?.linkedItemId) {
        setItems((prev) => prev.map((it) => (it.id === item.linkedItemId ? { ...it, value: Number(value) || 0 } : it)));
      }
    }
  }

  // Called on blur — matches the typed description against this customer's
  // existing Customer Stock items and pulls in the price + link if found.
  function matchNewJobQuoteItemToStock(idx) {
    setNewJobForm((f) => {
      const line = f.quoteItems[idx];
      if (!line || !line.description.trim() || !f.customer || f.customer === CUSTOM) return f;
      const match = (items || []).find(
        (it) => it.mainCat === "custom" && it.customer === f.customer && it.name.trim().toLowerCase() === line.description.trim().toLowerCase()
      );
      if (!match) return f;
      return {
        ...f,
        quoteItems: f.quoteItems.map((it, i) => (i === idx ? { ...it, linkedItemId: match.id, unitPrice: String(match.value ?? "") } : it)),
      };
    });
  }

  // Picking a suggestion directly from the dropdown links it immediately,
  // rather than waiting for onBlur to try to find the same match by exact
  // text — same linking outcome, just from the tap itself.
  function selectNewJobQuoteItemSuggestion(idx, stockItem) {
    setNewJobForm((f) => ({
      ...f,
      quoteItems: f.quoteItems.map((it, i) =>
        i === idx ? { ...it, description: stockItem.name, linkedItemId: stockItem.id, unitPrice: String(stockItem.value ?? "") } : it
      ),
    }));
    setNewJobItemSuggestOpen(null);
  }

  // The description didn't match anything — add it to Customer Stock right
  // from here, at whatever price is currently on the line, and link it.
  function addNewJobQuoteItemToStockManager(idx) {
    const line = newJobForm.quoteItems[idx];
    if (!line?.description.trim() || !newJobForm.customer || newJobForm.customer === CUSTOM) {
      alert("Pick a real customer first, and make sure this line has a description.");
      return;
    }
    // Opens a small form instead of creating a bare item — a part number is
    // required for the drawing/revision system to ever be able to link to
    // this item later, so it can't be skipped here.
    setNewStockItemModal({
      quoteItemIdx: idx,
      forJob: true,
      partNumber: "",
      name: line.description.trim(),
      value: line.unitPrice || "",
      loc: "",
    });
  }

  function submitNewStockItemFromJob() {
    const m = newStockItemModal;
    if (!m.partNumber.trim()) {
      alert("A part number is needed — without one, this item can never be linked to a drawing or revision later.");
      return;
    }
    const newItem = {
      id: uid(),
      mainCat: "custom",
      customer: newJobForm.customer,
      partNumber: m.partNumber.trim(),
      name: m.name.trim(),
      grade: "",
      qty: 0,
      value: Number(m.value) || 0,
      low: 0,
      loc: m.loc.trim(),
      comment: "",
      salesPerson: "",
    };
    setItems((prev) => [...prev, newItem]);
    setNewJobForm((f) => ({
      ...f,
      quoteItems: f.quoteItems.map((it, i) => (i === m.quoteItemIdx ? { ...it, linkedItemId: newItem.id, unitPrice: String(newItem.value) } : it)),
    }));
    setNewStockItemModal(null);
  }

  function removeNewJobQuoteItem(idx) {
    setNewJobForm((f) => ({ ...f, quoteItems: f.quoteItems.filter((_, i) => i !== idx) }));
  }

  function closeNewJob() {
    setShowNewJob(false);
    setNewJobForm(null);
  }

  // Ticking a process slots it into its place in the factory flow — the
  // order set in Stock Manager — rather than onto the end. That order
  // becomes sort_order, which is what gates the floor, so the sequence has
  // to come from the shop's real flow and not from whichever button
  // somebody happened to tap first.
  //
  // Placed relative to what's already selected rather than re-sorting the
  // whole list, so any deliberate reordering of this particular job
  // survives ticking another process.
  function toggleNewJobProcess(processName) {
    setNewJobForm((f) => {
      if (f.selectedProcesses.some((p) => p.name === processName)) {
        return { ...f, selectedProcesses: f.selectedProcesses.filter((p) => p.name !== processName) };
      }
      const flow = master?.jobProcessTypes || [];
      // A process since removed from the master list has no place in the
      // flow — keep those last rather than letting -1 jump them to front.
      const rank = (name) => {
        const i = flow.indexOf(name);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      const entry = { name: processName, operator: "", assignedToId: null, trackingMode: "batch" };
      const at = f.selectedProcesses.findIndex((p) => rank(p.name) > rank(processName));
      const next = [...f.selectedProcesses];
      next.splice(at === -1 ? next.length : at, 0, entry);
      return { ...f, selectedProcesses: next };
    });
  }

  // Sets both the real person link (assignedToId, what makes a genuine
  // notification possible) and the plain operator text alongside it, so
  // anything that still displays operator as text keeps working exactly
  // as before, without needing every display spot updated at once.
  function updateNewJobProcessAssignee(processName, personId) {
    const person = (people || []).find((p) => p.id === personId);
    setNewJobForm((f) => ({
      ...f,
      selectedProcesses: f.selectedProcesses.map((p) =>
        p.name === processName ? { ...p, assignedToId: personId || null, operator: person?.name || "" } : p
      ),
    }));
  }

  function updateNewJobProcessTrackingMode(processName, trackingMode) {
    setNewJobForm((f) => ({
      ...f,
      selectedProcesses: f.selectedProcesses.map((p) => (p.name === processName ? { ...p, trackingMode } : p)),
    }));
  }

  // Reads a quote Excel file and pulls out customer, quote reference, sales
  // rep, and line items to pre-fill the New Job form. Deliberately strict:
  // if the sheet or header layout doesn't match exactly what's expected,
  // this refuses and asks for manual entry rather than guessing at
  // misaligned data. A broken formula on one specific cell (not a layout
  // problem, just bad data on that one line) gets flagged for that item
  // alone rather than rejecting the whole file.
  function parseQuoteExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
          const sheetName = wb.SheetNames.find((n) => n.trim().toUpperCase() === "ERS QUOTE");
          if (!sheetName) {
            reject("This doesn't look like an ERS quote file — no \"ERS QUOTE\" sheet found. Fill in the job details manually.");
            return;
          }
          const ws = wb.Sheets[sheetName];
          const cellAt = (addr) => ws[addr]?.v;
          const textAt = (addr) => {
            const v = cellAt(addr);
            return v === undefined || v === null ? "" : String(v).trim();
          };

          // The header row must be exactly where every real quote we've
          // checked has it — if it's not, something about this file's
          // layout is different and it needs a human, not a guess.
          if (
            textAt("C21").toUpperCase() !== "DESCRIPTION" ||
            textAt("J21").toUpperCase() !== "QTY" ||
            textAt("K21").toUpperCase() !== "RATE"
          ) {
            reject("This file's layout doesn't match the expected quote format (header row has moved or changed) — fill in the job details manually.");
            return;
          }

          const customer = textAt("D10");
          if (!customer) {
            reject("Couldn't find a customer name in this file — fill in the job details manually.");
            return;
          }
          const contact = textAt("D11") || textAt("D9");
          const quoteNumber = textAt("K10");
          const salesRep = textAt("K13");

          // Walk row by row rather than assuming a fixed 2-row gap between
          // every item — a note or footnote can push the next real item
          // further down than the usual spacing.
          const quoteItems = [];
          let blankStreak = 0;
          for (let row = 23; row <= 45; row++) {
            const bVal = cellAt(`B${row}`);
            const cText = textAt(`C${row}`);
            if (typeof bVal === "number") {
              const qtyVal = cellAt(`J${row}`);
              const rateVal = cellAt(`K${row}`);
              const rateIsUsable = typeof rateVal === "number";
              quoteItems.push({
                description: cText,
                qty: typeof qtyVal === "number" ? qtyVal : 1,
                unitPrice: rateIsUsable ? rateVal : "",
                priceNeedsReview: !rateIsUsable,
              });
              blankStreak = 0;
            } else if (cText) {
              // A note/footnote line — append to whichever item is most
              // recent rather than treating it as its own item.
              if (quoteItems.length > 0) {
                quoteItems[quoteItems.length - 1].description += ` — ${cText}`;
              }
              blankStreak = 0;
            } else {
              blankStreak++;
              if (quoteItems.length > 0 && blankStreak >= 2) break;
            }
          }

          if (quoteItems.length === 0) {
            reject("Couldn't find any line items in this file — fill in the job details manually.");
            return;
          }

          resolve({ customer, contact, quoteNumber, salesRep, quoteItems });
        } catch (err) {
          reject("Couldn't read that file — fill in the job details manually.");
        }
      };
      reader.onerror = () => reject("Couldn't read that file — fill in the job details manually.");
      reader.readAsArrayBuffer(file);
    });
  }

  async function submitNewJob() {
    // Belt and braces with the button's disabled state: a fast double
    // click can register both presses before React re-renders.
    if (jobSubmitting) return;
    if (!newJobForm.customer || (newJobForm.customer === CUSTOM && !newJobForm.newCustomerName.trim())) {
      alert("Pick or add a customer before creating the job.");
      return;
    }
    if (newJobForm.selectedProcesses.length === 0) {
      alert("Select at least one process this job needs.");
      return;
    }
    setJobSubmitting(true);
    try {
      // A brand-new customer, added right here — same info a full Stock
      // Manager entry would eventually hold, just the essentials up front.
      let customerName = newJobForm.customer;
      if (customerName === CUSTOM) {
        customerName = newJobForm.newCustomerName.trim();
        ensureStringEntry("customers", customerName);
        if (newJobForm.newCustomerContactName.trim() || newJobForm.newCustomerContactEmail.trim()) {
          addCustomerContact(customerName);
          // addCustomerContact creates a blank contact — fill it in via the
          // same master update rather than a second async round-trip.
          setMaster((prev) => {
            const existing = prev.customerContacts?.[customerName] || [];
            const last = existing[existing.length - 1];
            if (!last) return prev;
            return {
              ...prev,
              customerContacts: {
                ...prev.customerContacts,
                [customerName]: existing.map((c) =>
                  c.id === last.id
                    ? { ...c, name: newJobForm.newCustomerContactName.trim(), email: newJobForm.newCustomerContactEmail.trim() }
                    : c
                ),
              },
            };
          });
        }
      }

      // Self-healing job number: if the counter is stale for any reason
      // (an earlier attempt created the job row but failed on a later
      // step, so the counter never advanced), retry with the next number
      // instead of getting permanently stuck on a collision.
      const derivedQty = newJobForm.quoteItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
      let job = null;
      let jobNumber = null;
      let candidateNumber = master.nextJobNumber;
      for (let attempt = 0; attempt < 5; attempt++) {
        jobNumber = formatJobNumber(candidateNumber);
        const { data, error } = await supabase
          .from("jobs")
          .insert({
            job_number: jobNumber,
            customer: customerName,
            status: "in_progress",
            sales_rep: roleLabel,
            qty: derivedQty > 0 ? derivedQty : null,
            due_date: newJobForm.dueDate || null,
            description: newJobForm.description,
            quoted_value: newJobForm.quotedValue ? Number(newJobForm.quotedValue) : null,
            quote_reference: newJobForm.quoteReference,
            customer_po: newJobForm.customerPo,
            laser_job_reference: newJobForm.laserJobReference,
            material_location: newJobForm.materialLocation,
            buy_out_notes: newJobForm.buyOutNotes,
            created_by: roleLabel,
          })
          .select()
          .single();
        if (!error) {
          job = data;
          break;
        }
        if (error.code === "23505") {
          // That number's taken — try the next one.
          candidateNumber++;
          continue;
        }
        throw error;
      }
      if (!job) throw new Error("Couldn't find an available job number after several attempts.");

      // Advance the counter past whatever number actually worked, right
      // away — not at the very end — so a later step failing can never
      // cause this same collision again.
      setMaster((prev) => ({ ...prev, nextJobNumber: candidateNumber + 1 }));

      try {
        const processRows = newJobForm.selectedProcesses.map((p, idx) => ({
          job_id: job.id,
          process_name: p.name,
          operator: p.operator || "",
          assigned_to: p.assignedToId || null,
          tracking_mode: p.trackingMode || "batch",
          sort_order: idx,
        }));
        const { error: procError } = await supabase.from("job_processes").insert(processRows);
        if (procError) throw procError;

        // A real, accountable assignment is what makes this notification
        // possible at all — this couldn't exist back when it was just a
        // free-text name with no actual link to a person.
        const assignedRows = newJobForm.selectedProcesses.filter((p) => p.assignedToId);
        if (assignedRows.length) {
          await supabase.from("job_notifications").insert(
            assignedRows.map((p) => ({
              job_id: job.id,
              job_number: job.job_number,
              recipient_id: p.assignedToId,
              message: `You've been assigned to ${p.name} on ${job.job_number} (${job.customer || "no customer"})`,
            }))
          );
        }

        const validQuoteItems = newJobForm.quoteItems.filter((it) => it.description.trim() && Number(it.qty) > 0);
        if (validQuoteItems.length) {
          const quoteItemRows = validQuoteItems.map((it, idx) => ({
            job_id: job.id,
            description: it.description.trim(),
            qty: Number(it.qty),
            unit_price: Number(it.unitPrice) || 0,
            linked_item_id: it.linkedItemId || null,
            sort_order: idx,
          }));
          const { error: quoteItemError } = await supabase.from("job_quote_items").insert(quoteItemRows);
          if (quoteItemError) throw quoteItemError;
        }

        if (newJobForm.quoteExcelFile) await uploadJobDocument(job.id, newJobForm.quoteExcelFile, null, true);
      } catch (innerErr) {
        // Something after the job itself failed — clean up the orphaned
        // job row (its processes/quote items cascade-delete with it)
        // rather than leaving a half-created job cluttering the list.
        await supabase.from("jobs").delete().eq("id", job.id);
        throw innerErr;
      }

      closeNewJob();
      fetchJobs();
    } catch (err) {
      console.error("Failed to create job:", err);
      alert(`Couldn't create that job: ${err.message || "unknown error"}. If this mentions a missing column, an SQL migration hasn't been run yet in Supabase.`);
    } finally {
      setJobSubmitting(false);
    }
  }

  async function openJobDetail(job) {
    setJobDetail({ job, processes: [], documents: [], quoteItems: [], deliveryNotes: [], allocations: [] });
    setJobDetailTab("overview");
    setJobDetailLoading(true);
    try {
      const [{ data: processes, error: procError }, { data: documents, error: docError }, { data: quoteItems, error: qiError }, { data: deliveryNotes, error: dnError }, allocResult] = await Promise.all([
        supabase.from("job_processes").select("*").eq("job_id", job.id).order("sort_order"),
        supabase.from("job_documents").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
        supabase.from("job_quote_items").select("*").eq("job_id", job.id).order("sort_order"),
        supabase.from("delivery_notes").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
        supabase.from("job_allocations").select("*").eq("job_id", job.id).order("created_at"),
      ]);
      if (procError) throw procError;
      if (docError) throw docError;
      if (qiError) throw qiError;
      if (dnError) throw dnError;
      // Deliberately not fatal. Allocations are an extra on this screen —
      // the process checklist, documents and quote items must still load
      // if the table is missing (migration not run yet) or unreadable.
      // Throwing here took the whole job detail down with it.
      if (allocResult.error) console.error("Failed to load allocations (job detail still shown):", allocResult.error);
      setJobDetail({ job, processes: processes || [], documents: documents || [], quoteItems: quoteItems || [], deliveryNotes: deliveryNotes || [], allocations: allocResult.data || [] });
    } catch (err) {
      console.error("Failed to load job detail:", err);
    }
    setJobDetailLoading(false);
  }

  // Sets material aside for one stage of a job. Reserves rather than
  // removes: stock_items keeps its quantity, so the count still matches
  // the shelf. It only drops when an operator books the material out.
  async function allocateStockToProcess(item, qty) {
    const { job, process } = allocateModal;
    const amount = Number(qty);
    if (!amount || amount <= 0) return;
    try {
      const { error } = await supabase.from("job_allocations").insert({
        id: uid(),
        job_id: job.id,
        job_number: job.job_number || "",
        process_id: process.id,
        process_name: process.process_name,
        item_id: item.id,
        item_name: item.name || "",
        main_cat: item.mainCat || "",
        qty_allocated: amount,
        qty_used: 0,
        allocated_by: roleLabel,
        allocated_by_id: currentUser?.id || null,
        status: "open",
      });
      if (error) throw error;
      setAllocateModal(null);
      refreshJobDetail();
      // The stock screens show what is reserved too, so they need telling
      // as much as the job screen does.
      fetchAllocations();
    } catch (err) {
      console.error("Failed to allocate stock:", err);
      alert(`Couldn't allocate that: ${err.message || "unknown error"}. If this mentions a missing table, setup-job-allocations.sql hasn't been run yet in Supabase.`);
    }
  }

  // Hands material back without it having been used — the job changed, or
  // it was set aside by mistake. Kept as a released row rather than
  // deleted, so "who reserved what and what happened to it" survives.
  // Books reserved material out against the job it was set aside for.
  // This is the only route by which reserved stock can be consumed —
  // ordinary Use is capped at what is free — so the quantity leaving the
  // shelf and the job it left for always agree.
  // offcuts is a list of { length, qty } — a cut rarely leaves one tidy
  // remainder, and the pieces that come back vary in both length and
  // number from job to job.
  async function useAllocation(allocation, qty, offcuts = []) {
    const outstanding = Number(allocation.qty_allocated) - Number(allocation.qty_used);
    const amount = Number(qty);
    if (!amount || amount <= 0) return;
    if (amount > outstanding) {
      alert(`Only ${outstanding} of that allocation is left to use.`);
      return;
    }
    const item = (items || []).find((i) => i.id === allocation.item_id);
    if (!item) {
      alert("That stock item no longer exists, so it can't be booked out. Release the allocation instead.");
      return;
    }
    const cleanOffcuts = (offcuts || [])
      .map((o) => ({ length: Number(o.length) || 0, qty: Number(o.qty) || 0 }))
      .filter((o) => o.length > 0 && o.qty > 0);
    const tooLong = cleanOffcuts.find((o) => o.length >= Number(item.length || 0));
    if (tooLong) {
      alert(`An offcut of ${tooLong.length}m isn't possible from a ${item.length}m length — it has to be shorter than the piece it came off.`);
      return;
    }
    try {
      const newUsed = Number(allocation.qty_used) + amount;
      const { error } = await supabase
        .from("job_allocations")
        .update({
          qty_used: newUsed,
          status: newUsed >= Number(allocation.qty_allocated) ? "used" : "open",
        })
        .eq("id", allocation.id);
      if (error) throw error;

      // Same two effects as any other usage: the shelf goes down, and the
      // log records what went where. Both save themselves.
      //
      // A returned offcut is filed as its own shorter line rather than
      // shortening the original, which would quietly change the length of
      // every other full piece sitting under the same entry. Same approach
      // the CNC bar cut already takes with its remainder.
      setItems((prev) => {
        const reduced = prev.map((it) => (it.id === item.id ? { ...it, qty: Math.max(0, Number(it.qty) - amount) } : it));
        if (cleanOffcuts.length === 0) return reduced;
        // One line per distinct length, carrying its own count — three 2m
        // pieces belong together, but 2m and 3.5m pieces do not.
        return [
          ...reduced,
          ...cleanOffcuts.map((o) => ({ ...item, id: uid(), qty: o.qty, length: o.length, stockType: "offcut", low: 0 })),
        ];
      });
      setUsageLog((prev) => [
        ...prev,
        {
          id: uid(),
          itemId: item.id,
          itemName: item.name,
          mainCat: item.mainCat,
          qty: amount,
          direction: "use",
          by: roleLabel,
          jobNumber: allocation.job_number || "",
          customer: "",
          note: `Allocated to ${allocation.process_name}`,
          lineCost: resolveUsageLineCost(item, amount),
          timestamp: new Date().toISOString(),
        },
      ]);
      fetchAllocations();
      if (jobDetail) refreshJobDetail();
    } catch (err) {
      console.error("Failed to use allocation:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  async function releaseAllocation(allocation) {
    if (!window.confirm(`Release ${allocation.qty_allocated} × ${allocation.item_name} back from ${allocation.process_name}?`)) return;
    try {
      const { error } = await supabase.from("job_allocations").update({ status: "released" }).eq("id", allocation.id);
      if (error) throw error;
      refreshJobDetail();
      fetchAllocations();
    } catch (err) {
      console.error("Failed to release allocation:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  function closeJobDetail() {
    setJobDetail(null);
    setJobDetailTab("overview");
  }

  async function refreshJobDetail() {
    if (!jobDetail) return;
    // Re-fetch the job's own row too, not just its sub-collections — the
    // job object passed to openJobDetail was otherwise stale, so a status
    // change (e.g. marking Complete) updated the database correctly but
    // never actually showed up on screen until the modal was reopened.
    try {
      const { data: freshJob, error } = await supabase.from("jobs").select("*").eq("id", jobDetail.job.id).single();
      if (error) throw error;
      await openJobDetail(freshJob || jobDetail.job);
    } catch (err) {
      console.error("Failed to refresh job:", err);
      await openJobDetail(jobDetail.job);
    }
  }

  // A process is only actionable once every process before it (by
  // sort_order, on the same job) is marked complete — work moves through
  // one stage at a time, not all open at once. sort_order comes from the
  // factory flow set in Stock Manager, so this gating follows the real
  // shop sequence. Jobs created before that existed keep the order they
  // were built with, which was whatever order the boxes were ticked in.
  // Where a stage sits in the factory flow. Worked out from the Stock
  // Manager list every time rather than read from the sort_order stored on
  // the row, so the sequence on a job can never drift from the list: change
  // the flow and every job follows it immediately, however old the job is
  // and whatever order its stages were ticked in.
  //
  // A stage no longer in the list ranks last rather than first, and keeps
  // its stored order relative to others like it.
  function flowRank(processName) {
    const i = (master?.jobProcessTypes || []).indexOf(processName);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  }

  // Job stages in factory-flow order. Stable, so two stages of the same
  // name keep their relative position.
  //
  // A finished job is left in the order it was stored in. What happened on
  // a job that is already done is a record, not a plan: reshuffling it to
  // match a flow set afterwards would rewrite history, and it is why a
  // completed job's checklist appeared to scramble itself.
  function isFrozenJob(job) {
    return job?.status === "complete" || job?.status === "invoiced" || job?.status === "cancelled";
  }

  function inFlowOrder(processes, job) {
    const frozen = isFrozenJob(job);
    return (processes || [])
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        if (!frozen) {
          const r = flowRank(a.p.process_name) - flowRank(b.p.process_name);
          if (r !== 0) return r;
        }
        return Number(a.p.sort_order) - Number(b.p.sort_order) || a.i - b.i;
      })
      .map(({ p }) => p);
  }

  // ---------- Laser 4kw: SigmaNest programs ----------

  // Jobs come from jobsList, which is already loaded for everyone as soon
  // as they sign in, so this only fetches what is specific to the tab.
  async function fetchLaserData() {
    if (!supabase) return;
    try {
      const [programs, links, processes] = await Promise.all([
        fetchAllRows("laser_programs", { orderBy: "created_at", ascending: false }),
        fetchAllRows("laser_program_jobs", { orderBy: "created_at" }),
        fetchAllRows("job_processes", { select: "id, job_id, process_name, is_complete, shortage_id" }),
      ]);
      setLaserData({ programs: programs || [], links: links || [], processes: processes || [] });
    } catch (err) {
      console.error("Failed to load laser programs:", err);
      setLaserData({ programs: [], links: [], processes: [] });
    }
  }

  // Shapes the raw rows into what the screen needs. Cancelled programs
  // drop out here rather than being deleted, so one that was already cut
  // still exists in the history.
  function laserNestingData() {
    const d = laserData || { programs: [], links: [], processes: [] };
    const jobs = jobsList || [];
    const activeJobs = jobs.filter((j) => j.status === "in_progress");
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    const linksByProgram = {};
    for (const l of d.links) {
      if (!linksByProgram[l.program_id]) linksByProgram[l.program_id] = [];
      linksByProgram[l.program_id].push({ ...l, job_number: jobById.get(l.job_id)?.job_number || "" });
    }

    const programs = d.programs
      .filter((p) => !p.is_cancelled)
      .map((p) => ({ ...p, jobs: linksByProgram[p.id] || [] }));

    const programsByJob = {};
    for (const p of programs) {
      for (const l of p.jobs) {
        if (!programsByJob[l.job_id]) programsByJob[l.job_id] = [];
        programsByJob[l.job_id].push(p);
      }
    }

    // A job is waiting to be nested while its own nesting stage is still
    // open. Matched on the name the way shortages are routed, so a shop
    // calling it "Nesting" or "Plate Nesting" both work. Catch-up stages
    // belonging to a shortage are skipped -- those arrive in step 5.
    const jobsToNest = [];
    for (const job of activeJobs) {
      const process = d.processes.find(
        (pr) =>
          pr.job_id === job.id &&
          !pr.shortage_id &&
          isNestingProcess(pr.process_name) &&
          !pr.is_complete
      );
      if (process) jobsToNest.push({ job, process, onPrograms: programsByJob[job.id] || [] });
    }
    jobsToNest.sort(
      (a, b) => new Date(a.job.due_date || "2999-01-01") - new Date(b.job.due_date || "2999-01-01")
    );

    return { jobsToNest, programs, allJobs: activeJobs };
  }

  // The history is worth having but never worth blocking a change for: a
  // missing line in the log beats a program that would not save.
  async function logProgramEvent(programId, action, detail) {
    try {
      await supabase.from("laser_program_events").insert({
        program_id: programId,
        action,
        detail: detail || "",
        acted_by: roleLabel,
        acted_by_id: currentUser?.id || null,
      });
    } catch (err) {
      console.error("Failed to record program history:", err);
    }
  }

  async function createLaserProgram({ program_number, material, machine, jobs }) {
    if (!supabase) return false;
    try {
      const { data, error } = await supabase
        .from("laser_programs")
        .insert({ program_number, material, machine, created_by: roleLabel })
        .select("id")
        .single();
      if (error) throw error;
      if (jobs.length) {
        const { error: linkError } = await supabase.from("laser_program_jobs").insert(
          jobs.map((j) => ({
            program_id: data.id,
            job_id: j.job_id,
            sigmanest_number: j.sigmanest_number,
            created_by: roleLabel,
          }))
        );
        if (linkError) throw linkError;
      }
      await logProgramEvent(data.id, "created", material + " - " + jobs.length + " job(s)");
      await fetchLaserData();
      return true;
    } catch (err) {
      console.error("Failed to create laser program:", err);
      alert(
        err?.code === "23505"
          ? "Program " + program_number + " already exists and has not been cancelled. Use a different number, or cancel the old one first."
          : "That didn't save — check your connection and try again."
      );
      return false;
    }
  }

  async function updateLaserProgram(program, fields) {
    try {
      const { error } = await supabase.from("laser_programs").update(fields).eq("id", program.id);
      if (error) throw error;
      const what = Object.entries(fields).map(([k, v]) => k + " -> " + v).join(", ");
      await logProgramEvent(program.id, "edited", what);
      flashSaved("program-" + program.id);
      await fetchLaserData();
    } catch (err) {
      console.error("Failed to update laser program:", err);
      alert(err?.code === "23505" ? "Another live program already has that number." : "That didn't save — check your connection and try again.");
      await fetchLaserData();
    }
  }

  async function cancelLaserProgram(program) {
    const ok = window.confirm(
      "Cancel program " + program.program_number + "? It stays on record with its history, but comes off the cut list."
    );
    if (!ok) return;
    try {
      const { error } = await supabase
        .from("laser_programs")
        .update({ is_cancelled: true, cancelled_by: roleLabel, cancelled_at: new Date().toISOString() })
        .eq("id", program.id);
      if (error) throw error;
      await logProgramEvent(program.id, "cancelled", program.program_number);
      await fetchLaserData();
    } catch (err) {
      console.error("Failed to cancel laser program:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  async function addJobToLaserProgram(program, job) {
    try {
      const { error } = await supabase.from("laser_program_jobs").insert({
        program_id: program.id,
        job_id: job.id,
        sigmanest_number: job.laser_job_reference || "",
        created_by: roleLabel,
      });
      if (error) throw error;
      await logProgramEvent(program.id, "job added", job.job_number);
      await fetchLaserData();
    } catch (err) {
      console.error("Failed to add job to laser program:", err);
      alert(
        err?.code === "23505" ? job.job_number + " is already on this program." : "That didn't save — check your connection and try again."
      );
    }
  }

  async function removeJobFromLaserProgram(program, link) {
    try {
      const { error } = await supabase.from("laser_program_jobs").delete().eq("id", link.id);
      if (error) throw error;
      await logProgramEvent(program.id, "job removed", link.job_number || link.sigmanest_number);
      await fetchLaserData();
    } catch (err) {
      console.error("Failed to remove job from laser program:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  // Ticked when there are no more programs coming for that job. Without
  // it the app cannot tell a job with parts still to nest apart from one
  // that is finished, so the laser stage would complete too early.
  async function markJobFullyNested(job, process) {
    try {
      const { error } = await supabase
        .from("job_processes")
        .update({ is_complete: true, completed_by: roleLabel, completed_at: new Date().toISOString() })
        .eq("id", process.id);
      if (error) throw error;
      flashSaved("nesting-" + process.id);
      await fetchLaserData();
      if (productionQueue !== null) fetchProductionQueue();
    } catch (err) {
      console.error("Failed to mark nesting complete:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  function isProcessActionable(process, jobProcesses) {
    // A shortage's catch-up stages are their own sequence, running
    // alongside the job rather than inside it. Comparing the two would
    // hold the re-cut behind stages the original job has already passed,
    // and would hold the job behind the re-cut — neither is true.
    const sameRun = (p) => (p.shortage_id || null) === (process.shortage_id || null);
    // Compared by the factory flow, not the order stored on the row, so a
    // change to the flow gates every job by it straight away — including
    // jobs already on the floor.
    const mine = flowRank(process.process_name);
    return jobProcesses
      .filter(sameRun)
      .filter((p) => flowRank(p.process_name) < mine)
      .every((p) => p.is_complete);
  }

  // How much of ONE item may pass through this stage right now.
  //
  // A stage that tracks per item hands its work forward piece by piece,
  // so an item that has been nested can go to the laser while the rest of
  // the job is still on the nester. Big jobs get walked through part by
  // part instead of waiting for the whole lot at every stage.
  //
  // What it may not do is get ahead of itself: the cap is what the stages
  // before have actually finished for that same item, so five cannot be
  // cut when only two have been nested.
  //
  // A batch stage carries no per-item information -- it only knows done or
  // not done -- so it hands nothing forward until it is signed off as a
  // whole. Anything not switched to Each keeps behaving as it does today.
  function itemFlowLimit(process, jobProcesses, itemProgressForJob, quoteItem) {
    const sameRun = (p) => (p.shortage_id || null) === (process.shortage_id || null);
    const mine = flowRank(process.process_name);
    let allowed = Number(quoteItem.qty) || 0;
    let waitingOn = null;
    for (const p of jobProcesses || []) {
      if (!sameRun(p) || p.is_complete) continue;
      if (flowRank(p.process_name) >= mine) continue;
      if ((p.tracking_mode || "batch") !== "each") {
        return { allowed: 0, waitingOn: p.process_name };
      }
      const row = (itemProgressForJob || []).find(
        (ip) => ip.job_process_id === p.id && ip.job_quote_item_id === quoteItem.id
      );
      const done = Number(row?.qty_complete) || 0;
      if (done < allowed) {
        allowed = done;
        waitingOn = p.process_name;
      }
    }
    return { allowed: Math.max(allowed, 0), waitingOn };
  }

  // The floor-facing queue: for someone with specific process-type access,
  // this is every job currently sitting at a stage that's actually theirs
  // to work on right now — not the whole job, not stages still waiting on
  // something earlier in the sequence.
  async function fetchGeneratedDocuments() {
    if (!supabase) return;
    try {
      const data = await fetchAllRows("generated_documents", { orderBy: "generated_at", ascending: false });
      setGeneratedDocuments(data || []);
    } catch (err) {
      console.error("Failed to load generated documents:", err);
      setGeneratedDocuments([]);
    }
  }

  async function fetchProductionQueue() {
    if (!supabase || !profile?.allowedProcessTypes?.length) return;
    setProductionLoading(true);
    try {
      const { data: activeJobs, error: jobsError } = await supabase
        .from("jobs")
        .select("*")
        .in("status", ["in_progress", "complete"]);
      if (jobsError) throw jobsError;
      const jobIds = (activeJobs || []).map((j) => j.id);
      if (jobIds.length === 0) {
        setProductionQueue({});
        setProductionLoading(false);
        return;
      }
      const [{ data: allProcesses, error: procError }, { data: allQuoteItems, error: qiError }, { data: allDocs, error: docError }, shortageResult] = await Promise.all([
        supabase.from("job_processes").select("*").in("job_id", jobIds).order("sort_order"),
        supabase.from("job_quote_items").select("*").in("job_id", jobIds),
        supabase.from("job_documents").select("*").in("job_id", jobIds).not("process_name", "is", null),
        // Fetched here rather than read from shortagesList so the queue
        // never depends on that having loaded first.
        supabase.from("shortages").select("*").in("job_id", jobIds),
      ]);
      if (procError) throw procError;
      if (qiError) throw qiError;
      if (docError) throw docError;
      // Not fatal: without it the catch-up stages simply lose their
      // shortage label, which is far better than no queue at all.
      if (shortageResult.error) console.error("Failed to load shortages for the queue:", shortageResult.error);
      const queueShortages = shortageResult.data || [];

      // Each-mode progress is tracked per item, not lumped into one
      // combined count — needs the process ids from the fetch above
      // before it can be filtered, so it can't join the Promise.all.
      const processIds = (allProcesses || []).map((p) => p.id);
      let allItemProgress = [];
      if (processIds.length > 0) {
        const { data: progressData, error: progressError } = await supabase
          .from("job_process_item_progress")
          .select("*")
          .in("job_process_id", processIds);
        if (progressError) throw progressError;
        allItemProgress = progressData || [];
      }

      // Grouped by process type, one "pill box" per type the person has
      // access to — every job with that process still outstanding shows
      // up, not just the ones ready right now, so a department can see
      // its whole upcoming workload, not only this instant's queue.
      // Built by walking the Job Process Types list and keeping the ones
      // this person handles — not by walking their permissions and trying
      // to sort them afterwards.
      //
      // Sorting after the fact only works while every name in someone's
      // access still exists in the list. A name left behind by a rename
      // matches nothing, so it cannot be placed in the order; several of
      // them tie and the whole list falls back to the order the
      // permissions happened to be ticked in. Taking the order from the
      // list itself cannot fail that way: the sequence is the list's, and
      // a stale permission simply produces no department, which is the
      // truth — that department no longer exists.
      const byProcessType = {};
      for (const procType of master?.jobProcessTypes || []) {
        if (profile.allowedProcessTypes.includes(procType)) byProcessType[procType] = [];
      }

      for (const job of activeJobs) {
        const jobProcesses = (allProcesses || []).filter((p) => p.job_id === job.id);
        const jobQuoteItems = (allQuoteItems || []).filter((it) => it.job_id === job.id);
        for (const p of jobProcesses) {
          if (p.is_complete || !byProcessType[p.process_name]) continue;
          byProcessType[p.process_name].push({
            job,
            process: p,
            isReady: isProcessActionable(p, jobProcesses),
            quoteItems: jobQuoteItems,
            documents: (allDocs || []).filter((d) => d.job_id === job.id && d.process_name === p.process_name),
            itemProgress: allItemProgress.filter((ip) => ip.job_process_id === p.id),
            // The whole job's stages and per-item progress, so each item's
            // row can work out how far that one item has already got.
            jobProcesses,
            jobItemProgress: allItemProgress.filter((ip) =>
              jobProcesses.some((jp) => jp.id === ip.job_process_id)
            ),
            // Set only on catch-up stages, so the queue can say this is a
            // replacement for something missing rather than new work.
            shortage: p.shortage_id ? queueShortages.find((s) => s.id === p.shortage_id) || null : null,
          });
        }
      }
      // Within each department: urgent first, then ready-before-waiting,
      // then oldest due date first.
      for (const procType of Object.keys(byProcessType)) {
        byProcessType[procType].sort((a, b) => {
          if (a.process.is_urgent !== b.process.is_urgent) return a.process.is_urgent ? -1 : 1;
          // A priority shortage is a customer already waiting on something
          // that should have been finished, so it outranks new work.
          const aShort = a.shortage && a.shortage.is_priority !== false ? 1 : 0;
          const bShort = b.shortage && b.shortage.is_priority !== false ? 1 : 0;
          if (aShort !== bShort) return bShort - aShort;
          if (a.isReady !== b.isReady) return a.isReady ? -1 : 1;
          return new Date(a.job.due_date || "2999-01-01") - new Date(b.job.due_date || "2999-01-01");
        });
      }
      setProductionQueue(byProcessType);
    } catch (err) {
      console.error("Failed to load production queue:", err);
      setProductionQueue({});
    }
    setProductionLoading(false);
  }

  async function toggleProcessUrgent(process) {
    try {
      const { error } = await supabase.from("job_processes").update({ is_urgent: !process.is_urgent }).eq("id", process.id);
      if (error) throw error;
      fetchProductionQueue();
    } catch (err) {
      console.error("Failed to update priority:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  async function saveProcessNote(process, notes) {
    try {
      const { error } = await supabase.from("job_processes").update({ notes }).eq("id", process.id);
      if (error) throw error;
      fetchProductionQueue();
    } catch (err) {
      console.error("Failed to save note:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  // Writes straight to the job's own laser_job_reference column — the same
  // field New Job / Job Detail read and write — so filling this in from
  // Production shows up there automatically, with nothing to keep in sync.
  async function saveJobSigmaNestNumber(job, value) {
    try {
      const { error } = await supabase.from("jobs").update({ laser_job_reference: value }).eq("id", job.id);
      if (error) throw error;
      fetchProductionQueue();
      if (jobDetail?.job.id === job.id) refreshJobDetail();
    } catch (err) {
      console.error("Failed to save SigmaNest number:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  // Real, independent shortage tracking — not a flag on the process that
  // was already completed. A shortage always means the same thing now:
  // something needs to be re-cut on the laser. It can be flagged from any
  // department (packing finds one missing, welding finds one damaged),
  // then runs through two people in sequence — Nesting sets it up, the
  // Laser Operator actually cuts it — before whoever originally flagged it
  // gets told it's ready.
  // isPriority starts true: a shortage means something already promised is
  // missing, so the re-cut is holding up work that was otherwise done.
  // Priority is the normal case here, not the exception.
  // A photo of the missing or damaged part, taken on the spot. Worth more
  // than any description a packer can type in a hurry — nesting can see
  // what they are actually re-cutting.
  //
  // Stored in the existing job-documents bucket, under the job, but
  // deliberately not recorded in job_documents: it belongs to a line on a
  // shortage, not to the job's paperwork, and listing it there would put
  // snapshots of broken parts among the drawings and quotes.
  async function uploadShortagePhoto(jobId, file, onDone) {
    if (!supabase) return;
    try {
      const safeName = (file.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${jobId}/shortages/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("job-documents").upload(path, file);
      if (error) throw error;
      onDone(path);
    } catch (err) {
      console.error("Failed to upload shortage photo:", err);
      alert("Couldn't upload that photo — check your connection and try again.");
    }
  }

  async function viewShortagePhoto(path, name) {
    try {
      const { data, error } = await supabase.storage.from("job-documents").createSignedUrl(path, 3600);
      if (error) throw error;
      setPreviewItem({ id: path, attachmentType: "image", attachmentName: name || "Shortage photo" });
      setPreviewData(data.signedUrl);
      setPreviewLoading(false);
    } catch (err) {
      console.error("Failed to open shortage photo:", err);
      alert("Couldn't open that photo — it may have been removed.");
    }
  }

  function openShortageFlagModal(job, process) {
    setShortageModal({
      job,
      process,
      // Prefilled from the job when nesting has already recorded it, since
      // that is the number the nesting operator needs and retyping it is
      // just a chance to get it wrong. Still editable — a shortage can
      // come off a different nest from the one on the job.
      boardNumber: job.laser_job_reference || "",
      // One line per missing part. Several parts short off the same nest
      // is one shortage to be re-cut together, not several.
      lines: [{ description: "", qty: "", photo: "", photoName: "" }],
      reason: "short",
      isPriority: true,
      priorityNote: "",
    });
  }

  async function submitNewShortage() {
    const { job, process, boardNumber, lines, reason, isPriority, priorityNote } = shortageModal;
    // Blank rows are ignored rather than rejected — someone adding a line
    // and changing their mind should not have to remove it again.
    const items = (lines || [])
      .map((l) => ({
        description: (l.description || "").trim(),
        qty: Number(l.qty) || 0,
        ...(l.photo ? { photo: l.photo, photoName: l.photoName || "" } : {}),
      }))
      .filter((l) => l.description && l.qty > 0);
    if (items.length === 0) return;
    // description and qty carry the first line, so anything reading the
    // shortage the old way still shows something sensible.
    const description = items[0].description;
    const qty = items[0].qty;
    try {
      // A direct, fresh lookup rather than relying on productionQueue,
      // which only ever holds the process types the person flagging this
      // is themselves allowed to see — a Packer flagging a shortage may
      // have no Nesting entries loaded there at all.
      const { data: nestingRows } = await supabase.from("job_processes").select("assigned_to").eq("job_id", job.id).ilike("process_name", "%nest%").limit(1);
      const nestingAssignedTo = nestingRows?.[0]?.assigned_to || null;

      const { error } = await supabase.from("shortages").insert({
        id: uid(),
        job_id: job.id,
        job_number: job.job_number,
        customer: job.customer || "",
        flagged_by: roleLabel,
        flagged_by_id: currentUser?.id || null,
        flagged_department: process.process_name,
        board_number: boardNumber.trim(),
        items,
        description: description.trim(),
        qty: Number(qty),
        reason,
        status: "flagged",
        is_priority: !!isPriority,
        priority_note: (priorityNote || "").trim(),
      });
      if (error) throw error;

      // The designated handler(s) always get told, plus whoever's actually
      // assigned to Nesting on this specific job right now, if that's a
      // different person — covers both "the person who always deals with
      // this" and "the person actually doing the work today."
      const handlerIds = (people || []).filter((p) => p.isShortageHandler).map((p) => p.id);
      const recipientIds = new Set(handlerIds);
      if (nestingAssignedTo) recipientIds.add(nestingAssignedTo);
      if (recipientIds.size) {
        await supabase.from("job_notifications").insert(
          [...recipientIds].map((recipientId) => ({
            job_id: job.id,
            job_number: job.job_number,
            recipient_id: recipientId,
            message: `Shortage flagged on ${job.job_number} (${job.customer || "no customer"}) by ${roleLabel}: ${items
              .map((i) => `${i.description} × ${i.qty}`)
              .join(", ")}`,
          }))
        );
      }
      setShortageModal(null);
      fetchShortages();
    } catch (err) {
      console.error("Failed to flag shortage:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  // Nesting the shortage is also where the replacement gets its own run
  // through the shop. It has to catch up from the re-cut to wherever the
  // problem was found: a part a packer noticed missing needs cutting,
  // welding and painting again before it can be packed, but nothing
  // beyond that stage.
  //
  // The stages are job_processes rows carrying shortage_id, so they land
  // in the same queue the operators already watch, gate one after another
  // the same way, and can be assigned like any other work.
  async function markShortageNested(shortage) {
    try {
      const { data: jobStages, error: stagesError } = await supabase
        .from("job_processes")
        .select("*")
        .eq("job_id", shortage.job_id)
        .is("shortage_id", null)
        .order("sort_order");
      if (stagesError) throw stagesError;

      // Everything up to and including the stage that raised it. If that
      // stage can't be found — renamed or removed since — fall back to the
      // whole sequence rather than silently skipping the catch-up.
      // By the factory flow, like everything else, so the catch-up covers
      // the right stages even if the job's stored order predates a change
      // to that flow.
      const upTo = flowRank(shortage.flagged_department);
      const needed = inFlowOrder((jobStages || []).filter((p) => flowRank(p.process_name) <= upTo));

      const { data: already, error: existingError } = await supabase
        .from("job_processes")
        .select("id")
        .eq("shortage_id", shortage.id)
        .limit(1);
      if (existingError) throw existingError;

      // Re-nesting a shortage must not double the catch-up stages.
      if (needed.length > 0 && (already || []).length === 0) {
        const { error: insertError } = await supabase.from("job_processes").insert(
          needed.map((p, idx) => ({
            job_id: shortage.job_id,
            shortage_id: shortage.id,
            process_name: p.process_name,
            operator: p.operator || "",
            assigned_to: p.assigned_to || null,
            tracking_mode: "batch",
            sort_order: idx,
          }))
        );
        if (insertError) throw insertError;
      }

      const { error } = await supabase
        .from("shortages")
        .update({ status: "nested", nested_by: roleLabel, nested_at: new Date().toISOString() })
        .eq("id", shortage.id);
      if (error) throw error;
      fetchShortages();
      if (productionQueue !== null) fetchProductionQueue();
    } catch (err) {
      console.error("Failed to update shortage:", err);
      alert(
        `That didn't save: ${err.message || "unknown error"}. If this mentions shortage_id, setup-shortage-rework.sql hasn't been run yet in Supabase.`
      );
    }
  }

  async function markShortageCut(shortage) {
    try {
      const { error } = await supabase
        .from("shortages")
        .update({ status: "cut", cut_by: roleLabel, cut_at: new Date().toISOString() })
        .eq("id", shortage.id);
      if (error) throw error;
      // Fully resolved — no one needs to go close this out separately.
      // The one person still waiting is whoever originally flagged it.
      if (shortage.flagged_by_id) {
        await supabase.from("job_notifications").insert({
          job_id: shortage.job_id,
          job_number: shortage.job_number,
          recipient_id: shortage.flagged_by_id,
          message: `Shortage cut and ready — ${shortageSummary(shortage)} for ${shortage.job_number} (${shortage.customer || "no customer"})`,
        });
      }
      fetchShortages();
    } catch (err) {
      console.error("Failed to update shortage:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  // "Each"-tracked processes complete themselves once the running count
  // reaches the job's total quantity — no separate manual complete step.
  // Each item on the job is tracked separately — logging progress against
  // one item never touches another's count, matching how the process
  // sheet lists them individually rather than as one lumped total.
  async function submitProcessItemProgress(process, job, quoteItem, qtyAdded, existingProgress, allQuoteItems, allProgressForProcess) {
    if (!qtyAdded || qtyAdded <= 0) return;
    const currentDone = Number(existingProgress?.qty_complete) || 0;
    const newDone = Math.min(currentDone + qtyAdded, Number(quoteItem.qty) || 0);
    try {
      const { error } = await supabase
        .from("job_process_item_progress")
        .upsert(
          { job_process_id: process.id, job_quote_item_id: quoteItem.id, qty_complete: newDone, updated_at: new Date().toISOString() },
          { onConflict: "job_process_id,job_quote_item_id" }
        );
      if (error) throw error;

      // Whole process only completes once every item on the job has
      // individually reached its own quantity.
      const updatedProgress = [
        ...allProgressForProcess.filter((p) => p.job_quote_item_id !== quoteItem.id),
        { job_quote_item_id: quoteItem.id, qty_complete: newDone },
      ];
      const allItemsDone = allQuoteItems.every((it) => {
        const p = updatedProgress.find((up) => up.job_quote_item_id === it.id);
        return (Number(p?.qty_complete) || 0) >= (Number(it.qty) || 0);
      });

      if (allItemsDone) {
        const { error: procError } = await supabase
          .from("job_processes")
          .update({ is_complete: true, completed_by: roleLabel, completed_at: new Date().toISOString() })
          .eq("id", process.id);
        if (procError) throw procError;
        if (job.sales_rep) {
          await supabase.from("job_notifications").insert({
            job_id: job.id,
            job_number: job.job_number,
            sales_rep: job.sales_rep,
            message: `${process.process_name} marked complete by ${roleLabel} on ${job.job_number} (${job.customer || "no customer"})`,
          });
        }
      }
      if (jobDetail?.job.id === job.id) refreshJobDetail();
      if (productionQueue !== null) fetchProductionQueue();
    } catch (err) {
      console.error("Failed to log progress:", err);
      alert("Couldn't save that — check your connection and try again.");
    }
  }

  function openEditProcessesModal(job, processes) {
    // The job's own stages only. A shortage's catch-up run is stored
    // against the same job, so including it would let this screen take
    // stages off a re-cut that is still working its way back.
    setEditProcessesModal({
      job,
      selected: new Set(processes.filter((p) => !p.shortage_id).map((p) => p.process_name)),
    });
  }

  function toggleEditProcessesSelection(name) {
    setEditProcessesModal((m) => {
      if (!m) return m;
      const next = new Set(m.selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...m, selected: next };
    });
  }

  async function saveEditProcesses() {
    const { job, selected } = editProcessesModal;
    // Same reason as opening it: a shortage's catch-up run belongs to the
    // shortage, not to this screen, and must not be added to or removed
    // from here.
    const existing = (jobDetail?.processes || []).filter((p) => !p.shortage_id);
    const existingNames = new Set(existing.map((p) => p.process_name));
    const toAdd = [...selected].filter((name) => !existingNames.has(name));
    // Removals are confirmed rather than checked: an Each-mode process
    // with partial progress logged doesn't show that here reliably, since
    // its progress lives in a separate per-item table this editor doesn't
    // load. A confirmation covers that gap honestly instead of guessing at
    // a check that could miss it.
    //
    // Completed stages are only reachable here by an admin, and losing a
    // completion is worth saying out loud rather than folding into the
    // general warning.
    const toRemove = existing.filter((p) => !selected.has(p.process_name));
    if (toRemove.length > 0) {
      const names = toRemove.map((p) => p.process_name).join(", ");
      const completed = toRemove.filter((p) => p.is_complete).map((p) => p.process_name);
      const warning = completed.length
        ? `\n\nAlready completed, and that record will be lost: ${completed.join(", ")}.`
        : "";
      if (
        !window.confirm(
          `Remove ${names} from this job? Any notes, urgent flag, or logged progress on it will be lost.${warning}`
        )
      ) {
        return;
      }
    }
    try {
      if (toAdd.length > 0) {
        const maxSort = existing.reduce((max, p) => Math.max(max, p.sort_order ?? 0), -1);
        const newRows = toAdd.map((name, idx) => ({
          job_id: job.id,
          process_name: name,
          operator: "",
          tracking_mode: "batch",
          sort_order: maxSort + 1 + idx,
        }));
        const { error: addError } = await supabase.from("job_processes").insert(newRows);
        if (addError) throw addError;
      }
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from("job_processes")
          .delete()
          .in("id", toRemove.map((p) => p.id));
        if (removeError) throw removeError;
      }
      setEditProcessesModal(null);
      refreshJobDetail();
      if (productionQueue !== null) fetchProductionQueue();
    } catch (err) {
      console.error("Failed to update processes:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  async function toggleJobProcessComplete(process, job) {
    if (!supabase || !job) return;
    const nowComplete = !process.is_complete;

    // A finished stage with material still set aside for it leaves that
    // stock reserved with nothing left to consume it — invisible from the
    // job, since the stage has gone from the queue, but still held against
    // everyone else on the stock screens. Ask before that happens.
    if (nowComplete) {
      const stranded = (allocationsList || []).filter(
        (a) => a.process_id === process.id && a.status !== "released" && Number(a.qty_allocated) - Number(a.qty_used) > 0
      );
      if (stranded.length > 0) {
        const detail = stranded
          .map((a) => `  • ${a.item_name}: ${Number(a.qty_allocated) - Number(a.qty_used)} still reserved`)
          .join("\n");
        const proceed = window.confirm(
          `${process.process_name} still has material set aside for it:\n\n${detail}\n\n` +
            `Marking it complete leaves that stock reserved and unavailable to anyone else. ` +
            `Use it or release it first if you can.\n\nMark complete anyway?`
        );
        if (!proceed) return;
      }
    }

    try {
      const { error } = await supabase
        .from("job_processes")
        .update({
          is_complete: nowComplete,
          completed_by: nowComplete ? roleLabel : null,
          completed_at: nowComplete ? new Date().toISOString() : null,
        })
        .eq("id", process.id);
      if (error) throw error;

      // A shortage is only genuinely resolved once its replacement has
      // been through every catch-up stage — not when it comes off the
      // laser. Closing it here means the trail ends where the work does.
      if (process.shortage_id) {
        const { data: runStages, error: runError } = await supabase
          .from("job_processes")
          .select("is_complete")
          .eq("shortage_id", process.shortage_id);
        if (runError) throw runError;
        const allDone = (runStages || []).length > 0 && runStages.every((p) => p.is_complete);
        await supabase
          .from("shortages")
          .update(
            allDone
              ? { status: "cut", cut_by: roleLabel, cut_at: new Date().toISOString() }
              : { status: "nested", cut_by: "", cut_at: "" }
          )
          .eq("id", process.shortage_id);
        fetchShortages();
      }

      // Notify whoever's running this job the moment a process wraps up —
      // never on un-ticking, that's just a correction, not progress.
      if (nowComplete && job.sales_rep) {
        await supabase.from("job_notifications").insert({
          job_id: job.id,
          job_number: job.job_number,
          sales_rep: job.sales_rep,
          message: `${process.process_name} marked complete by ${roleLabel} on ${job.job_number} (${job.customer || "no customer"})`,
        });
      }
      // Refresh whichever view(s) are actually active — this can be
      // called from Job Detail, the Production queue, or both.
      if (jobDetail?.job.id === job.id) refreshJobDetail();
      if (productionQueue !== null) fetchProductionQueue();
    } catch (err) {
      console.error("Failed to update process:", err);
      alert("Couldn't update that — check your connection and try again.");
    }
  }

  async function updateJobProcessField(process, field, value) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from("job_processes").update({ [field]: value }).eq("id", process.id);
      if (error) throw error;
      flashSaved(`process-${process.id}`);
      // The controls here are driven by what's in state, so without this
      // the save landed in the database and the control snapped straight
      // back to its old value — indistinguishable from the change being
      // rejected. Tracking mode also changes how the floor records the
      // work, so the queue has to hear about it too.
      refreshJobDetail();
      if (productionQueue !== null) fetchProductionQueue();
    } catch (err) {
      console.error("Failed to update process field:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  // Sets both the real person link and the plain operator text alongside
  // it, same as job creation — and fires a real notification, but only
  // when the assignment actually changes to a genuinely different person,
  // not on every unrelated save of this process.
  async function updateJobProcessAssignee(process, job, personId) {
    if (!supabase) return;
    const person = (people || []).find((p) => p.id === personId);
    try {
      const { error } = await supabase
        .from("job_processes")
        .update({ assigned_to: personId || null, operator: person?.name || "" })
        .eq("id", process.id);
      if (error) throw error;
      flashSaved(`process-${process.id}`);
      if (personId && personId !== process.assigned_to) {
        await supabase.from("job_notifications").insert({
          job_id: job.id,
          job_number: job.job_number,
          recipient_id: personId,
          message: `You've been assigned to ${process.process_name} on ${job.job_number} (${job.customer || "no customer"})`,
        });
      }
      refreshJobDetail();
      // Who a stage is assigned to decides whose queue it appears in, so
      // the queue is now wrong until it is refetched. Without this the
      // change saved but nothing moved on screen, which reads as the
      // assignment not having worked.
      if (productionQueue !== null) fetchProductionQueue();
    } catch (err) {
      console.error("Failed to update assignee:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  function setInvoiceQty(itemId, value) {
    setInvoiceQtyInputs((prev) => ({ ...prev, [itemId]: value }));
  }

  // Replaces the old one-item-at-a-time "Add to Invoice" prompt — type a
  // quantity on whichever items are ready, submit once, get one
  // consolidated draft
  // covering everything ticked rather than a separate document per click.
  // Shared by both the tick-box submission and "Invoice Now" — updates
  // each item, logs it, then generates and stores one consolidated
  // document covering whatever was passed in.
  // Takes { item, qty } pairs — qty is whatever was actually typed in,
  // which may be less than the full remaining amount, not always "invoice
  // everything left on this line".
  async function submitItemsToInvoice(job, itemsWithQty) {
    const lines = [];
    for (const { item: it, qty } of itemsWithQty) {
      const newTotal = Number(it.qty_invoiced) + qty;
      // Submitting only ever means "requested" — it never becomes actually
      // "invoiced" until accounts marks the whole job invoiced with a real
      // invoice number. Those are two genuinely different states.
      const { error: updateError } = await supabase
        .from("job_quote_items")
        .update({ qty_invoiced: newTotal, item_status: "invoice_requested" })
        .eq("id", it.id);
      if (updateError) throw updateError;
      const { error: logError } = await supabase.from("job_quote_item_invoices").insert({
        quote_item_id: it.id,
        job_id: it.job_id,
        qty_added: qty,
        invoiced_by: roleLabel,
      });
      if (logError) throw logError;
      lines.push({ description: it.description, qty, unitPrice: Number(it.unit_price) });
    }
    if (job.sales_rep) {
      await supabase.from("job_notifications").insert({
        job_id: job.id,
        job_number: job.job_number,
        sales_rep: job.sales_rep,
        message: `${lines.length} item(s) submitted to invoice on ${job.job_number} (${job.customer || "no customer"}) by ${roleLabel}`,
      });
    }
    // Stored as a real document accounts can open when ready — never
    // downloaded automatically. Visible from both the job itself and
    // the Invoicing tab, since accounts works from there.
    const doc = buildDraftInvoiceDoc(job, lines);
    const totalAmount = lines.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
    const fileName = `Invoice-Request-${job.job_number}-${Date.now()}.pdf`;
    const path = `${job.id}/${fileName}`;
    const stored = await generateAndStoreDocument({
      doc,
      documentType: "invoice_request",
      bucket: "job-invoices",
      path,
      fileName,
      jobId: job.id,
      showPreview: false,
    });
    if (!stored) return;
    const { error: reqError } = await supabase.from("job_invoice_requests").insert({
      job_id: job.id,
      storage_path: path,
      file_name: fileName,
      total_amount: totalAmount,
      submitted_by: roleLabel,
    });
    if (reqError) throw reqError;
  }

  function submitInvoiceForEnteredQuantities(job, quoteItems) {
    const itemsWithQty = [];
    for (const it of quoteItems) {
      const raw = invoiceQtyInputs[it.id];
      const qty = Number(raw);
      if (!raw || !qty || qty <= 0) continue;
      const remaining = Number(it.qty) - Number(it.qty_invoiced);
      if (qty > remaining) {
        alert(`${it.description}: entered ${qty}, but only ${remaining} remains — fix that before submitting.`);
        return;
      }
      itemsWithQty.push({ item: it, qty });
    }
    if (itemsWithQty.length === 0) {
      alert("Enter a quantity on at least one item first.");
      return;
    }
    return itemsWithQty;
  }

  async function submitSelectedItemsToInvoice(job, quoteItems) {
    const itemsWithQty = submitInvoiceForEnteredQuantities(job, quoteItems);
    if (!itemsWithQty) return;
    try {
      await submitItemsToInvoice(job, itemsWithQty);
      setInvoiceQtyInputs({});
      refreshJobDetail();
      fetchJobs();
    } catch (err) {
      console.error("Failed to submit invoice:", err);
      alert("Couldn't submit that — check your connection and try again.");
    }
  }

  // Wraps the whole job up in one action: submits every remaining item
  // (skipping anything currently out with an external supplier, since
  // that physically can't be invoiced yet), generates the consolidated
  // document, then goes straight into the invoice-number popup so the
  // job can be fully closed out without a second trip through the UI.
  function openCopyJobModal(job) {
    setCopyJobModal({ job, dueDate: "" });
  }

  // Creates a fresh job from an existing one as a template — same
  // customer, description, references, materials, processes, and quoted
  // items — but everything starts clean: a new job number, no progress
  // ticked, no quantities invoiced yet.
  async function submitCopyJob() {
    const { job: source, dueDate } = copyJobModal;
    try {
      let jobNumber, newJob;
      let candidateNumber = master.nextJobNumber;
      for (let attempt = 0; attempt < 5; attempt++) {
        jobNumber = formatJobNumber(candidateNumber);
        const { data, error } = await supabase
          .from("jobs")
          .insert({
            job_number: jobNumber,
            customer: source.customer,
            status: "in_progress",
            sales_rep: roleLabel,
            qty: source.qty,
            due_date: dueDate || null,
            description: source.description,
            quoted_value: source.quoted_value,
            quote_reference: source.quote_reference,
            customer_po: source.customer_po,
            laser_job_reference: "",
            material_1_grade: source.material_1_grade,
            material_1_qty: source.material_1_qty,
            material_2_grade: source.material_2_grade,
            material_2_qty: source.material_2_qty,
            material_3_grade: source.material_3_grade,
            material_3_qty: source.material_3_qty,
            material_location: source.material_location,
            buy_out_notes: source.buy_out_notes,
            created_by: roleLabel,
          })
          .select()
          .single();
        if (!data && error?.code === "23505") {
          candidateNumber++;
          continue;
        }
        if (error) throw error;
        newJob = data;
        break;
      }
      if (!newJob) throw new Error("Couldn't find an available job number after several attempts.");
      setMaster((prev) => ({ ...prev, nextJobNumber: candidateNumber + 1 }));

      const [{ data: sourceProcesses }, { data: sourceQuoteItems }] = await Promise.all([
        supabase.from("job_processes").select("*").eq("job_id", source.id),
        supabase.from("job_quote_items").select("*").eq("job_id", source.id),
      ]);

      if (sourceProcesses?.length) {
        await supabase.from("job_processes").insert(
          sourceProcesses.map((p) => ({
            job_id: newJob.id,
            process_name: p.process_name,
            operator: p.operator,
            tracking_mode: p.tracking_mode || "batch",
            sort_order: p.sort_order,
          }))
        );
      }
      if (sourceQuoteItems?.length) {
        await supabase.from("job_quote_items").insert(
          sourceQuoteItems.map((it, idx) => ({
            job_id: newJob.id,
            description: it.description,
            qty: it.qty,
            unit_price: it.unit_price,
            linked_item_id: it.linked_item_id,
            sort_order: idx,
          }))
        );
      }

      setCopyJobModal(null);
      fetchJobs();
      openJobDetail(newJob);
    } catch (err) {
      console.error("Failed to copy job:", err);
      alert("Couldn't copy that job — check your connection and try again.");
    }
  }

  // Called from the Jobs list, where a job's quote items aren't already
  // loaded (only Job Detail fetches those) — pulls them fresh first.
  async function invoiceNowFromList(job) {
    try {
      const { data, error } = await supabase.from("job_quote_items").select("*").eq("job_id", job.id);
      if (error) throw error;
      await invoiceEntireJob(job, data || []);
    } catch (err) {
      console.error("Failed to load items for invoicing:", err);
      alert("Couldn't load this job's items — check your connection and try again.");
    }
  }

  async function invoiceEntireJob(job, quoteItems) {
    const eligibleItems = quoteItems
      .filter((it) => (it.item_status || "on_floor") !== "out_external" && Number(it.qty) - Number(it.qty_invoiced) > 0)
      .map((it) => ({ item: it, qty: Number(it.qty) - Number(it.qty_invoiced) }));
    if (eligibleItems.length === 0) {
      alert("Nothing left to invoice on this job — everything's either already invoiced or currently out with a supplier.");
      return;
    }
    const ok = window.confirm(`Invoice all ${eligibleItems.length} remaining item(s) on ${job.job_number} now?`);
    if (!ok) return;
    try {
      await submitItemsToInvoice(job, eligibleItems);
      setInvoiceQtyInputs({});
      fetchJobs();
      openMarkInvoicedModal(job);
    } catch (err) {
      console.error("Failed to invoice job:", err);
      alert("Couldn't submit that — check your connection and try again.");
    }
  }

  async function viewJobInvoiceRequest(request) {
    try {
      const { data, error } = await supabase.storage.from("job-invoices").createSignedUrl(request.storage_path, 3600);
      if (error) throw error;
      setPreviewItem({ attachmentType: "pdf", attachmentName: request.file_name || "Invoice request.pdf" });
      setPreviewData(data.signedUrl);
      setPreviewLoading(false);
    } catch (err) {
      console.error("Couldn't open invoice request:", err);
      alert("Couldn't open that document — check your connection and try again.");
    }
  }

  async function uploadJobDocument(jobId, file, processName, isQuoteFile) {
    if (!supabase) return;
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${jobId}/${Date.now()}-${safeName}`;
      const { error: upError } = await supabase.storage.from("job-documents").upload(path, file);
      if (upError) throw upError;
      const { error } = await supabase.from("job_documents").insert({
        job_id: jobId,
        file_name: file.name,
        storage_path: path,
        uploaded_by: roleLabel,
        process_name: processName || null,
        is_quote_file: !!isQuoteFile,
      });
      if (error) throw error;
      refreshJobDetail();
      if (productionQueue !== null) fetchProductionQueue();
    } catch (err) {
      console.error("Failed to upload document:", err);
      alert("Couldn't upload that file — check your connection and try again.");
    }
  }

  async function viewJobDocument(doc) {
    try {
      const { data, error } = await supabase.storage.from("job-documents").createSignedUrl(doc.storage_path, 3600);
      if (error) throw error;
      const lower = doc.file_name.toLowerCase();
      const isPdf = lower.endsWith(".pdf");
      setPreviewItem({ id: doc.id, attachmentType: isPdf ? "pdf" : "image", attachmentName: doc.file_name });
      setPreviewData(data.signedUrl);
      setPreviewLoading(false);
      if (!isPdf && !lower.match(/\.(png|jpe?g|gif|webp)$/)) {
        // Not something the preview modal can render (e.g. an .xlsm) —
        // just download it directly instead.
        window.open(data.signedUrl, "_blank");
        setPreviewItem(null);
      }
    } catch (err) {
      console.error("Couldn't open document:", err);
    }
  }

  async function deleteJobDocument(doc) {
    const ok = window.confirm(`Delete ${doc.file_name} permanently? This can't be undone.`);
    if (!ok) return;
    try {
      await supabase.storage.from("job-documents").remove([doc.storage_path]);
      const { error } = await supabase.from("job_documents").delete().eq("id", doc.id);
      if (error) throw error;
      refreshJobDetail();
    } catch (err) {
      console.error("Failed to delete document:", err);
      alert("Couldn't delete that file — check your connection and try again.");
    }
  }

  function openBatchDeliveryNoteModal(job, quoteItems) {
    const itemsWithQty = submitInvoiceForEnteredQuantities(job, quoteItems);
    if (!itemsWithQty) return;
    setDeliveryNoteBatchModal({ job, itemsWithQty, direction: "to_supplier", recipientName: "", notes: "" });
  }

  async function submitBatchDeliveryNote() {
    const m = deliveryNoteBatchModal;
    if (!m.recipientName.trim()) {
      alert("Pick or type who this is going to.");
      return;
    }
    try {
      const noteNumber = formatDeliveryNoteNumber(master.nextDeliveryNoteNumber);
      let recipientAddress = "";
      if (m.direction === "to_supplier") {
        const sup = master.suppliers.find((s) => s.name === m.recipientName);
        recipientAddress = sup?.address || "";
      }
      // One delivery_notes row per item (sharing the same note number) so
      // "check back in" still knows exactly which item each row is for —
      // the printed document below combines them into one delivery anyway.
      for (const { item: it, qty } of m.itemsWithQty) {
        const { error } = await supabase.from("delivery_notes").insert({
          delivery_note_number: noteNumber,
          job_id: m.job.id,
          quote_item_id: it.id,
          recipient_type: m.direction === "to_supplier" ? "supplier" : "customer",
          recipient_name: m.recipientName.trim(),
          recipient_address: recipientAddress,
          direction: m.direction,
          notes: m.notes.trim(),
          created_by: roleLabel,
        });
        if (error) throw error;
        if (m.direction === "to_supplier") {
          const { error: statusError } = await supabase.from("job_quote_items").update({ item_status: "out_external" }).eq("id", it.id);
          if (statusError) throw statusError;
        }
      }
      setMaster((prev) => ({ ...prev, nextDeliveryNoteNumber: (prev.nextDeliveryNoteNumber || 1) + 1 }));
      if (m.job.sales_rep) {
        await supabase.from("job_notifications").insert({
          job_id: m.job.id,
          job_number: m.job.job_number,
          sales_rep: m.job.sales_rep,
          message: `${m.itemsWithQty.length} item(s) sent out on ${noteNumber} to ${m.recipientName.trim()} on ${m.job.job_number} (${m.job.customer || "no customer"})`,
        });
      }
      await buildDeliveryNoteDoc(
        { delivery_note_number: noteNumber, direction: m.direction, recipient_name: m.recipientName.trim(), recipient_address: recipientAddress, created_at: new Date().toISOString() },
        m.itemsWithQty.map(({ item, qty }) => ({ description: item.description, qty })),
        m.job
      );
      setInvoiceQtyInputs({});
      setDeliveryNoteBatchModal(null);
      refreshJobDetail();
    } catch (err) {
      console.error("Failed to create delivery note:", err);
      alert("Couldn't create that delivery note — check your connection and try again.");
    }
  }

  // Shared by every PDF generator in the app — the same proportional-sizing
  // logic was independently copy-pasted into each one (with a bug slipping
  // into at least one of those copies over time). Draws the logo at (x, y)
  // scaled to fit within maxW × maxH without ever distorting it, and
  // returns the actual rendered size so the caller can lay out whatever
  // comes next around it. Does nothing if there's no logo or it fails to
  // load — never worth failing the whole document over.
  function addCompanyLogo(doc, company, x, y, maxW, maxH) {
    if (!company?.logo) return { width: 0, height: 0 };
    try {
      const imgProps = doc.getImageProperties(company.logo);
      let logoW = maxW;
      let logoH = (imgProps.height / imgProps.width) * logoW;
      if (logoH > maxH) {
        logoH = maxH;
        logoW = (imgProps.width / imgProps.height) * logoH;
      }
      doc.addImage(company.logo, "JPEG", x, y, logoW, logoH);
      return { width: logoW, height: logoH };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  // The one place every generated document gets uploaded, logged, and
  // (usually) previewed — every generator in the app calls this rather
  // than handling storage itself, so the upload/preview/fallback mechanics
  // only exist once and can't independently drift or break per document
  // type the way they did before. `relatedId` is whatever ties this back
  // to its own specific record — a delivery note number, a PO number —
  // for cross-referencing from the audit log; it's fine to leave blank for
  // something like a report that isn't tied to one specific record.
  async function generateAndStoreDocument({ doc, documentType, bucket, path, fileName, jobId, relatedId, showPreview = true }) {
    if (showPreview) {
      setPreviewLoading(true);
      setPreviewItem({ attachmentType: "pdf", attachmentName: fileName });
      setPreviewData(null);
    }
    try {
      const blob = doc.output("blob");
      const { error: upError } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType: "application/pdf" });
      if (upError) throw upError;
      await supabase.from("generated_documents").insert({
        document_type: documentType,
        bucket,
        storage_path: path,
        file_name: fileName,
        job_id: jobId || null,
        related_id: relatedId ? String(relatedId) : null,
        generated_by: roleLabel,
      });
      if (showPreview) {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
        if (error) throw error;
        setPreviewData(data.signedUrl);
        setPreviewLoading(false);
      }
      return { bucket, path };
    } catch (err) {
      console.error(`Failed to generate ${documentType}:`, err);
      if (showPreview) {
        // Storage failed — still show something rather than nothing, even
        // though this fallback can't be reopened later the way a real
        // stored copy can.
        setPreviewData(doc.output("bloburl"));
        setPreviewLoading(false);
      } else {
        alert("Couldn't save that document — check your connection and try again.");
      }
      return null;
    }
  }


  // Uploads to real storage and previews via signed URL, rather than
  // doc.save() forcing an immediate download with nothing kept — same fix
  // as the process sheet needed, for the same reason: the document needs
  // to still be there to open later, both from the job page generally and
  // specifically when checking external items back in.
  async function buildDeliveryNoteDoc(note, lineItems, job) {
    const doc = new jsPDF();
    const company = master.companyDetails || {};
    const leftX = 14;
    const rightX = 196;

    const renderCopy = (topY, copyLabel) => {
      let y = topY;
      // Logo, sized to its real proportions — never forced into a square,
      // same fix applied to every other document that has one.
      const { width: logoW } = addCompanyLogo(doc, company, leftX, y - 8, 26, 14);
      const textX = leftX + (logoW ? logoW + 6 : 0);
      doc.setFontSize(9);
      doc.setFont(undefined, "bold");
      doc.text(copyLabel, rightX, y - 6, { align: "right" });
      doc.setFontSize(16);
      doc.text("DELIVERY NOTE", rightX, y, { align: "right" });
      // Company name wraps within the space before the title, so a long
      // registered name can never collide with it.
      doc.setFontSize(12);
      const nameLines = doc.splitTextToSize(company.name || "Delivery Note", 105 - (textX - leftX));
      doc.text(nameLines, textX, y);
      y += Math.max(nameLines.length * 5, 5) + 4;
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      doc.text(`Number: ${note.delivery_note_number}`, rightX, y, { align: "right" });
      y += 5;
      doc.text(`Date: ${new Date(note.created_at || Date.now()).toLocaleDateString()}`, rightX, y, { align: "right" });
      y += 8;
      doc.setFont(undefined, "bold");
      doc.text(note.direction === "to_supplier" ? "To (Supplier):" : "To (Customer):", leftX, y);
      doc.setFont(undefined, "normal");
      doc.text(note.recipient_name, leftX + 45, y);
      y += 5;
      if (note.recipient_address) {
        doc.text(note.recipient_address, leftX + 45, y);
        y += 5;
      }
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [["Description", "Qty"]],
        body: lineItems.map((li) => [li.description, String(li.qty)]),
        theme: "grid",
        headStyles: { fillColor: [27, 29, 31] },
        margin: { left: leftX, right: leftX },
      });
      const afterY = (doc.lastAutoTable?.finalY || y + 20) + 12;
      doc.setFontSize(9);
      doc.text("Sent by: _______________________", leftX, afterY);
      doc.text("Received by: _______________________", rightX - 70, afterY);
      return afterY + 10;
    };

    renderCopy(26, "Recipient Copy");
    doc.setDrawColor(180, 180, 180);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(leftX, 155, rightX, 155);
    doc.setLineDashPattern([], 0);
    renderCopy(166, "Our Copy");

    // Deterministic path from job id + note number — every delivery_notes
    // row for this note (one per item) shares one PDF, and it can always
    // be found again later without needing to store the path anywhere.
    await generateAndStoreDocument({
      doc,
      documentType: "delivery_note",
      bucket: "job-documents",
      path: `${job.id}/delivery-note-${note.delivery_note_number}.pdf`,
      fileName: `${note.delivery_note_number}.pdf`,
      jobId: job.id,
      relatedId: note.delivery_note_number,
    });
  }

  // Reopens a delivery note's PDF later — same deterministic path used
  // when it was first created, so no separate lookup is needed.
  async function viewDeliveryNoteDocument(job, note) {
    try {
      const path = `${job.id}/delivery-note-${note.delivery_note_number}.pdf`;
      const { data, error } = await supabase.storage.from("job-documents").createSignedUrl(path, 3600);
      if (error) throw error;
      setPreviewItem({ attachmentType: "pdf", attachmentName: `${note.delivery_note_number}.pdf` });
      setPreviewData(data.signedUrl);
      setPreviewLoading(false);
    } catch (err) {
      console.error("Failed to open delivery note:", err);
      alert("Couldn't open that document — check your connection and try again.");
    }
  }

  // Opens any row from the generated_documents audit log — works for
  // every document type, since they all record their own real bucket and
  // path when they're first generated.
  async function viewGeneratedDocument(record) {
    try {
      const { data, error } = await supabase.storage.from(record.bucket).createSignedUrl(record.storage_path, 3600);
      if (error) throw error;
      setPreviewItem({ attachmentType: "pdf", attachmentName: record.file_name });
      setPreviewData(data.signedUrl);
      setPreviewLoading(false);
    } catch (err) {
      console.error("Failed to open document:", err);
      alert("Couldn't open that document — check your connection and try again.");
    }
  }

  async function checkInDeliveryNote(job, note, quoteItem) {
    try {
      const { error } = await supabase
        .from("delivery_notes")
        .update({ checked_back_in_at: new Date().toISOString(), checked_back_in_by: roleLabel })
        .eq("id", note.id);
      if (error) throw error;
      if (note.quote_item_id) {
        const { error: statusError } = await supabase
          .from("job_quote_items")
          .update({ item_status: "on_floor" })
          .eq("id", note.quote_item_id);
        if (statusError) throw statusError;
      }
      if (job.sales_rep) {
        await supabase.from("job_notifications").insert({
          job_id: job.id,
          job_number: job.job_number,
          sales_rep: job.sales_rep,
          message: `${quoteItem?.description || "An item"} checked back in from ${note.recipient_name} on ${job.job_number} (${job.customer || "no customer"})`,
        });
      }
      refreshJobDetail();
    } catch (err) {
      console.error("Failed to check delivery note back in:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  // A clearly-labeled draft, not a real tax invoice — the real one is
  // still made in Sage, but this gives accounts something concrete to
  // work from rather than nothing at all.
  function buildDraftInvoiceDoc(job, lines) {
    const doc = new jsPDF();
    const company = master.companyDetails || {};
    const leftX = 14;
    const rightX = 196;
    let y = 18;
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.setTextColor(200, 60, 60);
    doc.text("DRAFT — NOT A TAX INVOICE — FOR ACCOUNTS REFERENCE ONLY", leftX, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
    let textX = leftX;
    const { width: invLogoW } = addCompanyLogo(doc, company, leftX, y - 8, 26, 14);
    if (invLogoW) textX = leftX + invLogoW + 6;
    doc.setFontSize(16);
    doc.text("INVOICE REQUEST", rightX, y, { align: "right" });
    doc.setFontSize(12);
    const nameLines = doc.splitTextToSize(company.name || "Invoice Request", 105 - (textX - leftX));
    doc.text(nameLines, textX, y);
    y += Math.max(nameLines.length * 5, 5) + 4;
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(`Job: ${job.job_number}`, rightX, y, { align: "right" });
    y += 5;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, rightX, y, { align: "right" });
    y += 8;
    doc.setFont(undefined, "bold");
    doc.text("Customer:", leftX, y);
    doc.setFont(undefined, "normal");
    doc.text(job.customer || "—", leftX + 30, y);
    y += 10;
    const grandTotal = lines.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
    autoTable(doc, {
      startY: y,
      head: [["Description", "Qty", "Unit Price", "Total"]],
      body: lines.map((li) => [li.description, String(li.qty), `R ${li.unitPrice.toFixed(2)}`, `R ${(li.qty * li.unitPrice).toFixed(2)}`]),
      foot: [["", "", "Total", `R ${grandTotal.toFixed(2)}`]],
      theme: "grid",
      headStyles: { fillColor: [27, 29, 31] },
      footStyles: { fillColor: [242, 169, 0], textColor: [27, 29, 31], fontStyle: "bold" },
    });
    // Never auto-downloaded — the caller stores this and gives an explicit
    // Open button instead, since accounts should decide when to open it.
    return doc;
  }

  // A printable job sheet — same purpose as the paper process sheet, but
  // only ever shows the processes this job actually needs, not all twenty.
  // Uploads the generated PDF to real storage and previews via its signed
  // URL, rather than a blob: URL — a blob URL is only valid in the tab that
  // created it, so the PDF viewer's own built-in "open in new tab" button
  // was failing silently on it. A real signed URL works exactly like any
  // other attached document, including that button.
  async function printJobSheet(job, processes, quoteItems, deliveryNotes) {
    const doc = new jsPDF();
    const company = master.companyDetails || {};
    const leftX = 14;
    const { height: logoH } = addCompanyLogo(doc, company, leftX, 10, 26, 14);
    let y = logoH ? 10 + logoH + 6 : 18;
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text(`Job ${job.job_number}`, leftX, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const infoLines = [
      `Customer: ${job.customer || "—"}`,
      `Sales rep: ${job.sales_rep || "—"}`,
      job.due_date ? `Due date: ${new Date(job.due_date).toLocaleDateString()}` : null,
      job.quote_reference ? `Quote reference: ${job.quote_reference}` : null,
      job.customer_po ? `Customer PO: ${job.customer_po}` : null,
      job.laser_job_reference ? `Laser job reference: ${job.laser_job_reference}` : null,
      job.qty ? `Quantity: ${job.qty}` : null,
    ].filter(Boolean);
    infoLines.forEach((line) => {
      doc.text(line, leftX, y);
      y += 5;
    });

    // Items being made on this job — description, quantity, and current
    // invoiced/outstanding progress, no pricing (this sheet goes to the
    // floor, not accounts). Pulls from the same qty_invoiced tracking used
    // everywhere else, so reprinting partway through a longer job shows
    // where things actually stand, not just what was originally quoted.
    if (quoteItems?.length) {
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [["Item", "Qty", "Invoiced", "Outstanding"]],
        body: quoteItems.map((it) => {
          const qty = Number(it.qty) || 0;
          const invoiced = Number(it.qty_invoiced) || 0;
          return [it.description || "", qty, invoiced, Math.max(qty - invoiced, 0)];
        }),
        theme: "grid",
        headStyles: { fillColor: [27, 29, 31] },
        margin: { left: leftX },
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    const materials = [1, 2, 3]
      .map((n) => ({ grade: job[`material_${n}_grade`], qty: job[`material_${n}_qty`] }))
      .filter((m) => m.grade);
    if (materials.length) {
      y += 3;
      doc.setFont(undefined, "bold");
      doc.text("Materials:", leftX, y);
      doc.setFont(undefined, "normal");
      y += 5;
      materials.forEach((m) => {
        doc.text(`  ${m.grade}${m.qty ? ` — ${m.qty}` : ""}`, leftX, y);
        y += 5;
      });
      if (job.material_location) {
        doc.text(`  Location: ${job.material_location}`, leftX, y);
        y += 5;
      }
    }

    y += 5;
    autoTable(doc, {
      startY: y,
      head: [["Process", "Operator/Supplier", "Complete", "Notes"]],
      // The job's own stages only. A shortage's catch-up run is stored
      // against the same job, so without this the sheet lists nesting
      // twice with nothing saying why. The runs are summarised under
      // Shortages instead, where the context is.
      body: inFlowOrder(processes.filter((p) => !p.shortage_id), job).map((p) => [
        p.process_name,
        p.operator || "",
        p.is_complete ? `Yes — ${p.completed_by || ""}` : "",
        p.notes || "",
      ]),
      theme: "grid",
      headStyles: { fillColor: [27, 29, 31] },
    });

    if (job.buy_out_notes) {
      const finalY = (doc.lastAutoTable?.finalY || y + 20) + 8;
      doc.setFontSize(9);
      doc.text(`Buy-out notes: ${job.buy_out_notes}`, leftX, finalY);
    }

    // Job history — everything that happened on this job from start to
    // invoicing, so it can be printed at the end and filed or referred
    // back to if a problem comes up later. No values or prices anywhere
    // here — just what was done.
    doc.addPage();
    let hy = 18;
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(`Job History — ${job.job_number}`, leftX, hy);
    hy += 10;
    doc.setFont(undefined, "normal");

    const dnGroups = Object.values(
      (deliveryNotes || []).reduce((acc, dn) => {
        (acc[dn.delivery_note_number] = acc[dn.delivery_note_number] || []).push(dn);
        return acc;
      }, {})
    );
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Delivery notes", leftX, hy);
    doc.setFont(undefined, "normal");
    hy += 6;
    if (dnGroups.length === 0) {
      doc.setFontSize(9);
      doc.text("None issued.", leftX, hy);
      hy += 8;
    } else {
      autoTable(doc, {
        startY: hy,
        head: [["Number", "Direction", "Date"]],
        body: dnGroups.map((g) => [g[0].delivery_note_number, g[0].direction === "to_supplier" ? "To supplier" : "To customer", new Date(g[0].created_at).toLocaleDateString()]),
        theme: "grid",
        headStyles: { fillColor: [27, 29, 31] },
        margin: { left: leftX },
      });
      hy = doc.lastAutoTable.finalY + 8;
    }

    const requestsForJob = jobInvoiceRequests.filter((r) => r.job_id === job.id);
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Invoicing", leftX, hy);
    doc.setFont(undefined, "normal");
    hy += 6;
    doc.setFontSize(9);
    if (job.invoice_number) {
      doc.text(`Invoice #${job.invoice_number} — ${job.invoiced_at ? new Date(job.invoiced_at).toLocaleDateString() : ""}`, leftX, hy);
      hy += 6;
    }
    if (requestsForJob.length === 0 && !job.invoice_number) {
      doc.text("No invoicing activity yet.", leftX, hy);
      hy += 8;
    } else if (requestsForJob.length > 0) {
      autoTable(doc, {
        startY: hy,
        head: [["Submitted", "Date"]],
        body: requestsForJob.map((r) => [r.submitted_by, new Date(r.submitted_at).toLocaleDateString()]),
        theme: "grid",
        headStyles: { fillColor: [27, 29, 31] },
        margin: { left: leftX },
      });
      hy = doc.lastAutoTable.finalY + 8;
    }

    const materialsUsed = (usageLog || []).filter((u) => u.direction === "use" && u.jobNumber === job.job_number);
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Materials used", leftX, hy);
    doc.setFont(undefined, "normal");
    hy += 6;
    if (materialsUsed.length === 0) {
      doc.setFontSize(9);
      doc.text("None logged.", leftX, hy);
      hy += 8;
    } else {
      autoTable(doc, {
        startY: hy,
        head: [["Item", "Qty", "By", "Date"]],
        body: materialsUsed.map((u) => [u.itemName, u.qty, u.by, new Date(u.timestamp).toLocaleDateString()]),
        theme: "grid",
        headStyles: { fillColor: [27, 29, 31] },
        margin: { left: leftX },
      });
      hy = doc.lastAutoTable.finalY + 8;
    }

    // Shortages belong on the job's record as much as its processes do:
    // they are work that had to be done twice, and the sheet is where
    // anyone looks back to see what happened on a job.
    //
    // Fetched here rather than read from shortagesList, so printing does
    // not depend on that having loaded, and so the sheet is right even for
    // a job whose shortages were raised by someone else.
    let jobShortages = [];
    try {
      const { data, error } = await supabase
        .from("shortages")
        .select("*")
        .eq("job_id", job.id)
        .order("created_at");
      if (error) throw error;
      jobShortages = data || [];
    } catch (err) {
      // Never fatal. A sheet missing its shortages beats no sheet at all.
      console.error("Failed to load shortages for the job sheet:", err);
    }

    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Shortages", leftX, hy);
    doc.setFont(undefined, "normal");
    hy += 6;
    if (jobShortages.length === 0) {
      doc.setFontSize(9);
      doc.text("None raised.", leftX, hy);
      hy += 8;
    } else {
      autoTable(doc, {
        startY: hy,
        head: [["What was missing", "Reason", "Raised by", "SigmaNest", "Status"]],
        body: jobShortages.map((s) => [
          shortageLines(s)
            .map((l) => `${l.description} × ${l.qty}${l.photo ? " (photo)" : ""}`)
            .join("\n"),
          `${s.reason}${s.is_priority === false ? "" : " · priority"}`,
          `${s.flagged_by}\n${s.flagged_department}`,
          s.board_number || "—",
          s.status === "cut" ? "Re-cut complete" : s.status === "nested" ? "Being re-cut" : "Waiting on nesting",
        ]),
        theme: "grid",
        headStyles: { fillColor: [27, 29, 31] },
        margin: { left: leftX },
      });
      hy = doc.lastAutoTable.finalY + 8;
    }

    await generateAndStoreDocument({
      doc,
      documentType: "process_sheet",
      bucket: "job-documents",
      path: `${job.id}/process-sheet.pdf`,
      fileName: `${job.job_number}.pdf`,
      jobId: job.id,
    });
  }

  async function updateJobStatus(jobId, status) {
    try {
      const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId);
      if (error) throw error;
      fetchJobs();
      if (jobDetail?.job.id === jobId) refreshJobDetail();
    } catch (err) {
      console.error("Failed to update job status:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  async function updateJobField(jobId, field, value) {
    try {
      const { error } = await supabase.from("jobs").update({ [field]: value }).eq("id", jobId);
      if (error) throw error;
      flashSaved(`job-${jobId}-${field}`);
      if (jobDetail?.job.id === jobId) refreshJobDetail();
    } catch (err) {
      console.error("Failed to update job field:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  function openMarkInvoicedModal(job) {
    setMarkInvoicedModal({ job, invoiceNumber: "" });
  }

  async function submitMarkInvoiced() {
    const { job, invoiceNumber } = markInvoicedModal;
    if (!invoiceNumber.trim()) {
      alert("Enter the real invoice number from Sage before marking this invoiced.");
      return;
    }
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ status: "invoiced", invoiced_by: roleLabel, invoiced_at: new Date().toISOString(), invoice_number: invoiceNumber.trim() })
        .eq("id", job.id);
      if (error) throw error;
      // Everything that was only "requested" becomes genuinely invoiced
      // now that a real invoice number actually exists for this job.
      const { error: itemsError } = await supabase
        .from("job_quote_items")
        .update({ item_status: "invoiced" })
        .eq("job_id", job.id)
        .eq("item_status", "invoice_requested");
      if (itemsError) throw itemsError;
      if (job.sales_rep) {
        await supabase.from("job_notifications").insert({
          job_id: job.id,
          job_number: job.job_number,
          sales_rep: job.sales_rep,
          message: `${job.job_number} (${job.customer || "no customer"}) fully invoiced by ${roleLabel} — invoice #${invoiceNumber.trim()}`,
        });
      }
      setMarkInvoicedModal(null);
      fetchJobs();
      if (jobDetail?.job.id === job.id) refreshJobDetail();
    } catch (err) {
      console.error("Failed to mark job invoiced:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  // ---- Notifications ----

  async function fetchNotifications() {
    if (!supabase || !profile) return;
    try {
      // Two separate, properly-parameterized queries rather than a single
      // .or() built from a string-interpolated name — a name containing a
      // comma or other special character could otherwise break that
      // filter syntax outright.
      const [{ data: bySalesRep, error: err1 }, { data: byRecipient, error: err2 }] = await Promise.all([
        supabase.from("job_notifications").select("*").eq("sales_rep", roleLabel),
        supabase.from("job_notifications").select("*").eq("recipient_id", profile.id),
      ]);
      if (err1) throw err1;
      if (err2) throw err2;
      const byId = new Map();
      for (const n of [...(bySalesRep || []), ...(byRecipient || [])]) byId.set(n.id, n);
      const merged = [...byId.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setNotificationsList(merged);
    } catch (err) {
      console.error("Failed to load notifications:", err);
      setNotificationsList([]);
    }
  }

  // Deliberately never throws past itself. Reserved quantities are extra
  // information on the stock screens; if the table is missing or
  // unreadable those screens must still work, showing nothing reserved
  // rather than nothing at all.
  async function fetchAllocations() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("job_allocations")
        .select("*")
        .neq("status", "released")
        .order("created_at");
      if (error) throw error;
      setAllocationsList(data || []);
    } catch (err) {
      console.error("Failed to load allocations (stock still shown):", err);
      setAllocationsList([]);
    }
  }

  // What is still spoken for on a given stock item — allocated less
  // already used, ignoring anything handed back.
  function allocationsForItem(itemId) {
    return (allocationsList || []).filter(
      (a) => a.item_id === itemId && Number(a.qty_allocated) - Number(a.qty_used) > 0
    );
  }

  function reservedQtyForItem(itemId) {
    return allocationsForItem(itemId).reduce(
      (sum, a) => sum + (Number(a.qty_allocated) - Number(a.qty_used)),
      0
    );
  }

  // What anyone may actually take. Reserved material is off limits: the
  // only way to consume it is through its own allocation, which books it
  // out against the job it was set aside for. Without this a reservation
  // is only a note, and the material walks.
  function availableQtyForItem(item) {
    return Math.max(0, Number(item.qty) - reservedQtyForItem(item.id));
  }

  async function fetchShortages() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from("shortages").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setShortagesList(data || []);
    } catch (err) {
      console.error("Failed to load shortages:", err);
      setShortagesList([]);
    }
  }

  async function markNotificationRead(id) {
    setNotificationsList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await supabase.from("job_notifications").update({ is_read: true }).eq("id", id);
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }
  }

  // Whether an asset is overdue or approaching its next service, based on
  // whichever tracking mode it uses. Returns null if service tracking isn't
  // set up for this asset at all.
  function getServiceStatus(item) {
    if (!item.serviceMode || item.serviceMode === "none") return null;
    if (item.serviceMode === "months") {
      if (!item.lastServiceDate || !item.serviceIntervalMonths) return null;
      const due = new Date(item.lastServiceDate);
      due.setMonth(due.getMonth() + Number(item.serviceIntervalMonths));
      const daysUntil = (due - new Date()) / (1000 * 60 * 60 * 24);
      if (daysUntil <= 0) return { level: "overdue", detail: `Overdue since ${due.toLocaleDateString()}` };
      if (daysUntil <= 14) return { level: "soon", detail: `Due ${due.toLocaleDateString()}` };
      return { level: "ok", detail: `Next due ${due.toLocaleDateString()}` };
    }
    const interval = item.serviceMode === "hours" ? item.serviceIntervalHours : item.serviceIntervalKm;
    if (!interval) return null;
    const unit = item.serviceMode === "hours" ? "hrs" : "km";
    const used = Number(item.currentReading || 0) - Number(item.lastServiceReading || 0);
    const remaining = interval - used;
    if (remaining <= 0) return { level: "overdue", detail: `${Math.abs(remaining)}${unit} over interval` };
    if (remaining <= interval * 0.1) return { level: "soon", detail: `${remaining}${unit} remaining` };
    return { level: "ok", detail: `${remaining}${unit} remaining` };
  }

  async function openAssetHistory(item) {
    setAssetHistoryItem(item);
    setAssetHistoryEntries(null);
    setAssetHistoryNote("");
    setAssetHistoryFile(null);
    setAssetHistoryReading(String(item.currentReading || ""));
    try {
      const entries = await fetchAssetHistory(item.id);
      setAssetHistoryEntries(entries);
    } catch (err) {
      console.error("Failed to load asset history:", err);
      setAssetHistoryEntries([]);
    }
  }

  function closeAssetHistory() {
    setAssetHistoryItem(null);
    setAssetHistoryEntries(null);
    setAssetHistoryNote("");
    setAssetHistoryFile(null);
    setAssetHistoryReading("");
  }

  async function refreshAssetHistoryEntries() {
    if (!assetHistoryItem) return;
    try {
      const entries = await fetchAssetHistory(assetHistoryItem.id);
      setAssetHistoryEntries(entries);
    } catch (err) {
      console.error("Failed to refresh asset history:", err);
    }
  }

  async function submitAssetNote(e) {
    e.preventDefault();
    if (!assetHistoryNote.trim() && !assetHistoryFile) return;
    setAssetHistoryBusy(true);
    try {
      await addAssetHistoryEntry({
        itemId: assetHistoryItem.id,
        entryType: "note",
        note: assetHistoryNote.trim(),
        attachmentFile: assetHistoryFile,
      });
      setAssetHistoryNote("");
      setAssetHistoryFile(null);
      await refreshAssetHistoryEntries();
    } catch (err) {
      console.error("Failed to add note:", err);
      alert("Couldn't save that note — check your connection and try again.");
    }
    setAssetHistoryBusy(false);
  }

  async function submitAssetReading(e) {
    e.preventDefault();
    const reading = parseFloat(assetHistoryReading);
    if (isNaN(reading) || reading < 0) return;
    setAssetHistoryBusy(true);
    try {
      await addAssetHistoryEntry({
        itemId: assetHistoryItem.id,
        entryType: "meter_reading",
        reading,
        serviceMode: assetHistoryItem.serviceMode,
      });
      setAssetHistoryItem((prev) => ({ ...prev, currentReading: reading }));
      await refreshAssetHistoryEntries();
    } catch (err) {
      console.error("Failed to log reading:", err);
      alert("Couldn't save that reading — check your connection and try again.");
    }
    setAssetHistoryBusy(false);
  }

  async function viewAssetAttachment(entry) {
    try {
      const url = await getAssetAttachmentUrl(entry.attachment_path);
      setPreviewItem({ id: entry.id, attachmentType: entry.attachment_name.toLowerCase().endsWith(".pdf") ? "pdf" : "image", attachmentName: entry.attachment_name });
      setPreviewData(url);
      setPreviewLoading(false);
    } catch (err) {
      console.error("Couldn't open attachment:", err);
    }
  }

  async function handleDeleteAssetHistoryEntry(entry) {
    const ok = await deleteAssetHistoryEntry(entry);
    if (ok) refreshAssetHistoryEntries();
  }

  async function deleteDrawing(drawing) {
    if (!supabase) return;
    const ok = window.confirm(
      `Delete this drawing permanently?\n\n${drawing.part_number} — ${
        drawing.customer_revision ? `Rev ${drawing.customer_revision}` : `Rev ${drawing.internal_revision}`
      }\n\nThis removes the actual file too — it can't be undone.`
    );
    if (!ok) return;
    try {
      await supabase.storage.from("drawings").remove([drawing.storage_path]);
      const { error } = await supabase.from("drawings").delete().eq("id", drawing.id);
      if (error) throw error;
      refreshDrawings(drawingSearchQuery, drawingCustomerFilter);
    } catch (err) {
      console.error("Failed to delete drawing:", err);
      alert("Couldn't delete that drawing — check your connection and try again.");
    }
  }

  // A targeted way to clear out one customer's drawings (and every revision
  // of each) before a fresh re-upload — scoped to whichever customer is
  // currently filtered to, never a blanket wipe of everyone's drawings.
  async function batchDeleteDrawingsForCustomer(customer) {
    if (!supabase) return;
    try {
      let q = supabase.from("drawings").select("id, storage_path");
      if (customer === "__internal__") q = q.is("customer", null);
      else q = q.eq("customer", customer);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) {
        alert(`No drawings found for ${customer === "__internal__" ? "internal drawings" : customer}.`);
        return;
      }
      const ok = window.confirm(
        `Delete all ${data.length} drawing${data.length === 1 ? "" : "s"} for ${
          customer === "__internal__" ? "internal drawings" : customer
        }? This permanently removes the files too — can't be undone.`
      );
      if (!ok) return;
      const paths = data.map((d) => d.storage_path).filter(Boolean);
      if (paths.length) await supabase.storage.from("drawings").remove(paths);
      let delQ = supabase.from("drawings").delete();
      delQ = customer === "__internal__" ? delQ.is("customer", null) : delQ.eq("customer", customer);
      const { error: delError } = await delQ;
      if (delError) throw delError;
      refreshDrawings(drawingSearchQuery, drawingCustomerFilter);
    } catch (err) {
      console.error("Failed to batch delete drawings:", err);
      alert("Couldn't delete those drawings — check your connection and try again.");
    }
  }

  async function openDrawingPreview(drawing) {
    setPreviewItem({ id: drawing.id, attachmentType: "pdf", attachmentName: drawing.file_name, restrictDownload: true });
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const url = await getDrawingSignedUrl(drawing.storage_path);
      setPreviewData(url);
    } catch (err) {
      console.error("Couldn't open drawing:", err);
      setPreviewData(null);
    }
    setPreviewLoading(false);
  }

  function handleDrawingFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    const entries = files
      .filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
      .map((f) => {
        const partNumber = f.name.replace(/\.pdf$/i, "").trim();
        const matchedItem = (items || []).find(
          (it) =>
            it.mainCat === "custom" &&
            (it.partNumber || "").toLowerCase() === partNumber.toLowerCase() &&
            (it.customer || "") === (drawingUploadCustomer || "")
        );
        // The "must already exist in Customer Stock" rule only applies when
        // a customer is selected — an internal drawing (no customer chosen)
        // isn't expected to already have a matching item, so it's never
        // auto-skipped just for not matching one.
        const requiresMatch = !!drawingUploadCustomer;
        return {
          file: f,
          partNumber,
          skip: requiresMatch && !matchedItem,
          matchedStockCode: matchedItem ? { description: matchedItem.name } : null,
        };
      });
    setDrawingUploadFiles(entries);
    setDrawingUploadResult(null);
    e.target.value = "";
  }

  function removeDrawingUploadFile(idx) {
    setDrawingUploadFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitDrawingUpload() {
    const validFiles = drawingUploadFiles.filter((f) => f.partNumber && !f.skip);
    if (validFiles.length === 0) return;
    setDrawingUploadBusy(true);
    let succeeded = 0;
    let failed = 0;
    for (const entry of validFiles) {
      try {
        const nextRevision = await getNextInternalRevision(entry.partNumber);
        const path = await uploadDrawingFile(entry.file, entry.partNumber, nextRevision);
        await insertDrawingRecord({
          partNumber: entry.partNumber,
          customer: entry.matchedStockCode?.customer || drawingUploadCustomer || null,
          customerRevision: null,
          storagePath: path,
          fileName: entry.file.name,
          // If this part number already exists in Stock Codes, link to it
          // and carry its description/price through — never creates or
          // changes anything in Stock Codes itself, only reads from it.
          linkedItemId: entry.matchedStockCode?.id || null,
          description: entry.matchedStockCode?.description || null,
          price: entry.matchedStockCode?.price ?? null,
        });
        succeeded++;
      } catch (err) {
        console.error(`Failed to upload drawing for ${entry.partNumber}:`, err);
        failed++;
      }
    }
    setDrawingUploadBusy(false);
    setDrawingUploadResult({ succeeded, failed });
    setDrawingUploadFiles([]);
  }

  function closeDrawingUpload() {
    setShowDrawingUpload(false);
    setDrawingUploadFiles([]);
    setDrawingUploadResult(null);
    setDrawingUploadCustomer("");
  }

  async function loadPeople() {
    if (!supabase) return;
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    setPeople(
      (data || []).map((d) => ({
        id: d.id,
        name: d.name || d.email,
        email: d.email,
        isAdmin: !!d.is_admin,
        permissions: d.permissions || blankPermissions(),
        canAddItems: !!d.can_add_items,
        canEditItems: !!d.can_edit_items,
        canRequisition: !!d.can_requisition,
        canMarkReceived: !!d.can_mark_received,
        canSeeValue: !!d.can_see_value,
        canAccessStockManager: !!d.can_access_stock_manager,
        canManageRequisitions: !!d.can_manage_requisitions,
        canRaisePO: !!d.can_raise_po,
        canViewUsageLog: !!d.can_view_usage_log,
        canManageInvoicing: !!d.can_manage_invoicing,
        allowedProcessTypes: d.allowed_process_types || [],
        isSalesPerson: !!d.is_sales_person,
        isShortageHandler: !!d.is_shortage_handler,
        department: d.department || "",
      }))
    );
  }

  const FIELD_TO_COLUMN = {
    isAdmin: "is_admin",
    canAddItems: "can_add_items",
    canEditItems: "can_edit_items",
    canRequisition: "can_requisition",
    canMarkReceived: "can_mark_received",
    canSeeValue: "can_see_value",
    canAccessStockManager: "can_access_stock_manager",
    canManageRequisitions: "can_manage_requisitions",
    canRaisePO: "can_raise_po",
    canViewUsageLog: "can_view_usage_log",
    canManageInvoicing: "can_manage_invoicing",
    allowedProcessTypes: "allowed_process_types",
    isSalesPerson: "is_sales_person",
    isShortageHandler: "is_shortage_handler",
    theme: "theme",
    department: "department",
  };

  async function updatePersonField(id, field, value) {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    const column = FIELD_TO_COLUMN[field] || field;
    try {
      const { error } = await supabase.from("profiles").update({ [column]: value }).eq("id", id);
      if (error) throw error;
      flashSaved(`person-${id}`);
    } catch (err) {
      console.error("Failed to save person field:", err);
      alert("That didn't save — check your connection and try again.");
      loadPeople();
    }
  }

  // A personal preference, not something managed through User Management —
  // this updates the signed-in person's own profile state directly (not
  // the people list) so the theme actually, visually changes right away.
  async function setMyTheme(newTheme) {
    if (!profile) return;
    setProfile((prev) => ({ ...prev, theme: newTheme }));
    try {
      const { error } = await supabase.from("profiles").update({ theme: newTheme }).eq("id", profile.id);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to save theme:", err);
    }
  }

  // Real, enforced access to specific process types — this is what gates
  // the Production tab, separate from the free-text Department label.
  async function toggleProcessTypeAccess(id, processType) {
    const person = people.find((p) => p.id === id);
    if (!person) return;
    const current = person.allowedProcessTypes || [];
    const next = current.includes(processType) ? current.filter((p) => p !== processType) : [...current, processType];
    await updatePersonField(id, "allowedProcessTypes", next);
  }

  async function updatePersonPermission(id, section, kind, value) {
    const person = people.find((p) => p.id === id);
    if (!person) return;
    const newPermissions = { ...person.permissions, [section]: { ...person.permissions[section], [kind]: value } };
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, permissions: newPermissions } : p)));
    try {
      const { error } = await supabase.from("profiles").update({ permissions: newPermissions }).eq("id", id);
      if (error) throw error;
      flashSaved(`person-${id}`);
    } catch (err) {
      console.error("Failed to save permission:", err);
      alert("That didn't save — check your connection and try again.");
      loadPeople();
    }
  }

  async function resetPersonAccess(id) {
    const blank = blankPermissions();
    setPeople((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              isAdmin: false,
              permissions: blank,
              canAddItems: false,
              canEditItems: false,
              canRequisition: false,
              canMarkReceived: false,
              canSeeValue: false,
              canAccessStockManager: false,
              canManageRequisitions: false,
              canRaisePO: false,
              canViewUsageLog: false,
            }
          : p
      )
    );
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_admin: false,
          permissions: blank,
          can_add_items: false,
          can_edit_items: false,
          can_requisition: false,
          can_mark_received: false,
          can_see_value: false,
          can_access_stock_manager: false,
          can_manage_requisitions: false,
          can_raise_po: false,
          can_view_usage_log: false,
        })
        .eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to reset access:", err);
      alert("That didn't save — check your connection and try again.");
      loadPeople();
    }
  }

  // Genuinely, permanently removes the person — their login and their
  // profile both — not just their permissions. This calls a small
  // server-side function rather than doing it directly, since actually
  // deleting a login account requires Supabase's admin credentials, which
  // can never safely live in this app itself.
  async function deletePersonPermanently(id, name) {
    const confirmed = window.confirm(
      `Permanently delete ${name}? This removes their login and profile entirely — they will need a brand new account to sign in again, and this can't be undone. Are you sure?`
    );
    if (!confirmed) return;
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", { body: { userId: id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPeople((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete user:", err);
      alert(`Couldn't delete that person: ${err.message || "check your connection and try again."}`);
    }
  }

  const isAdmin = !!profile?.isAdmin;

  useEffect(() => {
    // Needed by more than just admin/User Management now — the Sales
    // Person picker on the item form needs real account names too, so this
    // loads for anyone signed in, not just when an admin opens the manager.
    if (profile && people === null) {
      loadPeople();
    }
  }, [profile, people]);

  function canView(section) {
    if (isAdmin) return true;
    if (section === "requisitions") return !!profile?.canRequisition || !!profile?.canManageRequisitions;
    if (section === "purchaseOrders") return !!profile?.canManageRequisitions || !!profile?.canRaisePO;
    if (section === "receiving") return !!profile?.canMarkReceived;
    if (section === "invoicing") return !!profile?.canManageInvoicing;
    if (section === "notifications") return !!profile;
    if (section === "production") return !!profile?.allowedProcessTypes?.length;
    // The programs tab belongs to whoever nests or cuts. Matched on the
    // name rather than a fixed list, so renaming a department in Stock
    // Manager cannot quietly take the tab away from the people using it.
    if (section === "laser4kw")
      return !!profile?.allowedProcessTypes?.some((t) => isNestingProcess(t) || isLaserProcess(t));
    if (section === "usageLog") return !!profile?.canViewUsageLog;
    if (section === "shortageCenter") return !!profile?.isShortageHandler;
    return profile ? !!profile.permissions?.[section]?.view : false;
  }

  function canEditQty(section) {
    if (isAdmin) return true;
    return profile ? !!profile.permissions?.[section]?.edit : false;
  }

  // Once a job is fully invoiced, nothing about it should be editable by
  // anyone — this is the single source of truth for that lock, used
  // throughout the Job Detail modal alongside the normal permission check.
  const jobIsLocked = jobDetail?.job?.status === "invoiced";
  // An admin can still edit a locked job. The lock is there to stop
  // invoiced work being changed by accident, not to make a job
  // unrepairable — and a job carrying stages from an old process list has
  // to be fixable by somebody.
  const canEditThisJob = canEditQty("jobs") && (!jobIsLocked || isAdmin);
  const editingLockedJob = jobIsLocked && isAdmin;

  const canAdd = isAdmin || !!profile?.canAddItems;
  const canEditItems = isAdmin || !!profile?.canEditItems;
  const canDelete = isAdmin;
  const canSeeValue = isAdmin || !!profile?.canSeeValue;
  const canRequisition = isAdmin || !!profile?.canRequisition;
  const canMarkReceivedPerm = isAdmin || !!profile?.canMarkReceived;
  const canManageRequisitions = isAdmin || !!profile?.canManageRequisitions;
  const canAccessStockManager = isAdmin || !!profile?.canAccessStockManager;
  const canRaisePO = isAdmin || !!profile?.canRaisePO;
  const hasAnyAccess = isAdmin || (!!profile && (canAccessStockManager || NAV_TABS.some((t) => canView(t.key))));

  const visibleTabs = useMemo(() => {
    if (!master || !profile) return [];
    return NAV_TABS.filter((t) => canView(t.key));
  }, [master, profile, isAdmin]);

  useEffect(() => {
    if (!master || visibleTabs.length === 0) return;
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0].key);
  }, [visibleTabs]);

  const tabItems = useMemo(() => {
    if (!items) return [];
    return items
      .filter((it) => it.mainCat === tab)
      .filter((it) => tab !== "assets" || it.status !== "removed")
      // Home page normally hides zero-stock items — except when there's an
      // active requisition tracking it, so the red/orange/green flag stays
      // visible until the order is actually fulfilled.
      .filter((it) => Number(it.qty) > 0 || !!activeRequisitionForItem(it.id))
      .filter((it) => (tab !== "custom" && tab !== "stores" && tab !== "fasteners") || !customerFilter || it.customer === customerFilter)
      .filter((it) => tab !== "structural" || !sectionTypeFilter || findSectionType(it.name) === sectionTypeFilter)
      .filter((it) => {
        if (!filterGrade) return true;
        if (it.grade === filterGrade) return true;
        // filterGrade may be a short name — also match items still storing
        // the full name from before short names existed.
        const gradeList = tab === "cncBar" ? master.cncGrades : master.grades;
        const match = (gradeList || []).find((g) => (g.shortName || g.name) === filterGrade);
        return match ? it.grade === match.name : false;
      })
      .filter((it) => tab !== "fasteners" || !filterFastenerType || it.fastenerType === filterFastenerType)
      .filter((it) => tab !== "fasteners" || !filterFastenerDiameter || String(it.diameter) === filterFastenerDiameter)
      .filter((it) => tab !== "fasteners" || !filterFastenerGrade || it.fastenerGrade === filterFastenerGrade)
      .filter((it) => tab !== "fasteners" || !filterFastenerFinish || it.finish === filterFastenerFinish)
      .filter((it) => {
        if (tab !== "plate") return true;
        const d = parseSize(it.size);
        if (filterWidth && (!d || String(d[0]) !== filterWidth)) return false;
        if (filterLength && (!d || String(d[1]) !== filterLength)) return false;
        if (filterThickness && (it.thickness || "") !== filterThickness) return false;
        if (filterStockType && (it.stockType || "full") !== filterStockType) return false;
        if (filterAreaMin || filterAreaMax) {
          if (!d) return false;
          const area = (d[0] / 1000) * (d[1] / 1000);
          if (filterAreaMin && area < parseFloat(filterAreaMin)) return false;
          if (filterAreaMax && area > parseFloat(filterAreaMax)) return false;
        }
        if (filterWeightMin || filterWeightMax) {
          const w = plateWeight(it);
          if (!w) return false;
          if (filterWeightMin && w.perSheet < parseFloat(filterWeightMin)) return false;
          if (filterWeightMax && w.perSheet > parseFloat(filterWeightMax)) return false;
        }
        return true;
      })
      .filter((it) => {
        if (tab !== "structural") return true;
        if (filterPieceLength && String(it.length || "") !== filterPieceLength) return false;
        if (filterStockType && (it.stockType || "full") !== filterStockType) return false;
        return true;
      })
      .filter((it) =>
        (it.name + " " + (it.grade || "") + " " + (it.partNumber || "") + " " + (it.customer || "") + " " + (it.supplier || "") + " " + (it.sheetName || ""))
          .toLowerCase()
          .includes(query.toLowerCase())
      );
  }, [
    items, master, requisitions, tab, query, customerFilter, sectionTypeFilter, filterGrade,
    filterWidth, filterLength, filterThickness, filterPieceLength, filterStockType,
    filterAreaMin, filterAreaMax, filterWeightMin, filterWeightMax,
  ]);

  const plateWidthOptions = useMemo(() => {
    const set = new Set();
    (items || []).filter((it) => it.mainCat === "plate").forEach((it) => {
      const d = parseSize(it.size);
      if (d) set.add(String(d[0]));
    });
    return Array.from(set).sort((a, b) => parseFloat(a) - parseFloat(b));
  }, [items]);

  const plateLengthOptions = useMemo(() => {
    const set = new Set();
    (items || []).filter((it) => it.mainCat === "plate").forEach((it) => {
      const d = parseSize(it.size);
      if (d) set.add(String(d[1]));
    });
    return Array.from(set).sort((a, b) => parseFloat(a) - parseFloat(b));
  }, [items]);

  const plateThicknessOptions = useMemo(() => {
    const set = new Set();
    (items || []).filter((it) => it.mainCat === "plate" && it.thickness).forEach((it) => set.add(it.thickness));
    return Array.from(set).sort((a, b) => (parseThickness(a) || 0) - (parseThickness(b) || 0));
  }, [items]);

  const structuralLengthOptions = useMemo(() => {
    const set = new Set();
    (items || []).filter((it) => it.mainCat === "structural" && it.length).forEach((it) => set.add(String(it.length)));
    return Array.from(set).sort((a, b) => parseFloat(a) - parseFloat(b));
  }, [items]);

  const grouped = useMemo(() => {
    const map = {};
    const isGrouped = tab === "custom" || tab === "stores";
    tabItems.forEach((it) => {
      const g = isGrouped ? it.customer || "Unassigned" : tab === "assets" ? it.manufacturer || "Other" : it.grade || "Ungraded";
      if (!map[g]) map[g] = [];
      map[g].push(it);
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([g, list]) => [g, list.sort((a, b) => a.name.localeCompare(b.name))]);
  }, [tabItems, tab]);

  // A low-stock alert of 0 means nobody's set a real threshold for that item
  // yet — usually a background/library entry that's never actually been
  // loaded as stock. Only flag items where an actual minimum was configured.
  function isLowStock(it) {
    return Number(it.low) > 0 && Number(it.qty) <= Number(it.low);
  }

  const lowStockItems = useMemo(() => {
    if (!items) return [];
    return items.filter((it) => isLowStock(it) && canView(it.mainCat));
  }, [items, isAdmin, profile]);

  const lowCount = lowStockItems.length;

  const specCatalog = useMemo(() => {
    return (items || []).filter((it) => it.mainCat === form.mainCat);
  }, [items, form.mainCat]);

  const effectiveGrade = form.grade === CUSTOM ? form.customGrade.trim() : form.grade.trim();
  const effectiveSize =
    form.mainCat === "plate" && form.stockType === "offcut"
      ? form.offcutLength.trim() && form.offcutWidth.trim()
        ? `${form.offcutLength.trim()}x${form.offcutWidth.trim()}mm`
        : ""
      : form.size === CUSTOM
      ? form.customSize.trim()
      : form.size.trim();
  const effectiveSection = form.section === CUSTOM ? form.customSection.trim() : form.section.trim();
  const effectiveSectionType = form.sectionType === CUSTOM ? form.customSectionType.trim() : form.sectionType.trim();
  const effectiveCustomer = form.customer === CUSTOM ? form.customCustomer.trim() : form.customer.trim();
  const effectiveFastenerType = form.fastenerType === CUSTOM ? (form.customFastenerType || "").trim() : form.fastenerType.trim();
  const effectiveSalesPerson = form.salesPerson === CUSTOM ? form.customSalesPerson.trim() : form.salesPerson.trim();
  const effectiveSupplier = form.supplier === CUSTOM ? form.customSupplier.trim() : form.supplier.trim();
  const effectiveSheetName = form.sheetName === CUSTOM ? form.customSheetName.trim() : form.sheetName.trim();

  const sectionOptionsForType = useMemo(() => {
    if (!master || !effectiveSectionType) return [];
    return master.sections.filter((s) => (s.type || "") === effectiveSectionType).map((s) => s.name);
  }, [master, effectiveSectionType]);

  function findFactor(listKey, name) {
    if (!master) return null;
    const hit = (master[listKey] || []).find((e) => e.name.toLowerCase() === (name || "").toLowerCase());
    return hit ? hit.factor : null;
  }

  function findPrice(listKey, name) {
    if (!master) return 0;
    const q = (name || "").toLowerCase();
    const hit = (master[listKey] || []).find((e) => e.name.toLowerCase() === q || (e.shortName || "").toLowerCase() === q);
    return hit ? hit.price || 0 : 0;
  }

  // Used by the R/unit ⇄ R/kg price toggle on the Add/Edit form — writes
  // straight back to the shared grade or section price, same underlying
  // value Requisitions and Stock Manager already read from.
  function setMaterialPrice(listKey, name, price) {
    const q = (name || "").toLowerCase();
    setMaster((prev) => ({
      ...prev,
      [listKey]: (prev[listKey] || []).map((x) =>
        x.name.toLowerCase() === q || (x.shortName || "").toLowerCase() === q ? { ...x, price } : x
      ),
    }));
  }

  function findSectionType(name) {
    if (!master) return "";
    const hit = (master.sections || []).find((e) => e.name.toLowerCase() === (name || "").toLowerCase());
    return hit ? hit.type || "" : "";
  }

  // The current non-terminal requisition tied to a stock item, if any — this
  // is what drives the red/orange/green flag shown right on the stock row.
  function activeRequisitionForItem(itemId) {
    if (!requisitions) return null;
    return requisitions.find((r) => r.itemId === itemId && ["pending", "ordered", "received"].includes(r.status)) || null;
  }

  function plateWeight(it) {
    const dims = parseSize(it.size);
    const th = parseThickness(it.thickness);
    const density = findFactor("grades", it.grade);
    if (!dims || th == null || density == null) return null;
    const [w, l] = dims;
    const perSheet = (w / 1000) * (l / 1000) * th * density;
    return { perSheet, total: perSheet * Number(it.qty || 0) };
  }

  function plateValue(it) {
    const w = plateWeight(it);
    if (!w) return null;
    const pricePerKg = findPrice("grades", it.grade);
    return { total: w.total * pricePerKg };
  }

  function structuralWeight(it) {
    const kgPerM = findFactor("sections", it.name);
    if (kgPerM == null) return null;
    return { perM: kgPerM, total: kgPerM * Number(it.qty || 0) * Number(it.length || 0) };
  }

  function structuralValue(it) {
    const pricePerM = findPrice("sections", it.name);
    const totalM = Number(it.qty || 0) * Number(it.length || 0);
    return { total: totalM * pricePerM };
  }

  // Round bar's weight comes straight from geometry (density × cross-section
  // area × length), not a lookup table of named profiles — this is the same
  // reason Plate can calculate weight directly instead of needing a Sections
  // table. kg/m = (π/4000) × diameter(mm)² × density(g/cm³).
  function cncBarWeight(it) {
    const d = parseFloat(it.diameter);
    const density = findFactor("cncGrades", it.grade);
    if (!d || density == null) return null;
    const perM = (Math.PI / 4000) * d * d * density;
    const totalM = (Number(it.length || 0) / 1000) * Number(it.qty || 0);
    return { perM, total: perM * totalM };
  }

  function cncBarValue(it) {
    const w = cncBarWeight(it);
    if (!w) return null;
    const pricePerKg = findPrice("cncGrades", it.grade);
    return { total: w.total * pricePerKg };
  }

  const tabWeightTotal = useMemo(() => {
    if (!master) return null;
    if (tab === "plate") return tabItems.reduce((sum, it) => sum + (plateWeight(it)?.total || 0), 0);
    if (tab === "structural") return tabItems.reduce((sum, it) => sum + (structuralWeight(it)?.total || 0), 0);
    if (tab === "cncBar") return tabItems.reduce((sum, it) => sum + (cncBarWeight(it)?.total || 0), 0);
    return null;
  }, [tabItems, tab, master]);

  const tabValueTotal = useMemo(() => {
    if (!master) return null;
    if (tab === "custom" || tab === "stores" || tab === "fasteners") return tabItems.reduce((sum, it) => sum + Number(it.value || 0) * Number(it.qty || 0), 0);
    if (tab === "plate") return tabItems.reduce((sum, it) => sum + (plateValue(it)?.total || 0), 0);
    if (tab === "structural") return tabItems.reduce((sum, it) => sum + (structuralValue(it)?.total || 0), 0);
    if (tab === "cncBar") return tabItems.reduce((sum, it) => sum + (cncBarValue(it)?.total || 0), 0);
    return null;
  }, [tabItems, tab, master]);

  // Company-wide total, independent of the current tab/filters — every division, everything on hand.
  const grandTotalValue = useMemo(() => {
    if (!master || !items) return 0;
    return items.reduce((sum, it) => {
      if (it.mainCat === "plate") return sum + (plateValue(it)?.total || 0);
      if (it.mainCat === "structural") return sum + (structuralValue(it)?.total || 0);
      if (it.mainCat === "cncBar") return sum + (cncBarValue(it)?.total || 0);
      if (it.mainCat === "custom" || it.mainCat === "stores" || it.mainCat === "fasteners") return sum + Number(it.value || 0) * Number(it.qty || 0);
      return sum;
    }, 0);
  }, [items, master]);

  const matchedExisting = useMemo(() => {
    if (!master) return null;
    const catalog = specCatalog.filter((it) => it.id !== editingId);
    const g = effectiveGrade.toLowerCase();
    if (form.mainCat === "plate") {
      if (!effectiveSize || !form.thickness.trim()) return null;
      // Full sheets and offcuts of the same size/grade/thickness are still
      // separate stock lines — an offcut shouldn't collide with the standard
      // full-sheet entry it happened to end up matching dimensions with.
      return catalog.find(
        (it) =>
          it.grade.trim().toLowerCase() === g &&
          (it.size || "").trim().toLowerCase() === effectiveSize.toLowerCase() &&
          (it.thickness || "").trim().toLowerCase() === form.thickness.trim().toLowerCase() &&
          (it.stockType || "full") === (form.stockType || "full")
      );
    }
    if (form.mainCat === "structural") {
      if (!effectiveSection) return null;
      // Length is part of what makes a structural stock line unique — an
      // offcut or a non-standard length shouldn't collide with the full,
      // standard-length stock of the same grade and section.
      const formLen = form.trackLength ? Number(form.length) || 0 : 0;
      return catalog.find(
        (it) =>
          it.grade.trim().toLowerCase() === g &&
          it.name.trim().toLowerCase() === effectiveSection.toLowerCase() &&
          Number(it.length || 0) === formLen
      );
    }
    if (form.mainCat === "cncBar") {
      if (!form.diameter.trim()) return null;
      // Same idea as structural offcuts — a given grade/diameter at one
      // length is a different stock line than the same grade/diameter at
      // another length, since you can't always substitute one for the other.
      const formLen = Number(form.length) || 0;
      return catalog.find(
        (it) =>
          it.grade.trim().toLowerCase() === g &&
          Number(it.diameter) === Number(form.diameter) &&
          Number(it.length || 0) === formLen
      );
    }
    if (form.mainCat === "custom") {
      if (!effectiveCustomer || !form.partNumber.trim()) return null;
      return catalog.find(
        (it) =>
          (it.customer || "").toLowerCase() === effectiveCustomer.toLowerCase() &&
          (it.partNumber || "").toLowerCase() === form.partNumber.trim().toLowerCase()
      );
    }
    if (form.mainCat === "stores") {
      if (!effectiveCustomer || !form.name.trim()) return null;
      return catalog.find(
        (it) =>
          (it.customer || "").toLowerCase() === effectiveCustomer.toLowerCase() &&
          (it.name || "").trim().toLowerCase() === form.name.trim().toLowerCase()
      );
    }
    return null;
  }, [specCatalog, editingId, effectiveGrade, effectiveSize, effectiveSection, effectiveCustomer, form.thickness, form.partNumber, form.name, form.mainCat, form.length, form.trackLength, form.stockType, form.diameter, master]);

  function ensureStringEntry(listKey, value) {
    setMaster((prev) => {
      const list = prev[listKey] || [];
      if (list.some((x) => x.toLowerCase() === value.toLowerCase())) return prev;
      return { ...prev, [listKey]: [...list, value] };
    });
  }

  // Suppliers hold more than a name (email, phone, address, logo — for
  // Purchase Orders), so a quick "+ Add new" from a picker just creates a
  // bare-minimum entry; an admin fills in the rest later in Stock Manager.
  function ensureSupplierEntry(name) {
    setMaster((prev) => {
      const list = prev.suppliers || [];
      if (list.some((s) => s.name.toLowerCase() === name.toLowerCase())) return prev;
      return { ...prev, suppliers: [...list, { id: uid(), name, email: "", phone: "", address: "" }] };
    });
  }

  function ensureFactorEntry(listKey, name, defaultFactor, sectionType) {
    setMaster((prev) => {
      const list = prev[listKey] || [];
      if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) return prev;
      const extra = listKey === "sections" ? { type: sectionType || "" } : {};
      return { ...prev, [listKey]: [...list, { name, factor: defaultFactor, price: 0, ...extra }] };
    });
  }

  // Renaming a master entry cascades to every stock item that references it,
  // so the library and the live stock stay consistent.
  // Master list values are stored as text on the rows that use them, not
  // as a reference, so renaming one in the manager left every existing row
  // pointing at the old name. A process type renamed from "tube laser
  // operator" to "tube laser" produced two departments: the old name still
  // on every job, the new one on nothing. It looked like a duplicate had
  // been created; in fact nothing had been carried across.
  //
  // These are the places a name is copied to. Anything missed here is a
  // row that silently detaches from its list.
  async function cascadeMasterRename(listKey, oldValue, newValue) {
    if (!supabase) return;
    const jobs = [];
    if (listKey === "jobProcessTypes") {
      jobs.push(
        supabase.from("job_processes").update({ process_name: newValue }).eq("process_name", oldValue),
        supabase.from("job_documents").update({ process_name: newValue }).eq("process_name", oldValue),
        supabase.from("shortages").update({ flagged_department: newValue }).eq("flagged_department", oldValue)
      );
    }
    if (listKey === "customers") {
      jobs.push(
        supabase.from("jobs").update({ customer: newValue }).eq("customer", oldValue),
        supabase.from("shortages").update({ customer: newValue }).eq("customer", oldValue)
      );
    }
    if (listKey === "staffDepartments") {
      jobs.push(supabase.from("profiles").update({ department: newValue }).eq("department", oldValue));
    }
    try {
      const results = await Promise.all(jobs);
      const failed = results.find((r) => r?.error);
      if (failed) throw failed.error;

      // allowed_process_types is a JSON array, so the element has to be
      // swapped rather than matched on — done per person, since only the
      // ones holding the old name need writing.
      if (listKey === "jobProcessTypes") {
        // Filtered here rather than with .contains(): that builds a
        // Postgres array match, which never matches a jsonb column, so it
        // returned nothing and the rename silently skipped everyone's
        // production access. There are only ever a handful of people.
        const { data: allProfiles, error } = await supabase.from("profiles").select("id, allowed_process_types");
        if (error) throw error;
        const holders = (allProfiles || []).filter((p) => (p.allowed_process_types || []).includes(oldValue));
        for (const p of holders) {
          const next = (p.allowed_process_types || []).map((v) => (v === oldValue ? newValue : v));
          const { error: upError } = await supabase
            .from("profiles")
            .update({ allowed_process_types: next })
            .eq("id", p.id);
          if (upError) throw upError;
        }
        loadPeople();
        if (productionQueue !== null) fetchProductionQueue();
      }
      if (listKey === "customers") fetchJobs();
      fetchShortages();
    } catch (err) {
      console.error("Failed to carry the rename across:", err);
      alert(
        `The name changed in the list, but existing records still say "${oldValue}": ${err.message || "unknown error"}.\n\n` +
          `Rename it back and try again, or they'll show up as a separate entry.`
      );
    }
  }

  function renameMasterEntry(listKey, oldValue, newValue) {
    if (!newValue.trim() || newValue === oldValue) return;
    cascadeMasterRename(listKey, oldValue, newValue.trim());
    const isFactor = FACTOR_TABLES.includes(listKey);
    setMaster((prev) => {
      const list = prev[listKey] || [];
      const updated = isFactor
        ? list.map((e) => (e.name === oldValue ? { ...e, name: newValue } : e))
        : list.map((e) => (e === oldValue ? newValue : e));
      // Renaming a section type cascades into every section tagged with it.
      const cascaded =
        listKey === "sectionTypes"
          ? (prev.sections || []).map((s) => (s.type === oldValue ? { ...s, type: newValue } : s))
          : prev.sections;
      return { ...prev, [listKey]: updated, sections: cascaded };
    });
    setItems((prev) =>
      prev.map((it) => {
        if (listKey === "sizes" && it.mainCat === "plate" && it.size === oldValue) {
          return { ...it, size: newValue, name: plateName(newValue, it.thickness) };
        }
        if (listKey === "sections" && it.mainCat === "structural" && it.name === oldValue) {
          return { ...it, name: newValue };
        }
        if (listKey === "grades" && it.grade === oldValue) {
          return { ...it, grade: newValue };
        }
        if (listKey === "salesPeople" && it.salesPerson === oldValue) {
          return { ...it, salesPerson: newValue };
        }
        if (listKey === "customers" && it.customer === oldValue) {
          return { ...it, customer: newValue };
        }
        return it;
      })
    );
  }

  // Bumping stock up on an item closes out whatever requisition is tracking
  // it — if it was already "received" that's just confirming the count; if
  // it was still "ordered", loading real stock in *is* the receiving step,
  // so that gets recorded as received (by whoever did it) on the way through.
  function closeOutRequisitionsForItem(itemId) {
    setRequisitions((prev) =>
      prev.map((r) => {
        if (r.itemId !== itemId) return r;
        if (r.status === "received") {
          return { ...r, status: "fulfilled", dateFulfilled: new Date().toISOString() };
        }
        if (r.status === "ordered") {
          return {
            ...r,
            status: "fulfilled",
            receivedBy: roleLabel,
            dateReceived: r.dateReceived || new Date().toISOString(),
            dateFulfilled: new Date().toISOString(),
          };
        }
        return r;
      })
    );
  }

  // prefill lets the caller supply the job and customer up front — used
  // when an operator pulls stock from inside a process, where the job is
  // already known and retyping the number is just a chance to get it wrong.
  function openUsageModal(item, direction, prefill = {}) {
    setUsageModal({
      item,
      direction,
      qty: "",
      cutQty: "1",
      jobNumber: prefill.jobNumber || "",
      customer: prefill.customer || "",
      note: prefill.note || "",
    });
  }

  function closeUsageModal() {
    setUsageModal(null);
  }

  // Snapshotted at the moment stock is used, so job costing reflects what
  // things actually cost then — not whatever the price happens to be if
  // someone looks the job up again after a rate change.
  function resolveUsageLineCost(item, qty) {
    if (!item) return 0;
    if (item.mainCat === "plate") {
      const w = plateWeight(item);
      const pricePerKg = findPrice("grades", item.grade);
      return w ? qty * w.perSheet * pricePerKg : 0;
    }
    if (item.mainCat === "structural") {
      const pricePerM = findPrice("sections", item.name);
      const metresPerPiece = item.trackLength ? Number(item.length || 0) : 1;
      return qty * metresPerPiece * pricePerM;
    }
    if (item.mainCat === "cncBar") {
      // qty here is the cut length in mm, not a piece count.
      const w = cncBarWeight(item);
      const pricePerKg = findPrice("cncGrades", item.grade);
      return w ? (qty / 1000) * w.perM * pricePerKg : 0;
    }
    return qty * Number(item.value || 0);
  }

  function submitUsageModal(e) {
    e.preventDefault();
    const qty = parseFloat(usageModal.qty);
    if (!qty || qty <= 0) return;
    if (usageModal.direction === "use" && !usageModal.jobNumber.trim() && !usageModal.customer.trim()) return;
    const itemId = usageModal.item.id;

    // Reserved material is not up for grabs. Taking it has to go through
    // its allocation, so it is booked against the job it was set aside
    // for — otherwise the first person to the rack wins and the
    // reservation means nothing.
    if (usageModal.direction === "use") {
      const held = reservedQtyForItem(itemId);
      const free = Math.max(0, Number(usageModal.item.qty) - held);
      if (held > 0 && qty > free) {
        alert(
          `Only ${free} of ${usageModal.item.qty} is free — the other ${held} is reserved for another job.\n\n` +
            `To use reserved material, open the reserved marker on this item and mark that allocation used, so it's booked against the job it was set aside for.`
        );
        return;
      }
    }

    // CNC Bar is sold by cutting an arbitrary length off a single piece, not
    // by whole pieces — cutting from a group of otherwise-identical pieces
    // splits one of them off as its own shorter remainder line, so the
    // other full-length pieces are never affected.
    if (usageModal.item.mainCat === "cncBar" && usageModal.direction === "use") {
      const item = usageModal.item;
      const cutQty = parseInt(usageModal.cutQty, 10) || 1;
      const totalMm = qty * cutQty;
      if (totalMm > Number(item.length || 0)) {
        alert(
          `Can't cut ${cutQty} × ${qty}mm (${totalMm}mm total) — this piece only has ${item.length}mm remaining.`
        );
        return;
      }
      const remainder = Number(item.length) - totalMm;
      const lineCost = resolveUsageLineCost(item, totalMm);
      setItems((prev) => {
        const currentQty = Number(item.qty) || 1;
        if (currentQty <= 1) {
          // Only one piece at this length — cut straight into it.
          if (remainder <= 0) return prev.filter((it) => it.id !== itemId);
          return prev.map((it) => (it.id === itemId ? { ...it, length: remainder } : it));
        }
        // Multiple identical pieces — take one out of the group to cut from,
        // and (if anything's left) file the leftover as its own new line.
        const reduced = prev.map((it) => (it.id === itemId ? { ...it, qty: currentQty - 1 } : it));
        if (remainder <= 0) return reduced;
        return [...reduced, { ...item, id: uid(), qty: 1, length: remainder }];
      });
      setUsageLog((prev) => [
        ...prev,
        {
          id: uid(),
          itemId,
          itemName: item.name,
          mainCat: item.mainCat,
          qty: totalMm,
          cutLength: qty,
          cutPieces: cutQty,
          direction: "use",
          by: roleLabel,
          jobNumber: usageModal.jobNumber.trim(),
          customer: usageModal.customer.trim(),
          note: usageModal.note.trim(),
          lineCost,
          timestamp: new Date().toISOString(),
        },
      ]);
      closeUsageModal();
      return;
    }

    const delta = usageModal.direction === "add" ? qty : -qty;
    const lineCost = usageModal.direction === "use" ? resolveUsageLineCost(usageModal.item, qty) : 0;
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, qty: Math.max(0, Number(it.qty) + delta) } : it)));
    if (delta > 0) closeOutRequisitionsForItem(itemId);
    setUsageLog((prev) => [
      ...prev,
      {
        id: uid(),
        itemId,
        itemName: usageModal.item.name,
        mainCat: usageModal.item.mainCat,
        qty,
        direction: usageModal.direction,
        by: roleLabel,
        jobNumber: usageModal.jobNumber.trim(),
        customer: usageModal.customer.trim(),
        note: usageModal.note.trim(),
        lineCost,
        timestamp: new Date().toISOString(),
      },
    ]);
    closeUsageModal();
  }

  function openAssetRemoveModal(item) {
    setAssetRemoveModal({ item, reason: "", date: new Date().toISOString().slice(0, 10) });
  }

  function closeAssetRemoveModal() {
    setAssetRemoveModal(null);
  }

  function submitAssetRemoveModal(e) {
    e.preventDefault();
    if (!assetRemoveModal.reason.trim()) return;
    const itemId = assetRemoveModal.item.id;
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              status: "removed",
              removedReason: assetRemoveModal.reason.trim(),
              removedDate: assetRemoveModal.date,
              removedBy: roleLabel,
            }
          : it
      )
    );
    closeAssetRemoveModal();
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    window.storage.delete(`attachment:${id}`, true).catch(() => {});
  }

  // Used by the Stock Manager's Customer Stock catalog view — the same real
  // items shown on the main tab, just including zero-qty ones too, so the
  // full catalog (imported but not yet actually stocked) stays manageable.
  function updateCustomerStockField(id, field, value) {
    const numericFields = ["value", "low", "qty"];
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: numericFields.includes(field) ? parseFloat(value) || 0 : value } : it)));
  }

  function openRequisition(it) {
    setRequisitionTarget(it);
    setEditingRequisitionId(null);
    setRequisitionQty("");
    setRequisitionNotes("");
    setRequisitionSupplier(it.supplier || "");
  }

  // Corrects an existing pending request — same form, but updates the
  // original in place rather than creating a second one. requisitionTarget
  // just needs enough shape to display the item label; the qty/supplier/
  // notes fields are what actually change.
  function openEditRequisition(req) {
    setRequisitionTarget({ mainCat: req.mainCat, grade: req.itemGrade, name: req.itemRawName || req.itemLabel });
    setEditingRequisitionId(req.id);
    setRequisitionQty(String(req.qty));
    setRequisitionNotes(req.notes || "");
    setRequisitionSupplier(req.supplier || "");
  }

  function openRequisitionPicker() {
    setShowRequisitionPicker(true);
    setRequisitionPickerQuery("");
  }

  function closeRequisitionPicker() {
    setShowRequisitionPicker(false);
    setRequisitionPickerQuery("");
  }

  // Opens the real Add Item form, pre-filled with whatever was typed in
  // the requisition search — same "not found? create it" pattern as
  // service consumables. On save, addItem() sees addingItemForRequisition
  // and walks straight into requesting stock for the new item.
  function createItemForRequisition(name) {
    setAddingItemForRequisition(true);
    setForm({ ...emptyForm, id: uid(), mainCat: tab !== "requisitions" && tab !== "purchaseOrders" ? tab : "plate", name });
    setEditingId(null);
    setAllowDuplicate(false);
    setShowAdd(true);
    closeRequisitionPicker();
  }

  // Picking an item from the search hands straight off into the same
  // request form every other requisition uses — this only replaces how
  // the item gets found, not what happens once it's chosen.
  function pickItemForRequisition(it) {
    closeRequisitionPicker();
    openRequisition(it);
  }

  function closeRequisition() {
    setRequisitionTarget(null);
    setEditingRequisitionId(null);
    setRequisitionQty("");
    setRequisitionNotes("");
    setRequisitionSupplier("");
  }

  function submitRequisition(e) {
    e.preventDefault();
    if (!requisitionTarget || !requisitionQty.trim()) return;
    if (editingRequisitionId) {
      updateRequisition(editingRequisitionId, {
        qty: requisitionQty.trim(),
        notes: requisitionNotes.trim(),
        supplier: requisitionSupplier,
      });
      closeRequisition();
      return;
    }
    const label =
      requisitionTarget.mainCat === "plate"
        ? `${requisitionTarget.grade} — ${requisitionTarget.name}`
        : requisitionTarget.mainCat === "structural"
        ? `${requisitionTarget.grade} — ${requisitionTarget.name}`
        : `${requisitionTarget.customer ? requisitionTarget.customer + " — " : ""}${requisitionTarget.name}`;
    setRequisitions((prev) => [
      ...prev,
      {
        id: uid(),
        mainCat: requisitionTarget.mainCat,
        itemId: requisitionTarget.id,
        itemLabel: label,
        itemGrade: requisitionTarget.grade || "",
        itemRawName: requisitionTarget.name || "",
        qty: requisitionQty.trim(),
        notes: requisitionNotes.trim(),
        requestedBy: roleLabel,
        dateRequested: new Date().toISOString(),
        status: "pending",
        supplier: requisitionSupplier,
        orderedBy: "",
        dateOrdered: "",
        receivedBy: "",
        dateReceived: "",
      },
    ]);
    closeRequisition();
  }

  function updateRequisition(id, fields) {
    setRequisitions((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)));
  }

  function markOrdered(id) {
    updateRequisition(id, { status: "ordered", dateOrdered: new Date().toISOString(), orderedBy: roleLabel });
  }

  // Marking received is the one decisive action, for every division: pull
  // the (possibly buyer-corrected) quantity straight into real stock and
  // close the requisition out in the same step. No separate "arrived but
  // still shows zero" waiting state — if it says arrived, it's on the shelf.
  function markReceived(id) {
    const req = requisitions.find((r) => r.id === id);
    if (!req) return;
    const qtyToAdd = parseFloat(req.qty);
    if (!isNaN(qtyToAdd) && qtyToAdd > 0) {
      setItems((prev) => prev.map((it) => (it.id === req.itemId ? { ...it, qty: Number(it.qty || 0) + qtyToAdd } : it)));
      setUsageLog((prev) => [
        ...prev,
        {
          id: uid(),
          itemId: req.itemId,
          itemName: req.itemLabel,
          mainCat: req.mainCat,
          qty: qtyToAdd,
          direction: "add",
          by: roleLabel,
          jobNumber: "",
          customer: "",
          note: `Received via requisition${req.supplier ? ` — ${req.supplier}` : ""}`,
          lineCost: 0,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
    updateRequisition(id, {
      status: "fulfilled",
      dateReceived: new Date().toISOString(),
      receivedBy: roleLabel,
      dateFulfilled: new Date().toISOString(),
    });
  }

  // Clicking the flag directly on a stock row: if this login is allowed to
  // confirm arrival and the order is sitting at "ordered", one tap marks it
  // received. Otherwise (pending, or no permission) just jump to the full
  // Requisitions tab for more detail.
  function handleFlagClick(req) {
    // "Received" here means the delivery arrived but (from older data, before
    // this got tightened up) never got closed out — clicking it should finish
    // that last step immediately, same as clicking it from "ordered".
    if ((req.status === "ordered" || req.status === "received") && canMarkReceivedPerm) {
      markReceived(req.id);
    } else {
      setTab("requisitions");
    }
  }

  function cancelRequisition(id) {
    updateRequisition(id, { status: "cancelled" });
  }

  // ---- Purchase Orders ----

  function buildPoDoc(po) {
    const doc = new jsPDF();
    const company = master.companyDetails || {};
    const supplier = master.suppliers.find((s) => s.id === po.supplierId);
    const leftX = 14;
    const rightX = 196;

    // ---- Header: logo on its own row above the company details, at its
    // real proportions — a fixed square box would squish anything that
    // isn't already perfectly square, so the size is derived from the
    // logo's actual width/height instead. ----
    const textX = leftX;
    const { height: poLogoH } = addCompanyLogo(doc, company, leftX, 10, 45, 22);
    let logoY = 10 + (poLogoH ? poLogoH + 6 : 0);
    let headerY = logoY + 4;
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    // Wrap the company name to fit before the "PURCHASE ORDER" title, so a
    // long registered company name never overlaps it.
    const nameMaxWidth = 118;
    const nameLines = doc.splitTextToSize(company.name || "Purchase Order", nameMaxWidth);
    doc.text(nameLines, textX, headerY);
    let compY = headerY + nameLines.length * 5 + 3;
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    const contactLine = [company.phone, company.email].filter(Boolean).join("   ");
    if (contactLine) {
      doc.text(contactLine, textX, compY);
      compY += 5;
    }

    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("PURCHASE ORDER", rightX, 16, { align: "right" });

    // ---- Three-column info strip: postal address / delivery address / PO
    // metadata — matches the layout of your actual Sage documents. ----
    const col1X = leftX;
    const col2X = 80;
    const col3X = 145;
    const colTopY = Math.max(compY, 40) + 6;
    const addressLines = (company.address || "").split(",").map((s) => s.trim()).filter(Boolean);

    doc.setFontSize(9);
    let c1y = colTopY;
    if (company.vatNumber) {
      doc.setFont(undefined, "bold");
      doc.text("VAT No: ", col1X, c1y);
      doc.setFont(undefined, "normal");
      doc.text(company.vatNumber, col1X + 15, c1y);
      c1y += 5;
    }
    doc.setFont(undefined, "normal");
    doc.text("POSTAL ADDRESS ONLY:", col1X, c1y);
    c1y += 5;
    addressLines.forEach((line) => {
      doc.text(line, col1X, c1y);
      c1y += 5;
    });

    let c2y = colTopY;
    doc.text("DELIVERY ADDRESS:", col2X, c2y);
    c2y += 5;
    addressLines.forEach((line) => {
      doc.text(line, col2X, c2y);
      c2y += 5;
    });
    if (company.regNumber) {
      doc.text(`Reg No: ${company.regNumber}`, col2X, c2y);
      c2y += 5;
    }

    let c3y = colTopY;
    const metaLine = (label, value) => {
      if (!value) return;
      doc.setFont(undefined, "bold");
      doc.text(label, col3X, c3y);
      doc.setFont(undefined, "normal");
      doc.text(String(value), rightX, c3y, { align: "right" });
      c3y += 5;
    };
    metaLine("Number:", po.poNumber);
    metaLine("Date:", new Date(po.dateCreated).toLocaleDateString());
    metaLine("Reference:", po.reference);
    metaLine("Sales person:", po.salesPerson);
    metaLine("Delivery Date:", po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString() : "");

    let y = Math.max(c1y, c2y, c3y) + 6;

    // ---- Supplier block ----
    let supX = leftX;
    if (supplier?.logo) {
      try {
        const imgProps = doc.getImageProperties(supplier.logo);
        const maxW = 18;
        const maxH = 18;
        let logoW = maxW;
        let logoH = (imgProps.height / imgProps.width) * logoW;
        if (logoH > maxH) {
          logoH = maxH;
          logoW = (imgProps.width / imgProps.height) * logoH;
        }
        doc.addImage(supplier.logo, "JPEG", leftX, y, logoW, logoH);
        supX = leftX + 24;
      } catch {
        // skip on bad image data
      }
    }
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("Supplier", supX, y + 4);
    doc.setFont(undefined, "normal");
    let supY = y + 10;
    doc.setFont(undefined, "bold");
    doc.text(supplier?.name || po.supplierName || "—", supX, supY);
    doc.setFont(undefined, "normal");
    supY += 5;
    if (supplier?.vatNumber) {
      doc.text(`Supplier VAT No: ${supplier.vatNumber}`, supX, supY);
      supY += 5;
    }
    [supplier?.email, supplier?.phone, supplier?.address].filter(Boolean).forEach((line) => {
      doc.text(line, supX, supY);
      supY += 5;
    });

    y = Math.max(supY, y + 22) + 6;

    // ---- Line items — priced excluding VAT, with VAT and the inclusive
    // total broken out per line, same shape as a standard SA supplier PO ----
    const vatRate = po.vatRate != null ? po.vatRate : 15;
    autoTable(doc, {
      startY: y,
      head: [["Description", "Qty", "Excl. Price", "VAT %", "Excl. Total", "Incl. Total"]],
      body: po.lineItems.map((li) => {
        const exclTotal = Number(li.qty) * Number(li.unitPrice);
        const inclTotal = exclTotal * (1 + vatRate / 100);
        return [
          li.description,
          String(li.qty),
          `R ${Number(li.unitPrice).toFixed(2)}`,
          `${vatRate}%`,
          `R ${exclTotal.toFixed(2)}`,
          `R ${inclTotal.toFixed(2)}`,
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [27, 29, 31] },
    });

    const afterTableY = (doc.lastAutoTable?.finalY || y + 20) + 8;
    const exclusiveTotal = po.exclusiveTotal != null ? po.exclusiveTotal : po.lineItems.reduce((s, li) => s + Number(li.qty) * Number(li.unitPrice), 0);
    const vatTotal = po.vatTotal != null ? po.vatTotal : exclusiveTotal * (vatRate / 100);
    const grandTotal = po.totalValue != null ? po.totalValue : exclusiveTotal + vatTotal;

    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text("Total Exclusive:", rightX - 45, afterTableY);
    doc.text(`R ${exclusiveTotal.toFixed(2)}`, rightX, afterTableY, { align: "right" });
    doc.text(`Total VAT (${vatRate}%):`, rightX - 45, afterTableY + 5);
    doc.text(`R ${vatTotal.toFixed(2)}`, rightX, afterTableY + 5, { align: "right" });
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Total:", rightX - 45, afterTableY + 12);
    doc.text(`R ${grandTotal.toFixed(2)}`, rightX, afterTableY + 12, { align: "right" });

    let stampBottomY = afterTableY + 12;

    if (po.status === "received") {
      // A clear, unmissable stamp showing what actually happened once this
      // PO was received — reprinting an already-received PO should never
      // look identical to the original, unreceived version.
      const stampTop = afterTableY + 20;
      const anyQtyDiffers = (po.receivedLineItems || []).some((l) => l.receivedQty !== l.orderedQty);
      const stampLines = [
        `RECEIVED — ${po.receivedBy || "—"} on ${po.receivedDate ? new Date(po.receivedDate).toLocaleString() : "—"}`,
        `Supplier delivery note: ${po.deliveryNoteNumber || "—"}`,
      ];
      const qtyLines = anyQtyDiffers
        ? (po.receivedLineItems || [])
            .filter((l) => l.receivedQty !== l.orderedQty)
            .map((l) => `  ${l.description}: ordered ${l.orderedQty}, received ${l.receivedQty}`)
        : [];
      const boxHeight = 8 + stampLines.length * 5 + (qtyLines.length ? 4 + qtyLines.length * 5 : 0) + 4;

      doc.setDrawColor(200, 60, 60);
      doc.setLineWidth(0.6);
      doc.roundedRect(leftX, stampTop, rightX - leftX, boxHeight, 2, 2);

      doc.setTextColor(200, 60, 60);
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      let stampY = stampTop + 6;
      stampLines.forEach((line) => {
        doc.text(line, leftX + 4, stampY);
        stampY += 5;
      });
      if (qtyLines.length) {
        doc.setFontSize(9);
        doc.text("Quantity differed from what was ordered:", leftX + 4, stampY);
        stampY += 5;
        doc.setFont(undefined, "normal");
        qtyLines.forEach((line) => {
          doc.text(line, leftX + 4, stampY);
          stampY += 5;
        });
      }
      doc.setTextColor(0, 0, 0);
      stampBottomY = stampTop + boxHeight;
    }

    if (po.notes) {
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      doc.text(`Notes: ${po.notes}`, leftX, stampBottomY + 8);
    }

    return doc;
  }

  // ---- Receiving ----
  // A PO line only has a real stock item behind it when that line came from
  // a linked requisition — lines added by hand in the PO builder have
  // nothing to match against, so those just get flagged for manual entry.
  function openReceiving(po) {
    const linkedReqs = (po.linkedRequisitionIds || []).map((id) => requisitions.find((r) => r.id === id)).filter(Boolean);
    const lines = po.lineItems.map((li, idx) => {
      const linkedReq = linkedReqs[idx] || null;
      const linkedItem = linkedReq ? items.find((it) => it.id === linkedReq.itemId) : null;
      return {
        description: li.description,
        orderedQty: li.qty,
        receivedQty: String(li.qty),
        linkedRequisitionId: linkedReq?.id || null,
        linkedItemId: linkedItem?.id || null,
        linkedItemName: linkedItem?.name || null,
        linkedItemMainCat: linkedItem?.mainCat || null,
      };
    });
    setReceivingPo(po);
    setReceivingLines(lines);
    setReceivingDeliveryNote("");
    setReceivingAdjustingIdx(null);
  }

  function closeReceiving() {
    setReceivingPo(null);
    setReceivingLines([]);
    setReceivingDeliveryNote("");
    setReceivingAdjustingIdx(null);
  }

  function updateReceivingLineQty(idx, value) {
    setReceivingLines((prev) => prev.map((l, i) => (i === idx ? { ...l, receivedQty: value } : l)));
  }

  function submitReceiving() {
    if (!receivingDeliveryNote.trim()) {
      alert("Please enter the supplier's delivery note number before confirming.");
      return;
    }
    const timestamp = new Date().toISOString();
    receivingLines.forEach((line) => {
      const receivedQty = parseFloat(line.receivedQty) || 0;
      if (receivedQty <= 0) return;
      if (line.linkedItemId) {
        setItems((prev) => prev.map((it) => (it.id === line.linkedItemId ? { ...it, qty: Number(it.qty) + receivedQty } : it)));
        setUsageLog((prev) => [
          ...prev,
          {
            id: uid(),
            itemId: line.linkedItemId,
            itemName: line.linkedItemName,
            mainCat: line.linkedItemMainCat,
            qty: receivedQty,
            direction: "add",
            by: roleLabel,
            jobNumber: "",
            customer: "",
            note: `Received against ${receivingPo.poNumber} — delivery note ${receivingDeliveryNote.trim()}`,
            lineCost: 0,
            timestamp,
          },
        ]);
      }
      if (line.linkedRequisitionId) {
        setRequisitions((prev) =>
          prev.map((r) =>
            r.id === line.linkedRequisitionId
              ? { ...r, status: "fulfilled", dateFulfilled: timestamp, receivedBy: roleLabel, dateReceived: timestamp }
              : r
          )
        );
      }
    });
    setPurchaseOrders((prev) =>
      prev.map((p) =>
        p.id === receivingPo.id
          ? {
              ...p,
              status: "received",
              receivedBy: roleLabel,
              receivedDate: timestamp,
              deliveryNoteNumber: receivingDeliveryNote.trim(),
              // Kept so a printout of an already-received PO can show what
              // actually arrived, not just what was originally ordered.
              receivedLineItems: receivingLines.map((l) => ({
                description: l.description,
                orderedQty: Number(l.orderedQty),
                receivedQty: parseFloat(l.receivedQty) || 0,
              })),
            }
          : p
      )
    );
    closeReceiving();
  }

  // Opens the PO in the same inline viewer already used for drawing/photo
  // attachments, and stores it properly so it can be reopened later
  // instead of only existing for this one moment — same fix as every
  // other document generator needed. This replaces the old separate
  // "Download" action too: the viewer already has its own download link,
  // so a second, differently-behaving button next to it was redundant.
  async function viewPoPdf(po) {
    const doc = buildPoDoc(po);
    await generateAndStoreDocument({
      doc,
      documentType: "purchase_order",
      bucket: "job-documents",
      path: `po/${po.id}/${po.poNumber}.pdf`,
      fileName: `${po.poNumber}.pdf`,
      relatedId: po.poNumber,
    });
  }

  // A summary-table report across many POs at once — for spend review, not
  // for sending to a supplier, so this is a plain table, not a letterhead.
  async function generatePoReport() {
    const matches = purchaseOrders
      .filter((po) => !poReportSupplier || po.supplierId === poReportSupplier)
      .filter((po) => !poReportStatus || (poReportStatus === "received" ? po.status === "received" : po.status !== "received"))
      .filter((po) => !poReportFrom || new Date(po.dateCreated) >= new Date(poReportFrom))
      .filter((po) => !poReportTo || new Date(po.dateCreated) <= new Date(poReportTo + "T23:59:59"))
      .sort((a, b) => new Date(a.dateCreated) - new Date(b.dateCreated));

    if (matches.length === 0) {
      alert("No Purchase Orders match that date range/supplier.");
      return;
    }

    const doc = new jsPDF();
    const company = master.companyDetails || {};
    const { width: reportLogoW } = addCompanyLogo(doc, company, 14, 10, 26, 14);
    const textX = reportLogoW ? 14 + reportLogoW + 6 : 14;
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(`${company.name || "Purchase Order Report"}`, textX, 18);
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const supplierLabel = poReportSupplier ? master.suppliers.find((s) => s.id === poReportSupplier)?.name || "" : "All suppliers";
    const rangeLabel = `${poReportFrom || "earliest"} to ${poReportTo || "latest"}`;
    doc.text(`${supplierLabel} · ${rangeLabel}`, textX, 25);

    const total = matches.reduce((sum, po) => sum + po.totalValue, 0);

    autoTable(doc, {
      startY: 32,
      head: [["PO Number", "Date", "Supplier", "Status", "Received By", "Lines", "Total"]],
      body: matches.map((po) => [
        po.poNumber,
        new Date(po.dateCreated).toLocaleDateString(),
        po.supplierName || "—",
        po.status === "received" ? "Received" : "Outstanding",
        po.status === "received" ? `${po.receivedBy || "—"} (${po.receivedDate ? new Date(po.receivedDate).toLocaleDateString() : "—"})` : "—",
        String(po.lineItems.length),
        `R ${po.totalValue.toFixed(2)}`,
      ]),
      foot: [["", "", "", "", "", "Grand total", `R ${total.toFixed(2)}`]],
      theme: "grid",
      headStyles: { fillColor: [27, 29, 31] },
      footStyles: { fillColor: [242, 169, 0], textColor: [27, 29, 31], fontStyle: "bold" },
    });

    // Not tied to one job or PO — each run is its own dated snapshot for
    // whatever filter was used, so it gets its own timestamped path rather
    // than overwriting a previous report.
    const fileName = `PO-Report-${new Date().toISOString().slice(0, 10)}-${Date.now()}.pdf`;
    await generateAndStoreDocument({
      doc,
      documentType: "po_report",
      bucket: "job-documents",
      path: `po-reports/${fileName}`,
      fileName,
    });
    setShowPoReport(false);
  }

  function openPoBuilder(linkedRequisitionIds = [], prefillSupplierId = "", prefillLineItems = []) {
    setPoBuilder({
      supplierId: prefillSupplierId,
      lineItems: prefillLineItems.length ? prefillLineItems : [{ description: "", qty: "", unitPrice: "" }],
      notes: "",
      linkedRequisitionIds,
      deliveryDate: "",
      vatRate: "15",
      reference: "",
    });
  }

  // Starts a brand-new PO pre-filled with an old one's supplier and lines
  // — not linked to whatever requisitions the original PO was, since this
  // is a fresh order being raised now, not a continuation of that one.
  // Quantities carry over exactly as they were; editing them before
  // sending is the whole point of copying rather than starting blank.
  function copyPurchaseOrder(po) {
    openPoBuilder(
      [],
      po.supplierId,
      po.lineItems.map((li) => ({ description: li.description, qty: String(li.qty), unitPrice: String(li.unitPrice) }))
    );
  }

  function closePoBuilder() {
    setPoBuilder(null);
  }

  function addPoLineItem() {
    setPoBuilder((b) => ({ ...b, lineItems: [...b.lineItems, { description: "", qty: "", unitPrice: "" }] }));
  }

  function updatePoLineItem(idx, field, value) {
    setPoBuilder((b) => ({
      ...b,
      lineItems: b.lineItems.map((li, i) => (i === idx ? { ...li, [field]: value } : li)),
    }));
  }

  function removePoLineItem(idx) {
    setPoBuilder((b) => ({ ...b, lineItems: b.lineItems.filter((_, i) => i !== idx) }));
  }

  // Selecting requisitions on the Buyer page to bundle into one PO — reused
  // by the checkbox flow on each pending requisition card.
  function toggleReqSelection(id) {
    setSelectedReqIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function raisePoFromSelected() {
    const selected = requisitions.filter((r) => selectedReqIds.includes(r.id));
    if (selected.length === 0) return;
    const lineItems = selected.map((r) => ({
      description: r.itemLabel,
      qty: r.qty,
      unitPrice: resolvePoLineUnitPrice(r),
    }));
    // If every selected requisition already has the same supplier text set,
    // try to match it to a real supplier record to prefill the picker.
    const supplierNames = [...new Set(selected.map((r) => r.supplier).filter(Boolean))];
    const matched = supplierNames.length === 1 ? master.suppliers.find((s) => s.name === supplierNames[0]) : null;
    openPoBuilder(selected.map((r) => r.id), matched?.id || "", lineItems);
  }

  // One-click version of the same bundling, for an entire supplier's group
  // of pending requisitions at once — the everyday case this exists for:
  // several separate requests for the same supplier, submitted together as
  // one PO instead of raising one at a time throughout the day.
  function raisePoForSupplierGroup(supplierName, reqList) {
    if (reqList.length === 0) return;
    const lineItems = reqList.map((r) => ({
      description: r.itemLabel,
      qty: r.qty,
      unitPrice: resolvePoLineUnitPrice(r),
    }));
    const matched = master.suppliers.find((s) => s.name === supplierName);
    openPoBuilder(reqList.map((r) => r.id), matched?.id || "", lineItems);
  }

  // Shared by both the supplier-grouped pending list and the flat ordered
  // list below — same card, just reused rather than duplicated.
  function renderRequisitionCard(r) {
    const price = resolveReqPrice(r);
    const isOpen = expandedReqId === r.id;
    const canAddToPo = canManageRequisitions && r.status === "pending" && canRaisePO;
    return (
      <div key={r.id} style={S.reqCard}>
        <button
          type="button"
          className="stk-btn"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            textAlign: "left",
            cursor: "pointer",
            gap: 10,
            background: "transparent",
            border: "none",
            padding: 0,
            color: "inherit",
            font: "inherit",
          }}
          onClick={() => setExpandedReqId(isOpen ? null : r.id)}
        >
          <span style={S.itemName}>{r.itemLabel}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...S.reqStatusTag, ...S["reqStatus_" + r.status] }}>{r.status}</span>
            {canAddToPo && (
              <label style={S.reqSelectLabel} onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selectedReqIds.includes(r.id)} onChange={() => toggleReqSelection(r.id)} />
                Add to PO
              </label>
            )}
            <ChevronDown size={16} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </span>
        </button>
        {isOpen && (
          <>
            <div className="stk-meta-row" style={{ ...S.rowMeta, marginTop: 6 }}>
              {canManageRequisitions ? (
                <span style={S.reqQtyEditRow}>
                  Qty:
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={r.qty}
                    onChange={(e) => updateRequisition(r.id, { qty: e.target.value })}
                    style={S.reqQtyInput}
                  />
                </span>
              ) : (
                <span>Qty: {r.qty}</span>
              )}
              <span>Requested by {r.requestedBy}</span>
              <span>{new Date(r.dateRequested).toLocaleDateString()}</span>
              {r.status === "ordered" && r.orderedBy && (
                <span>Ordered by {r.orderedBy} on {new Date(r.dateOrdered).toLocaleDateString()}</span>
              )}
              {r.supplier && <span>Supplier: {r.supplier}</span>}
            </div>
            {r.notes && <div style={S.itemComment}>{r.notes}</div>}
            {canManageRequisitions && r.mainCat !== "custom" && (
              <div style={S.reqPriceRow}>
                <span style={S.reqPriceLabel}>
                  Current price ({r.mainCat === "plate" || r.mainCat === "cncBar" ? "R/kg" : r.mainCat === "structural" ? "R/m" : "R/ea"})
                  {price === 0 ? " — not set" : ""}:
                </span>
                <input
                  type="number"
                  step="0.01"
                  style={{ ...S.managerFactorInput, ...(price === 0 ? S.reqPriceMissing : {}) }}
                  value={price === 0 ? "" : price}
                  placeholder="0"
                  onChange={(e) => updateReqPrice(r, e.target.value)}
                />
              </div>
            )}
            {canManageRequisitions && r.status === "pending" && (
              <div style={S.reqActions}>
                <select
                  style={{ ...S.input, flex: 1 }}
                  value={r.supplier}
                  onChange={(e) => updateRequisition(r.id, { supplier: e.target.value })}
                >
                  <option value="">Supplier (optional)</option>
                  {master.suppliers.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
                <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => markOrdered(r.id)}>
                  <ShoppingCart size={13} /> Mark ordered
                </button>
                <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => openEditRequisition(r)}>
                  <Pencil size={13} /> Edit
                </button>
                <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => cancelRequisition(r.id)}>
                  Cancel
                </button>
              </div>
            )}
            {r.status === "ordered" && canMarkReceivedPerm && (
              <div style={S.reqActions}>
                <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => markReceived(r.id)}>
                  <Check size={13} /> Mark received
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  function submitPurchaseOrder(e) {
    e.preventDefault();
    if (!poBuilder.supplierId) return;
    const validLines = poBuilder.lineItems.filter((li) => li.description.trim() && Number(li.qty) > 0);
    if (validLines.length === 0) return;
    // Line prices are entered excluding VAT (standard practice, matches what
    // a supplier quotes) — VAT gets added on top for the real payable total.
    const exclusiveTotal = validLines.reduce((sum, li) => sum + Number(li.qty) * Number(li.unitPrice || 0), 0);
    const vatRate = Number(poBuilder.vatRate) || 0;
    const vatTotal = exclusiveTotal * (vatRate / 100);
    const totalValue = exclusiveTotal + vatTotal;
    const po = {
      id: uid(),
      poNumber: formatPoNumber(master.nextPoNumber),
      supplierId: poBuilder.supplierId,
      supplierName: master.suppliers.find((s) => s.id === poBuilder.supplierId)?.name || "",
      dateCreated: new Date().toISOString(),
      createdBy: roleLabel,
      lineItems: validLines.map((li) => ({ ...li, qty: Number(li.qty), unitPrice: Number(li.unitPrice) || 0 })),
      exclusiveTotal,
      vatRate,
      vatTotal,
      totalValue,
      deliveryDate: poBuilder.deliveryDate,
      reference: poBuilder.reference.trim(),
      // Tied to whoever is actually logged in, not a free-pick dropdown —
      // this is an accountability field, so it can't be set to someone
      // else's name.
      salesPerson: roleLabel,
      notes: poBuilder.notes.trim(),
      linkedRequisitionIds: poBuilder.linkedRequisitionIds,
      status: "outstanding",
      receivedBy: "",
      receivedDate: "",
      deliveryNoteNumber: "",
    };
    setPurchaseOrders((prev) => [...prev, po]);
    setMaster((prev) => ({ ...prev, nextPoNumber: (prev.nextPoNumber || 1) + 1 }));
    // Bundling requisitions into a PO is the "ordering" step — move them on
    // the same way markOrdered does, and remember which PO they belong to.
    if (poBuilder.linkedRequisitionIds.length) {
      setRequisitions((prev) =>
        prev.map((r) =>
          poBuilder.linkedRequisitionIds.includes(r.id)
            ? { ...r, status: "ordered", dateOrdered: new Date().toISOString(), orderedBy: roleLabel, poNumber: po.poNumber }
            : r
        )
      );
      setSelectedReqIds([]);
    }
    viewPoPdf(po);
    closePoBuilder();
  }

  // Requisitions are never deleted from here — completed ones (received,
  // fulfilled, or cancelled) move into the archived section for record
  // keeping instead. See ARCHIVE_STATUSES below.
  function resolveReqPrice(req) {
    if (!master) return 0;
    if (req.mainCat === "plate") return findPrice("grades", req.itemGrade);
    if (req.mainCat === "structural") return findPrice("sections", req.itemRawName);
    if (req.mainCat === "cncBar") return findPrice("cncGrades", req.itemGrade);
    const it = (items || []).find((i) => i.id === req.itemId);
    return it ? Number(it.value || 0) : 0;
  }

  function updateReqPrice(req, newPriceStr) {
    const price = parseFloat(newPriceStr) || 0;
    if (req.mainCat === "plate") {
      setMaster((prev) => ({
        ...prev,
        grades: prev.grades.map((g) => (g.name.toLowerCase() === (req.itemGrade || "").toLowerCase() ? { ...g, price } : g)),
      }));
    } else if (req.mainCat === "structural") {
      setMaster((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => (s.name.toLowerCase() === (req.itemRawName || "").toLowerCase() ? { ...s, price } : s)),
      }));
    } else if (req.mainCat === "cncBar") {
      setMaster((prev) => ({
        ...prev,
        cncGrades: prev.cncGrades.map((g) => (g.name.toLowerCase() === (req.itemGrade || "").toLowerCase() ? { ...g, price } : g)),
      }));
    } else {
      setItems((prev) => prev.map((it) => (it.id === req.itemId ? { ...it, value: price } : it)));
    }
  }

  // The rate (R/kg, R/m) isn't a usable "price each" on its own for anything
  // sold by weight or length — a PO line needs price × qty to add up to the
  // real total, so this multiplies the rate by however much is actually in
  // one unit (one sheet's weight, one piece's length or weight).
  function resolvePoLineUnitPrice(req) {
    const rate = resolveReqPrice(req);
    const it = (items || []).find((i) => i.id === req.itemId);
    if (req.mainCat === "plate" && it) {
      const w = plateWeight(it);
      return w ? rate * w.perSheet : rate;
    }
    if (req.mainCat === "structural" && it) {
      if (it.trackLength && it.length) return rate * Number(it.length);
      return rate;
    }
    if (req.mainCat === "cncBar" && it) {
      const w = cncBarWeight(it);
      return w ? w.perM * (Number(it.length || 0) / 1000) * rate : 0;
    }
    return rate;
  }

  async function handleAttachmentSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      alert("Please choose a JPEG/PNG photo or a PDF.");
      e.target.value = "";
      return;
    }
    try {
      let dataUrl;
      if (isImage) {
        dataUrl = await compressImage(file);
      } else {
        if (file.size > 4 * 1024 * 1024) {
          alert("That PDF is over 4MB — try a smaller export, or a photo of the drawing instead.");
          e.target.value = "";
          return;
        }
        dataUrl = await readFileAsDataUrl(file);
      }
      await window.storage.set(`attachment:${form.id}`, dataUrl, true);
      setForm((f) => ({ ...f, attachmentType: isImage ? "image" : "pdf", attachmentName: file.name }));
    } catch {
      alert("Couldn't process that file.");
    }
    e.target.value = "";
  }

  function removeAttachment() {
    window.storage.delete(`attachment:${form.id}`, true).catch(() => {});
    setForm((f) => ({ ...f, attachmentType: "", attachmentName: "" }));
  }

  async function openPreview(it) {
    setPreviewItem(it);
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const res = await window.storage.get(`attachment:${it.id}`, true);
      setPreviewData(res ? res.value : null);
    } catch {
      setPreviewData(null);
    }
    setPreviewLoading(false);
  }

  function closePreview() {
    setPreviewItem(null);
    setPreviewData(null);
  }

  function exportDivision(mainCat) {
    const rows = items
      .filter((it) => it.mainCat === mainCat)
      .map((it) => {
        if (mainCat === "plate") {
          const w = plateWeight(it);
          const row = {
            Grade: it.grade,
            Size: it.size,
            Thickness: it.thickness,
            Quantity: it.qty,
            Unit: it.unit,
            "Low Stock Alert": it.low,
            Location: it.loc,
            "Sales Person": it.salesPerson,
            Customer: it.customer,
            Comment: it.comment,
            "Weight per Sheet (kg)": w ? Number(w.perSheet.toFixed(2)) : "",
            "Total Weight (kg)": w ? Number(w.total.toFixed(2)) : "",
          };
          if (canSeeValue) row["Total Value (R)"] = Number((plateValue(it)?.total || 0).toFixed(2));
          return row;
        }
        if (mainCat === "structural") {
          const sw = structuralWeight(it);
          const row = {
            Grade: it.grade,
            Section: it.name,
            "Pieces on Hand": it.qty,
            "Length per Piece (m)": it.length,
            "Total Length (m)": Number((Number(it.qty) * Number(it.length)).toFixed(2)),
            "Low Stock Alert": it.low,
            Location: it.loc,
            "Sales Person": it.salesPerson,
            Customer: it.customer,
            "kg/m": sw ? sw.perM : "",
            "Total Weight (kg)": sw ? Number(sw.total.toFixed(2)) : "",
          };
          if (canSeeValue) row["Total Value (R)"] = Number((structuralValue(it)?.total || 0).toFixed(2));
          return row;
        }
        const row = {
          Customer: it.customer,
          "Part Number": it.partNumber,
          Description: it.name,
          Quantity: it.qty,
          "Low Stock Alert": it.low,
          Location: it.loc,
          "Sales Person": it.salesPerson,
        };
        if (canSeeValue) {
          row["Value per Unit (R)"] = Number(it.value || 0).toFixed(2);
          row["Total Value (R)"] = Number((Number(it.value || 0) * Number(it.qty || 0)).toFixed(2));
        }
        return row;
      });
    if (rows.length === 0) {
      alert("Nothing to export in this division yet.");
      return;
    }
    const label = TABS.find((t) => t.key === mainCat)?.label || mainCat;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
    XLSX.writeFile(wb, `${label.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportStockCodes() {
    const rows = items
      .filter((it) => it.mainCat === "custom")
      .map((it) => ({
        "Part Number": it.partNumber,
        Description: it.name,
        "Unit Price (R)": it.value,
        "Qty on Hand": it.qty,
        "Low Stock Warning At": it.low,
        "Customer Revision": it.customerRevision || "",
        Customer: it.customer || "",
      }));
    if (rows.length === 0) {
      alert("No Customer Stock items yet.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Stock");
    XLSX.writeFile(wb, `Customer-Stock-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // A full, one-click copy of everything — items, the whole master library,
  // requisitions, purchase orders, and the usage log — as one downloadable
  // file. Nothing fancy, just a real, in-your-hands safety net.
  function exportBackup() {
    const backup = {
      exportedAt: new Date().toISOString(),
      exportedBy: roleLabel,
      items,
      master,
      requisitions,
      purchaseOrders,
      usageLog,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-control-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let data;
      try {
        data = JSON.parse(ev.target.result);
      } catch {
        alert("That doesn't look like a valid backup file.");
        e.target.value = "";
        return;
      }
      if (!data.items || !data.master) {
        alert("That file doesn't look like a Stock Control backup — missing items or master data.");
        e.target.value = "";
        return;
      }
      const ok = window.confirm(
        `This will REPLACE everything currently in the system with the contents of this backup (from ${
          data.exportedAt ? new Date(data.exportedAt).toLocaleString() : "an unknown date"
        }). This can't be undone. Are you sure?`
      );
      if (!ok) {
        e.target.value = "";
        return;
      }
      setItems(data.items);
      setMaster({ ...DEFAULT_MASTER, ...data.master });
      setRequisitions(data.requisitions || []);
      setPurchaseOrders(data.purchaseOrders || []);
      setUsageLog(data.usageLog || []);
      alert("Backup restored.");
      e.target.value = "";
    };
    reader.readAsText(file);
  }

  function addItem(e) {
    e.preventDefault();
    if (matchedExisting && !allowDuplicate) return;

    if (form.grade === CUSTOM && effectiveGrade) {
      ensureFactorEntry(form.mainCat === "cncBar" ? "cncGrades" : "grades", effectiveGrade, 7.85);
    }
    if (form.size === CUSTOM && effectiveSize) ensureStringEntry("sizes", effectiveSize);
    if (form.sectionType === CUSTOM && effectiveSectionType) ensureStringEntry("sectionTypes", effectiveSectionType);
    if (form.section === CUSTOM && effectiveSection) ensureFactorEntry("sections", effectiveSection, 0, effectiveSectionType);
    if (form.customer === CUSTOM && effectiveCustomer) ensureStringEntry("customers", effectiveCustomer);
    if (form.fastenerType === CUSTOM && effectiveFastenerType) ensureStringEntry("fastenerCategories", effectiveFastenerType);
    if (form.salesPerson === CUSTOM && effectiveSalesPerson) ensureStringEntry("salesPeople", effectiveSalesPerson);
    if (form.supplier === CUSTOM && effectiveSupplier) ensureSupplierEntry(effectiveSupplier);
    if (form.sheetName === CUSTOM && effectiveSheetName) ensureStringEntry("sheetNames", effectiveSheetName);

    const base = {
      loc: form.loc.trim(),
      low: Number(form.low) || 0,
      salesPerson: effectiveSalesPerson,
      customer: effectiveCustomer,
      supplier: effectiveSupplier,
    };

    let payload = null;

    if (form.mainCat === "plate") {
      if (!effectiveSize || !form.thickness.trim()) return;
      payload = {
        ...base,
        mainCat: "plate",
        grade: effectiveGrade || "Ungraded",
        size: effectiveSize,
        thickness: form.thickness.trim(),
        name: plateName(effectiveSize, form.thickness.trim()),
        sheetName: effectiveSheetName,
        stockType: form.stockType || "full",
        comment: form.size === CUSTOM ? form.comment.trim() : form.comment.trim(),
        unit: "sheet",
        trackLength: false,
        length: 0,
        qty: Number(form.qty) || 0,
      };
    } else if (form.mainCat === "structural") {
      if (!effectiveSection) return;
      payload = {
        ...base,
        mainCat: "structural",
        grade: effectiveGrade || "Ungraded",
        name: effectiveSection,
        stockType: form.stockType || "full",
        comment: "",
        trackLength: form.trackLength,
        length: form.trackLength ? Number(form.length) || 0 : 0,
        unit: form.trackLength ? "m" : "ea",
        qty: Number(form.qty) || 0,
      };
    } else if (form.mainCat === "cncBar") {
      if (!form.diameter.trim()) return;
      payload = {
        ...base,
        mainCat: "cncBar",
        grade: effectiveGrade || "Ungraded",
        name: `${effectiveGrade} ⌀${form.diameter}mm`,
        diameter: Number(form.diameter) || 0,
        comment: "",
        trackLength: true,
        length: Number(form.length) || 0,
        unit: "mm",
        qty: Number(form.qty) || 0,
      };
    } else if (form.mainCat === "assets") {
      if (!form.name.trim()) return;
      const isNewAsset = !editingId;
      const assignedPartNumber = isNewAsset ? formatToolNumber(master.nextToolNumber) : form.partNumber.trim();
      payload = {
        ...base,
        mainCat: "assets",
        grade: "",
        partNumber: assignedPartNumber,
        name: form.name.trim(),
        manufacturer: form.manufacturer.trim(),
        serialNumber: form.serialNumber.trim(),
        purchaseDate: form.purchaseDate,
        value: Number(form.value) || 0,
        comment: "",
        trackLength: false,
        length: 0,
        unit: "ea",
        qty: 1,
        serviceMode: form.serviceMode,
        serviceIntervalMonths: Number(form.serviceIntervalMonths) || 0,
        serviceIntervalHours: Number(form.serviceIntervalHours) || 0,
        serviceIntervalKm: Number(form.serviceIntervalKm) || 0,
        lastServiceDate: form.lastServiceDate,
        lastServiceReading: Number(form.lastServiceReading) || 0,
        currentReading: Number(form.currentReading) || 0,
        ...(isNewAsset ? { status: "active" } : {}),
      };
      if (isNewAsset) {
        setMaster((prev) => ({ ...prev, nextToolNumber: (prev.nextToolNumber || 1) + 1 }));
      }
    } else if (form.mainCat === "fasteners") {
      if (!effectiveFastenerType || !form.diameter.trim()) return;
      const isNewFastener = !editingId;
      const assignedPartNumber = isNewFastener ? formatFastenerNumber(master.nextFastenerNumber) : form.partNumber.trim();
      const lengthPart = form.length.trim() ? `x${form.length.trim()}` : "";
      const designation = `M${form.diameter.trim()}${lengthPart} ${effectiveFastenerType}`;
      payload = {
        ...base,
        mainCat: "fasteners",
        grade: effectiveGrade, // "Material" — reuses the shared Material Types library, short name
        partNumber: assignedPartNumber,
        name: designation,
        fastenerType: effectiveFastenerType,
        diameter: form.diameter.trim(),
        length: form.length.trim(),
        fastenerGrade: form.fastenerGrade,
        finish: form.fastenerFinish,
        value: Number(form.value) || 0,
        comment: "",
        trackLength: false,
        unit: "ea",
        qty: Number(form.qty) || 0,
      };
      if (isNewFastener) {
        setMaster((prev) => ({ ...prev, nextFastenerNumber: (prev.nextFastenerNumber || 1) + 1 }));
      }
    } else {
      // Customer Stock requires a part number; Stores items don't have to.
      if (!effectiveCustomer || !form.name.trim() || (form.mainCat === "custom" && !form.partNumber.trim())) return;
      payload = {
        ...base,
        mainCat: form.mainCat,
        grade: "",
        partNumber: form.partNumber.trim(),
        name: form.name.trim(),
        value: Number(form.value) || 0,
        comment: "",
        trackLength: false,
        length: 0,
        unit: "ea",
        qty: Number(form.qty) || 0,
        attachmentType: form.attachmentType || "",
        attachmentName: form.attachmentName || "",
        storesKind: form.mainCat === "stores" ? form.storesKind : undefined,
      };
    }

    if (editingId) {
      const before = items.find((it) => it.id === editingId);
      setItems((prev) => prev.map((it) => (it.id === editingId ? { ...before, ...payload, id: editingId } : it)));
      if (before && Number(payload.qty) > Number(before.qty)) {
        closeOutRequisitionsForItem(editingId);
      }
      closeAdd();
    } else {
      const newItem = { ...payload, id: form.id || uid() };
      setItems((prev) => [...prev, newItem]);
      closeAdd();
      if (addingServiceConsumableQty !== null) {
        // This item was created specifically for a service consumable
        // that wasn't in Stores yet — link it straight in as a real,
        // stock-deducting entry rather than dropping the user back at an
        // empty stock list with no memory of what they were doing.
        setServiceNowConsumables((prev) => [
          ...prev,
          { source: "stores", itemId: newItem.id, name: newItem.name, qty: addingServiceConsumableQty, unit: newItem.unit || "" },
        ]);
        setAddingServiceConsumableQty(null);
      } else if (addingItemForRequisition) {
        // Same reasoning, for the requisition picker's "not found" path —
        // the explicit intent here was always to request stock for this
        // item, regardless of what quantity got entered while creating it.
        setAddingItemForRequisition(false);
        openRequisition(newItem);
      } else if (Number(newItem.qty) === 0 && canRequisition && newItem.mainCat !== "custom") {
        // A brand-new item saved at zero stock would otherwise vanish from
        // the home page the instant it's added (zero-qty items only stay
        // visible once a requisition is tracking them) — so if this login
        // can request stock, walk straight into that instead of leaving
        // the item stranded.
        openRequisition(newItem);
      }
    }
  }

  function resolveField(options, value) {
    if (!value) return { field: "", custom: "" };
    return options.includes(value) ? { field: value, custom: "" } : { field: CUSTOM, custom: value };
  }

  function formFromItem(it, { duplicate = false } = {}) {
    const base = {
      ...emptyForm,
      id: it.id,
      mainCat: it.mainCat,
      loc: it.loc || "",
      low: String(it.low || ""),
      qty: duplicate ? "" : String(it.qty || ""),
      comment: it.comment || "",
    };
    // Accept either the full name or short name as a valid match — older
    // items may have the full name stored from before short names existed.
    const gradeOptions = master.grades.map((g) => g.shortName || g.name);
    const gradeMatch = master.grades.find((g) => g.name === it.grade || (g.shortName && g.shortName === it.grade));
    const grade = gradeMatch ? { field: gradeMatch.shortName || gradeMatch.name, custom: "" } : resolveField(gradeOptions, it.grade);
    const sp = resolveField((people || []).filter((p) => p.isSalesPerson).map((p) => p.name), it.salesPerson);
    const cust = resolveField(master.customers, it.customer);
    const sup = resolveField(master.suppliers.map((s) => s.name), it.supplier);
    if (it.mainCat === "plate") {
      const stockType = it.stockType || "full";
      const sheet = resolveField(master.sheetNames, it.sheetName);
      if (stockType === "offcut") {
        const dims = parseSize(it.size);
        return {
          ...base,
          grade: grade.field, customGrade: grade.custom,
          stockType,
          offcutLength: dims ? String(dims[0]) : "",
          offcutWidth: dims ? String(dims[1]) : "",
          thickness: it.thickness || "",
          sheetName: sheet.field, customSheetName: sheet.custom,
          salesPerson: sp.field, customSalesPerson: sp.custom,
          customer: cust.field, customCustomer: cust.custom,
          supplier: sup.field, customSupplier: sup.custom,
        };
      }
      const size = resolveField(master.sizes, it.size);
      return {
        ...base,
        grade: grade.field, customGrade: grade.custom,
        size: size.field, customSize: size.custom,
        thickness: it.thickness || "",
        sheetName: sheet.field, customSheetName: sheet.custom,
        stockType,
        salesPerson: sp.field, customSalesPerson: sp.custom,
        customer: cust.field, customCustomer: cust.custom,
        supplier: sup.field, customSupplier: sup.custom,
      };
    }
    if (it.mainCat === "structural") {
      const section = resolveField(master.sections.map((s) => s.name), it.name);
      const type = resolveField(master.sectionTypes, findSectionType(it.name));
      return {
        ...base,
        grade: grade.field, customGrade: grade.custom,
        sectionType: type.field, customSectionType: type.custom,
        section: section.field, customSection: section.custom,
        stockType: it.stockType || "full",
        trackLength: it.trackLength, length: String(it.length || ""),
        salesPerson: sp.field, customSalesPerson: sp.custom,
        customer: cust.field, customCustomer: cust.custom,
        supplier: sup.field, customSupplier: sup.custom,
      };
    }
    if (it.mainCat === "cncBar") {
      const cncGrade = resolveField(master.cncGrades.map((g) => g.name), it.grade);
      return {
        ...base,
        grade: cncGrade.field, customGrade: cncGrade.custom,
        diameter: String(it.diameter || ""),
        length: String(it.length || ""),
        salesPerson: sp.field, customSalesPerson: sp.custom,
        customer: cust.field, customCustomer: cust.custom,
        supplier: sup.field, customSupplier: sup.custom,
      };
    }
    if (it.mainCat === "assets") {
      return {
        ...base,
        // Duplicating an asset (e.g. buying another identical machine) should
        // get its own fresh number and a blank serial — it's a distinct unit.
        // Service tracking is per-physical-machine too, so it resets on duplicate.
        partNumber: duplicate ? "" : it.partNumber || "",
        name: it.name || "",
        manufacturer: it.manufacturer || "",
        serialNumber: duplicate ? "" : it.serialNumber || "",
        purchaseDate: duplicate ? "" : it.purchaseDate || "",
        value: String(it.value || ""),
        salesPerson: sp.field, customSalesPerson: sp.custom,
        supplier: sup.field, customSupplier: sup.custom,
        serviceMode: duplicate ? "none" : it.serviceMode || "none",
        serviceIntervalMonths: duplicate ? "" : String(it.serviceIntervalMonths || ""),
        serviceIntervalHours: duplicate ? "" : String(it.serviceIntervalHours || ""),
        serviceIntervalKm: duplicate ? "" : String(it.serviceIntervalKm || ""),
        lastServiceDate: duplicate ? "" : it.lastServiceDate || "",
        lastServiceReading: duplicate ? "" : String(it.lastServiceReading || ""),
        currentReading: duplicate ? "" : String(it.currentReading || ""),
      };
    }
    if (it.mainCat === "fasteners") {
      return {
        ...base,
        grade: gradeMatch ? gradeMatch.shortName || gradeMatch.name : grade.field,
        customGrade: grade.custom,
        partNumber: duplicate ? "" : it.partNumber || "",
        name: it.name || "",
        fastenerType: it.fastenerType || "",
        diameter: it.diameter || "",
        length: it.length || "",
        fastenerGrade: it.fastenerGrade || "",
        fastenerFinish: it.finish || "",
        value: String(it.value || ""),
        supplier: sup.field, customSupplier: sup.custom,
      };
    }
    return {
      ...base,
      customer: cust.field, customCustomer: cust.custom,
      partNumber: it.partNumber || "",
      name: it.name || "",
      value: String(it.value || ""),
      salesPerson: sp.field, customSalesPerson: sp.custom,
      supplier: sup.field, customSupplier: sup.custom,
      storesKind: it.storesKind || "consumable",
      attachmentType: duplicate ? "" : it.attachmentType || "",
      attachmentName: duplicate ? "" : it.attachmentName || "",
    };
  }

  function openAdd() {
    setForm({ ...emptyForm, id: uid(), mainCat: tab, trackLength: tab === "structural" });
    setEditingId(null);
    setAllowDuplicate(false);
    setShowAdd(true);
  }

  function openEdit(it) {
    setForm(formFromItem(it));
    setEditingId(it.id);
    setAllowDuplicate(false);
    setShowAdd(true);
  }

  function openDuplicate(it) {
    setForm({ ...formFromItem(it, { duplicate: true }), id: uid() });
    setEditingId(null);
    setAllowDuplicate(true);
    setShowAdd(true);
  }

  function closeAdd() {
    setForm({ ...emptyForm, mainCat: tab, trackLength: tab === "structural" });
    setEditingId(null);
    setAllowDuplicate(false);
    setShowAdd(false);
    setAddingServiceConsumableQty(null);
    setAddingItemForRequisition(false);
  }

  function jumpToMatch() {
    if (!matchedExisting) return;
    setTab(matchedExisting.mainCat);
    openEdit(matchedExisting);
  }

  function jumpToLowStockItem(it) {
    setShowLowStock(false);
    setTab(it.mainCat);
    setCustomerFilter(null);
    setQuery(it.mainCat === "custom" || it.mainCat === "stores" || it.mainCat === "fasteners" ? (it.partNumber || it.name) : it.name);
  }

  const managerIsFactorTable = FACTOR_TABLES.includes(managerTab);

  function addMasterEntry() {
    const val = managerInput.trim();
    if (!val) return;
    if (managerIsFactorTable) {
      const factor = parseFloat(managerFactor) || 0;
      const price = parseFloat(managerPrice) || 0;
      // Adding a section always happens from within a specific type's
      // detail view now, so that type is always known here.
      const extra = managerTab === "sections" ? { type: sectionTypeFilterInManager } : managerTab === "grades" ? { shortName: managerShortName.trim() } : {};
      setMaster((prev) => {
        const list = prev[managerTab] || [];
        if (list.some((x) => x.name.toLowerCase() === val.toLowerCase())) return prev;
        return { ...prev, [managerTab]: [...list, { name: val, factor, price, ...extra }] };
      });
      setManagerFactor("");
      setManagerPrice("");
      setManagerShortName("");
    } else {
      setMaster((prev) => {
        const list = prev[managerTab] || [];
        if (list.some((x) => x.toLowerCase() === val.toLowerCase())) return prev;
        return { ...prev, [managerTab]: [...list, val] };
      });
    }
    setManagerInput("");
  }

  // Moves an entry one place up or down in a list whose order is real —
  // currently Job Process Types, where the sequence is the factory flow.
  // Works on the full list rather than what's on screen, so a search
  // filter can never make an item jump past hidden neighbours; the buttons
  // are hidden while searching for the same reason.

  function moveMasterEntry(entry, direction) {
    setMaster((prev) => {
      const list = prev[managerTab] || [];
      const from = list.indexOf(entry);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= list.length) return prev;
      const reordered = [...list];
      reordered.splice(from, 1);
      reordered.splice(to, 0, entry);
      return { ...prev, [managerTab]: reordered };
    });
  }

  function removeMasterEntry(entry) {
    setMaster((prev) => {
      const filtered = prev[managerTab].filter((x) => (typeof x === "string" ? x !== entry : x.name !== entry.name));
      const sections =
        managerTab === "sectionTypes"
          ? (prev.sections || []).map((s) => (s.type === entry ? { ...s, type: "" } : s))
          : prev.sections;
      return { ...prev, [managerTab]: filtered, sections };
    });
  }

  function updateFactorField(name, field, newValue) {
    setMaster((prev) => ({
      ...prev,
      [managerTab]: prev[managerTab].map((x) => (x.name === name ? { ...x, [field]: parseFloat(newValue) || 0 } : x)),
    }));
  }

  function updateGradeShortName(name, newValue) {
    setMaster((prev) => ({
      ...prev,
      grades: (prev.grades || []).map((x) => (x.name === name ? { ...x, shortName: newValue } : x)),
    }));
  }

  function updateSectionType(name, newType) {
    setMaster((prev) => ({
      ...prev,
      sections: (prev.sections || []).map((x) => (x.name === name ? { ...x, type: newType } : x)),
    }));
  }


  // A targeted way to clear out one customer's stock codes before a fresh
  // re-import — deliberately scoped to whichever customer is currently
  // filtered to, never a blanket wipe of everyone's data.
  function batchDeleteStockCodesForCustomer(customer) {
    // Only ever targets zero-qty catalog-style items for this customer —
    // anything with real stock on hand is never touched by this action.
    const matching = items.filter((it) => it.mainCat === "custom" && (it.customer || "") === (customer || "") && Number(it.qty) === 0);
    if (matching.length === 0) {
      alert(customer ? `No zero-stock catalog items found for ${customer}.` : "No unassigned zero-stock catalog items found.");
      return;
    }
    const ok = window.confirm(
      `Delete all ${matching.length} zero-stock catalog item${matching.length === 1 ? "" : "s"} for ${customer || "(no customer)"}? Anything with real stock on hand is kept regardless. This can't be undone.`
    );
    if (!ok) return;
    const idsToDelete = new Set(matching.map((it) => it.id));
    setItems((prev) => prev.filter((it) => !idsToDelete.has(it.id)));
  }

  function addStockCodeRow() {
    if (!scForm.stockCode.trim()) return;
    const code = scForm.stockCode.trim();
    setItems((prev) => {
      const existing = prev.find((it) => it.mainCat === "custom" && (it.partNumber || "").toLowerCase() === code.toLowerCase() && it.customer === scForm.customer);
      if (existing) {
        // Same part number for this customer already exists — update it in
        // place rather than creating a duplicate. Quantity is never touched
        // here — this is a catalog action, not a stock count.
        return prev.map((it) =>
          it.id === existing.id
            ? {
                ...it,
                name: scForm.description.trim() || it.name,
                value: parseFloat(scForm.price) || it.value,
                low: parseFloat(scForm.recommendedStock) || it.low,
                customerRevision: scForm.revision.trim() || it.customerRevision,
              }
            : it
        );
      }
      return [
        ...prev,
        {
          id: uid(),
          mainCat: "custom",
          customer: scForm.customer,
          partNumber: code,
          name: scForm.description.trim() || code,
          grade: "",
          qty: 0,
          value: parseFloat(scForm.price) || 0,
          low: parseFloat(scForm.recommendedStock) || 0,
          loc: "",
          comment: "",
          salesPerson: "",
          customerRevision: scForm.revision.trim(),
        },
      ];
    });
    setScForm({ stockCode: "", description: "", price: "", recommendedStock: "", customer: "" });
  }

  function updateStoresCatalogRow(id, field, value) {
    setMaster((prev) => ({
      ...prev,
      storesCatalog: (prev.storesCatalog || []).map((r) => (r.id === id ? { ...r, [field]: field === "price" ? parseFloat(value) || 0 : value } : r)),
    }));
  }

  function removeStoresCatalogRow(id) {
    setMaster((prev) => ({ ...prev, storesCatalog: (prev.storesCatalog || []).filter((r) => r.id !== id) }));
  }

  function duplicateStoresCatalogRow(id) {
    setMaster((prev) => {
      const src = (prev.storesCatalog || []).find((r) => r.id === id);
      if (!src) return prev;
      return { ...prev, storesCatalog: [...prev.storesCatalog, { ...src, id: uid(), name: src.name + " (copy)" }] };
    });
  }

  function addSupplierRow() {
    if (!newSupplierName.trim()) return;
    setMaster((prev) => ({
      ...prev,
      suppliers: [...prev.suppliers, { id: uid(), name: newSupplierName.trim(), email: "", phone: "", address: "", logo: "", vatNumber: "", contacts: [] }],
    }));
    setNewSupplierName("");
  }

  function updateSupplierField(id, field, value) {
    setMaster((prev) => ({ ...prev, suppliers: prev.suppliers.map((s) => (s.id === id ? { ...s, [field]: value } : s)) }));
  }

  function removeSupplierRow(id) {
    setMaster((prev) => ({ ...prev, suppliers: prev.suppliers.filter((s) => s.id !== id) }));
  }

  // A supplier can have several contact people — sales rep, accounts,
  // whoever — each stored right on that supplier's own record.
  function addSupplierContact(supplierId) {
    setMaster((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) =>
        s.id === supplierId ? { ...s, contacts: [...(s.contacts || []), { id: uid(), name: "", email: "" }] } : s
      ),
    }));
  }

  function updateSupplierContact(supplierId, contactId, field, value) {
    setMaster((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) =>
        s.id === supplierId
          ? { ...s, contacts: (s.contacts || []).map((c) => (c.id === contactId ? { ...c, [field]: value } : c)) }
          : s
      ),
    }));
  }

  function removeSupplierContact(supplierId, contactId) {
    setMaster((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) =>
        s.id === supplierId ? { ...s, contacts: (s.contacts || []).filter((c) => c.id !== contactId) } : s
      ),
    }));
  }

  // Same idea for customers, keyed by customer name since customers are
  // still just a plain name list everywhere else in the app.
  function addCustomerContact(customerName) {
    setMaster((prev) => ({
      ...prev,
      customerContacts: {
        ...prev.customerContacts,
        [customerName]: [...(prev.customerContacts?.[customerName] || []), { id: uid(), name: "", email: "", phone: "" }],
      },
    }));
  }

  function updateCustomerContact(customerName, contactId, field, value) {
    setMaster((prev) => ({
      ...prev,
      customerContacts: {
        ...prev.customerContacts,
        [customerName]: (prev.customerContacts?.[customerName] || []).map((c) =>
          c.id === contactId ? { ...c, [field]: value } : c
        ),
      },
    }));
  }

  function removeCustomerContact(customerName, contactId) {
    setMaster((prev) => ({
      ...prev,
      customerContacts: {
        ...prev.customerContacts,
        [customerName]: (prev.customerContacts?.[customerName] || []).filter((c) => c.id !== contactId),
      },
    }));
  }

  async function handleSupplierLogoSelect(id, e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose a JPEG or PNG image.");
      e.target.value = "";
      return;
    }
    try {
      const dataUrl = await compressImage(file, 400, 0.85);
      updateSupplierField(id, "logo", dataUrl);
    } catch {
      alert("Couldn't process that image.");
    }
    e.target.value = "";
  }

  function updateCompanyDetail(field, value) {
    setMaster((prev) => ({ ...prev, companyDetails: { ...prev.companyDetails, [field]: value } }));
  }

  async function handleCompanyLogoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose a JPEG or PNG image.");
      e.target.value = "";
      return;
    }
    try {
      const dataUrl = await compressImage(file, 400, 0.85);
      updateCompanyDetail("logo", dataUrl);
    } catch {
      alert("Couldn't process that image.");
    }
    e.target.value = "";
  }

  function addStoresCatalogRow() {
    if (!scCatalogForm.name.trim()) return;
    setMaster((prev) => ({
      ...prev,
      storesCatalog: [
        ...(prev.storesCatalog || []),
        {
          id: uid(),
          code: scCatalogForm.code.trim(),
          name: scCatalogForm.name.trim(),
          category: scCatalogForm.category || (prev.storeCategories[0] || ""),
          supplier: scCatalogForm.supplier || "",
          price: parseFloat(scCatalogForm.price) || 0,
        },
      ],
    }));
    setScCatalogForm({ code: "", name: "", category: scCatalogForm.category, supplier: scCatalogForm.supplier, price: "" });
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!importCustomer) {
      alert("Pick a customer before importing — this can't be left blank, so a stock code never accidentally ends up unassigned.");
      e.target.value = "";
      return;
    }
    setImportFileLabel(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!rows.length) return;

        // Find the actual header row instead of assuming it's row 1 — real
        // spreadsheets sometimes have a blank leading row or two.
        const HEADER_HINTS = ["code", "desc", "price", "cost", "value", "rev", "version", "recommend"];
        let headerRowIdx = rows.findIndex((r) => {
          const cells = r.map((c) => String(c).toLowerCase());
          return cells.filter((c) => HEADER_HINTS.some((h) => c.includes(h))).length >= 2;
        });
        if (headerRowIdx < 0) headerRowIdx = 0;

        const header = rows[headerRowIdx].map((h) => String(h).toLowerCase());
        const codeIdx = header.findIndex((h) => h.includes("stockcode") || h.includes("stock code") || h.includes("code"));
        const descIdx = header.findIndex((h) => h.includes("desc"));
        const priceIdx = header.findIndex(
          (h) => h.includes("price") || h.includes("cost") || h.includes("value") || h.includes("r/") || h.includes("rand")
        );
        const recIdx = header.findIndex((h) => h.includes("recommend") || h.includes("reorder") || h.includes("par"));
        const revIdx = header.findIndex((h) => h.includes("rev") || h.includes("version"));

        // Diagnostic — shows exactly what the importer saw, so a mismatch
        // can be pinpointed instead of guessed at from a screenshot.
        const colLabel = (idx) => (idx >= 0 ? `col ${idx + 1} ("${rows[headerRowIdx][idx]}")` : "NOT FOUND");
        const sampleRow = rows[headerRowIdx + 1] || [];
        console.log("Stock Codes import diagnostic:", {
          headerRowUsed: `row ${headerRowIdx + 1}`,
          headerRow: rows[headerRowIdx],
          detected: {
            stockCode: colLabel(codeIdx),
            description: colLabel(descIdx),
            price: colLabel(priceIdx),
            recommendedStock: colLabel(recIdx),
            revision: colLabel(revIdx),
          },
          firstDataRow: sampleRow,
        });

        const newRows = rows
          .slice(headerRowIdx + 1)
          .filter((r) => r.length && r.some((c) => String(c).trim() !== ""))
          .map((r) => ({
            id: uid(),
            stockCode: codeIdx >= 0 ? String(r[codeIdx] || "").trim() : String(r[0] || "").trim(),
            description: descIdx >= 0 ? String(r[descIdx] || "").trim() : String(r[1] || "").trim(),
            price: priceIdx >= 0 ? parseFloat(String(r[priceIdx]).replace(/[^0-9.]/g, "")) || 0 : 0,
            recommendedStock: recIdx >= 0 ? parseFloat(r[recIdx]) || 0 : 0,
            revision: revIdx >= 0 ? String(r[revIdx] || "").trim() : "",
            customer: importCustomer,
          }))
          .filter((r) => r.stockCode);

        const diagnosticSummary =
          `Detected — Stock code: ${colLabel(codeIdx)}, Description: ${colLabel(descIdx)}, Price: ${colLabel(priceIdx)}, ` +
          `Recommended: ${colLabel(recIdx)}, Revision: ${colLabel(revIdx)}.\n` +
          `First data row read as: ${JSON.stringify(sampleRow)}`;

        if (importReplaceAll) {
          setItems((prev) => {
            const otherItems = prev.filter((it) => !(it.mainCat === "custom" && it.customer === importCustomer));
            // Never delete anything with real stock on hand, even if it's
            // not in this file — only zero-qty catalog-style entries get
            // replaced wholesale.
            const keptRealStock = prev.filter((it) => it.mainCat === "custom" && it.customer === importCustomer && Number(it.qty) > 0);
            const keptKeys = new Set(keptRealStock.map((it) => (it.partNumber || "").toLowerCase()));
            const newItems = newRows
              .filter((row) => !keptKeys.has(row.stockCode.toLowerCase()))
              .map((row) => ({
                id: uid(),
                mainCat: "custom",
                customer: row.customer,
                partNumber: row.stockCode,
                name: row.description || row.stockCode,
                grade: "",
                qty: 0,
                value: row.price,
                low: row.recommendedStock,
                loc: "",
                comment: "",
                salesPerson: "",
                customerRevision: row.revision,
              }));
            return [...otherItems, ...keptRealStock, ...newItems];
          });
          alert(
            `Replaced the catalog with ${newRows.length} rows${importCustomer ? ` for ${importCustomer}` : ""} — any item with real stock on hand was kept regardless.\n\n${diagnosticSummary}`
          );
        } else {
          // Merge by part number — update anything that already exists
          // instead of creating a duplicate row for the same part. Real
          // quantity on hand is never touched by an import.
          setItems((prev) => {
            const existing = [...prev];
            newRows.forEach((row) => {
              const idx = existing.findIndex(
                (it) => it.mainCat === "custom" && it.customer === row.customer && (it.partNumber || "").toLowerCase() === row.stockCode.toLowerCase()
              );
              if (idx >= 0) {
                // Only overwrite a field if the import actually found a real
                // value for it — a parsing miss shouldn't silently erase a
                // price/revision that was already there from before.
                existing[idx] = {
                  ...existing[idx],
                  name: row.description || existing[idx].name,
                  value: row.price || existing[idx].value,
                  low: row.recommendedStock || existing[idx].low,
                  customerRevision: row.revision || existing[idx].customerRevision,
                };
              } else {
                existing.push({
                  id: uid(),
                  mainCat: "custom",
                  customer: row.customer,
                  partNumber: row.stockCode,
                  name: row.description || row.stockCode,
                  grade: "",
                  qty: 0,
                  value: row.price,
                  low: row.recommendedStock,
                  loc: "",
                  comment: "",
                  salesPerson: "",
                  customerRevision: row.revision,
                });
              }
            });
            return existing;
          });
          const addedCount = newRows.length;
          alert(
            `Processed ${addedCount} rows${importCustomer ? ` for ${importCustomer}` : ""} — new parts are added at qty 0 until real stock arrives; matched existing parts had their price/description updated, never their quantity.\n\n${diagnosticSummary}`
          );
        }
      } catch (err) {
        alert("Couldn't read that file — make sure it's a .xlsx, .xls, or .csv export.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  if (loadRetriesExhausted) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontFamily: F.mono, color: C.danger, fontSize: 15, marginBottom: 10 }}>
            Couldn't load your data — stopped here rather than risk overwriting anything.
          </div>
          <div style={{ fontFamily: F.mono, color: C.muted, fontSize: 13.5, marginBottom: 16 }}>
            This is usually a brief connection hiccup. Nothing has been changed or lost — refresh to try again.
          </div>
          <button className="stk-btn" style={S.addBtn} onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (items === null || master === null || requisitions === null || purchaseOrders === null || usageLog === null) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: F.mono, color: C.muted, letterSpacing: "0.08em" }}>LOADING STOCK…</div>
      </div>
    );
  }

  const RoleIcon = isAdmin ? ShieldCheck : User;

  return (
    <div style={S.page} data-stk-theme={profile?.theme || "dark"}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        ${THEME_CSS}
        * { box-sizing: border-box; }
        input, select { font-family: inherit; }
        input::placeholder { color: ${C.muted}; }
        .stk-btn { transition: transform .1s ease, background .15s ease; }
        .stk-btn:active { transform: scale(0.94); }
        .stk-row:hover { background: ${C.surfaceHover}; }
        .stk-grade:hover { background: ${C.surfaceHover}; }
        .stk-editable { transition: border-color .1s ease, background .1s ease; cursor: text; }
        .stk-editable:hover { border-color: ${C.border} !important; background: ${C.bg}; }
        .stk-editable:focus { border-color: ${C.accentRaw} !important; background: ${C.bg}; }
        .stk-meta-row > span { border: 1px solid ${C.border}; border-radius: 5px; padding: 2px 7px; display: inline-block; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <header style={S.header}>
        <div>
          <div style={S.eyebrow}>EAST RAND SUPPLIES</div>
          <h1 style={S.h1}>Stock Control</h1>
        </div>
        <div style={S.headerRight}>
          <SavedCheck fieldKey="core" />
          <button
            className="stk-btn"
            style={S.roleChip}
            onClick={manualRefresh}
            disabled={isRefreshing}
            title={lastRefreshedAt ? `Last updated ${lastRefreshedAt.toLocaleTimeString()}` : "Refresh"}
          >
            <RefreshCw size={13} strokeWidth={2.5} style={isRefreshing ? { animation: "spin 0.8s linear infinite" } : {}} />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          {canSeeValue && grandTotalValue > 0 && (
            <div style={S.totalValueBadge} title="Total stock value on hand across every division">
              R {grandTotalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          )}
          {lowCount > 0 && (
            <button className="stk-btn" style={S.lowBadge} onClick={() => setShowLowStock(true)}>
              <AlertTriangle size={14} strokeWidth={2.5} />
              {lowCount} low
            </button>
          )}
          {canManageRequisitions && requisitions.filter((r) => r.status === "pending").length > 0 && (
            <button
              className="stk-btn"
              style={S.pendingReqBadge}
              onClick={() => setTab("requisitions")}
            >
              <ClipboardList size={14} strokeWidth={2.5} />
              {requisitions.filter((r) => r.status === "pending").length} requests
            </button>
          )}
          {profile && (
            <button className="stk-btn" style={S.roleChip} onClick={() => setTab("notifications")}>
              <AlertTriangle size={13} strokeWidth={2.5} />
              Notifications
              {notificationsList?.filter((n) => !n.is_read).length > 0 && (
                <span style={S.notifBadgeCount}>{notificationsList.filter((n) => !n.is_read).length}</span>
              )}
            </button>
          )}
          {profile && (
            <select
              className="stk-btn"
              style={{ ...S.roleChip, cursor: "pointer" }}
              value={profile.theme || "dark"}
              onChange={(e) => setMyTheme(e.target.value)}
              title="Color theme"
            >
              <option value="dark">Dark theme</option>
              <option value="medium">Medium theme</option>
              <option value="light">Light theme</option>
            </select>
          )}
          {canAccessStockManager && (
            <button className="stk-btn" style={S.roleChip} onClick={() => setShowManager(true)}>
              <Database size={13} strokeWidth={2.5} />
              Stock Manager
            </button>
          )}
          {session && (
            <button className="stk-btn" style={S.roleChip} title={currentUser?.email}>
              <RoleIcon size={13} strokeWidth={2.5} />
              {roleLabel}
            </button>
          )}
          {session && (
            <button className="stk-btn" style={S.roleChip} onClick={signOutUser}>
              Sign out
            </button>
          )}
        </div>
      </header>

      {saveState === "error" && (
        <div style={S.saveErrorBanner}>
          <AlertTriangle size={14} strokeWidth={2.5} />
          A change didn't save — check your connection.
          <button className="stk-btn" style={S.saveErrorRetry} onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      )}

      {authLoading ? (
        <div style={S.loginPrompt}>
          <div style={S.loginPromptText}>Checking your session…</div>
        </div>
      ) : !session ? (
        <div style={S.loginPrompt}>
          <div style={{ width: "100%", maxWidth: 320 }}>
            <div style={S.authTabs}>
              <button
                type="button"
                className="stk-btn"
                style={{ ...S.authTab, ...(authMode === "signin" ? S.authTabActive : {}) }}
                onClick={() => {
                  setAuthMode("signin");
                  setAuthError("");
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                className="stk-btn"
                style={{ ...S.authTab, ...(authMode === "signup" ? S.authTabActive : {}) }}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError("");
                }}
              >
                Create account
              </button>
            </div>
            <form onSubmit={authMode === "signin" ? signIn : signUp} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {authMode === "signup" && (
                <div>
                  <label style={S.label}>Your name</label>
                  <input style={S.input} value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="e.g. Thabo M" />
                </div>
              )}
              <div>
                <label style={S.label}>Email</label>
                <input
                  style={S.input}
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label style={S.label}>Password</label>
                <input
                  style={S.input}
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              {authError && <div style={S.pinError}>{authError}</div>}
              <button type="submit" style={S.submitBtn} className="stk-btn" disabled={authBusy}>
                {authBusy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
            {authMode === "signup" && (
              <div style={{ ...S.roleHint, marginTop: 10 }}>
                Your account is created with no access yet — an admin needs to grant you permissions in User Management before
                you'll see any stock.
              </div>
            )}
          </div>
        </div>
      ) : !profile ? (
        <div style={S.loginPrompt}>
          <div style={S.loginPromptText}>Setting up your account…</div>
        </div>
      ) : !hasAnyAccess ? (
        <div style={S.loginPrompt}>
          <div style={S.loginPromptText}>
            You're signed in as {roleLabel}, but nobody's granted you access yet. Ask an admin to set your permissions in
            User Management.
          </div>
          <button className="stk-btn" style={S.roleChip} onClick={signOutUser}>
            Sign out
          </button>
        </div>
      ) : (
        <>
          <div style={S.mainTabs} ref={mainTabsRef}>
            {(() => {
              const rendered = [];
              const groupsShown = new Set();
              visibleTabs.forEach((t) => {
                const group = TAB_GROUPS.find((g) => g.keys.includes(t.key));
                if (group) {
                  if (groupsShown.has(group.label)) return; // this group's dropdown already rendered
                  groupsShown.add(group.label);
                  const groupTabs = visibleTabs.filter((vt) => group.keys.includes(vt.key));
                  const isActive = group.keys.includes(tab);
                  const isOpen = stockMenuOpen === group.label;
                  rendered.push(
                    <div key={`group-${group.label}`} style={{ position: "relative" }}>
                      <button
                        className="stk-btn"
                        onClick={() => setStockMenuOpen((o) => (o === group.label ? null : group.label))}
                        style={{ ...S.mainTab, ...(isActive ? S.mainTabActive : {}) }}
                      >
                        {group.label}
                        <ChevronDown size={13} style={{ marginLeft: 4, transform: isOpen ? "rotate(180deg)" : "none" }} />
                      </button>
                      {isOpen && (
                        <div style={S.stockDropdown}>
                          {groupTabs.map((gt) => (
                            <button
                              key={gt.key}
                              className="stk-btn"
                              onClick={() => {
                                setTab(gt.key);
                                setCustomerFilter(null);
                                setSectionTypeFilter(null);
                                setStockMenuOpen(null);
                              }}
                              style={{ ...S.stockDropdownItem, ...(tab === gt.key ? S.stockDropdownItemActive : {}) }}
                            >
                              {gt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                  return;
                }
                rendered.push(
                  <button
                    key={t.key}
                    className="stk-btn"
                    onClick={() => {
                      setTab(t.key);
                      setCustomerFilter(null);
                      setSectionTypeFilter(null);
                      setStockMenuOpen(null);
                    }}
                    style={{ ...S.mainTab, ...(tab === t.key ? S.mainTabActive : {}) }}
                  >
                    {t.label}
                  </button>
                );
              });
              return rendered;
            })()}
          </div>

      {tab === "requisitions" ? (
        <div style={S.list}>
          {canRequisition && (
            <button type="button" className="stk-btn" style={S.addBtn} onClick={openRequisitionPicker}>
              <Plus size={15} strokeWidth={2.5} /> New requisition
            </button>
          )}
          {requisitions.length === 0 && <div style={{ ...S.empty, marginTop: 10 }}>No requisitions yet.</div>}
          {requisitions.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <input
                style={{ ...S.input, flex: 2, minWidth: 160 }}
                value={requisitionsSearchQuery}
                onChange={(e) => setRequisitionsSearchQuery(e.target.value)}
                placeholder="Search by item, supplier, or who requested it…"
              />
              <select
                style={{ ...S.input, flex: 1, minWidth: 130 }}
                value={requisitionsSupplierFilter}
                onChange={(e) => setRequisitionsSupplierFilter(e.target.value)}
              >
                <option value="">All suppliers</option>
                {master.suppliers.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          {["pending", "ordered"].map((status) => {
            const rq = requisitionsSearchQuery.trim().toLowerCase();
            const list = requisitions
              .filter((r) => r.status === status)
              .filter((r) => canManageRequisitions || r.requestedBy === roleLabel)
              .filter((r) => !requisitionsSupplierFilter || r.supplier === requisitionsSupplierFilter)
              .filter(
                (r) =>
                  !rq ||
                  (r.itemLabel || "").toLowerCase().includes(rq) ||
                  (r.supplier || "").toLowerCase().includes(rq) ||
                  (r.requestedBy || "").toLowerCase().includes(rq)
              )
              .sort((a, b) => new Date(b.dateRequested) - new Date(a.dateRequested));
            if (list.length === 0) return null;
            return (
              <div key={status} style={S.gradeBlock}>
                <div style={S.gradeHeader}>
                  <span style={S.gradeTitle}>{status}</span>
                  <span style={S.gradeCount}>{list.length}</span>
                </div>
                <div style={S.gradeItems}>
                  {status === "pending" ? (
                    // Grouped by supplier — the everyday need this serves:
                    // several separate requests for the same supplier,
                    // submitted together as one PO rather than raised one
                    // at a time throughout the day.
                    Object.entries(
                      list.reduce((acc, r) => {
                        const k = r.supplier || "No supplier set";
                        (acc[k] = acc[k] || []).push(r);
                        return acc;
                      }, {})
                    )
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([supplierName, supplierReqs]) => (
                        <div key={supplierName} style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ ...S.label, fontWeight: 700 }}>{supplierName} · {supplierReqs.length}</span>
                            {canRaisePO && supplierName !== "No supplier set" && (
                              <button
                                type="button"
                                className="stk-btn"
                                style={S.reqActionBtn}
                                onClick={() => raisePoForSupplierGroup(supplierName, supplierReqs)}
                              >
                                <FileText size={13} /> Raise PO for all {supplierReqs.length}
                              </button>
                            )}
                          </div>
                          {supplierReqs.map(renderRequisitionCard)}
                        </div>
                      ))
                  ) : (
                    list.map(renderRequisitionCard)
                  )}
                </div>
              </div>
            );
          })}

          {canRaisePO && selectedReqIds.length > 0 && (
            <div style={S.poSelectBar}>
              <span>{selectedReqIds.length} selected for a Purchase Order</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => setSelectedReqIds([])}>
                  Clear
                </button>
                <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={raisePoFromSelected}>
                  <FileText size={13} /> Raise Purchase Order
                </button>
              </div>
            </div>
          )}

          {canManageRequisitions && (
            <div style={S.gradeBlock}>
              <button className="stk-grade" style={S.gradeHeader} onClick={() => setShowArchive((v) => !v)}>
                <ChevronDown size={15} style={{ transform: showArchive ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                <span style={S.gradeTitle}>Completed / Archived</span>
                <span style={S.gradeCount}>
                  {requisitions.filter((r) => ["received", "fulfilled", "cancelled"].includes(r.status)).length}
                </span>
              </button>
              {showArchive && (
                <>
                  <div style={S.filterBar}>
                    <div>
                      <label style={S.label}>Type</label>
                      <select style={S.input} value={archiveTypeFilter} onChange={(e) => setArchiveTypeFilter(e.target.value)}>
                        <option value="">All types</option>
                        {TABS.map((t) => (
                          <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={S.formGrid}>
                      <div>
                        <label style={S.label}>From</label>
                        <input type="date" style={S.input} value={archiveDateFrom} onChange={(e) => setArchiveDateFrom(e.target.value)} />
                      </div>
                      <div>
                        <label style={S.label}>To</label>
                        <input type="date" style={S.input} value={archiveDateTo} onChange={(e) => setArchiveDateTo(e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <div style={S.gradeItems}>
                    {requisitions
                      .filter((r) => ["received", "fulfilled", "cancelled"].includes(r.status))
                      .filter((r) => !archiveTypeFilter || r.mainCat === archiveTypeFilter)
                      .filter((r) => !archiveDateFrom || new Date(r.dateRequested) >= new Date(archiveDateFrom))
                      .filter((r) => !archiveDateTo || new Date(r.dateRequested) <= new Date(archiveDateTo + "T23:59:59"))
                      .filter((r) => !requisitionsSupplierFilter || r.supplier === requisitionsSupplierFilter)
                      .filter((r) => {
                        const rq = requisitionsSearchQuery.trim().toLowerCase();
                        return (
                          !rq ||
                          (r.itemLabel || "").toLowerCase().includes(rq) ||
                          (r.supplier || "").toLowerCase().includes(rq) ||
                          (r.requestedBy || "").toLowerCase().includes(rq)
                        );
                      })
                      .sort((a, b) => new Date(b.dateRequested) - new Date(a.dateRequested))
                      .map((r) => (
                        <div key={r.id} style={S.reqCard}>
                          <div style={S.reqCardTop}>
                            <span style={S.itemName}>{r.itemLabel}</span>
                            <span style={{ ...S.reqStatusTag, ...S["reqStatus_" + r.status] }}>
                              {r.status === "fulfilled" ? "fulfilled — back in stock" : r.status}
                            </span>
                          </div>
                          <div className="stk-meta-row" style={S.rowMeta}>
                            <span>Qty: {r.qty}</span>
                            <span>Requested by {r.requestedBy}</span>
                            {r.orderedBy && <span>Ordered by {r.orderedBy} on {new Date(r.dateOrdered).toLocaleDateString()}</span>}
                            {r.receivedBy && <span>Received by {r.receivedBy} on {new Date(r.dateReceived).toLocaleDateString()}</span>}
                            {r.dateFulfilled && <span>Stocked {new Date(r.dateFulfilled).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : tab === "purchaseOrders" ? (
        <div style={S.list}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canRaisePO && (
              <button type="button" className="stk-btn" style={S.addBtn} onClick={() => openPoBuilder()}>
                <Plus size={15} strokeWidth={2.5} /> Raise Purchase Order
              </button>
            )}
            {canManageRequisitions && (
              <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => setShowPoReport(true)}>
                <FileText size={13} /> Generate Report
              </button>
            )}
          </div>

          {purchaseOrders.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <input
                style={{ ...S.input, flex: 2, minWidth: 160 }}
                value={poSearchQuery}
                onChange={(e) => setPoSearchQuery(e.target.value)}
                placeholder="Search by PO number, supplier, or reference…"
              />
              <select style={{ ...S.input, flex: 1, minWidth: 130 }} value={poSupplierFilter} onChange={(e) => setPoSupplierFilter(e.target.value)}>
                <option value="">All suppliers</option>
                {master.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {purchaseOrders.length === 0 && <div style={S.empty}>No Purchase Orders yet.</div>}
          {(() => {
            const pq = poSearchQuery.trim().toLowerCase();
            const matchesSearch = (po) =>
              (!poSupplierFilter || po.supplierId === poSupplierFilter) &&
              (!pq ||
                (po.poNumber || "").toLowerCase().includes(pq) ||
                (po.supplierName || "").toLowerCase().includes(pq) ||
                (po.reference || "").toLowerCase().includes(pq));
            const renderPoCard = (po) => {
              const isOpen = expandedPoId === po.id;
              return (
                <div key={po.id} style={S.reqCard}>
                  <button
                    type="button"
                    className="stk-btn"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                      gap: 10,
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      color: "inherit",
                      font: "inherit",
                    }}
                    onClick={() => setExpandedPoId(isOpen ? null : po.id)}
                  >
                    <span style={S.itemName}>{po.poNumber}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ ...S.reqStatusTag, ...(po.status === "received" ? S.reqStatus_received : S.reqStatus_ordered) }}>
                        R{po.totalValue.toFixed(2)}
                      </span>
                      <ChevronDown size={16} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                    </span>
                  </button>
                  {isOpen && (
                    <>
                      <div className="stk-meta-row" style={{ ...S.rowMeta, marginTop: 6 }}>
                        <span>Raised by {po.createdBy}</span>
                        <span>{new Date(po.dateCreated).toLocaleDateString()}</span>
                        <span>{po.lineItems.length} line{po.lineItems.length === 1 ? "" : "s"}</span>
                        {po.status === "received" && (
                          <>
                            <span>Received by {po.receivedBy} on {new Date(po.receivedDate).toLocaleDateString()}</span>
                            {po.deliveryNoteNumber && <span>Delivery note: {po.deliveryNoteNumber}</span>}
                          </>
                        )}
                      </div>
                      {po.notes && <div style={S.itemComment}>{po.notes}</div>}
                      <div style={S.reqActions}>
                        <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => viewPoPdf(po)}>
                          <FileText size={13} /> View PDF
                        </button>
                        {canRaisePO && (
                          <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => copyPurchaseOrder(po)}>
                            <Copy size={13} /> Copy
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            };

            const outstanding = [...purchaseOrders].filter((po) => po.status !== "received").filter(matchesSearch);
            const bySupplier = Object.entries(
              outstanding.reduce((acc, po) => {
                const k = po.supplierName || "No supplier";
                (acc[k] = acc[k] || []).push(po);
                return acc;
              }, {})
            ).sort((a, b) => a[0].localeCompare(b[0]));

            return (
              <>
                <div style={{ ...S.gradeItems, marginTop: 10 }}>
                  {bySupplier.map(([supplierName, list]) => (
                    <div key={supplierName} style={{ marginBottom: 14 }}>
                      <div style={{ ...S.label, fontWeight: 700, marginBottom: 6 }}>{supplierName} · {list.length}</div>
                      {list.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated)).map(renderPoCard)}
                    </div>
                  ))}
                  {outstanding.length === 0 && purchaseOrders.length > 0 && <div style={S.empty}>Nothing matches.</div>}
                </div>

                <div style={S.gradeBlock}>
                  <button className="stk-grade" style={S.gradeHeader} onClick={() => setShowCompletedPOs((v) => !v)}>
                    <ChevronDown size={15} style={{ transform: showCompletedPOs ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                    <span style={S.gradeTitle}>Received / Completed</span>
                    <span style={S.gradeCount}>{purchaseOrders.filter((po) => po.status === "received").length}</span>
                  </button>
                  {showCompletedPOs && (
                    <div style={S.gradeItems}>
                      {[...purchaseOrders]
                        .filter((po) => po.status === "received")
                        .filter(matchesSearch)
                        .sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate))
                        .map(renderPoCard)}
                      {purchaseOrders.filter((po) => po.status === "received").filter(matchesSearch).length === 0 && (
                        <div style={S.empty}>Nothing received matches.</div>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      ) : tab === "receiving" ? (
        <div style={S.list}>
          <div style={S.roleHint}>Pick an outstanding Purchase Order to confirm what actually arrived.</div>
          {purchaseOrders.filter((po) => po.status !== "received").length > 0 && (
            <input
              style={{ ...S.input, marginTop: 10 }}
              value={receivingSearchQuery}
              onChange={(e) => setReceivingSearchQuery(e.target.value)}
              placeholder="Search by PO number or supplier…"
            />
          )}
          {purchaseOrders.filter((po) => po.status !== "received").length === 0 && (
            <div style={S.empty}>Nothing outstanding to receive.</div>
          )}
          <div style={{ ...S.gradeItems, marginTop: 10 }}>
            {(() => {
              const rq = receivingSearchQuery.trim().toLowerCase();
              const list = [...purchaseOrders]
                .filter((po) => po.status !== "received")
                .filter(
                  (po) =>
                    !rq ||
                    (po.poNumber || "").toLowerCase().includes(rq) ||
                    (po.supplierName || "").toLowerCase().includes(rq)
                )
                .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
              if (list.length === 0 && rq) return <div style={S.empty}>Nothing matches.</div>;
              return list.map((po) => {
                const isOpen = expandedReceivingId === po.id;
                return (
                  <div key={po.id} style={S.reqCard}>
                    <button
                      type="button"
                      className="stk-btn"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        textAlign: "left",
                        cursor: "pointer",
                        gap: 10,
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        color: "inherit",
                        font: "inherit",
                      }}
                      onClick={() => setExpandedReceivingId(isOpen ? null : po.id)}
                    >
                      <span style={S.itemName}>{po.poNumber} — {po.supplierName || "No supplier"}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>R{po.totalValue.toFixed(2)}</span>
                        <ChevronDown size={16} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                      </span>
                    </button>
                    {isOpen && (
                      <>
                        <div className="stk-meta-row" style={{ ...S.rowMeta, marginTop: 6 }}>
                          <span>Raised by {po.createdBy}</span>
                          <span>{new Date(po.dateCreated).toLocaleDateString()}</span>
                          <span>{po.lineItems.length} line{po.lineItems.length === 1 ? "" : "s"}</span>
                        </div>
                        <div style={S.reqActions}>
                          <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => openReceiving(po)}>
                            <Check size={13} /> Receive this PO
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              });
            })()}
          </div>

          <div style={S.gradeBlock}>
            <button className="stk-grade" style={S.gradeHeader} onClick={() => setShowReceivingHistory((v) => !v)}>
              <ChevronDown size={15} style={{ transform: showReceivingHistory ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
              <span style={S.gradeTitle}>Completed / History</span>
            </button>
            {showReceivingHistory && (
              <div style={{ marginTop: 10 }}>
                <div style={S.filterBar}>
                  <div>
                    <label style={S.label}>From</label>
                    <input
                      type="date"
                      style={S.input}
                      value={receivingHistoryDateFrom}
                      onChange={(e) => setReceivingHistoryDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={S.label}>To</label>
                    <input
                      type="date"
                      style={S.input}
                      value={receivingHistoryDateTo}
                      onChange={(e) => setReceivingHistoryDateTo(e.target.value)}
                    />
                  </div>
                  <input
                    style={S.input}
                    value={receivingHistorySearchQuery}
                    onChange={(e) => setReceivingHistorySearchQuery(e.target.value)}
                    placeholder="Search item, supplier note, or person…"
                  />
                </div>
                {(() => {
                  const received = [...usageLog]
                    .filter((u) => u.direction === "add")
                    .filter((u) => !receivingHistoryDateFrom || new Date(u.timestamp) >= new Date(receivingHistoryDateFrom))
                    .filter((u) => !receivingHistoryDateTo || new Date(u.timestamp) <= new Date(receivingHistoryDateTo + "T23:59:59"))
                    .filter((u) => {
                      if (!receivingHistorySearchQuery.trim()) return true;
                      const q = receivingHistorySearchQuery.toLowerCase();
                      return (
                        u.itemName.toLowerCase().includes(q) ||
                        (u.note || "").toLowerCase().includes(q) ||
                        (u.by || "").toLowerCase().includes(q)
                      );
                    })
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                  return (
                    <div style={{ ...S.gradeItems, marginTop: 10 }}>
                      {received.length === 0 && <div style={S.empty}>Nothing received yet.</div>}
                      {received.map((u) => (
                        <div key={u.id} style={S.reqCard}>
                          <div style={S.reqCardTop}>
                            <span style={S.itemName}>{u.itemName}</span>
                            <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>+{u.qty}</span>
                          </div>
                          <div className="stk-meta-row" style={S.rowMeta}>
                            <span>By {u.by}</span>
                            <span>{new Date(u.timestamp).toLocaleString()}</span>
                          </div>
                          {u.note && <div style={S.itemComment}>{u.note}</div>}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : tab === "jobs" ? (
        <div style={S.list}>
          {canEditQty("jobs") && (
            <button type="button" className="stk-btn" style={S.addBtn} onClick={openNewJob}>
              <Plus size={15} strokeWidth={2.5} /> New Job
            </button>
          )}
          {jobsLoading && <div style={{ ...S.empty, marginTop: 10 }}>Loading…</div>}
          {!jobsLoading && jobsList?.length === 0 && <div style={S.empty}>No jobs yet.</div>}

          {jobsList?.length > 0 &&
            (() => {
              const customers = [...new Set(jobsList.map((j) => j.customer).filter(Boolean))].sort();
              const salesReps = [...new Set(jobsList.map((j) => j.sales_rep).filter(Boolean))].sort();
              const q = jobsSearchQuery.trim().toLowerCase();
              const matchesFilters = (j) =>
                (!jobsCustomerFilter || j.customer === jobsCustomerFilter) &&
                (!jobsSalesRepFilter || j.sales_rep === jobsSalesRepFilter) &&
                (!q ||
                  (j.job_number || "").toLowerCase().includes(q) ||
                  (j.customer || "").toLowerCase().includes(q) ||
                  (j.sales_rep || "").toLowerCase().includes(q));
              const renderJobRow = (job) => (
                <button
                  key={job.id}
                  type="button"
                  className="stk-btn"
                  style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
                  onClick={() => openJobDetail(job)}
                >
                  <span style={{ fontSize: 15, color: C.text }}>{job.job_number}</span>
                  <span style={{ fontSize: 15, color: C.text }}>{job.laser_job_reference || "No SigmaNest #"}</span>
                  <span style={{ fontSize: 15, color: C.text }}>{job.customer || "No customer"}</span>
                  <span style={{ fontSize: 15, color: C.text }}>{job.sales_rep || "No sales rep"}</span>
                </button>
              );

              return (
                <>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <input
                      style={{ ...S.input, flex: 2, minWidth: 160 }}
                      value={jobsSearchQuery}
                      onChange={(e) => setJobsSearchQuery(e.target.value)}
                      placeholder="Search job #, customer, sales rep…"
                    />
                    <select style={{ ...S.input, flex: 1, minWidth: 130 }} value={jobsCustomerFilter} onChange={(e) => setJobsCustomerFilter(e.target.value)}>
                      <option value="">All customers</option>
                      {customers.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <select style={{ ...S.input, flex: 1, minWidth: 130 }} value={jobsSalesRepFilter} onChange={(e) => setJobsSalesRepFilter(e.target.value)}>
                      <option value="">All sales reps</option>
                      {salesReps.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <label style={{ ...S.label, marginTop: 12, display: "block" }}>Active</label>
                  <div style={{ ...S.managerListFullPage, marginTop: 6 }}>
                    {jobsList.filter((j) => (j.status === "in_progress" || j.status === "complete") && matchesFilters(j)).map(renderJobRow)}
                    {jobsList.filter((j) => (j.status === "in_progress" || j.status === "complete") && matchesFilters(j)).length === 0 && (
                      <div style={S.empty}>Nothing active matches.</div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="stk-btn"
                    style={{ ...S.productionPill, marginTop: 16 }}
                    onClick={() => setJobsCompletedSectionOpen((o) => !o)}
                  >
                    <span>Completed</span>
                    <span style={S.gradeCount}>{jobsList.filter((j) => j.status === "invoiced" && matchesFilters(j)).length}</span>
                    <ChevronDown size={14} style={{ transform: jobsCompletedSectionOpen ? "rotate(180deg)" : "none" }} />
                  </button>
                  {jobsCompletedSectionOpen && (
                    <div style={{ ...S.managerListFullPage, marginTop: 6 }}>
                      {jobsList.filter((j) => j.status === "invoiced" && matchesFilters(j)).map(renderJobRow)}
                      {jobsList.filter((j) => j.status === "invoiced" && matchesFilters(j)).length === 0 && (
                        <div style={S.empty}>Nothing completed matches.</div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
        </div>
      ) : tab === "laser4kw" ? (
        laserData === null || jobsList === null ? (
          <div style={S.empty}>Loading programs…</div>
        ) : (
          (() => {
            const { jobsToNest, programs, allJobs } = laserNestingData();
            return (
              <NestingView
                machine={LASER_MACHINE}
                jobsToNest={jobsToNest}
                programs={programs}
                allJobs={allJobs}
                materials={master.laserMaterials || []}
                canManage={isAdmin || !!profile?.allowedProcessTypes?.some(isNestingProcess)}
                onCreateProgram={createLaserProgram}
                onCancelProgram={cancelLaserProgram}
                onAddJobToProgram={addJobToLaserProgram}
                onRemoveJobFromProgram={removeJobFromLaserProgram}
                onMarkJobNested={markJobFullyNested}
                onUpdateProgram={updateLaserProgram}
                SavedCheck={SavedCheck}
              />
            );
          })()
        )
      ) : tab === "production" ? (
        productionSelectedDept === null ? (
          <div style={S.list}>
            {/* Without any process types assigned, fetchProductionQueue
                returns immediately and this screen stays blank — which
                reads as "no work on" rather than "not set up", and an
                admin sees it too since isAdmin doesn't bypass the check.
                Say so, the way the sign-in screen does for no access. */}
            {!profile?.allowedProcessTypes?.length && (
              <div style={S.empty}>
                Production shows the stages you're set up to handle, and you haven't been given any yet — so there's
                nothing here, even if jobs are running. {isAdmin ? "Set yours" : "Ask an admin to set them"} under Stock
                Manager → User Management → your name → Production access.
              </div>
            )}
            {productionLoading && <div style={S.empty}>Loading…</div>}
            {Object.keys(productionQueue || {}).length > 0 && (
              <input
                style={{ ...S.input, marginBottom: 10 }}
                value={productionSearchQuery}
                onChange={(e) => setProductionSearchQuery(e.target.value)}
                placeholder="Search job number, SigmaNest number, or customer…"
              />
            )}
            {(() => {
              const q = productionSearchQuery.trim().toLowerCase();
              const matchesJob = ({ job }) =>
                (job.job_number || "").toLowerCase().includes(q) ||
                (job.laser_job_reference || "").toLowerCase().includes(q) ||
                (job.customer || "").toLowerCase().includes(q);
              const visibleDepts = Object.entries(productionQueue || {})
                .map(([procType, allEntries]) => {
                  // Counts what the department can actually see now that
                  // nothing is hidden, so the number on the pill and the
                  // length of the list agree.
                  const readyCount = q ? allEntries.filter(matchesJob).length : allEntries.length;
                  // Only nesting gets the marker now. A shortage past that
                  // point is carried by its own run, which shows up in the
                  // department's normal list like any other work — a second
                  // marker would be pointing at something already there.
                  const hasPendingShortage =
                    !q && isNestingProcess(procType) && (shortagesList || []).some((s) => s.status === "flagged");
                  return { procType, readyCount, hasPendingShortage };
                })
                // A department with nothing ready and no shortage needing
                // attention has nothing to actually do right now — hide it
                // rather than list empty departments alongside real work.
                // One with a pending shortage stays visible regardless of
                // readyCount, so that alert is never accidentally hidden.
                // A search is a deliberate, specific request though — it
                // shows every department that job is genuinely in, not
                // just the ones with something "ready" right now.
                // Only departments with work in them. A station with
                // nothing at it is noise on a screen someone is using to
                // decide what to do next.
                .filter(({ readyCount, hasPendingShortage }) => readyCount > 0 || hasPendingShortage)
                // In factory-flow order, the order set in Stock Manager,
                // so the list reads the way work moves through the shop.
                // Anything no longer in that list sorts last rather than
                // to the front.
                .sort((a, b) => {
                  const flow = master?.jobProcessTypes || [];
                  const rank = (t) => {
                    const i = flow.indexOf(t);
                    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
                  };
                  return rank(a.procType) - rank(b.procType);
                });
              return (
                <>
                  {!productionLoading && visibleDepts.length === 0 && (
                    <div style={S.empty}>{q ? "Nothing matches that search." : "Nothing outstanding right now."}</div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
                    {visibleDepts.map(({ procType, readyCount, hasPendingShortage }) => {
                return (
                  <button
                    key={procType}
                    type="button"
                    className="stk-btn"
                    style={S.productionDeptCard}
                    onClick={() => {
                      setProductionSelectedDept(procType);
                      setProductionSelectedProcessId(null);
                    }}
                  >
                    {hasPendingShortage && (
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.danger, flexShrink: 0 }} title="Shortage needs attention" />
                    )}
                    <span style={{ flex: 1 }}>{procType}</span>
                    <span style={S.gradeCount}>{readyCount}</span>
                    <ChevronRight size={20} />
                  </button>
                );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          <div style={S.list}>
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.prominentBackBtn, marginBottom: 10 }}
              onClick={() => {
                setProductionSelectedDept(null);
                setProductionSelectedProcessId(null);
              }}
            >
              <ChevronLeft size={18} strokeWidth={2.5} /> All departments
            </button>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{productionSelectedDept}</div>
            <input
              style={S.input}
              value={productionSearchQuery}
              onChange={(e) => setProductionSearchQuery(e.target.value)}
              placeholder="Search job number, SigmaNest number, or customer…"
            />
            {(() => {
              const procType = productionSelectedDept;
              const allEntries = productionQueue?.[procType] || [];
              const q = productionSearchQuery.trim().toLowerCase();
              let entries = q
                ? allEntries.filter(
                    ({ job }) =>
                      (job.job_number || "").toLowerCase().includes(q) ||
                      (job.laser_job_reference || "").toLowerCase().includes(q) ||
                      (job.customer || "").toLowerCase().includes(q)
                  )
                : allEntries;
              // Everything at this stage is shown, and each card says
              // whose it is. Unassigned work used to be hidden from the
              // whole department, so a job nobody had been given was
              // invisible to everyone — including the people who could
              // have picked it up. Labelling instead of hiding keeps what
              // the assignment was protecting (two people not starting the
              // same job) without losing the work.
              //
              // Yours first, then unassigned, then other people's.
              entries = entries.slice().sort((a, b) => {
                const rank = (e) =>
                  e.process.assigned_to === currentUser?.id ? 0 : !e.process.assigned_to ? 1 : 2;
                return rank(a) - rank(b);
              });
              return (
                <div style={{ ...S.gradeItems, marginTop: 8 }}>
                  {/* Only the not-yet-nested ones. Once nesting has set a
                      shortage up it has its own run through the shop, and
                      that run is what carries it from here — listing it
                      again for the laser would show the same shortage
                      twice, with a "Shortage cut" button that marks it
                      finished while welding and assembly are still to do. */}
                  {isNestingProcess(procType) &&
                    (() => {
                      const relevantStatus = "flagged";
                      // Priority first, then oldest — a queue is only
                      // useful if the order on screen is the order to work
                      // in, so the operator never has to read all of them
                      // to find what matters.
                      const relevant = (shortagesList || [])
                        .filter((s) => s.status === relevantStatus)
                        .slice()
                        .sort((a, b) => {
                          const ap = a.is_priority === false ? 1 : 0;
                          const bp = b.is_priority === false ? 1 : 0;
                          if (ap !== bp) return ap - bp;
                          return String(a.created_at || "").localeCompare(String(b.created_at || ""));
                        });
                      if (relevant.length === 0) return null;
                      return (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ ...S.label, color: C.danger }}>⚠ Shortages needing {isNestingProcess(procType) ? "nesting" : "cutting"}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                            {relevant.map((s) => (
                              <div key={s.id} style={{ ...S.reqCard, borderColor: C.danger, borderWidth: 2 }}>
                                <div style={S.reqCardTop}>
                                  <span style={S.itemName}>{s.job_number} — {s.customer || "No customer"}</span>
                                  {s.is_priority === false ? (
                                    <span style={{ ...S.reqStatusTag, color: C.muted }} title={s.priority_note || "Can wait"}>
                                      Can wait
                                    </span>
                                  ) : (
                                    <span style={{ ...S.reqStatusTag, background: C.dangerTint, color: C.danger, fontWeight: 700 }}>
                                      Priority
                                    </span>
                                  )}
                                </div>
                                <div style={{ ...S.itemComment, marginTop: 2 }}>
                                  {/* Listed line by line rather than as one
                                      string, so each photo sits with the
                                      part it belongs to. */}
                                  {shortageLines(s).map((line, li) => (
                                    <span key={li} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
                                      {line.description} × {line.qty}
                                      {line.photo && (
                                        <button
                                          type="button"
                                          className="stk-btn"
                                          style={{ background: "none", border: "none", padding: 0, color: C.accentRaw, cursor: "pointer" }}
                                          title="See the photo"
                                          onClick={(e) => { e.stopPropagation(); viewShortagePhoto(line.photo, line.photoName); }}
                                        >
                                          <ImageIcon size={13} />
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {s.board_number && `— SigmaNest ${s.board_number}`}
                                </div>
                                <div className="stk-meta-row" style={S.rowMeta}>
                                  <span>Reason: {s.reason}</span>
                                  <span>Flagged by {s.flagged_by} ({s.flagged_department})</span>
                                </div>
                                <button
                                  type="button"
                                  className="stk-btn"
                                  style={{ ...S.reqActionBtn, marginTop: 6, width: "100%" }}
                                  onClick={() => (isNestingProcess(procType) ? markShortageNested(s) : markShortageCut(s))}
                                >
                                  {isNestingProcess(procType) ? "Shortage nested" : "Shortage cut"}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  {entries.length === 0 && <div style={S.empty}>Nothing outstanding for {procType}.</div>}
                  {productionSelectedProcessId ? (
                    (() => {
                      const selected = allEntries.find(({ process }) => process.id === productionSelectedProcessId);
                      if (!selected) {
                        // The job this was pointing at is no longer in the
                        // queue (completed, reassigned elsewhere, etc.) —
                        // always leave a way back rather than a dead end.
                        return (
                          <div>
                            <button
                              type="button"
                              className="stk-btn"
                              style={{ ...S.prominentBackBtn, marginBottom: 10 }}
                              onClick={() => setProductionSelectedProcessId(null)}
                            >
                              <ChevronLeft size={18} strokeWidth={2.5} /> Back to {procType} list
                            </button>
                            <div style={S.empty}>This job isn't in the queue anymore.</div>
                          </div>
                        );
                      }
                      const { job, process, isReady, quoteItems, documents, itemProgress, shortage } = selected;
                      const stagesOnJob = selected.jobProcesses || [];
                      const progressOnJob = selected.jobItemProgress || [];
                      const drawingsForJob = quoteItems
                        .map((it) => {
                          const linkedItem = it.linked_item_id ? (items || []).find((i) => i.id === it.linked_item_id) : null;
                          const drawing = linkedItem?.partNumber ? drawingLookup[linkedItem.partNumber.trim()] : null;
                          return drawing ? { description: it.description, partNumber: linkedItem.partNumber, drawing } : null;
                        })
                        .filter(Boolean);
                      const totalQty = quoteItems.reduce((sum, it) => sum + Number(it.qty || 0), 0);
                      return (
                        <div>
                          <button
                            type="button"
                            className="stk-btn"
                            style={{ ...S.prominentBackBtn, marginBottom: 10 }}
                            onClick={() => setProductionSelectedProcessId(null)}
                          >
                            <ChevronLeft size={18} strokeWidth={2.5} /> Back to {procType} list
                          </button>
                          <div style={S.reqCard}>
                            <div style={S.reqCardTop}>
                              <span style={S.itemName}>{job.job_number} — {job.customer || "No customer"}</span>
                              <span style={{ ...S.reqStatusTag, ...(isReady ? S.reqStatus_received : S.reqStatus_ordered) }}>
                                {isReady ? "Ready" : "Waiting"}
                              </span>
                            </div>
                            {/* The list card says this is a re-cut, but the
                                operator works from this screen — without it
                                here they are making a replacement part with
                                nothing telling them so, or how many. */}
                            {shortage && (
                              <div
                                style={{
                                  border: `2px solid ${C.danger}`,
                                  borderRadius: 6,
                                  padding: 8,
                                  marginBottom: 8,
                                  background: C.dangerTint,
                                }}
                              >
                                <div style={{ color: C.danger, fontWeight: 700 }}>
                                  ⚠ Shortage re-cut{shortage.is_priority === false ? "" : " · Priority"}
                                </div>
                                <div style={{ ...S.itemComment, marginTop: 2 }}>
                                  {shortageLines(shortage).map((line, li) => (
                                    <span key={li} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
                                      {line.description} × {line.qty}
                                      {line.photo && (
                                        <button
                                          type="button"
                                          className="stk-btn"
                                          style={{ background: "none", border: "none", padding: 0, color: C.accentRaw, cursor: "pointer" }}
                                          title="See the photo"
                                          onClick={() => viewShortagePhoto(line.photo, line.photoName)}
                                        >
                                          <ImageIcon size={13} />
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {shortage.board_number ? ` — SigmaNest ${shortage.board_number}` : ""}
                                </div>
                                <div className="stk-meta-row" style={S.rowMeta}>
                                  <span>Reason: {shortage.reason}</span>
                                  <span>Flagged by {shortage.flagged_by} at {shortage.flagged_department}</span>
                                </div>
                              </div>
                            )}
                            {isNestingProcess(process.process_name) && (
                              <div style={{ marginBottom: 4 }}>
                                <label style={S.label}>SigmaNest job number</label>
                                <input
                                  style={{ ...S.input, marginTop: 4 }}
                                  defaultValue={job.laser_job_reference || ""}
                                  placeholder="Not filled in yet"
                                  onBlur={(e) => {
                                    if (e.target.value !== (job.laser_job_reference || "")) saveJobSigmaNestNumber(job, e.target.value.trim());
                                  }}
                                />
                              </div>
                            )}
                            {job.description && <div style={S.roleHint}>{job.description}</div>}
                            <div className="stk-meta-row" style={S.rowMeta}>
                              {process.operator && <span>Assigned: {process.operator}</span>}
                              {totalQty > 0 && <span>Qty: {totalQty}</span>}
                              {job.laser_job_reference && <span>SigmaNest: {job.laser_job_reference}</span>}
                              {job.due_date && <span>Due {new Date(job.due_date).toLocaleDateString()}</span>}
                              {process.is_urgent && <span style={{ color: C.danger, fontWeight: 600 }}>Urgent</span>}
                            </div>
                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                              <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, flex: 1 }} onClick={() => toggleProcessUrgent(process)}>
                                {process.is_urgent ? "Unmark urgent" : "Mark urgent"}
                              </button>
                              <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, flex: 1 }} onClick={() => openShortageFlagModal(job, process)}>
                                Flag shortage
                              </button>
                            </div>
                            {/* Material already set aside for this stage,
                                so the operator is told what to use rather
                                than having to go and find out. */}
                            {(() => {
                              const mine = (allocationsList || []).filter(
                                (a) => a.process_id === process.id && a.status !== "released"
                              );
                              if (mine.length === 0) return null;
                              return (
                                <div style={{ marginTop: 8 }}>
                                  <div style={{ ...S.label, color: C.accentRaw }}>Material set aside for this stage</div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                                    {mine.map((a) => {
                                      const outstanding = Number(a.qty_allocated) - Number(a.qty_used);
                                      const stockItem = (items || []).find((i) => i.id === a.item_id);
                                      return (
                                        <div key={a.id} style={{ ...S.reqCard, borderColor: C.accentRaw }}>
                                          <div style={S.reqCardTop}>
                                            <span style={S.itemName}>{a.item_name}</span>
                                            <span style={{ fontFamily: F.mono, fontSize: 12.5, color: outstanding > 0 ? C.accentRaw : C.muted }}>
                                              {outstanding > 0 ? `${outstanding} to use` : "all used"}
                                            </span>
                                          </div>
                                          <div className="stk-meta-row" style={S.rowMeta}>
                                            {a.qty_used > 0 && <span>{a.qty_used} of {a.qty_allocated} already used</span>}
                                            {stockItem?.loc && <span>Location: {stockItem.loc}</span>}
                                            {stockItem?.trackLength && stockItem.length > 0 && <span>{stockItem.length}m lengths</span>}
                                            <span>Set aside by {a.allocated_by}</span>
                                          </div>
                                          {outstanding > 0 && (
                                            <button
                                              type="button"
                                              className="stk-btn"
                                              style={{ ...S.reqActionBtn, marginTop: 6, width: "100%" }}
                                              onClick={() =>
                                                setUseAllocationModal({
                                                  allocation: a,
                                                  item: stockItem,
                                                  qty: String(outstanding),
                                                  offcuts: [],
                                                })
                                              }
                                            >
                                              Use stock
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                            <button
                              type="button"
                              className="stk-btn"
                              style={{ ...S.reqActionBtnMuted, width: "100%", marginTop: 6 }}
                              onClick={() => setPullStockModal({ job, process, dept: null, search: "" })}
                            >
                              <PackagePlus size={13} /> Pull from stock
                            </button>
                            <div style={{ marginTop: 6 }}>
                              {process.tracking_mode === "each" ? (
                                <QtyProgressControl
                                  process={process}
                                  job={job}
                                  quoteItems={quoteItems}
                                  itemProgress={itemProgress}
                                  limitFor={(item) => itemFlowLimit(process, stagesOnJob, progressOnJob, item)}
                                  onSubmit={submitProcessItemProgress}
                                />
                              ) : (
                                <label style={{ ...S.checkRow, fontWeight: 600 }}>
                                  <input
                                    type="checkbox"
                                    checked={process.is_complete}
                                    disabled={!isReady}
                                    onChange={() => toggleJobProcessComplete(process, job)}
                                  />
                                  Complete
                                </label>
                              )}
                            </div>
                            {drawingsForJob.length > 0 && canView("drawings") && (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                <label style={S.label}>Drawings</label>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                                  {drawingsForJob.map((d, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      className="stk-btn"
                                      style={S.reqActionBtnMuted}
                                      onClick={() => openDrawingPreviewByPartNumber(d.partNumber)}
                                    >
                                      <FileText size={12} /> {d.description}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                              <ExpandableProcessNotes value={process.notes} onCommit={(notes) => saveProcessNote(process, notes)} />
                            </div>
                            {isNestingProcess(process.process_name) && (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                <label style={S.label}>Nesting document</label>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                                  {documents.map((doc) => (
                                    <button
                                      key={doc.id}
                                      type="button"
                                      className="stk-btn"
                                      style={S.reqActionBtnMuted}
                                      onClick={() => viewJobDocument(doc)}
                                    >
                                      <FileText size={12} /> {doc.file_name}
                                    </button>
                                  ))}
                                  <label style={{ ...S.reqActionBtnMuted, display: "inline-flex", cursor: "pointer", width: "fit-content" }}>
                                    <Upload size={12} /> Upload document
                                    <input
                                      type="file"
                                      style={{ display: "none" }}
                                      onChange={(e) => {
                                        const file = e.target.files[0];
                                        // Tag it with the stage it was
                                        // actually uploaded from. Hardcoding
                                        // "Nesting" filed it under a stage
                                        // that may not exist in this shop,
                                        // so it never appeared again.
                                        if (file) uploadJobDocument(job.id, file, process.process_name);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    entries.map(({ job, process, isReady, quoteItems, shortage }) => {
                      const totalQty = quoteItems.reduce((sum, it) => sum + Number(it.qty || 0), 0);
                      return (
                        <button
                          key={process.id}
                          type="button"
                          className="stk-btn"
                          style={{
                            ...S.reqCard,
                            width: "100%",
                            textAlign: "left",
                            cursor: "pointer",
                            // A replacement for something missing reads
                            // very differently from new work, and the
                            // operator needs to know which this is before
                            // they open it.
                            ...(shortage ? { borderColor: C.danger, borderWidth: 2 } : {}),
                          }}
                          onClick={() => setProductionSelectedProcessId(process.id)}
                        >
                          <div style={S.reqCardTop}>
                            <span style={S.itemName}>{job.job_number} — {job.customer || "No customer"}</span>
                            <span style={{ ...S.reqStatusTag, ...(isReady ? S.reqStatus_received : S.reqStatus_ordered) }}>
                              {isReady ? "Ready" : "Waiting"}
                            </span>
                          </div>
                          {shortage && (
                            <div style={{ ...S.itemComment, color: C.danger, fontWeight: 600, marginTop: 2 }}>
                              ⚠ Shortage re-cut{shortage.is_priority === false ? "" : " · Priority"} — {shortageSummary(shortage)}
                            </div>
                          )}
                          <div className="stk-meta-row" style={S.rowMeta}>
                            {/* Whose job this is. Nothing is hidden any
                                more, so the card has to say — otherwise two
                                people start the same one. */}
                            {process.assigned_to === currentUser?.id ? (
                              <span style={{ color: C.accentRaw, fontWeight: 700 }}>Yours</span>
                            ) : process.assigned_to ? (
                              <span>{process.operator || "Someone else"}</span>
                            ) : (
                              <span style={{ color: C.accentRaw, fontWeight: 600 }}>Unassigned</span>
                            )}
                            {job.sales_rep && <span>Sales: {job.sales_rep}</span>}
                            {job.laser_job_reference && <span>SigmaNest: {job.laser_job_reference}</span>}
                            {totalQty > 0 ? (
                              <span>Qty: {totalQty}</span>
                            ) : (
                              <span style={{ color: C.muted }}>No quantity set yet</span>
                            )}
                            {shortage && <span>Originally flagged at {shortage.flagged_department}</span>}
                            {process.is_urgent && <span style={{ color: C.danger, fontWeight: 600 }}>Urgent</span>}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              );
            })()}
          </div>
        )
      ) : tab === "notifications" ? (
        <div style={S.list}>
          {notificationsList === null && <div style={S.empty}>Loading…</div>}
          {notificationsList?.length === 0 && <div style={S.empty}>Nothing yet — you'll see it here when something's assigned to you or a process wraps up on one of your jobs.</div>}
          {(() => {
            const unread = (notificationsList || []).filter((n) => !n.is_read);
            const viewed = (notificationsList || []).filter((n) => n.is_read);
            return (
              <>
                {notificationsList?.length > 0 && unread.length === 0 && (
                  <div style={S.empty}>Nothing new — everything's in "Already viewed" below.</div>
                )}
                <div style={{ ...S.gradeItems, marginTop: 10 }}>
                  {unread.map((n) => (
                    <div key={n.id} style={{ ...S.reqCard, borderLeft: `3px solid ${C.accentRaw}` }} onClick={() => markNotificationRead(n.id)}>
                      <div className="stk-meta-row" style={S.rowMeta}>
                        {n.job_number && <span style={{ fontWeight: 700, color: C.accentRaw }}>{n.job_number}</span>}
                        <span>{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                      <div style={{ ...S.itemName, fontSize: 14.5, marginTop: 2 }}>{n.message}</div>
                    </div>
                  ))}
                </div>
                {viewed.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="stk-btn"
                      style={{ ...S.productionPill, marginTop: 16 }}
                      onClick={() => setNotificationsViewedOpen((o) => !o)}
                    >
                      <span>Already viewed</span>
                      <span style={S.gradeCount}>{viewed.length}</span>
                      <ChevronDown size={14} style={{ transform: notificationsViewedOpen ? "rotate(180deg)" : "none" }} />
                    </button>
                    {notificationsViewedOpen && (
                      <div style={{ ...S.gradeItems, marginTop: 6 }}>
                        {viewed.map((n) => (
                          <div key={n.id} style={S.reqCard}>
                            <div className="stk-meta-row" style={S.rowMeta}>
                              {n.job_number && <span style={{ fontWeight: 700, color: C.accentRaw }}>{n.job_number}</span>}
                              <span>{new Date(n.created_at).toLocaleString()}</span>
                            </div>
                            <div style={{ ...S.itemName, fontSize: 14.5, marginTop: 2 }}>{n.message}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>
      ) : tab === "shortageCenter" ? (
        <div style={S.list}>
          <div style={S.roleHint}>Every shortage across every job, in one place — flagged, being nested, or ready to cut.</div>
          {shortagesList === null && <div style={{ ...S.empty, marginTop: 10 }}>Loading…</div>}
          {shortagesList?.length === 0 && <div style={{ ...S.empty, marginTop: 10 }}>Nothing outstanding right now.</div>}
          {shortagesList?.length > 0 && (
            <input
              style={{ ...S.input, marginTop: 10 }}
              value={shortageSearchQuery}
              onChange={(e) => setShortageSearchQuery(e.target.value)}
              placeholder="Search by job number or customer…"
            />
          )}
          {(() => {
            const sq = shortageSearchQuery.trim().toLowerCase();
            const matchesSearch = (s) =>
              !sq || (s.job_number || "").toLowerCase().includes(sq) || (s.customer || "").toLowerCase().includes(sq);
            const open = (shortagesList || []).filter((s) => s.status !== "cut").filter(matchesSearch);
            const resolved = (shortagesList || []).filter((s) => s.status === "cut").filter(matchesSearch);
            const statusLabel = { flagged: "Needs nesting", nested: "Needs cutting" };
            return (
              <>
                {shortagesList?.length > 0 && open.length === 0 && (
                  <div style={{ ...S.empty, marginTop: 10 }}>{sq ? "Nothing open matches." : "Nothing open — everything's cut."}</div>
                )}
                <div style={{ ...S.gradeItems, marginTop: 10 }}>
                  {open.map((s) => (
                    <div key={s.id} style={{ ...S.reqCard, borderColor: C.danger, borderWidth: 2 }}>
                      <div style={S.reqCardTop}>
                        <span style={S.itemName}>{s.job_number} — {s.customer || "No customer"}</span>
                        <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>{statusLabel[s.status] || s.status}</span>
                      </div>
                      <div style={{ ...S.itemComment, marginTop: 2 }}>
                        {shortageSummary(s)} {s.board_number && `— SigmaNest ${s.board_number}`}
                      </div>
                      <div className="stk-meta-row" style={S.rowMeta}>
                        <span>Reason: {s.reason}</span>
                        <span>Flagged by {s.flagged_by} ({s.flagged_department})</span>
                        <span>{new Date(s.created_at).toLocaleString()}</span>
                        {s.status === "nested" && <span>Nested by {s.nested_by}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {resolved.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="stk-btn"
                      style={{ ...S.productionPill, marginTop: 16 }}
                      onClick={() => setShortagesResolvedOpen((o) => !o)}
                    >
                      <span>Resolved</span>
                      <span style={S.gradeCount}>{resolved.length}</span>
                      <ChevronDown size={14} style={{ transform: shortagesResolvedOpen ? "rotate(180deg)" : "none" }} />
                    </button>
                    {shortagesResolvedOpen && (
                      <div style={{ ...S.gradeItems, marginTop: 6 }}>
                        {resolved.map((s) => (
                          <div key={s.id} style={S.reqCard}>
                            <div style={S.reqCardTop}>
                              <span style={S.itemName}>{s.job_number} — {s.customer || "No customer"}</span>
                              <span style={{ ...S.reqStatusTag, ...S.reqStatus_received }}>Cut</span>
                            </div>
                            <div style={{ ...S.itemComment, marginTop: 2 }}>
                              {shortageSummary(s)} {s.board_number && `— SigmaNest ${s.board_number}`}
                            </div>
                            <div className="stk-meta-row" style={S.rowMeta}>
                              <span>Flagged by {s.flagged_by}</span>
                              <span>Nested by {s.nested_by}</span>
                              <span>Cut by {s.cut_by} on {new Date(s.cut_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>
      ) : tab === "invoicing" ? (
        <div style={S.list}>
          <div style={S.roleHint}>
            Jobs marked Complete show up here, ready to invoice — create the real invoice in Sage, then mark it here to keep a record.
          </div>
          <label style={S.label}>Outstanding</label>
          {(jobsList || []).filter((j) => j.status !== "invoiced" && j.status !== "cancelled" && (j.status === "complete" || jobInvoiceRequests.some((r) => r.job_id === j.id))).length === 0 && (
            <div style={S.empty}>Nothing waiting to be invoiced.</div>
          )}
          <div style={{ ...S.gradeItems, marginTop: 6 }}>
            {(jobsList || [])
              .filter((j) => j.status !== "invoiced" && j.status !== "cancelled" && (j.status === "complete" || jobInvoiceRequests.some((r) => r.job_id === j.id)))
              .map((job) => (
                <div key={job.id} style={S.reqCard}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{job.job_number} — {job.customer || "No customer"}</span>
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>Sales rep: {job.sales_rep}</span>
                    {job.quoted_value != null && <span>Quoted: R {Number(job.quoted_value).toFixed(2)}</span>}
                  </div>
                  <div style={S.reqActions}>
                    {jobInvoiceRequests.find((r) => r.job_id === job.id) ? (
                      <button
                        type="button"
                        className="stk-btn"
                        style={S.reqActionBtnMuted}
                        onClick={() => viewJobInvoiceRequest(jobInvoiceRequests.find((r) => r.job_id === job.id))}
                      >
                        <FileText size={13} /> Open Invoice
                      </button>
                    ) : (
                      <span style={S.roleHint}>No invoice request submitted yet</span>
                    )}
                    {isAdmin || !!profile?.canManageInvoicing && (
                      <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => openMarkInvoicedModal(job)}>
                        <Check size={13} /> Mark as Invoiced
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>

          <button
            type="button"
            className="stk-btn"
            style={{ ...S.productionPill, marginTop: 16 }}
            onClick={() => setInvoicedSectionOpen((o) => !o)}
          >
            <span>Invoiced</span>
            <span style={S.gradeCount}>{(jobsList || []).filter((j) => j.status === "invoiced").length}</span>
            <ChevronDown size={14} style={{ transform: invoicedSectionOpen ? "rotate(180deg)" : "none" }} />
          </button>
          {invoicedSectionOpen && (
            <div style={{ ...S.gradeItems, marginTop: 6 }}>
              {(jobsList || [])
                .filter((j) => j.status === "invoiced")
                .map((job) => (
                  <div key={job.id} style={S.reqCard}>
                    <div style={S.reqCardTop}>
                      <span style={S.itemName}>{job.job_number} — {job.customer || "No customer"}</span>
                    </div>
                    <div className="stk-meta-row" style={S.rowMeta}>
                      <span>Invoiced by {job.invoiced_by} on {new Date(job.invoiced_at).toLocaleDateString()}</span>
                    </div>
                    <div style={S.reqActions}>
                      {jobInvoiceRequests.find((r) => r.job_id === job.id) ? (
                        <button
                          type="button"
                          className="stk-btn"
                          style={S.reqActionBtnMuted}
                          onClick={() => viewJobInvoiceRequest(jobInvoiceRequests.find((r) => r.job_id === job.id))}
                        >
                          <FileText size={13} /> Open Invoice
                        </button>
                      ) : (
                        <span style={S.roleHint}>No invoice request on file</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : tab === "deliveryNotes" ? (
        <div style={S.list}>
          <div style={S.roleHint}>
            Every delivery note across every job, in sequence — like a delivery note book, so nothing issued ever goes untracked.
          </div>
          <div style={S.filterBar}>
            <div>
              <label style={S.label}>From</label>
              <input type="date" style={S.input} value={deliveryNotesDateFrom} onChange={(e) => setDeliveryNotesDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>To</label>
              <input type="date" style={S.input} value={deliveryNotesDateTo} onChange={(e) => setDeliveryNotesDateTo(e.target.value)} />
            </div>
            <input
              style={S.input}
              value={deliveryNotesSearchQuery}
              onChange={(e) => setDeliveryNotesSearchQuery(e.target.value)}
              placeholder="Search job number…"
            />
          </div>
          {(() => {
            const groups = Object.values(
              allDeliveryNotes.reduce((acc, dn) => {
                (acc[dn.delivery_note_number] = acc[dn.delivery_note_number] || []).push(dn);
                return acc;
              }, {})
            )
              .map((group) => {
                const first = group[0];
                const job = (jobsList || []).find((j) => j.id === first.job_id);
                return { group, first, job };
              })
              .filter(({ first }) => !deliveryNotesDateFrom || new Date(first.created_at) >= new Date(deliveryNotesDateFrom))
              .filter(({ first }) => !deliveryNotesDateTo || new Date(first.created_at) <= new Date(deliveryNotesDateTo + "T23:59:59"))
              .filter(({ job }) => !deliveryNotesSearchQuery.trim() || (job?.job_number || "").toLowerCase().includes(deliveryNotesSearchQuery.trim().toLowerCase()))
              .sort((a, b) => {
                const numA = parseInt((a.first.delivery_note_number || "").replace(/\D/g, ""), 10) || 0;
                const numB = parseInt((b.first.delivery_note_number || "").replace(/\D/g, ""), 10) || 0;
                return numB - numA;
              });
            return (
              <div style={{ ...S.gradeItems, marginTop: 10 }}>
                {groups.length === 0 && <div style={S.empty}>No delivery notes match that search.</div>}
                {groups.map(({ group, first, job }) => (
                  <div key={first.delivery_note_number} style={S.reqCard}>
                    <div style={S.reqCardTop}>
                      <span style={S.itemName}>{first.delivery_note_number}</span>
                      <span style={S.roleHint}>{first.direction === "to_supplier" ? "To supplier" : "To customer"}</span>
                    </div>
                    <div className="stk-meta-row" style={S.rowMeta}>
                      <span>{job ? `${job.job_number} — ${job.customer || "No customer"}` : "Job not found"}</span>
                      <span>{first.recipient_name}</span>
                      <span>Sent by {first.created_by}</span>
                      <span>{new Date(first.created_at).toLocaleDateString()}</span>
                    </div>
                    {group.map((dn) => (
                      <div key={dn.id} style={{ ...S.roleHint, marginTop: 4 }}>
                        {dn.checked_back_in_at
                          ? `✓ Received by ${dn.checked_back_in_by} on ${new Date(dn.checked_back_in_at).toLocaleString()}`
                          : dn.direction === "to_supplier"
                          ? "Not yet checked back in"
                          : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="stk-btn"
                      style={{ ...S.reqActionBtnMuted, marginTop: 8 }}
                      onClick={() => job && viewDeliveryNoteDocument(job, first)}
                      disabled={!job}
                    >
                      <FileText size={13} /> View document
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      ) : tab === "invoiceRequests" ? (
        <div style={S.list}>
          <div style={S.roleHint}>Every invoice request document generated across every job — its own book, separate from the Invoicing workflow itself.</div>
          <div style={S.filterBar}>
            <div>
              <label style={S.label}>From</label>
              <input type="date" style={S.input} value={invoiceRequestsDateFrom} onChange={(e) => setInvoiceRequestsDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>To</label>
              <input type="date" style={S.input} value={invoiceRequestsDateTo} onChange={(e) => setInvoiceRequestsDateTo(e.target.value)} />
            </div>
            <input
              style={S.input}
              value={invoiceRequestsSearchQuery}
              onChange={(e) => setInvoiceRequestsSearchQuery(e.target.value)}
              placeholder="Search job number…"
            />
          </div>
          {(() => {
            const rows = jobInvoiceRequests
              .map((r) => ({ r, job: (jobsList || []).find((j) => j.id === r.job_id) }))
              .filter(({ r }) => !invoiceRequestsDateFrom || new Date(r.submitted_at) >= new Date(invoiceRequestsDateFrom))
              .filter(({ r }) => !invoiceRequestsDateTo || new Date(r.submitted_at) <= new Date(invoiceRequestsDateTo + "T23:59:59"))
              .filter(({ job }) => !invoiceRequestsSearchQuery.trim() || (job?.job_number || "").toLowerCase().includes(invoiceRequestsSearchQuery.trim().toLowerCase()))
              .sort((a, b) => new Date(b.r.submitted_at) - new Date(a.r.submitted_at));
            return (
              <div style={{ ...S.gradeItems, marginTop: 10 }}>
                {rows.length === 0 && <div style={S.empty}>No invoice requests match that search.</div>}
                {rows.map(({ r, job }) => (
                  <div key={r.id} style={S.reqCard}>
                    <div style={S.reqCardTop}>
                      <span style={S.itemName}>{r.file_name}</span>
                      {r.total_amount != null && <span style={S.roleHint}>R {Number(r.total_amount).toFixed(2)}</span>}
                    </div>
                    <div className="stk-meta-row" style={S.rowMeta}>
                      <span>{job ? `${job.job_number} — ${job.customer || "No customer"}` : "Job not found"}</span>
                      <span>Submitted by {r.submitted_by}</span>
                      <span>{new Date(r.submitted_at).toLocaleDateString()}</span>
                    </div>
                    <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 8 }} onClick={() => viewJobInvoiceRequest(r)}>
                      <FileText size={13} /> View document
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      ) : tab === "processSheets" ? (
        <div style={S.list}>
          <div style={S.roleHint}>Every process sheet ever printed, with its job number — a running record, not just the latest reprint.</div>
          <div style={S.filterBar}>
            <div>
              <label style={S.label}>From</label>
              <input type="date" style={S.input} value={processSheetsDateFrom} onChange={(e) => setProcessSheetsDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>To</label>
              <input type="date" style={S.input} value={processSheetsDateTo} onChange={(e) => setProcessSheetsDateTo(e.target.value)} />
            </div>
            <input
              style={S.input}
              value={processSheetsSearchQuery}
              onChange={(e) => setProcessSheetsSearchQuery(e.target.value)}
              placeholder="Search job number…"
            />
          </div>
          {generatedDocuments === null ? (
            <div style={S.empty}>Loading…</div>
          ) : (
            (() => {
              const rows = generatedDocuments
                .filter((d) => d.document_type === "process_sheet")
                .map((d) => ({ d, job: (jobsList || []).find((j) => j.id === d.job_id) }))
                .filter(({ d }) => !processSheetsDateFrom || new Date(d.generated_at) >= new Date(processSheetsDateFrom))
                .filter(({ d }) => !processSheetsDateTo || new Date(d.generated_at) <= new Date(processSheetsDateTo + "T23:59:59"))
                .filter(({ job }) => !processSheetsSearchQuery.trim() || (job?.job_number || "").toLowerCase().includes(processSheetsSearchQuery.trim().toLowerCase()));
              return (
                <div style={{ ...S.gradeItems, marginTop: 10 }}>
                  {rows.length === 0 && <div style={S.empty}>No process sheets match that search.</div>}
                  {rows.map(({ d, job }) => (
                    <div key={d.id} style={S.reqCard}>
                      <div style={S.reqCardTop}>
                        <span style={S.itemName}>{d.file_name}</span>
                      </div>
                      <div className="stk-meta-row" style={S.rowMeta}>
                        <span>{job ? `${job.job_number} — ${job.customer || "No customer"}` : "Job not found"}</span>
                        <span>Printed by {d.generated_by}</span>
                        <span>{new Date(d.generated_at).toLocaleString()}</span>
                      </div>
                      <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 8 }} onClick={() => viewGeneratedDocument(d)}>
                        <FileText size={13} /> View document
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      ) : tab === "poReports" ? (
        <div style={S.list}>
          <div style={S.roleHint}>Every PO spend report ever generated — each run is its own dated snapshot, not overwritten by the next one.</div>
          <div style={S.filterBar}>
            <div>
              <label style={S.label}>From</label>
              <input type="date" style={S.input} value={poReportsDateFrom} onChange={(e) => setPoReportsDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>To</label>
              <input type="date" style={S.input} value={poReportsDateTo} onChange={(e) => setPoReportsDateTo(e.target.value)} />
            </div>
          </div>
          {generatedDocuments === null ? (
            <div style={S.empty}>Loading…</div>
          ) : (
            (() => {
              const rows = generatedDocuments
                .filter((d) => d.document_type === "po_report")
                .filter((d) => !poReportsDateFrom || new Date(d.generated_at) >= new Date(poReportsDateFrom))
                .filter((d) => !poReportsDateTo || new Date(d.generated_at) <= new Date(poReportsDateTo + "T23:59:59"));
              return (
                <div style={{ ...S.gradeItems, marginTop: 10 }}>
                  {rows.length === 0 && <div style={S.empty}>No PO reports match that range.</div>}
                  {rows.map((d) => (
                    <div key={d.id} style={S.reqCard}>
                      <div style={S.reqCardTop}>
                        <span style={S.itemName}>{d.file_name}</span>
                      </div>
                      <div className="stk-meta-row" style={S.rowMeta}>
                        <span>Generated by {d.generated_by}</span>
                        <span>{new Date(d.generated_at).toLocaleString()}</span>
                      </div>
                      <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 8 }} onClick={() => viewGeneratedDocument(d)}>
                        <FileText size={13} /> View document
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      ) : tab === "usageLog" ? (
        <div style={S.list}>
          <div style={S.segRow}>
            {[
              { key: "log", label: "Usage Log" },
              { key: "jobCosting", label: "Job Costing" },
            ].map((m) => (
              <button
                type="button"
                key={m.key}
                className="stk-btn"
                onClick={() => setUsageViewMode(m.key)}
                style={{
                  ...S.segBtn,
                  ...(usageViewMode === m.key ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {usageViewMode === "jobCosting" ? (
            <div style={{ marginTop: 12 }}>
              <input
                style={S.input}
                value={jobCostQuery}
                onChange={(e) => setJobCostQuery(e.target.value)}
                placeholder="Type a job number or customer name…"
              />
              {jobCostQuery.trim() && (() => {
                const q = jobCostQuery.trim().toLowerCase();
                const matches = usageLog
                  .filter((u) => u.direction === "use")
                  .filter((u) => (u.jobNumber || "").toLowerCase().includes(q) || (u.customer || "").toLowerCase().includes(q))
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const total = matches.reduce((sum, u) => sum + (u.lineCost || 0), 0);
                return (
                  <div style={{ marginTop: 12 }}>
                    {matches.length === 0 && <div style={S.empty}>No material logged against that job or customer yet.</div>}
                    <div style={S.gradeItems}>
                      {matches.map((u) => (
                        <div key={u.id} style={S.reqCard}>
                          <div style={S.reqCardTop}>
                            <span style={S.itemName}>{u.itemName}</span>
                            {canSeeValue && <span style={S.itemName}>R{(u.lineCost || 0).toFixed(2)}</span>}
                          </div>
                          <div className="stk-meta-row" style={S.rowMeta}>
                            <span>Qty: {u.qty}</span>
                            <span>By {u.by}</span>
                            <span>{new Date(u.timestamp).toLocaleDateString()}</span>
                            {u.jobNumber && <span>Job: {u.jobNumber}</span>}
                            {u.customer && <span>Customer: {u.customer}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {canSeeValue && matches.length > 0 && (
                      <div style={S.poTotalRow}>Total material cost: R{total.toFixed(2)}</div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <>
          <div style={S.filterBar}>
            <div>
              <label style={S.label}>Type</label>
              <select style={S.input} value={usageTypeFilter} onChange={(e) => setUsageTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {TABS.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Direction</label>
              <select style={S.input} value={usageDirectionFilter} onChange={(e) => setUsageDirectionFilter(e.target.value)}>
                <option value="">Used & Added</option>
                <option value="use">Used only</option>
                <option value="add">Added only</option>
              </select>
            </div>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>From</label>
                <input type="date" style={S.input} value={usageDateFrom} onChange={(e) => setUsageDateFrom(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>To</label>
                <input type="date" style={S.input} value={usageDateTo} onChange={(e) => setUsageDateTo(e.target.value)} />
              </div>
            </div>
            <input
              style={S.input}
              value={usageSearchQuery}
              onChange={(e) => setUsageSearchQuery(e.target.value)}
              placeholder="Search item, job number, customer, or person…"
            />
          </div>
          <div style={{ ...S.gradeItems, marginTop: 10 }}>
            {[...usageLog]
              .filter((u) => !usageTypeFilter || u.mainCat === usageTypeFilter)
              .filter((u) => !usageDirectionFilter || u.direction === usageDirectionFilter)
              .filter((u) => !usageDateFrom || new Date(u.timestamp) >= new Date(usageDateFrom))
              .filter((u) => !usageDateTo || new Date(u.timestamp) <= new Date(usageDateTo + "T23:59:59"))
              .filter((u) => {
                if (!usageSearchQuery.trim()) return true;
                const q = usageSearchQuery.toLowerCase();
                return (
                  u.itemName.toLowerCase().includes(q) ||
                  (u.jobNumber || "").toLowerCase().includes(q) ||
                  (u.customer || "").toLowerCase().includes(q) ||
                  (u.by || "").toLowerCase().includes(q)
                );
              })
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
              .map((u) => (
                <div key={u.id} style={S.reqCard}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{u.itemName}</span>
                    <span style={{ ...S.reqStatusTag, ...(u.direction === "use" ? S.reqStatus_cancelled : S.reqStatus_ordered) }}>
                      {u.mainCat === "cncBar" && u.cutPieces > 1
                        ? `${u.direction === "use" ? "Used" : "Added"} ${u.cutPieces} × ${u.cutLength}mm`
                        : u.mainCat === "cncBar" && u.direction === "use"
                        ? `Used ${u.qty}mm`
                        : `${u.direction === "use" ? "Used" : "Added"} ${u.qty}`}
                    </span>
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>By {u.by}</span>
                    <span>{new Date(u.timestamp).toLocaleString()}</span>
                    {u.jobNumber && <span>Job: {u.jobNumber}</span>}
                    {u.customer && <span>Customer: {u.customer}</span>}
                  </div>
                  {u.note && <div style={S.itemComment}>{u.note}</div>}
                </div>
              ))}
            {usageLog.length === 0 && <div style={S.empty}>No usage recorded yet.</div>}
          </div>
            </>
          )}
        </div>
      ) : tab === "drawings" ? (
        <div style={S.list}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canEditQty("drawings") && (
              <button type="button" className="stk-btn" style={S.addBtn} onClick={() => setShowDrawingUpload(true)}>
                <Upload size={15} strokeWidth={2.5} /> Upload Drawings
              </button>
            )}
            {isAdmin && drawingCustomerFilter && (
              <button
                type="button"
                className="stk-btn"
                style={S.usageBtnUse}
                onClick={() => batchDeleteDrawingsForCustomer(drawingCustomerFilter)}
                title={`Delete all drawings for ${drawingCustomerFilter === "__internal__" ? "internal drawings" : drawingCustomerFilter}`}
              >
                <Trash2 size={13} /> Delete for {drawingCustomerFilter === "__internal__" ? "Internal" : drawingCustomerFilter}
              </button>
            )}
          </div>
          <div style={S.formGrid}>
            <div>
              <label style={S.label}>Search part number or description</label>
              <input
                style={S.input}
                value={drawingSearchQuery}
                onChange={(e) => {
                  setDrawingSearchQuery(e.target.value);
                  refreshDrawings(e.target.value, drawingCustomerFilter);
                }}
                placeholder="Search part number or description…"
              />
            </div>
            <div>
              <label style={S.label}>Customer</label>
              <select
                style={S.input}
                value={drawingCustomerFilter}
                onChange={(e) => {
                  setDrawingCustomerFilter(e.target.value);
                  refreshDrawings(drawingSearchQuery, e.target.value);
                }}
              >
                <option value="">All customers</option>
                <option value="__internal__">Internal (no customer)</option>
                {master.customers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {drawingSearchLoading && <div style={{ ...S.empty, marginTop: 10 }}>Loading…</div>}

          {!drawingSearchLoading && drawingSearchResults !== null && (
            <div style={{ ...S.gradeItems, marginTop: 12 }}>
              {drawingSearchResults.length === 0 && <div style={S.empty}>No drawings yet — upload some to get started.</div>}
              {drawingSearchResults.map(([partNumber, revisions]) => {
                const current = revisions.find((r) => r.status === "current") || revisions[0];
                const history = revisions.filter((r) => r.id !== current.id);
                return (
                  <div key={partNumber} style={S.reqCard}>
                    <div style={S.reqCardTop}>
                      <span style={S.itemName}>{partNumber}</span>
                      <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>
                        {current.customer_revision ? `Rev ${current.customer_revision}` : `Rev ${current.internal_revision}`}
                      </span>
                    </div>
                    <div className="stk-meta-row" style={S.rowMeta}>
                      {current.customer && <span>Customer: {current.customer}</span>}
                      {current.description && <span>{current.description}</span>}
                      {current.linked_item_id && <span style={{ color: C.accentFinished }}>Linked to Stock Codes</span>}
                      <span>Uploaded by {current.uploaded_by}</span>
                      <span>{new Date(current.created_at).toLocaleDateString()}</span>
                    </div>
                    <div style={S.reqActions}>
                      <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => openDrawingPreview(current)}>
                        <FileText size={13} /> View drawing
                      </button>
                      {history.length > 0 && (
                        <button
                          type="button"
                          className="stk-btn"
                          style={S.reqActionBtnMuted}
                          onClick={() => setExpandedDrawingHistory((prev) => ({ ...prev, [partNumber]: !prev[partNumber] }))}
                        >
                          {expandedDrawingHistory[partNumber] ? "Hide" : "Show"} {history.length} older revision{history.length === 1 ? "" : "s"}
                        </button>
                      )}
                      {isAdmin && (
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => deleteDrawing(current)} title="Delete this drawing">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    {expandedDrawingHistory[partNumber] && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        {history.map((rev) => (
                          <div key={rev.id} style={S.managerRow}>
                            <span style={{ fontSize: 13.5, color: C.muted }}>
                              {rev.customer_revision ? `Rev ${rev.customer_revision}` : `Rev ${rev.internal_revision}`} —{" "}
                              {new Date(rev.created_at).toLocaleDateString()} · {rev.uploaded_by}
                            </span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => openDrawingPreview(rev)}>
                                <FileText size={13} />
                              </button>
                              {isAdmin && (
                                <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => deleteDrawing(rev)} title="Delete this revision">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>

      {(tab !== "custom" && tab !== "stores" ? tabWeightTotal > 0 || (canSeeValue && tabValueTotal > 0) : canSeeValue && tabValueTotal > 0) && (
        <div style={S.summaryBanner}>
          {tab !== "custom" && tab !== "stores" && tabWeightTotal > 0 && (
            <span>{tabWeightTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg in view</span>
          )}
          {tab !== "custom" && tab !== "stores" && tabWeightTotal > 0 && canSeeValue && tabValueTotal > 0 && <span> · </span>}
          {canSeeValue && tabValueTotal > 0 && (
            <span>R {tabValueTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in view</span>
          )}
        </div>
      )}

      <div style={S.controls}>
        <div style={S.searchWrap}>
          <Search size={16} color={C.muted} />
          <input
            style={S.searchInput}
            placeholder={`Search ${TABS.find((t) => t.key === tab).label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {tab !== "custom" && tab !== "stores" && (
          <button
            className="stk-btn"
            style={{ ...S.roleChip, ...(showFilters ? { borderColor: C.accentRaw, color: C.accentRaw } : {}) }}
            onClick={() => setShowFilters((v) => !v)}
          >
            <FilterIcon size={13} strokeWidth={2.5} />
            Filters
          </button>
        )}
        <button className="stk-btn" style={S.roleChip} onClick={() => exportDivision(tab)} title="Export this list to Excel">
          <Download size={13} strokeWidth={2.5} />
          Export
        </button>
        {canAdd ? (
          <button className="stk-btn" style={S.addBtn} onClick={openAdd}>
            <PackagePlus size={16} strokeWidth={2.5} />
            Add item
          </button>
        ) : (
          <div style={S.staffNote}>
            <Lock size={12} />
            Sales adds new items
          </div>
        )}
        {canRequisition && tab !== "custom" && (
          <button className="stk-btn" style={S.roleChip} onClick={openRequisitionPicker} title="Request stock for any item, including anything at zero">
            <ClipboardList size={13} strokeWidth={2.5} />
            Request stock
          </button>
        )}
      </div>

      {showFilters && tab !== "custom" && tab !== "stores" && (
        <div style={S.filterBar}>
          <div>
            <label style={S.label}>Material</label>
            <select style={S.input} value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
              <option value="">All materials</option>
              {(tab === "cncBar" ? master.cncGrades : master.grades).map((g) => (
                <option key={g.name} value={g.shortName || g.name}>{g.shortName || g.name}</option>
              ))}
            </select>
          </div>
          {tab === "plate" && (
            <>
              <div>
                <label style={S.label}>Length</label>
                <select style={S.input} value={filterWidth} onChange={(e) => setFilterWidth(e.target.value)}>
                  <option value="">Any</option>
                  {plateWidthOptions.map((w) => (
                    <option key={w} value={w}>{w}mm</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Width</label>
                <select style={S.input} value={filterLength} onChange={(e) => setFilterLength(e.target.value)}>
                  <option value="">Any</option>
                  {plateLengthOptions.map((l) => (
                    <option key={l} value={l}>{l}mm</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Thickness</label>
                <select style={S.input} value={filterThickness} onChange={(e) => setFilterThickness(e.target.value)}>
                  <option value="">Any</option>
                  {plateThicknessOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div style={S.formGrid}>
                <div>
                  <label style={S.label}>Area min (m²)</label>
                  <input style={S.input} type="number" min="0" step="0.1" value={filterAreaMin} onChange={(e) => setFilterAreaMin(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label style={S.label}>Area max (m²)</label>
                  <input style={S.input} type="number" min="0" step="0.1" value={filterAreaMax} onChange={(e) => setFilterAreaMax(e.target.value)} placeholder="—" />
                </div>
              </div>
              <div style={S.formGrid}>
                <div>
                  <label style={S.label}>Weight min (kg)</label>
                  <input style={S.input} type="number" min="0" step="0.1" value={filterWeightMin} onChange={(e) => setFilterWeightMin(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label style={S.label}>Weight max (kg)</label>
                  <input style={S.input} type="number" min="0" step="0.1" value={filterWeightMax} onChange={(e) => setFilterWeightMax(e.target.value)} placeholder="—" />
                </div>
              </div>
            </>
          )}
          {tab === "structural" && (
            <div>
              <label style={S.label}>Length</label>
              <select style={S.input} value={filterPieceLength} onChange={(e) => setFilterPieceLength(e.target.value)}>
                <option value="">Any</option>
                {structuralLengthOptions.map((l) => (
                  <option key={l} value={l}>{l}m</option>
                ))}
              </select>
            </div>
          )}
          {tab === "fasteners" && (
            <>
              <div>
                <label style={S.label}>Type</label>
                <select style={S.input} value={filterFastenerType} onChange={(e) => setFilterFastenerType(e.target.value)}>
                  <option value="">Any</option>
                  {master.fastenerCategories.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Diameter</label>
                <select style={S.input} value={filterFastenerDiameter} onChange={(e) => setFilterFastenerDiameter(e.target.value)}>
                  <option value="">Any</option>
                  {[...new Set((items || []).filter((it) => it.mainCat === "fasteners" && it.diameter).map((it) => String(it.diameter)))]
                    .sort((a, b) => Number(a) - Number(b))
                    .map((d) => (
                      <option key={d} value={d}>M{d}</option>
                    ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Grade</label>
                <select style={S.input} value={filterFastenerGrade} onChange={(e) => setFilterFastenerGrade(e.target.value)}>
                  <option value="">Any</option>
                  {master.fastenerGrades.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Finish</label>
                <select style={S.input} value={filterFastenerFinish} onChange={(e) => setFilterFastenerFinish(e.target.value)}>
                  <option value="">Any</option>
                  {master.fastenerFinishes.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {(tab === "plate" || tab === "structural") && (
            <div>
              <label style={S.label}>Stock type</label>
              <select style={S.input} value={filterStockType} onChange={(e) => setFilterStockType(e.target.value)}>
                <option value="">Full plates & offcuts</option>
                <option value="full">Full only</option>
                <option value="offcut">Offcuts only</option>
              </select>
            </div>
          )}
          <button
            type="button"
            className="stk-btn"
            style={S.clearFiltersBtn}
            onClick={() => {
              setFilterGrade(""); setFilterWidth(""); setFilterLength(""); setFilterThickness("");
              setFilterPieceLength(""); setFilterStockType("");
              setFilterAreaMin(""); setFilterAreaMax(""); setFilterWeightMin(""); setFilterWeightMax("");
              setFilterFastenerType(""); setFilterFastenerDiameter(""); setFilterFastenerGrade(""); setFilterFastenerFinish("");
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {(tab === "custom" || tab === "stores" || tab === "fasteners") && (
        <div style={{ marginBottom: 4 }} ref={customerChipsRef}>
          <button
            className="stk-btn"
            style={{ ...S.roleChip, ...(showCustomerChips ? { borderColor: C.accentRaw, color: C.accentRaw } : {}) }}
            onClick={() => setShowCustomerChips((v) => !v)}
          >
            <FilterIcon size={13} strokeWidth={2.5} />
            {tab === "fasteners" ? filterFastenerType || "All types" : customerFilter || "All customers"}
            <ChevronDown size={13} style={{ transform: showCustomerChips ? "rotate(180deg)" : "none" }} />
          </button>
          {showCustomerChips && (
            <div style={{ ...S.chipRow, marginTop: 6 }}>
              <button
                className="stk-btn"
                style={{ ...S.chip, ...((tab === "fasteners" ? !filterFastenerType : !customerFilter) ? S.chipActive : {}) }}
                onClick={() => {
                  tab === "fasteners" ? setFilterFastenerType("") : setCustomerFilter(null);
                  setShowCustomerChips(false);
                }}
              >
                All
              </button>
              {(tab === "custom" ? master.customers : tab === "fasteners" ? master.fastenerCategories : master.storeCategories).map((c) => (
                <button
                  key={c}
                  className="stk-btn"
                  style={{ ...S.chip, ...((tab === "fasteners" ? filterFastenerType === c : customerFilter === c) ? S.chipActive : {}) }}
                  onClick={() => {
                    tab === "fasteners" ? setFilterFastenerType(c) : setCustomerFilter(c);
                    setShowCustomerChips(false);
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "structural" && master.sectionTypes.length > 0 && (
        <div style={{ marginBottom: 4 }} ref={customerChipsRef}>
          <button
            className="stk-btn"
            style={{ ...S.roleChip, ...(showCustomerChips ? { borderColor: C.accentRaw, color: C.accentRaw } : {}) }}
            onClick={() => setShowCustomerChips((v) => !v)}
          >
            <FilterIcon size={13} strokeWidth={2.5} />
            {sectionTypeFilter || "All types"}
            <ChevronDown size={13} style={{ transform: showCustomerChips ? "rotate(180deg)" : "none" }} />
          </button>
          {showCustomerChips && (
            <div style={{ ...S.chipRow, marginTop: 6 }}>
              <button
                className="stk-btn"
                style={{ ...S.chip, ...(!sectionTypeFilter ? S.chipActive : {}) }}
                onClick={() => {
                  setSectionTypeFilter(null);
                  setShowCustomerChips(false);
                }}
              >
                All types
              </button>
              {master.sectionTypes.map((t) => (
                <button
                  key={t}
                  className="stk-btn"
                  style={{ ...S.chip, ...(sectionTypeFilter === t ? S.chipActive : {}) }}
                  onClick={() => {
                    setSectionTypeFilter(t);
                    setShowCustomerChips(false);
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={S.list}>
        {tab === "assets" ? (
          !assetManufacturerOpen ? (
            // Level 1: manufacturers, collapsed into groups — same pattern
            // as Sections. The removed/archive list stays here too, since
            // it's not scoped to any one manufacturer.
            <>
              <div style={S.managerListFullPage}>
                {Object.entries(
                  items
                    .filter((it) => it.mainCat === "assets" && it.status !== "removed")
                    .reduce((acc, it) => {
                      const k = it.manufacturer || "Other";
                      (acc[k] = acc[k] || []).push(it);
                      return acc;
                    }, {})
                )
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([mfr, list]) => (
                    <button
                      key={mfr}
                      type="button"
                      className="stk-btn"
                      style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                      onClick={() => setAssetManufacturerOpen(mfr)}
                    >
                      <span style={S.itemName}>{mfr}</span>
                      <span style={S.gradeCount}>{list.length}</span>
                    </button>
                  ))}
                {items.filter((it) => it.mainCat === "assets" && it.status !== "removed").length === 0 && (
                  <div style={S.empty}>Nothing here yet — add an item to get started.</div>
                )}
              </div>

              <div style={{ ...S.gradeBlock, marginTop: 14 }}>
                <button className="stk-grade" style={S.gradeHeader} onClick={() => setShowAssetArchive((v) => !v)}>
                  <ChevronDown size={15} style={{ transform: showAssetArchive ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                  <span style={S.gradeTitle}>Removed / Archive</span>
                  <span style={S.gradeCount}>{items.filter((it) => it.mainCat === "assets" && it.status === "removed").length}</span>
                </button>
                {showAssetArchive && (
                  <div style={S.gradeItems}>
                    {items
                      .filter((it) => it.mainCat === "assets" && it.status === "removed")
                      .sort((a, b) => new Date(b.removedDate || 0) - new Date(a.removedDate || 0))
                      .map((it) => (
                        <div key={it.id} style={S.reqCard}>
                          <div style={S.reqCardTop}>
                            <span style={S.itemName}>
                              {it.partNumber ? `${it.partNumber} — ` : ""}
                              {it.name}
                            </span>
                            <span style={{ ...S.reqStatusTag, ...S.reqStatus_cancelled }}>{it.removedReason}</span>
                          </div>
                          <div className="stk-meta-row" style={S.rowMeta}>
                            {it.manufacturer && <span>{it.manufacturer}</span>}
                            {it.serialNumber && <span>SN: {it.serialNumber}</span>}
                            <span>Removed by {it.removedBy}</span>
                            {it.removedDate && <span>{new Date(it.removedDate).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      ))}
                    {items.filter((it) => it.mainCat === "assets" && it.status === "removed").length === 0 && (
                      <div style={S.empty}>Nothing removed yet.</div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : !assetDetailOpen ? (
            // Level 2: this manufacturer's assets, compact cards.
            <>
              <button
                type="button"
                className="stk-btn"
                style={{ ...S.prominentBackBtn, marginBottom: 10 }}
                onClick={() => setAssetManufacturerOpen(null)}
              >
                <ChevronLeft size={18} strokeWidth={2.5} /> Back to Manufacturers
              </button>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{assetManufacturerOpen}</div>
              <div style={S.managerListFullPage}>
                {items
                  .filter((it) => it.mainCat === "assets" && it.status !== "removed" && (it.manufacturer || "Other") === assetManufacturerOpen)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((it) => {
                    const svc = getServiceStatus(it);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        className="stk-btn"
                        style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer" }}
                        onClick={() => setAssetDetailOpen(it.id)}
                      >
                        <div style={S.reqCardTop}>
                          <span style={S.itemName}>{it.partNumber ? `${it.partNumber} — ` : ""}{it.name}</span>
                          {svc && (
                            <span style={{ ...S.reqStatusTag, ...(svc.level === "overdue" ? S.reqStatus_cancelled : svc.level === "soon" ? S.reqStatus_ordered : S.reqStatus_received) }}>
                              {svc.level === "overdue" ? "Service overdue" : svc.level === "soon" ? "Service due soon" : "Service OK"}
                            </span>
                          )}
                        </div>
                        {it.serialNumber && <div className="stk-meta-row" style={S.rowMeta}><span>SN: {it.serialNumber}</span></div>}
                      </button>
                    );
                  })}
              </div>
            </>
          ) : (
            // Level 3: one asset's full detail page.
            (() => {
              const it = items.find((x) => x.id === assetDetailOpen);
              if (!it) return null;
              const svc = getServiceStatus(it);
              return (
                <>
                  <button
                    type="button"
                    className="stk-btn"
                    style={{ ...S.prominentBackBtn, marginBottom: 10 }}
                    onClick={() => setAssetDetailOpen(null)}
                  >
                    <ChevronLeft size={18} strokeWidth={2.5} /> Back to {assetManufacturerOpen}
                  </button>
                  <div style={S.deptCard}>
                    <div style={S.deptCardHead}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{it.name}</span>
                      {canEditItems && (
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => openEdit(it)} title="Edit item">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                    <div className="stk-meta-row" style={{ ...S.rowMeta, marginTop: 6 }}>
                      {it.partNumber && <span>Part #: {it.partNumber}</span>}
                      {it.manufacturer && <span>{it.manufacturer}</span>}
                      {it.serialNumber && <span>SN: {it.serialNumber}</span>}
                    </div>
                    <div className="stk-meta-row" style={S.rowMeta}>
                      {it.purchaseDate && <span>Bought {new Date(it.purchaseDate).toLocaleDateString()}</span>}
                      {it.supplier && <span>Supplier: {it.supplier}</span>}
                      {it.loc && <span>{it.loc}</span>}
                      {canSeeValue && Number(it.value || 0) > 0 && <span>R{Number(it.value).toFixed(2)}</span>}
                    </div>
                    {svc && (
                      <div
                        style={{
                          ...S.roleHint,
                          marginTop: 8,
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: svc.level === "overdue" ? C.dangerTint : svc.level === "soon" ? C.accentTint : C.bg,
                          color: svc.level === "overdue" ? C.danger : svc.level === "soon" ? C.accentRaw : C.muted,
                        }}
                      >
                        {svc.level === "overdue" ? "Service overdue" : svc.level === "soon" ? "Service due soon" : "Service on track"} — {svc.detail}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      {canEditQty("assets") && it.serviceMode && it.serviceMode !== "none" && (
                        <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => openServiceNow(it)}>
                          <Check size={13} /> Service now
                        </button>
                      )}
                      <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => openRepairList(it)}>
                        <AlertTriangle size={13} /> Repair list
                      </button>
                      <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => openAssetHistory(it)}>
                        History
                      </button>
                      {canEditQty("assets") && (
                        <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => openAssetRemoveModal(it)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()
          )
        ) : (
          <>
        {grouped.length === 0 && (
          <div style={S.empty}>
            {query ? "Nothing matches that search." : "Nothing here yet — add an item to get started."}
          </div>
        )}
        {!selectedGradeGroup ? (
          // Level 1: groups, collapsed — tap one to open its items, same
          // pattern as Sections and Assets manufacturers.
          <div style={S.managerListFullPage}>
            {grouped.map(([grade, list]) => (
              <button
                key={grade}
                type="button"
                className="stk-btn"
                style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                onClick={() => setSelectedGradeGroup(grade)}
              >
                <span style={S.itemName}>{grade}</span>
                <span style={S.gradeCount}>{list.length}</span>
              </button>
            ))}
          </div>
        ) : (() => {
          const groupEntry = grouped.find(([g]) => g === selectedGradeGroup);
          const list = groupEntry ? groupEntry[1] : [];
          return !selectedItemDetail ? (
            // Level 2: this group's items, compact cards — name and
            // quantity only, with the same low-stock/requisition flag
            // shown everywhere else.
            <>
              <button
                type="button"
                className="stk-btn"
                style={{ ...S.prominentBackBtn, marginBottom: 10 }}
                onClick={() => setSelectedGradeGroup(null)}
              >
                <ChevronLeft size={18} strokeWidth={2.5} /> Back to {TABS.find((t) => t.key === tab)?.label || "list"}
              </button>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{selectedGradeGroup}</div>
              <div style={S.managerListFullPage}>
                {list.length === 0 && <div style={S.empty}>Nothing here.</div>}
                {list.map((it) => {
                  const low = isLowStock(it);
                  const linkedReq = tab !== "custom" ? activeRequisitionForItem(it.id) : null;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className="stk-btn"
                      style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                      onClick={() => setSelectedItemDetail(it.id)}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {(tab === "custom" || tab === "stores") && it.partNumber && <span style={S.partTag}>{it.partNumber}</span>}
                        <span style={S.itemName}>{it.name}</span>
                        {linkedReq && <ReqFlag req={linkedReq} onClick={() => handleFlagClick(linkedReq)} />}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {low && <AlertTriangle size={13} strokeWidth={2.5} color={C.danger} />}
                        <span style={{ color: low ? C.danger : C.text, fontWeight: 600 }}>{it.qty}</span>
                        <span style={{ color: C.muted, fontSize: 12.5 }}>{it.trackLength ? "pcs" : it.unit}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            // Level 3: one item's full detail — the exact same rendering
            // this tab has always used, just scoped to a single item
            // instead of mapped across the whole group.
            <>
              <button
                type="button"
                className="stk-btn"
                style={{ ...S.prominentBackBtn, marginBottom: 10 }}
                onClick={() => setSelectedItemDetail(null)}
              >
                <ChevronLeft size={18} strokeWidth={2.5} /> Back to {selectedGradeGroup}
              </button>
              {list.filter((it) => it.id === selectedItemDetail).map((it) => {
            const low = isLowStock(it);
            const pw = tab === "plate" ? plateWeight(it) : null;
            const sw = tab === "structural" ? structuralWeight(it) : null;
            const cw = tab === "cncBar" ? cncBarWeight(it) : null;
            const linkedReq = tab !== "custom" ? activeRequisitionForItem(it.id) : null;
            return (
                      <div
                        key={it.id}
                        className="stk-row"
                        style={{
                          ...S.row,
                          borderLeft: `4px solid ${linkedReq ? S["reqFlagColor_" + linkedReq.status] : low ? C.danger : C.accentFinished}`,
                        }}
                      >
                        <div style={S.rowMain}>
                          {tab === "custom" || tab === "stores" || tab === "assets" ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {it.partNumber && <span style={S.partTag}>{it.partNumber}</span>}
                              <span style={S.itemName}>{it.name}</span>
                              {it.attachmentType && (
                                <button
                                  className="stk-btn"
                                  style={S.attachmentIndicator}
                                  onClick={() => openPreview(it)}
                                  title={`View ${it.attachmentName || "attachment"}`}
                                >
                                  {it.attachmentType === "pdf" ? <FileText size={12} /> : <ImageIcon size={12} />}
                                </button>
                              )}
                              {linkedReq && <ReqFlag req={linkedReq} onClick={() => handleFlagClick(linkedReq)} />}
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={S.itemName}>{it.name}</span>
                              {linkedReq && <ReqFlag req={linkedReq} onClick={() => handleFlagClick(linkedReq)} />}
                            </div>
                          )}
                          {(it.customer || it.salesPerson || (it.partNumber && drawingLookup[it.partNumber.trim()])) && (
                            <div style={S.customerSalesRow}>
                              {tab !== "custom" && tab !== "stores" && tab !== "assets" && it.customer && (
                                <span style={S.customerTag}>{it.customer}</span>
                              )}
                              {it.salesPerson && <span style={S.salesTag}>{it.salesPerson}</span>}
                              {it.partNumber && drawingLookup[it.partNumber.trim()] && canView("drawings") && (
                                <button
                                  type="button"
                                  className="stk-btn"
                                  style={S.drawingTag}
                                  onClick={() => openDrawingPreviewByPartNumber(it.partNumber.trim())}
                                >
                                  <FileText size={14} /> Drawing
                                </button>
                              )}
                            </div>
                          )}
                          {it.comment && <div style={S.itemComment}>{it.comment}</div>}
                          <div className="stk-meta-row" style={S.rowMeta}>
                            {/* What of this item is already promised to a
                                job. The quantity above is still the true
                                shelf count — reserving does not remove
                                anything — so without this there is no way
                                to tell that some of it is spoken for. */}
                            {(() => {
                              const reserved = allocationsForItem(it.id);
                              if (reserved.length === 0) return null;
                              const total = reserved.reduce((sum, a) => sum + (Number(a.qty_allocated) - Number(a.qty_used)), 0);
                              const jobs = [...new Set(reserved.map((a) => a.job_number))].filter(Boolean);
                              return (
                                <button
                                  type="button"
                                  className="stk-btn"
                                  style={{ background: "none", border: "none", padding: 0, color: C.accentRaw, fontWeight: 600, cursor: "pointer", font: "inherit" }}
                                  title="See what's reserved, and release it or mark it used"
                                  onClick={(e) => { e.stopPropagation(); setReservedModal({ item: it }); setReservedUseQty({}); }}
                                >
                                  {total} reserved{jobs.length ? ` · ${jobs.slice(0, 3).join(", ")}${jobs.length > 3 ? ` +${jobs.length - 3}` : ""}` : ""}
                                </button>
                              );
                            })()}
                            {tab === "plate" && it.sheetName && <span>{it.sheetName}</span>}
                            {(tab === "plate" || tab === "structural") && it.stockType === "offcut" && (
                              <span style={S.offcutTag}>Offcut</span>
                            )}
                            {tab === "stores" && it.storesKind === "toolConsumable" && (
                              <span style={S.offcutTag}>Tool Consumable</span>
                            )}
                            {pw && <span>{pw.perSheet.toFixed(1)}kg/sheet · {pw.total.toFixed(1)}kg total</span>}
                            {sw && <span>{sw.perM.toFixed(2)}kg/m · {sw.total.toFixed(1)}kg total</span>}
                            {cw && <span>{cw.perM.toFixed(2)}kg/m · {cw.total.toFixed(1)}kg total</span>}
                            {tab === "cncBar" && <span>⌀{it.diameter}mm × {it.length}mm</span>}
                            {tab === "structural" && it.trackLength && it.length > 0 && (
                              <span>{it.length}m lengths</span>
                            )}
                            {tab === "assets" && it.manufacturer && <span>{it.manufacturer}</span>}
                            {tab === "assets" && it.serialNumber && <span>SN: {it.serialNumber}</span>}
                            {tab === "assets" && it.purchaseDate && <span>Bought {new Date(it.purchaseDate).toLocaleDateString()}</span>}
                            {tab === "assets" &&
                              (() => {
                                const svc = getServiceStatus(it);
                                if (!svc) return null;
                                return (
                                  <span style={svc.level === "overdue" ? S.lowTag : { color: svc.level === "soon" ? C.accentRaw : C.muted }}>
                                    {svc.level === "overdue" && <AlertTriangle size={11} strokeWidth={2.5} />}
                                    {svc.level === "overdue" ? "Service overdue" : svc.level === "soon" ? "Service due soon" : "Service OK"} — {svc.detail}
                                  </span>
                                );
                              })()}
                            {it.loc && <span>{it.loc}</span>}
                            {it.supplier && <span>Supplier: {it.supplier}</span>}
                            {(tab === "custom" || tab === "stores" || tab === "fasteners") && canSeeValue && (
                              <span>R{Number(it.value || 0).toFixed(2)} ea · R{(Number(it.value || 0) * Number(it.qty || 0)).toFixed(2)} total</span>
                            )}
                            {tab === "assets" && canSeeValue && Number(it.value || 0) > 0 && <span>R{Number(it.value).toFixed(2)}</span>}
                            {tab === "plate" && canSeeValue && pw && (
                              <span>R{(plateValue(it)?.total || 0).toFixed(2)} value</span>
                            )}
                            {tab === "structural" && canSeeValue && sw && (
                              <span>R{(structuralValue(it)?.total || 0).toFixed(2)} value</span>
                            )}
                            {tab === "cncBar" && canSeeValue && cw && (
                              <span>R{(cncBarValue(it)?.total || 0).toFixed(2)} value</span>
                            )}
                            {low && (
                              <span style={S.lowTag}>
                                <AlertTriangle size={11} strokeWidth={2.5} /> below {it.low}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={S.rowControls}>
                          {tab === "assets" ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button className="stk-btn" style={S.usageBtnAdd} onClick={() => openAssetHistory(it)}>
                                History
                              </button>
                              {canEditQty("assets") && (
                                <button className="stk-btn" style={S.usageBtnUse} onClick={() => openAssetRemoveModal(it)}>
                                  Remove
                                </button>
                              )}
                            </div>
                          ) : (
                          <div style={S.qtyBlock}>
                            {canEditQty(tab) && (
                              <button className="stk-btn" style={S.usageBtnUse} onClick={() => openUsageModal(it, "use")}>
                                {tab === "cncBar" ? "Cut" : "Use"}
                              </button>
                            )}
                            {/* The big number is what anyone may actually
                                take, so reserved material is already
                                subtracted — a number nobody is allowed to
                                act on would be worse than useless here.
                                The shelf count is still shown underneath
                                whenever the two differ, since a stock take
                                counts what is physically on the rack. */}
                            {(() => {
                              const held = reservedQtyForItem(it.id);
                              const free = availableQtyForItem(it);
                              return (
                                <div style={S.qtyDisplay}>
                                  <span style={{ ...S.qtyNum, color: low || (held > 0 && free === 0) ? C.danger : C.text }}>
                                    {held > 0 ? free : it.qty}
                                  </span>
                                  <span style={S.qtyUnit}>{it.trackLength ? "pcs" : it.unit}</span>
                                  {held > 0 && (
                                    <span
                                      style={{ ...S.qtyUnit, color: C.accentRaw, fontWeight: 600 }}
                                      title={`${it.qty} physically on the shelf, ${held} reserved for other jobs`}
                                    >
                                      of {it.qty}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            {canEditQty(tab) && (
                              <button className="stk-btn" style={S.usageBtnAdd} onClick={() => openUsageModal(it, "add")}>
                                Add
                              </button>
                            )}
                          </div>
                          )}
                          <div style={S.rowActionIcons}>
                            {canRequisition && tab !== "custom" && (
                              <button className="stk-btn" style={S.iconRowBtn} onClick={() => openRequisition(it)} title="Request stock for this item">
                                <ClipboardList size={14} />
                              </button>
                            )}
                            {canEditItems && (
                              <button className="stk-btn" style={S.iconRowBtn} onClick={() => openEdit(it)} title="Edit item">
                                <Pencil size={14} />
                              </button>
                            )}
                            {canEditItems && (
                              <button className="stk-btn" style={S.iconRowBtn} onClick={() => openDuplicate(it)} title="Duplicate (e.g. for an offcut)">
                                <Copy size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <button className="stk-btn" style={S.deleteBtn} onClick={() => removeItem(it.id)} title="Remove item">
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </>
          );
        })()}
          </>
        )}
      </div>
        </>
      )}
        </>
      )}

      {showAdd && (canAdd || canEditItems) && (
        <div style={S.modalOverlay}>
          <form style={S.modal} onClick={(e) => e.stopPropagation()} onSubmit={addItem}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>{editingId ? "Edit stock item" : allowDuplicate ? "Duplicate stock item" : "New stock item"}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeAdd}>
                <X size={18} />
              </button>
            </div>

            <label style={S.label}>Category</label>
            <div style={S.segRow}>
              {TABS.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  className="stk-btn"
                  disabled={!!editingId || allowDuplicate}
                  onClick={() => setForm({ ...emptyForm, mainCat: t.key, trackLength: t.key === "structural" })}
                  style={{
                    ...S.segBtn,
                    ...(form.mainCat === t.key ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                    ...((editingId || allowDuplicate) ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {(editingId || allowDuplicate) && (
              <div style={S.roleHint}>Category is locked while {editingId ? "editing" : "duplicating"} — remove and re-add to change it.</div>
            )}

            {form.mainCat === "fasteners" ? (
              <>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Type</label>
                  <LibraryField
                    options={master.fastenerCategories}
                    value={form.fastenerType}
                    onChange={(v) => setForm({ ...form, fastenerType: v })}
                    customValue={form.customFastenerType || ""}
                    onCustomChange={(v) => setForm({ ...form, customFastenerType: v })}
                    placeholder="e.g. Hex Bolt"
                  />
                </div>
                <div style={S.formGrid}>
                  <div>
                    <label style={S.label}>Diameter (mm)</label>
                    <input
                      style={S.input}
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.diameter}
                      onChange={(e) => setForm({ ...form, diameter: e.target.value })}
                      placeholder="e.g. 10"
                    />
                  </div>
                  <div>
                    <label style={S.label}>Length (mm, if applicable)</label>
                    <input
                      style={S.input}
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.length}
                      onChange={(e) => setForm({ ...form, length: e.target.value })}
                      placeholder="e.g. 25 — leave blank for nuts/washers"
                    />
                  </div>
                </div>
                {form.diameter.trim() && effectiveFastenerType && (
                  <div style={{ ...S.roleHint, marginTop: 4 }}>
                    Designation: <strong style={{ color: C.accentRaw }}>
                      M{form.diameter.trim()}{form.length.trim() ? `x${form.length.trim()}` : ""} {effectiveFastenerType}
                    </strong>
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Part number</label>
                  <div style={S.roleHint}>
                    {editingId ? (
                      <>This fastener's number: <strong style={{ color: C.accentRaw }}>{form.partNumber || "—"}</strong> (doesn't change when editing)</>
                    ) : (
                      <>Assigned automatically when you save — will be <strong style={{ color: C.accentRaw }}>{formatFastenerNumber(master.nextFastenerNumber)}</strong></>
                    )}
                  </div>
                </div>
                <div style={S.formGrid}>
                  <div>
                    <label style={S.label}>Grade</label>
                    <select style={S.input} value={form.fastenerGrade} onChange={(e) => setForm({ ...form, fastenerGrade: e.target.value })}>
                      <option value="">Not set</option>
                      {master.fastenerGrades.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Finish</label>
                    <select style={S.input} value={form.fastenerFinish} onChange={(e) => setForm({ ...form, fastenerFinish: e.target.value })}>
                      <option value="">Not set</option>
                      {master.fastenerFinishes.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <LibraryField
                    label="Material"
                    options={master.grades.map((g) => g.shortName || g.name)}
                    value={form.grade}
                    onChange={(v) => setForm({ ...form, grade: v })}
                    customValue={form.customGrade}
                    onCustomChange={(v) => setForm({ ...form, customGrade: v })}
                    placeholder="e.g. SS304-2B"
                    allowNone
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <LibraryField
                    label="Supplier"
                    options={master.suppliers.map((s) => s.name)}
                    value={form.supplier}
                    onChange={(v) => setForm({ ...form, supplier: v })}
                    customValue={form.customSupplier}
                    onCustomChange={(v) => setForm({ ...form, customSupplier: v })}
                    placeholder="e.g. Macsteel"
                    allowNone
                  />
                </div>
                <div style={S.formGrid}>
                  <div>
                    <label style={S.label}>Quantity</label>
                    <input
                      style={S.input}
                      type="number"
                      min="0"
                      value={form.qty}
                      onChange={(e) => setForm({ ...form, qty: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={S.label}>Price each (R)</label>
                    <input
                      style={S.input}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ) : form.mainCat === "assets" ? (
              <>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Description</label>
                  <input
                    style={S.input}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Angle Grinder 230mm"
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Part number</label>
                  <div style={S.roleHint}>
                    {editingId ? (
                      <>This asset's number: <strong style={{ color: C.accentRaw }}>{form.partNumber || "—"}</strong> (doesn't change when editing)</>
                    ) : (
                      <>Assigned automatically when you save — will be <strong style={{ color: C.accentRaw }}>{formatToolNumber(master.nextToolNumber)}</strong></>
                    )}
                  </div>
                </div>
                <div style={S.formGrid}>
                  <div>
                    <label style={S.label}>Manufacturer (optional)</label>
                    <input
                      style={S.input}
                      value={form.manufacturer}
                      onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                      placeholder="e.g. Makita"
                    />
                  </div>
                  <div>
                    <label style={S.label}>Serial number (optional)</label>
                    <input
                      style={S.input}
                      value={form.serialNumber}
                      onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                      placeholder="e.g. SN-88213"
                    />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Purchase date (optional)</label>
                  <input
                    style={S.input}
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <LibraryField
                    label="Supplier"
                    options={master.suppliers.map((s) => s.name)}
                    value={form.supplier}
                    onChange={(v) => setForm({ ...form, supplier: v })}
                    customValue={form.customSupplier}
                    onCustomChange={(v) => setForm({ ...form, customSupplier: v })}
                    placeholder="e.g. Macsteel"
                    allowNone
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Value (R, optional)</label>
                  <input
                    style={S.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Location</label>
                  <input style={S.input} value={form.loc} onChange={(e) => setForm({ ...form, loc: e.target.value })} placeholder="e.g. Tool crib" />
                </div>

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <label style={S.label}>Service tracking</label>
                  <div style={S.segRow}>
                    {[
                      { key: "none", label: "None" },
                      { key: "months", label: "By date" },
                      { key: "hours", label: "By hours" },
                      { key: "km", label: "By kilometers" },
                    ].map((m) => (
                      <button
                        type="button"
                        key={m.key}
                        className="stk-btn"
                        onClick={() => setForm({ ...form, serviceMode: m.key })}
                        style={{
                          ...S.segBtn,
                          ...(form.serviceMode === m.key ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {form.serviceMode === "months" && (
                  <div style={S.formGrid}>
                    <div>
                      <label style={S.label}>Service every (months)</label>
                      <input
                        style={S.input}
                        type="number"
                        min="0"
                        value={form.serviceIntervalMonths}
                        onChange={(e) => setForm({ ...form, serviceIntervalMonths: e.target.value })}
                        placeholder="e.g. 6"
                      />
                    </div>
                    <div>
                      <label style={S.label}>Last serviced</label>
                      <input
                        style={S.input}
                        type="date"
                        value={form.lastServiceDate}
                        onChange={(e) => setForm({ ...form, lastServiceDate: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {(form.serviceMode === "hours" || form.serviceMode === "km") && (
                  <>
                    <div style={S.formGrid}>
                      <div>
                        <label style={S.label}>Service every ({form.serviceMode === "hours" ? "hours" : "km"})</label>
                        <input
                          style={S.input}
                          type="number"
                          min="0"
                          value={form.serviceMode === "hours" ? form.serviceIntervalHours : form.serviceIntervalKm}
                          onChange={(e) =>
                            setForm(
                              form.serviceMode === "hours"
                                ? { ...form, serviceIntervalHours: e.target.value }
                                : { ...form, serviceIntervalKm: e.target.value }
                            )
                          }
                          placeholder={form.serviceMode === "hours" ? "e.g. 2500" : "e.g. 10000"}
                        />
                      </div>
                      <div>
                        <label style={S.label}>Reading at last service</label>
                        <input
                          style={S.input}
                          type="number"
                          min="0"
                          value={form.lastServiceReading}
                          onChange={(e) => setForm({ ...form, lastServiceReading: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={S.label}>Current reading</label>
                      <input
                        style={S.input}
                        type="number"
                        min="0"
                        value={form.currentReading}
                        onChange={(e) => setForm({ ...form, currentReading: e.target.value })}
                        placeholder="0"
                      />
                      <div style={S.roleHint}>Once saved, log day-to-day readings from the asset's own page instead of editing this each time.</div>
                    </div>
                  </>
                )}
              </>
            ) : form.mainCat === "custom" || form.mainCat === "stores" || form.mainCat === "fasteners" ? (
              <>
                <LibraryField
                  label={form.mainCat === "stores" ? "Category" : form.mainCat === "fasteners" ? "Category" : "Customer"}
                  options={form.mainCat === "stores" ? master.storeCategories : form.mainCat === "fasteners" ? master.fastenerCategories : master.customers}
                  value={form.customer}
                  onChange={(v) => setForm({ ...form, customer: v })}
                  customValue={form.customCustomer}
                  onCustomChange={(v) => setForm({ ...form, customCustomer: v })}
                  placeholder={form.mainCat === "stores" ? "e.g. Hand Tools" : form.mainCat === "fasteners" ? "e.g. Bolts" : "e.g. New Customer Pty Ltd"}
                />
                {form.mainCat === "stores" && (
                  <div style={{ marginTop: 10 }}>
                    <label style={S.label}>Type</label>
                    <div style={S.segRow}>
                      {[
                        { key: "consumable", label: "Consumable" },
                        { key: "toolConsumable", label: "Tool Consumable" },
                      ].map((t) => (
                        <button
                          type="button"
                          key={t.key}
                          className="stk-btn"
                          onClick={() => setForm({ ...form, storesKind: t.key })}
                          style={{
                            ...S.segBtn,
                            ...(form.storesKind === t.key ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {form.mainCat === "stores" && master.storesCatalog.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <label style={S.label}>Fill from Stores Catalog (optional)</label>
                    <input
                      style={S.input}
                      list="stores-catalog-options"
                      placeholder="Start typing an item name…"
                      onChange={(e) => {
                        const hit = master.storesCatalog.find((r) => `${r.name} — ${r.category}` === e.target.value);
                        if (hit) {
                          const catResolved = resolveField(master.storeCategories, hit.category);
                          setForm((f) => ({
                            ...f,
                            name: hit.name,
                            value: String(hit.price || ""),
                            partNumber: hit.code || f.partNumber,
                            supplier: hit.supplier || f.supplier,
                            ...(catResolved ? { customer: catResolved.field, customCustomer: catResolved.custom } : {}),
                          }));
                        }
                      }}
                    />
                    <datalist id="stores-catalog-options">
                      {master.storesCatalog.map((r) => (
                        <option key={r.id} value={`${r.name} — ${r.category}`} />
                      ))}
                    </datalist>
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>
                    {form.mainCat === "stores" && form.storesKind === "toolConsumable"
                      ? "Supplier part code (optional)"
                      : `Part number ${form.mainCat === "stores" ? "(optional)" : ""}`}
                  </label>
                  <input
                    style={S.input}
                    value={form.partNumber}
                    onChange={(e) => setForm({ ...form, partNumber: e.target.value })}
                    placeholder={
                      form.mainCat === "stores" && form.storesKind === "toolConsumable"
                        ? "e.g. CCMT09T304-M"
                        : form.mainCat === "stores"
                        ? "e.g. supplier SKU, if any"
                        : "e.g. HPE-4471"
                    }
                  />
                  {form.partNumber.trim() && drawingLookup[form.partNumber.trim()] && (
                    <div style={{ ...S.roleHint, color: C.accentFinished, marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Check size={13} /> Drawing on file — {drawingLookup[form.partNumber.trim()].description || "no description"}.{" "}
                      <button
                        type="button"
                        className="stk-btn"
                        style={{ ...S.roleHint, color: C.accentFinished, textDecoration: "underline", padding: 0 }}
                        onClick={() => openDrawingPreviewByPartNumber(form.partNumber.trim())}
                      >
                        Confirm it's the right part →
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Description</label>
                  <input
                    style={S.input}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={form.mainCat === "stores" ? "e.g. 10mm Carbide End Mill" : "e.g. Bracket, left-hand"}
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Drawing or photo (optional)</label>
                  {form.attachmentName ? (
                    <div style={S.attachmentChip}>
                      {form.attachmentType === "pdf" ? <FileText size={14} /> : <ImageIcon size={14} />}
                      <span style={S.attachmentName}>{form.attachmentName}</span>
                      <button type="button" className="stk-btn" style={S.managerDelete} onClick={removeAttachment} title="Remove">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="stk-btn" style={S.attachBtn}>
                      <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleAttachmentSelect} />
                      <Paperclip size={14} />
                      Attach photo or PDF
                    </label>
                  )}
                </div>
              </>
            ) : (
              <>
                {form.mainCat === "structural" && (
                  <LibraryField
                    label="Section type"
                    options={master.sectionTypes}
                    value={form.sectionType}
                    onChange={(v) => setForm({ ...form, sectionType: v, customSectionType: "", section: "", customSection: "" })}
                    customValue={form.customSectionType}
                    onCustomChange={(v) => setForm({ ...form, customSectionType: v })}
                    placeholder="e.g. Channel"
                  />
                )}

                {form.mainCat !== "cncBar" && (
                  <div style={{ marginTop: form.mainCat === "structural" ? 10 : 0 }}>
                    <LibraryField
                      label="Material grade"
                      options={master.grades.map((g) => g.shortName || g.name)}
                      value={form.grade}
                      onChange={(v) => setForm({ ...form, grade: v })}
                      customValue={form.customGrade}
                      onCustomChange={(v) => setForm({ ...form, customGrade: v })}
                      placeholder="e.g. Duplex 2205"
                    />
                  </div>
                )}

                {form.mainCat === "plate" ? (
                  <div style={{ marginTop: 10 }}>
                    <label style={S.label}>Stock type</label>
                    <div style={S.segRow}>
                      {["full", "offcut"].map((t) => (
                        <button
                          type="button"
                          key={t}
                          className="stk-btn"
                          onClick={() => setForm({ ...form, stockType: t, size: "", customSize: "", offcutLength: "", offcutWidth: "" })}
                          style={{
                            ...S.segBtn,
                            ...(form.stockType === t ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                          }}
                        >
                          {t === "full" ? "Full sheet" : "Offcut"}
                        </button>
                      ))}
                    </div>

                    {form.stockType === "offcut" ? (
                      <div style={S.formGrid}>
                        <div>
                          <label style={S.label}>Length (mm)</label>
                          <input
                            style={S.input}
                            type="number"
                            min="0"
                            value={form.offcutLength}
                            onChange={(e) => setForm({ ...form, offcutLength: e.target.value })}
                            placeholder="e.g. 980"
                          />
                        </div>
                        <div>
                          <label style={S.label}>Width (mm)</label>
                          <input
                            style={S.input}
                            type="number"
                            min="0"
                            value={form.offcutWidth}
                            onChange={(e) => setForm({ ...form, offcutWidth: e.target.value })}
                            placeholder="e.g. 640"
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 10 }}>
                        <LibraryField
                          label="Sheet size (L x W)"
                          options={master.sizes}
                          value={form.size}
                          onChange={(v) => setForm({ ...form, size: v, customSize: "", comment: "" })}
                          customValue={form.customSize}
                          onCustomChange={(v) => setForm({ ...form, customSize: v })}
                          placeholder="e.g. 1740x980mm"
                          showComment
                          comment={form.comment}
                          onCommentChange={(v) => setForm({ ...form, comment: v })}
                        />
                      </div>
                    )}

                    <div style={{ marginTop: 10 }}>
                      <label style={S.label}>Thickness</label>
                      <input
                        style={S.input}
                        value={form.thickness}
                        onChange={(e) => setForm({ ...form, thickness: e.target.value })}
                        placeholder="e.g. 3mm"
                      />
                    </div>
                    {effectiveGrade && form.thickness.trim() && effectiveSize && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={S.label}>Price</label>
                          <div style={S.segRow}>
                            {[
                              { key: "perUnit", label: "R/sheet" },
                              { key: "perKg", label: "R/kg" },
                            ].map((m) => (
                              <button
                                type="button"
                                key={m.key}
                                className="stk-btn"
                                onClick={() => setPriceUnitMode(m.key)}
                                style={{
                                  ...S.segBtn,
                                  ...(priceUnitMode === m.key ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                                }}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(() => {
                          const weight = plateWeight({ size: effectiveSize, thickness: form.thickness, grade: effectiveGrade, qty: 1 });
                          const perSheetWeight = weight?.perSheet || 0;
                          const currentPerKg = findPrice("grades", effectiveGrade);
                          const displayValue = priceUnitMode === "perKg" ? currentPerKg : currentPerKg * perSheetWeight;
                          return (
                            <>
                              <input
                                type="number"
                                step="0.01"
                                style={S.input}
                                value={displayValue === 0 ? "" : displayValue}
                                placeholder="0"
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || 0;
                                  const newPerKg = priceUnitMode === "perKg" ? v : perSheetWeight > 0 ? v / perSheetWeight : 0;
                                  setMaterialPrice("grades", effectiveGrade, newPerKg);
                                }}
                              />
                              <div style={S.roleHint}>
                                {perSheetWeight > 0
                                  ? `${perSheetWeight.toFixed(1)}kg per sheet — this updates the ${effectiveGrade} rate everywhere it's used.`
                                  : "Enter a valid size and thickness to calculate weight."}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <LibraryField
                        label="Sheet name (optional)"
                        options={master.sheetNames}
                        value={form.sheetName}
                        onChange={(v) => setForm({ ...form, sheetName: v })}
                        customValue={form.customSheetName}
                        onCustomChange={(v) => setForm({ ...form, customSheetName: v })}
                        placeholder="e.g. per your naming table"
                        allowNone
                      />
                    </div>
                  </div>
                ) : form.mainCat === "cncBar" ? (
                  <div style={{ marginTop: 10 }}>
                    <LibraryField
                      label="Grade"
                      options={master.cncGrades.map((g) => g.name)}
                      value={form.grade}
                      onChange={(v) => setForm({ ...form, grade: v })}
                      customValue={form.customGrade}
                      onCustomChange={(v) => setForm({ ...form, customGrade: v })}
                      placeholder="e.g. EN8"
                    />
                    <div style={{ marginTop: 10 }}>
                      <label style={S.label}>Diameter (mm)</label>
                      <input
                        style={S.input}
                        type="number"
                        min="0"
                        step="0.1"
                        value={form.diameter}
                        onChange={(e) => setForm({ ...form, diameter: e.target.value })}
                        placeholder="e.g. 25"
                      />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={S.label}>Length per piece (mm)</label>
                      <input
                        style={S.input}
                        type="number"
                        min="0"
                        value={form.length}
                        onChange={(e) => setForm({ ...form, length: e.target.value })}
                        placeholder="e.g. 3000"
                      />
                    </div>
                    {effectiveGrade && form.diameter.trim() && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={S.label}>Price</label>
                          <div style={S.segRow}>
                            {[
                              { key: "perUnit", label: "R/m" },
                              { key: "perKg", label: "R/kg" },
                            ].map((m) => (
                              <button
                                type="button"
                                key={m.key}
                                className="stk-btn"
                                onClick={() => setPriceUnitMode(m.key)}
                                style={{
                                  ...S.segBtn,
                                  ...(priceUnitMode === m.key ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                                }}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(() => {
                          const d = parseFloat(form.diameter) || 0;
                          const perM = d ? (Math.PI / 4000) * d * d * findFactor("cncGrades", effectiveGrade) : 0;
                          const currentPerKg = findPrice("cncGrades", effectiveGrade);
                          const displayValue = priceUnitMode === "perKg" ? currentPerKg : currentPerKg * perM;
                          return (
                            <>
                              <input
                                type="number"
                                step="0.01"
                                style={S.input}
                                value={displayValue === 0 ? "" : displayValue}
                                placeholder="0"
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || 0;
                                  const newPerKg = priceUnitMode === "perKg" ? v : perM > 0 ? v / perM : 0;
                                  setMaterialPrice("cncGrades", effectiveGrade, newPerKg);
                                }}
                              />
                              <div style={S.roleHint}>
                                {perM > 0
                                  ? `${perM.toFixed(2)}kg per metre — this updates the ${effectiveGrade} rate everywhere it's used.`
                                  : "Enter a diameter to calculate weight."}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ) : effectiveSectionType ? (
                  <div style={{ marginTop: 10 }}>
                    <LibraryField
                      label={`Section (${effectiveSectionType})`}
                      options={sectionOptionsForType}
                      value={form.section}
                      onChange={(v) => setForm({ ...form, section: v })}
                      customValue={form.customSection}
                      onCustomChange={(v) => setForm({ ...form, customSection: v })}
                      placeholder="e.g. 50x50x5mm"
                    />
                    {effectiveSection && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={S.label}>Price</label>
                          <div style={S.segRow}>
                            {[
                              { key: "perUnit", label: "R/m" },
                              { key: "perKg", label: "R/kg" },
                            ].map((m) => (
                              <button
                                type="button"
                                key={m.key}
                                className="stk-btn"
                                onClick={() => setPriceUnitMode(m.key)}
                                style={{
                                  ...S.segBtn,
                                  ...(priceUnitMode === m.key ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                                }}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(() => {
                          const kgPerM = findFactor("sections", effectiveSection);
                          const currentPerM = findPrice("sections", effectiveSection);
                          const currentPerKg = kgPerM ? currentPerM / kgPerM : 0;
                          const displayValue = priceUnitMode === "perKg" ? currentPerKg : currentPerM;
                          return (
                            <>
                              <input
                                type="number"
                                step="0.01"
                                style={S.input}
                                value={displayValue === 0 ? "" : displayValue}
                                placeholder="0"
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || 0;
                                  const newPerM = priceUnitMode === "perKg" ? v * (kgPerM || 0) : v;
                                  setMaterialPrice("sections", effectiveSection, newPerM);
                                }}
                              />
                              <div style={S.roleHint}>
                                {kgPerM
                                  ? `${kgPerM.toFixed(2)}kg per metre — this updates the ${effectiveSection} rate everywhere it's used.`
                                  : "This section has no kg/m set yet in Stock Manager."}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <label style={S.checkRow}>
                        <input
                          type="checkbox"
                          checked={form.trackLength}
                          onChange={(e) => setForm({ ...form, trackLength: e.target.checked })}
                        />
                        Sold in long lengths — track by length × pieces
                      </label>
                      {form.trackLength && (
                        <div style={{ marginTop: 8 }}>
                          <label style={S.label}>Length per piece (m)</label>
                          <input
                            style={S.input}
                            type="number"
                            min="0"
                            step="0.1"
                            value={form.length}
                            onChange={(e) => setForm({ ...form, length: e.target.value })}
                            placeholder="6"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ ...S.roleHint, marginTop: 10 }}>Pick a section type above first.</div>
                )}

                {form.mainCat === "structural" && (
                  <div style={{ marginTop: 10 }}>
                    <label style={S.label}>Stock type</label>
                    <div style={S.segRow}>
                      {["full", "offcut"].map((t) => (
                        <button
                          type="button"
                          key={t}
                          className="stk-btn"
                          onClick={() => setForm({ ...form, stockType: t })}
                          style={{
                            ...S.segBtn,
                            ...(form.stockType === t ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                          }}
                        >
                          {t === "full" ? "Full plate/length" : "Offcut"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {matchedExisting && !allowDuplicate && (
              <div style={S.warnBox}>
                <AlertTriangle size={13} strokeWidth={2.5} />
                <span>
                  Already in the library{matchedExisting.grade ? ` under ${matchedExisting.grade}` : ""}
                  {Number(matchedExisting.qty) === 0 ? " at 0 stock" : ""}. Edit it to update the quantity, or add it as a new duplicate line for an offcut.
                </span>
                <button type="button" className="stk-btn" style={S.warnLink} onClick={jumpToMatch}>
                  Edit it
                </button>
              </div>
            )}
            {matchedExisting && allowDuplicate && (
              <div style={{ ...S.warnBox, color: C.accentRaw, background: C.accentTint, borderColor: `${C.accentRaw}55` }}>
                <Copy size={13} strokeWidth={2.5} />
                <span>Matches an existing spec — that's fine, this will be saved as a separate stock line (e.g. an offcut).</span>
              </div>
            )}

            {form.mainCat === "assets" ? null : form.mainCat === "custom" || form.mainCat === "stores" ? (
              <div style={S.formGrid}>
                <div>
                  <label style={S.label}>Quantity</label>
                  <input
                    style={S.input}
                    type="number"
                    min="0"
                    value={form.qty}
                    onChange={(e) => setForm({ ...form, qty: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={S.label}>Value per unit (R)</label>
                  <input
                    style={S.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
            ) : form.mainCat === "structural" && form.trackLength ? (
              <div style={{ marginTop: 10 }}>
                <label style={S.label}>Pieces on hand</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                  placeholder="0"
                />
              </div>
            ) : form.mainCat === "cncBar" ? (
              <div style={{ marginTop: 10 }}>
                <label style={S.label}>Pieces on hand (at this length)</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                  placeholder="0"
                />
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <label style={S.label}>Quantity on hand</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                  placeholder="0"
                />
              </div>
            )}

            {form.mainCat !== "assets" && (
              <>
                <div style={S.formGrid}>
                  <div>
                    <label style={S.label}>Low-stock alert at</label>
                    <input
                      style={S.input}
                      type="number"
                      min="0"
                      value={form.low}
                      onChange={(e) => setForm({ ...form, low: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={S.label}>Location</label>
                    <input
                      style={S.input}
                      value={form.loc}
                      onChange={(e) => setForm({ ...form, loc: e.target.value })}
                      placeholder="e.g. Rack A2"
                    />
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Sales person</label>
                  <select style={S.input} value={form.salesPerson} onChange={(e) => setForm({ ...form, salesPerson: e.target.value })}>
                    <option value="">Not set</option>
                    {(people || [])
                      .filter((p) => p.isSalesPerson)
                      .map((p) => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                  </select>
                </div>

                <div style={{ marginTop: 10 }}>
                  <LibraryField
                    label="Supplier"
                    options={master.suppliers.map((s) => s.name)}
                    value={form.supplier}
                    onChange={(v) => setForm({ ...form, supplier: v })}
                    customValue={form.customSupplier}
                    onCustomChange={(v) => setForm({ ...form, customSupplier: v })}
                    placeholder="e.g. Macsteel"
                    allowNone
                  />
                </div>

                {form.mainCat !== "custom" && form.mainCat !== "stores" && (
                  <div style={{ marginTop: 10 }}>
                    <LibraryField
                      label="Customer"
                      options={master.customers}
                      value={form.customer}
                      onChange={(v) => setForm({ ...form, customer: v })}
                      customValue={form.customCustomer}
                      onCustomChange={(v) => setForm({ ...form, customCustomer: v })}
                      placeholder="e.g. New Customer Pty Ltd"
                      allowNone
                    />
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              style={{ ...S.submitBtn, ...(matchedExisting && !allowDuplicate ? S.submitBtnDisabled : {}) }}
              className="stk-btn"
              disabled={!!matchedExisting && !allowDuplicate}
            >
              {editingId ? "Save changes" : allowDuplicate ? "Add duplicate" : "Add to stock"}
            </button>
          </form>
        </div>
      )}

      {showManager && canAccessStockManager && (
        <div style={S.managerFullPage} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Stock Manager</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => { setShowManager(false); setManagerTab(null); }}>
                <X size={18} />
              </button>
            </div>

            {isAdmin && (
              <div style={S.backupRow}>
                <button type="button" className="stk-btn" style={S.backupBtn} onClick={exportBackup}>
                  <Download size={13} /> Download backup
                </button>
                <label className="stk-btn" style={S.backupBtn}>
                  <Upload size={13} /> Restore from backup
                  <input type="file" accept="application/json" style={{ display: "none" }} onChange={importBackup} />
                </label>
              </div>
            )}

            {!managerTab ? (
              <div style={S.managerListFullPage}>
                {MANAGER_TABS.filter((t) => t.key !== "departments" || isAdmin).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className="stk-btn"
                    style={S.managerMenuRow}
                    onClick={() => {
                      setManagerTab(t.key);
                      setManagerInput("");
                      setManagerFactor("");
                      setManagerSearchQuery("");
                      setSectionTypeFilterInManager("");
                      setManagerCustomerOpen(null);
                      setManagerSupplierOpen(null);
                    }}
                  >
                    <span>{t.label}</span>
                    <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
                  </button>
                ))}
              </div>
            ) : (
              <>
                <button type="button" className="stk-btn" style={{ ...S.prominentBackBtn, marginBottom: 10 }} onClick={() => setManagerTab(null)}>
                  <ChevronLeft size={18} strokeWidth={2.5} /> Back to Stock Manager
                </button>

                {managerTab === "stockCodes" ? (
                  <>
                <div style={{ ...S.managerAddRow, marginBottom: 4 }}>
                  <input
                    style={{ ...S.input, flex: 2 }}
                    value={stockCodeQuery}
                    onChange={(e) => setStockCodeQuery(e.target.value)}
                    placeholder="Search part number or description…"
                  />
                  <select
                    style={{ ...S.input, flex: 1 }}
                    value={stockCodeCustomerFilter}
                    onChange={(e) => setStockCodeCustomerFilter(e.target.value)}
                  >
                    <option value="">All customers</option>
                    {master.customers.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button type="button" className="stk-btn" style={S.addBtn} onClick={() => setShowAddStockItemModal(true)}>
                    <Plus size={15} />
                    Add Item
                  </button>
                  <button type="button" className="stk-btn" style={S.roleChip} onClick={() => setShowStockImportModal(true)}>
                    <Upload size={13} />
                    Import / Export
                  </button>
                  {isAdmin && stockCodeCustomerFilter && (
                    <button
                      type="button"
                      className="stk-btn"
                      style={S.usageBtnUse}
                      onClick={() => batchDeleteStockCodesForCustomer(stockCodeCustomerFilter)}
                      title={`Delete all zero-stock catalog items for ${stockCodeCustomerFilter}`}
                    >
                      <Trash2 size={13} /> Delete for {stockCodeCustomerFilter}
                    </button>
                  )}
                </div>

                <div style={S.managerListFullPage}>
                  {(items || [])
                    .filter((it) => it.mainCat === "custom")
                    .filter((it) => ((it.partNumber || "") + " " + (it.name || "")).toLowerCase().includes(stockCodeQuery.toLowerCase()))
                    .filter((it) => !stockCodeCustomerFilter || it.customer === stockCodeCustomerFilter)
                    .map((it) => (
                      <div key={it.id} style={{ ...S.managerRow, flexDirection: "column", alignItems: "stretch" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <EditableName value={it.partNumber || ""} onCommit={(v) => updateCustomerStockField(it.id, "partNumber", v)} style={{ maxWidth: 110 }} />
                          <EditableName value={it.name || ""} onCommit={(v) => updateCustomerStockField(it.id, "name", v)} style={{ flex: 1, minWidth: 140 }} />
                          {isAdmin && (
                            <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeItem(it.id)}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                          <div>
                            <label style={S.label}>Qty</label>
                            <input
                              type="number"
                              value={it.qty === 0 ? "" : it.qty}
                              placeholder="0"
                              onChange={(e) => updateCustomerStockField(it.id, "qty", e.target.value)}
                              style={{ ...S.managerFactorInput, width: 55, display: "block" }}
                              title="Actual quantity on hand"
                            />
                          </div>
                          <div>
                            <label style={S.label}>Price (R)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={it.value === 0 ? "" : it.value}
                              placeholder="0"
                              onChange={(e) => updateCustomerStockField(it.id, "value", e.target.value)}
                              style={{ ...S.managerFactorInput, display: "block" }}
                              title="Unit price (R)"
                            />
                          </div>
                          <div>
                            <label style={S.label}>Low at</label>
                            <input
                              type="number"
                              value={it.low === 0 ? "" : it.low}
                              placeholder="0"
                              onChange={(e) => updateCustomerStockField(it.id, "low", e.target.value)}
                              style={{ ...S.managerFactorInput, display: "block" }}
                              title="Low stock warning threshold"
                            />
                          </div>
                          <div>
                            <label style={S.label}>Cust. rev</label>
                            <input
                              type="text"
                              value={it.customerRevision || ""}
                              placeholder="—"
                              onChange={(e) => updateCustomerStockField(it.id, "customerRevision", e.target.value)}
                              style={{ ...S.managerFactorInput, width: 50, display: "block" }}
                              title="Revision (customer's own, e.g. a letter or number)"
                            />
                          </div>
                          <div>
                            <label style={S.label}>Customer</label>
                            <select
                              value={it.customer || ""}
                              onChange={(e) => updateCustomerStockField(it.id, "customer", e.target.value)}
                              style={{ ...S.managerFactorInput, width: 110, display: "block" }}
                            >
                              <option value="">No customer</option>
                              {master.customers.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  {(items || [])
                    .filter((it) => it.mainCat === "custom")
                    .filter((it) => ((it.partNumber || "") + " " + (it.name || "")).toLowerCase().includes(stockCodeQuery.toLowerCase()))
                    .filter((it) => !stockCodeCustomerFilter || it.customer === stockCodeCustomerFilter).length === 0 && (
                    <div style={S.empty}>
                      {(items || []).filter((it) => it.mainCat === "custom").length === 0
                        ? "Nothing here yet — import a file or add one above."
                        : "Nothing matches that search or customer filter."}
                    </div>
                  )}
                </div>
              </>
            ) : managerTab === "storesCatalog" ? (
              <>
                <div style={S.roleHint}>
                  This is what powers the "Fill from Stores Catalog" autocomplete when your team adds stock — start typing a bolt, nut, or
                  consumable and it'll pull the price straight from here. Every price starts at 0 — I didn't want to guess and load in stale
                  numbers, so fill these in with your real current pricing whenever you get a chance.
                </div>
                <div style={{ ...S.managerAddRow, marginTop: 10 }}>
                  <input
                    style={{ ...S.input, flex: 1 }}
                    value={scCatalogForm.code}
                    onChange={(e) => setScCatalogForm({ ...scCatalogForm, code: e.target.value })}
                    placeholder="Stock code"
                  />
                  <input
                    style={{ ...S.input, flex: 2 }}
                    value={scCatalogForm.name}
                    onChange={(e) => setScCatalogForm({ ...scCatalogForm, name: e.target.value })}
                    placeholder="Item name, e.g. M10 Hex Bolt"
                  />
                  <select
                    style={{ ...S.input, flex: 1 }}
                    value={scCatalogForm.category}
                    onChange={(e) => setScCatalogForm({ ...scCatalogForm, category: e.target.value })}
                  >
                    <option value="">Category…</option>
                    {master.storeCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ ...S.managerAddRow, marginTop: 6 }}>
                  <select
                    style={{ ...S.input, flex: 1 }}
                    value={scCatalogForm.supplier}
                    onChange={(e) => setScCatalogForm({ ...scCatalogForm, supplier: e.target.value })}
                  >
                    <option value="">Supplier…</option>
                    {master.suppliers.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    style={{ ...S.input, flex: 1 }}
                    type="number"
                    step="0.01"
                    value={scCatalogForm.price}
                    onChange={(e) => setScCatalogForm({ ...scCatalogForm, price: e.target.value })}
                    placeholder="Unit price (R)"
                  />
                  <button type="button" className="stk-btn" style={S.addBtn} onClick={addStoresCatalogRow}>
                    <Plus size={15} />
                    Add
                  </button>
                </div>

                <div style={{ ...S.managerAddRow, marginTop: 12 }}>
                  <input
                    style={{ ...S.input, flex: 2 }}
                    value={storesCatalogQuery}
                    onChange={(e) => setStoresCatalogQuery(e.target.value)}
                    placeholder="Search the catalog…"
                  />
                  <select
                    style={{ ...S.input, flex: 1 }}
                    value={storesCatalogCategoryFilter}
                    onChange={(e) => setStoresCatalogCategoryFilter(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {master.storeCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div style={S.managerListFullPage}>
                  {Object.entries(
                    (master.storesCatalog || [])
                      .filter((r) => (r.name + " " + r.category).toLowerCase().includes(storesCatalogQuery.toLowerCase()))
                      .filter((r) => !storesCatalogCategoryFilter || r.category === storesCatalogCategoryFilter)
                      .reduce((acc, r) => {
                        const k = r.category || "Uncategorised";
                        (acc[k] = acc[k] || []).push(r);
                        return acc;
                      }, {})
                  )
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([cat, list]) => (
                      <div key={cat}>
                        <button
                          type="button"
                          className="stk-btn"
                          style={{
                            ...S.managerGroupHeader,
                            ...S.managerGroupHeaderBtn,
                            ...(storesCatalogCategoryFilter === cat ? S.managerGroupHeaderActive : {}),
                          }}
                          onClick={() => setStoresCatalogCategoryFilter((prev) => (prev === cat ? "" : cat))}
                          title={storesCatalogCategoryFilter === cat ? "Showing only this category — tap to show all" : "Tap to show only this category"}
                        >
                          {cat} · {list.length}
                        </button>
                        {list.map((r) => (
                          <div key={r.id} style={S.managerRow}>
                            <EditableName value={r.code || ""} onCommit={(v) => updateStoresCatalogRow(r.id, "code", v)} style={{ maxWidth: 90 }} />
                            <EditableName value={r.name} onCommit={(v) => updateStoresCatalogRow(r.id, "name", v)} />
                            <select
                              value={r.category || ""}
                              onChange={(e) => updateStoresCatalogRow(r.id, "category", e.target.value)}
                              style={{ ...S.managerFactorInput, width: 130 }}
                            >
                              {master.storeCategories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <select
                              value={r.supplier || ""}
                              onChange={(e) => updateStoresCatalogRow(r.id, "supplier", e.target.value)}
                              style={{ ...S.managerFactorInput, width: 130 }}
                            >
                              <option value="">No supplier</option>
                              {master.suppliers.map((s) => (
                                <option key={s.id} value={s.name}>{s.name}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              step="0.01"
                              value={r.price === 0 ? "" : r.price}
                              placeholder="0"
                              onChange={(e) => updateStoresCatalogRow(r.id, "price", e.target.value)}
                              style={S.managerFactorInput}
                              title="Unit price (R)"
                            />
                            <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => duplicateStoresCatalogRow(r.id)} title="Duplicate">
                              <Copy size={13} />
                            </button>
                            <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeStoresCatalogRow(r.id)} title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  {(master.storesCatalog || []).length === 0 && <div style={S.empty}>Nothing here yet — add one above.</div>}
                </div>
              </>
            ) : managerTab === "customers" ? (
              !managerCustomerOpen ? (
                <>
                  <div style={{ ...S.managerAddRow, marginTop: 10 }}>
                    <input
                      style={{ ...S.input, flex: 1 }}
                      value={managerInput}
                      onChange={(e) => setManagerInput(e.target.value)}
                      placeholder="New customer name…"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMasterEntry())}
                    />
                    <button type="button" className="stk-btn" style={S.addBtn} onClick={addMasterEntry}>
                      <Plus size={15} strokeWidth={2.5} /> Add
                    </button>
                  </div>
                  <div style={S.managerListFullPage}>
                    {master.customers.map((cust) => (
                      <button
                        key={cust}
                        type="button"
                        className="stk-btn"
                        style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                        onClick={() => setManagerCustomerOpen(cust)}
                      >
                        <span style={S.itemName}>{cust}</span>
                        <span style={S.gradeCount}>{(master.customerContacts?.[cust] || []).length}</span>
                      </button>
                    ))}
                    {master.customers.length === 0 && <div style={S.empty}>No customers yet — add one above.</div>}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="stk-btn"
                    style={{ ...S.prominentBackBtn, marginBottom: 10 }}
                    onClick={() => setManagerCustomerOpen(null)}
                  >
                    <ChevronLeft size={18} strokeWidth={2.5} /> Back to Customers
                  </button>
                  <div style={S.deptCard}>
                    <div style={S.deptCardHead}>
                      <EditableName
                        value={managerCustomerOpen}
                        onCommit={(v) => {
                          renameMasterEntry("customers", managerCustomerOpen, v);
                          setManagerCustomerOpen(v);
                        }}
                        style={{ fontWeight: 600, fontSize: 15 }}
                      />
                      <button
                        type="button"
                        className="stk-btn"
                        style={S.managerDelete}
                        onClick={() => {
                          removeMasterEntry(managerCustomerOpen);
                          setManagerCustomerOpen(null);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <label style={S.label}>Contact people</label>
                        <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => addCustomerContact(managerCustomerOpen)}>
                          <Plus size={12} /> Add contact
                        </button>
                      </div>
                      {(master.customerContacts?.[managerCustomerOpen] || []).map((c) => (
                        <div key={c.id} style={{ marginTop: 6 }}>
                          <input
                            style={S.input}
                            value={c.name}
                            onChange={(e) => updateCustomerContact(managerCustomerOpen, c.id, "name", e.target.value)}
                            placeholder="Contact name"
                          />
                          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                            <input
                              style={{ ...S.input, flex: 1 }}
                              type="email"
                              value={c.email}
                              onChange={(e) => updateCustomerContact(managerCustomerOpen, c.id, "email", e.target.value)}
                              placeholder="Email"
                            />
                            <input
                              style={{ ...S.input, flex: 1 }}
                              type="tel"
                              value={c.phone || ""}
                              onChange={(e) => updateCustomerContact(managerCustomerOpen, c.id, "phone", e.target.value)}
                              placeholder="Phone"
                            />
                            <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeCustomerContact(managerCustomerOpen, c.id)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(!master.customerContacts?.[managerCustomerOpen] || master.customerContacts[managerCustomerOpen].length === 0) && (
                        <div style={{ ...S.roleHint, marginTop: 4 }}>No contacts added yet.</div>
                      )}
                    </div>
                  </div>
                </>
              )
            ) : managerTab === "suppliers" ? (
              !managerSupplierOpen ? (
                <>
                  <div style={S.roleHint}>
                    Add a logo and contact details for any supplier you'll be raising Purchase Orders to — these appear on the
                    PO document. Suppliers with no email or logo still work fine everywhere else in the app.
                  </div>
                  <div style={{ ...S.managerAddRow, marginTop: 10 }}>
                    <input
                      style={{ ...S.input, flex: 1 }}
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      placeholder="New supplier name…"
                    />
                    <button type="button" className="stk-btn" style={S.addBtn} onClick={addSupplierRow}>
                      <Plus size={15} strokeWidth={2.5} />
                      Add
                    </button>
                  </div>
                  <div style={S.managerListFullPage}>
                    {master.suppliers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="stk-btn"
                        style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}
                        onClick={() => setManagerSupplierOpen(s.id)}
                      >
                        {s.logo ? (
                          <img src={s.logo} alt="" style={S.supplierLogoPreview} />
                        ) : (
                          <div style={S.supplierLogoPlaceholder}>
                            <ImageIcon size={16} color={C.muted} />
                          </div>
                        )}
                        <span style={{ ...S.itemName, flex: 1 }}>{s.name}</span>
                        <span style={S.gradeCount}>{(s.contacts || []).length}</span>
                      </button>
                    ))}
                    {master.suppliers.length === 0 && <div style={S.empty}>No suppliers yet — add one above.</div>}
                  </div>
                </>
              ) : (
                (() => {
                  const s = master.suppliers.find((x) => x.id === managerSupplierOpen);
                  if (!s) return null;
                  return (
                    <>
                      <button
                        type="button"
                        className="stk-btn"
                        style={{ ...S.prominentBackBtn, marginBottom: 10 }}
                        onClick={() => setManagerSupplierOpen(null)}
                      >
                        <ChevronLeft size={18} strokeWidth={2.5} /> Back to Suppliers
                      </button>
                      <div style={S.deptCard}>
                        <div style={S.deptCardHead}>
                          {s.logo ? (
                            <img src={s.logo} alt="" style={S.supplierLogoPreview} />
                          ) : (
                            <div style={S.supplierLogoPlaceholder}>
                              <ImageIcon size={16} color={C.muted} />
                            </div>
                          )}
                          <EditableName value={s.name} onCommit={(v) => updateSupplierField(s.id, "name", v)} style={{ fontWeight: 600, fontSize: 15 }} />
                          <label className="stk-btn" style={S.managerDelete} title="Upload logo">
                            <Paperclip size={13} />
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleSupplierLogoSelect(s.id, e)} />
                          </label>
                          <button
                            type="button"
                            className="stk-btn"
                            style={S.managerDelete}
                            onClick={() => {
                              removeSupplierRow(s.id);
                              setManagerSupplierOpen(null);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div style={S.formGrid}>
                          <input
                            style={S.input}
                            type="email"
                            value={s.email}
                            onChange={(e) => updateSupplierField(s.id, "email", e.target.value)}
                            placeholder="Email"
                          />
                          <input
                            style={S.input}
                            value={s.phone}
                            onChange={(e) => updateSupplierField(s.id, "phone", e.target.value)}
                            placeholder="Phone"
                          />
                        </div>
                        <input
                          style={{ ...S.input, marginTop: 8 }}
                          value={s.address}
                          onChange={(e) => updateSupplierField(s.id, "address", e.target.value)}
                          placeholder="Address"
                        />
                        <input
                          style={{ ...S.input, marginTop: 8 }}
                          value={s.vatNumber || ""}
                          onChange={(e) => updateSupplierField(s.id, "vatNumber", e.target.value)}
                          placeholder="VAT number (optional)"
                        />
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <label style={S.label}>Contact people</label>
                            <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => addSupplierContact(s.id)}>
                              <Plus size={12} /> Add contact
                            </button>
                          </div>
                          {(s.contacts || []).map((c) => (
                            <div key={c.id} style={{ ...S.formGrid, marginTop: 6 }}>
                              <input
                                style={S.input}
                                value={c.name}
                                onChange={(e) => updateSupplierContact(s.id, c.id, "name", e.target.value)}
                                placeholder="Contact name"
                              />
                              <div style={{ display: "flex", gap: 6 }}>
                                <input
                                  style={{ ...S.input, flex: 1 }}
                                  type="email"
                                  value={c.email}
                                  onChange={(e) => updateSupplierContact(s.id, c.id, "email", e.target.value)}
                                  placeholder="Email"
                                />
                                <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeSupplierContact(s.id, c.id)}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {(!s.contacts || s.contacts.length === 0) && <div style={{ ...S.roleHint, marginTop: 4 }}>No contacts added yet.</div>}
                        </div>
                      </div>
                    </>
                  );
                })()
              )
            ) : managerTab === "companyDetails" ? (
              <CompanyDetails
                companyDetails={master.companyDetails}
                updateCompanyDetail={updateCompanyDetail}
                handleCompanyLogoSelect={handleCompanyLogoSelect}
              />
            ) : managerTab === "departments" && isAdmin ? (
              <UserManagement
                people={people}
                master={master}
                updatePersonField={updatePersonField}
                updatePersonPermission={updatePersonPermission}
                toggleProcessTypeAccess={toggleProcessTypeAccess}
                resetPersonAccess={resetPersonAccess}
                deletePersonPermanently={deletePersonPermanently}
                SavedCheck={SavedCheck}
              />
            ) : managerTab === "departments" ? (
              <div style={S.empty}>User Management is Admin-only.</div>
            ) : managerTab === "sections" ? (
              // Sections collapse into their type groups (e.g. "Equal
              // Angle") — selecting one opens a dedicated view for just
              // that group's individual sizes, rather than mixing every
              // size from every type into one long list.
              !sectionTypeFilterInManager ? (
                <div style={S.managerListFullPage}>
                  {master.sections.length === 0 && <div style={S.empty}>Nothing here yet.</div>}
                  {Object.entries(
                    master.sections.reduce((acc, s) => {
                      const k = s.type || "Ungrouped";
                      (acc[k] = acc[k] || []).push(s);
                      return acc;
                    }, {})
                  )
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([groupName, list]) => (
                      <button
                        key={groupName}
                        type="button"
                        className="stk-btn"
                        style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                        onClick={() => setSectionTypeFilterInManager(groupName)}
                      >
                        <span style={S.itemName}>{groupName}</span>
                        <span style={S.gradeCount}>{list.length}</span>
                      </button>
                    ))}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="stk-btn"
                    style={{ ...S.prominentBackBtn, marginBottom: 10 }}
                    onClick={() => setSectionTypeFilterInManager("")}
                  >
                    <ChevronLeft size={18} strokeWidth={2.5} /> Back to Sections
                  </button>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{sectionTypeFilterInManager}</div>

                  <div style={S.managerAddRow}>
                    <input
                      style={{ ...S.input, flex: 2 }}
                      value={managerInput}
                      onChange={(e) => setManagerInput(e.target.value)}
                      placeholder="Add a new size…"
                    />
                    <input
                      style={{ ...S.input, flex: 1 }}
                      type="number"
                      step="0.01"
                      value={managerFactor}
                      onChange={(e) => setManagerFactor(e.target.value)}
                      placeholder="kg/m"
                    />
                    <input
                      style={{ ...S.input, flex: 1 }}
                      type="number"
                      step="0.01"
                      value={managerPrice}
                      onChange={(e) => setManagerPrice(e.target.value)}
                      placeholder="R/m"
                    />
                    <button type="button" className="stk-btn" style={S.addBtn} onClick={addMasterEntry}>
                      <Plus size={15} strokeWidth={2.5} />
                      Add
                    </button>
                  </div>

                  {master.sections.filter((s) => (s.type || "Ungrouped") === sectionTypeFilterInManager).length > 8 && (
                    <input
                      style={{ ...S.input, marginTop: 10 }}
                      value={managerSearchQuery}
                      onChange={(e) => setManagerSearchQuery(e.target.value)}
                      placeholder="Search sizes…"
                    />
                  )}

                  <div style={S.managerListFullPage}>
                    {master.sections
                      .filter((s) => (s.type || "Ungrouped") === sectionTypeFilterInManager)
                      .filter((s) => s.name.toLowerCase().includes(managerSearchQuery.toLowerCase()))
                      .map((entry) => (
                        <div key={entry.name} style={S.managerRow}>
                          <EditableName value={entry.name} onCommit={(v) => renameMasterEntry(managerTab, entry.name, v)} />
                          <input
                            type="number"
                            step="0.01"
                            value={entry.factor === 0 ? "" : entry.factor}
                            placeholder="0"
                            onChange={(e) => updateFactorField(entry.name, "factor", e.target.value)}
                            style={S.managerFactorInput}
                            title="kg/m"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={!entry.price ? "" : entry.price}
                            placeholder="0"
                            onChange={(e) => updateFactorField(entry.name, "price", e.target.value)}
                            style={S.managerFactorInput}
                            title="R/m"
                          />
                          <select
                            value={entry.type || ""}
                            onChange={(e) => updateSectionType(entry.name, e.target.value)}
                            style={{ ...S.managerFactorInput, width: 130 }}
                          >
                            <option value="">No type</option>
                            {master.sectionTypes.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeMasterEntry(entry)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                  </div>
                </>
              )
            ) : (
              <>
                <div style={S.managerAddRow}>
                  <input
                    style={{ ...S.input, flex: managerIsFactorTable ? 2 : 1 }}
                    value={managerInput}
                    onChange={(e) => setManagerInput(e.target.value)}
                    placeholder={`Add a new ${MANAGER_TABS.find((t) => t.key === managerTab).label.toLowerCase().replace(/s$/, "")}…`}
                    onKeyDown={(e) => e.key === "Enter" && !managerIsFactorTable && (e.preventDefault(), addMasterEntry())}
                  />
                  {managerIsFactorTable && (
                    <>
                      <input
                        style={{ ...S.input, flex: 1 }}
                        type="number"
                        step="0.01"
                        value={managerFactor}
                        onChange={(e) => setManagerFactor(e.target.value)}
                        placeholder="Density g/cm³"
                      />
                      <input
                        style={{ ...S.input, flex: 1 }}
                        type="number"
                        step="0.01"
                        value={managerPrice}
                        onChange={(e) => setManagerPrice(e.target.value)}
                        placeholder="R/kg"
                      />
                      {managerTab === "grades" && (
                        <input
                          style={{ ...S.input, flex: 1 }}
                          value={managerShortName}
                          onChange={(e) => setManagerShortName(e.target.value)}
                          placeholder="Short name, e.g. SS304-2B"
                        />
                      )}
                    </>
                  )}
                  <button type="button" className="stk-btn" style={S.addBtn} onClick={addMasterEntry}>
                    <Plus size={15} strokeWidth={2.5} />
                    Add
                  </button>
                </div>

                {ORDERED_STRING_LISTS.includes(managerTab) && (
                  <div style={{ ...S.roleHint, marginTop: 10 }}>
                    {managerTab === "laserMaterials"
                      ? "This order is how the laser's cut list groups programs together. Put them in the order that suits the machine — thinnest first, say — because left alphabetical, 10mm sorts next to 1.2mm."
                      : "This order is the factory flow — top to bottom is the sequence work moves through the shop. Use the arrows to change it. Every job follows this order, new or already running, and every department is listed in it."}
                  </div>
                )}

                {master[managerTab].length > 8 && (
                  <input
                    style={{ ...S.input, marginTop: 10 }}
                    value={managerSearchQuery}
                    onChange={(e) => setManagerSearchQuery(e.target.value)}
                    placeholder={`Search ${MANAGER_TABS.find((t) => t.key === managerTab).label.toLowerCase()}…`}
                  />
                )}

                <div style={S.managerListFullPage}>
                  {master[managerTab].length === 0 && <div style={S.empty}>Nothing here yet — add one above.</div>}
                  {managerIsFactorTable
                    ? master[managerTab]
                        .filter((e) => e.name.toLowerCase().includes(managerSearchQuery.toLowerCase()))
                        .map((entry) => (
                          <div key={entry.name} style={S.managerRow}>
                            <EditableName value={entry.name} onCommit={(v) => renameMasterEntry(managerTab, entry.name, v)} />
                            <input
                              type="number"
                              step="0.01"
                              value={entry.factor === 0 ? "" : entry.factor}
                              placeholder="0"
                              onChange={(e) => updateFactorField(entry.name, "factor", e.target.value)}
                              style={S.managerFactorInput}
                              title="Density g/cm³"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={!entry.price ? "" : entry.price}
                              placeholder="0"
                              onChange={(e) => updateFactorField(entry.name, "price", e.target.value)}
                              style={S.managerFactorInput}
                              title="R/kg"
                            />
                            {managerTab === "grades" && (
                              <input
                                value={entry.shortName || ""}
                                placeholder="Short name"
                                onChange={(e) => updateGradeShortName(entry.name, e.target.value)}
                                style={{ ...S.managerFactorInput, width: 130 }}
                              />
                            )}
                            <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeMasterEntry(entry)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))
                    : master[managerTab]
                        .filter((entry) => entry.toLowerCase().includes(managerSearchQuery.toLowerCase()))
                        .map((entry) => {
                        // Reordering is offered only where the sequence
                        // means something, and never while a search is
                        // narrowing the list — moving an item one place
                        // when its neighbours are hidden would look like
                        // it jumped several.
                        const reorderable = ORDERED_STRING_LISTS.includes(managerTab) && !managerSearchQuery;
                        const fullList = master[managerTab];
                        const pos = fullList.indexOf(entry);
                        return (
                        <div key={entry} style={S.managerRow}>
                          <EditableName value={entry} onCommit={(v) => renameMasterEntry(managerTab, entry, v)} />
                          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                            {reorderable && (
                              <>
                                <button
                                  type="button"
                                  className="stk-btn"
                                  style={{ ...S.managerDelete, opacity: pos === 0 ? 0.25 : 1, cursor: pos === 0 ? "not-allowed" : "pointer" }}
                                  disabled={pos === 0}
                                  title={managerTab === "laserMaterials" ? "Move up the cut list" : "Move earlier in the factory flow"}
                                  onClick={() => moveMasterEntry(entry, -1)}
                                >
                                  <ChevronUp size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="stk-btn"
                                  style={{ ...S.managerDelete, opacity: pos === fullList.length - 1 ? 0.25 : 1, cursor: pos === fullList.length - 1 ? "not-allowed" : "pointer" }}
                                  disabled={pos === fullList.length - 1}
                                  title={managerTab === "laserMaterials" ? "Move down the cut list" : "Move later in the factory flow"}
                                  onClick={() => moveMasterEntry(entry, 1)}
                                >
                                  <ChevronDown size={15} />
                                </button>
                              </>
                            )}
                            <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeMasterEntry(entry)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        );
                      })}
                </div>
              </>
            )}
              </>
            )}
        </div>
      )}

      {previewItem && (
        // Higher z-index than the standard modal overlay — this can open
        // while Job Detail (or another modal) is already open behind it,
        // same fix as the New Stock Item modal needed for the same reason.
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>{previewItem.attachmentName || "Attachment"}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closePreview}>
                <X size={18} />
              </button>
            </div>
            {previewLoading && <div style={S.empty}>Loading…</div>}
            {!previewLoading && !previewData && <div style={S.empty}>Couldn't load this attachment.</div>}
            {!previewLoading && previewData && previewItem.attachmentType === "image" && (
              <img src={previewData} alt={previewItem.attachmentName || "Attachment"} style={S.previewImage} />
            )}
            {!previewLoading && previewData && previewItem.attachmentType === "pdf" && (
              <>
                {/* iframe, not embed — most mobile browsers don't support
                    <embed type="application/pdf"> and were falling back to
                    downloading the file instead of showing it inline. */}
                <iframe src={previewData} title={previewItem.attachmentName || "Attachment"} style={S.previewPdf} />
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8 }}>
                  {(!previewItem.restrictDownload || isAdmin) && (
                    <>
                      <a href={previewData} target="_blank" rel="noreferrer" style={S.previewDownload}>
                        Open / Print
                      </a>
                      <a href={previewData} download={previewItem.attachmentName || "drawing.pdf"} style={S.previewDownload}>
                        Download PDF
                      </a>
                    </>
                  )}
                </div>
                {previewItem.restrictDownload && !isAdmin && (
                  <div style={{ ...S.roleHint, textAlign: "center", marginTop: 8 }}>
                    Downloading this drawing is restricted to Admin.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {assetRemoveModal && (
        <div style={S.modalOverlay}>
          <form style={{ ...S.modal, maxWidth: 380 }} onClick={(e) => e.stopPropagation()} onSubmit={submitAssetRemoveModal}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Remove asset</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeAssetRemoveModal}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>
              {assetRemoveModal.item.partNumber ? `${assetRemoveModal.item.partNumber} — ` : ""}
              {assetRemoveModal.item.name}
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Reason (required)</label>
              <input
                autoFocus
                style={S.input}
                value={assetRemoveModal.reason}
                onChange={(e) => setAssetRemoveModal((m) => ({ ...m, reason: e.target.value }))}
                placeholder="e.g. Broken, Stolen, Sold, Scrapped"
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Date</label>
              <input
                type="date"
                style={S.input}
                value={assetRemoveModal.date}
                onChange={(e) => setAssetRemoveModal((m) => ({ ...m, date: e.target.value }))}
              />
            </div>
            <button type="submit" style={{ ...S.submitBtn, background: C.danger }} className="stk-btn">
              Confirm removal
            </button>
          </form>
        </div>
      )}

      {assetHistoryItem && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>{assetHistoryItem.name}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeAssetHistory}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>{assetHistoryItem.partNumber}</div>

            {(() => {
              const svc = getServiceStatus(assetHistoryItem);
              if (!svc) return null;
              return (
                <div
                  style={{
                    ...S.roleHint,
                    marginTop: 6,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: svc.level === "overdue" ? C.dangerTint : svc.level === "soon" ? C.accentTint : C.bg,
                    color: svc.level === "overdue" ? C.danger : svc.level === "soon" ? C.accentRaw : C.muted,
                  }}
                >
                  {svc.level === "overdue" ? "Service overdue" : svc.level === "soon" ? "Service due soon" : "Service on track"} — {svc.detail}
                </div>
              );
            })()}

            {canEditQty("assets") && (assetHistoryItem.serviceMode === "hours" || assetHistoryItem.serviceMode === "km") && (
              <form onSubmit={submitAssetReading} style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Log current {assetHistoryItem.serviceMode === "hours" ? "hours" : "kilometers"}</label>
                  <input
                    type="number"
                    min="0"
                    style={S.input}
                    value={assetHistoryReading}
                    onChange={(e) => setAssetHistoryReading(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <button type="submit" className="stk-btn" style={{ ...S.addBtn, marginBottom: 1 }} disabled={assetHistoryBusy}>
                  Log
                </button>
              </form>
            )}

            {canEditQty("assets") && (
              <form onSubmit={submitAssetNote} style={{ marginTop: 12 }}>
                <label style={S.label}>Add a note</label>
                <input
                  style={S.input}
                  value={assetHistoryNote}
                  onChange={(e) => setAssetHistoryNote(e.target.value)}
                  placeholder="e.g. Replaced brushes"
                />
                <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="stk-btn" style={{ ...S.reqActionBtnMuted, cursor: "pointer" }}>
                    <Paperclip size={13} /> {assetHistoryFile ? assetHistoryFile.name : "Attach photo/file"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => setAssetHistoryFile(e.target.files[0] || null)}
                    />
                  </label>
                  <button
                    type="submit"
                    className="stk-btn"
                    style={S.addBtn}
                    disabled={assetHistoryBusy || (!assetHistoryNote.trim() && !assetHistoryFile)}
                  >
                    Submit
                  </button>
                </div>
              </form>
            )}

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
              {assetHistoryEntries === null && <div style={S.empty}>Loading history…</div>}
              {assetHistoryEntries?.length === 0 && <div style={S.empty}>No history yet — add a note or log a reading above.</div>}
              {assetHistoryEntries?.map((entry) => (
                <div key={entry.id} style={S.reqCard}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>
                      {entry.entry_type === "meter_reading"
                        ? `Reading logged: ${entry.hours_reading ?? entry.km_reading}${entry.hours_reading != null ? "hrs" : "km"}`
                        : entry.entry_type === "service"
                        ? `Serviced${entry.note ? " — " + entry.note : ""}`
                        : entry.note}
                    </span>
                    {isAdmin && (
                      <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => handleDeleteAssetHistoryEntry(entry)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>{entry.logged_by}</span>
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                  {entry.entry_type === "service" && entry.consumables && entry.consumables.length > 0 && (
                    <div style={{ ...S.roleHint, marginTop: 4 }}>
                      Used: {entry.consumables.map((c) => `${c.name} × ${c.qty}${c.unit || ""}`).join(", ")}
                    </div>
                  )}
                  {entry.attachment_path && (
                    <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 6 }} onClick={() => viewAssetAttachment(entry)}>
                      <Paperclip size={13} /> {entry.attachment_name}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {serviceNowItem && !showAdd && (
        <div style={S.modalOverlay}>
          <form style={{ ...S.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()} onSubmit={submitServiceNow}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Service now — {serviceNowItem.name}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeServiceNow}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>Recording this updates the service counter and works out the next due date automatically.</div>

            {(serviceNowItem.serviceMode === "hours" || serviceNowItem.serviceMode === "km") && (
              <div style={{ marginTop: 10 }}>
                <label style={S.label}>Reading at time of service ({serviceNowItem.serviceMode === "hours" ? "hours" : "km"})</label>
                <input
                  type="number"
                  min="0"
                  style={S.input}
                  value={serviceNowReading}
                  onChange={(e) => setServiceNowReading(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <label style={S.label}>Consumables used</label>
              {serviceNowConsumables.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {serviceNowConsumables.map((c, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ flex: 1, fontSize: 13.5 }}>
                        {c.name} {c.source === "stores" && <span style={{ color: C.muted }}>(Stores)</span>}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        style={{ ...S.managerFactorInput, width: 70 }}
                        value={c.qty}
                        onChange={(e) => updateServiceConsumableQty(idx, e.target.value)}
                      />
                      <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeServiceConsumable(idx)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <input
                  style={S.input}
                  value={serviceNowConsumableSearch}
                  onChange={(e) => setServiceNowConsumableSearch(e.target.value)}
                  placeholder="Search Stores to add a consumable…"
                />
                {serviceNowConsumableSearch.trim() && (
                  <div style={{ ...S.managerList, marginTop: 6, maxHeight: 160 }}>
                    {items
                      .filter((it) => it.mainCat === "stores")
                      .filter((it) => it.name.toLowerCase().includes(serviceNowConsumableSearch.trim().toLowerCase()))
                      .slice(0, 20)
                      .map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          className="stk-btn"
                          style={{ ...S.reqActionBtnMuted, justifyContent: "space-between", width: "100%" }}
                          onClick={() => addServiceConsumableFromStores(it)}
                        >
                          <span>{it.name}</span>
                          <span style={{ color: C.muted }}>{it.qty} {it.unit} in stock</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div style={{ ...S.roleHint, marginTop: 10 }}>Not in Stores yet? Type its name below — this creates a real Stores item and uses it.</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  style={{ ...S.input, flex: 2 }}
                  value={serviceNowCustomName}
                  onChange={(e) => setServiceNowCustomName(e.target.value)}
                  placeholder="New item name…"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  style={{ ...S.input, flex: 1 }}
                  value={serviceNowCustomQty}
                  onChange={(e) => setServiceNowCustomQty(e.target.value)}
                  placeholder="Qty"
                />
                <button type="button" className="stk-btn" style={S.addBtn} onClick={addServiceConsumableCustom} disabled={!serviceNowCustomName.trim()}>
                  <Plus size={15} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={S.label}>Note (optional)</label>
              <input
                style={S.input}
                value={serviceNowNote}
                onChange={(e) => setServiceNowNote(e.target.value)}
                placeholder="e.g. Full service, replaced filters"
              />
            </div>

            <div style={{ marginTop: 8 }}>
              <label className="stk-btn" style={{ ...S.reqActionBtnMuted, cursor: "pointer" }}>
                <Paperclip size={13} /> {serviceNowFile ? serviceNowFile.name : "Attach document (optional)"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => setServiceNowFile(e.target.files[0] || null)}
                />
              </label>
            </div>

            <button type="submit" className="stk-btn" style={S.submitBtn} disabled={serviceNowBusy}>
              {serviceNowBusy ? "Saving…" : "Mark serviced"}
            </button>
          </form>
        </div>
      )}

      {repairListItem && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Repair list — {repairListItem.name}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeRepairList}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>Small problems to come back to later — not urgent enough to stop using it now.</div>

            {canEditQty("assets") && (
              <form onSubmit={submitRepairEntry} style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={repairListDescription}
                  onChange={(e) => setRepairListDescription(e.target.value)}
                  placeholder="e.g. Guard is loose, needs a new bolt"
                />
                <button type="submit" className="stk-btn" style={S.addBtn} disabled={repairListBusy || !repairListDescription.trim()}>
                  <Plus size={15} strokeWidth={2.5} />
                </button>
              </form>
            )}

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
              {repairListEntries === null && <div style={S.empty}>Loading…</div>}
              {repairListEntries?.filter((e) => e.status === "open").length === 0 && repairListEntries !== null && (
                <div style={S.empty}>Nothing outstanding.</div>
              )}
              {repairListEntries?.filter((e) => e.status === "open").map((entry) => (
                <div key={entry.id} style={S.reqCard}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{entry.description}</span>
                    {isAdmin && (
                      <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => deleteRepairEntry(entry)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>{entry.logged_by}</span>
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                  {canEditQty("assets") && (
                    <button type="button" className="stk-btn" style={{ ...S.reqActionBtn, marginTop: 6 }} onClick={() => resolveRepairEntry(entry)}>
                      <Check size={13} /> Mark fixed
                    </button>
                  )}
                </div>
              ))}
            </div>

            {repairListEntries?.some((e) => e.status === "resolved") && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="stk-btn"
                  style={S.reqActionBtnMuted}
                  onClick={() => setRepairListResolvedOpen((v) => !v)}
                >
                  {repairListResolvedOpen ? "Hide" : "Show"} fixed ({repairListEntries.filter((e) => e.status === "resolved").length})
                </button>
                {repairListResolvedOpen && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    {repairListEntries.filter((e) => e.status === "resolved").map((entry) => (
                      <div key={entry.id} style={{ ...S.reqCard, opacity: 0.7 }}>
                        <div style={S.reqCardTop}>
                          <span style={S.itemName}>{entry.description}</span>
                          {isAdmin && (
                            <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => deleteRepairEntry(entry)}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <div className="stk-meta-row" style={S.rowMeta}>
                          <span>Fixed by {entry.resolved_by}</span>
                          <span>{new Date(entry.resolved_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pulling stock from inside a process. Two steps — pick the
          department, then the item — rather than one enormous list, since
          the stock table runs to thousands of rows. Handing straight over
          to the usual Use stock form keeps one path for actually booking
          material out, with the job filled in already. */}
      {/* The operator confirming what they actually used. Long material
          gets an offcut box, because a 6m length rarely goes into a job
          whole and the remainder is worth real money — left off, it
          silently disappears from stock. */}
      {useAllocationModal && (
        <div style={{ ...S.modalOverlay, zIndex: 31 }}>
          <form
            style={{ ...S.modal, maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              useAllocation(useAllocationModal.allocation, useAllocationModal.qty, useAllocationModal.offcuts);
              setUseAllocationModal(null);
            }}
          >
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Use stock</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setUseAllocationModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>
              {useAllocationModal.allocation.item_name} — set aside for {useAllocationModal.allocation.process_name} on{" "}
              {useAllocationModal.allocation.job_number}
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={S.label}>How much did you use</label>
              <input
                autoFocus
                style={S.input}
                type="number"
                step="any"
                min="0"
                max={Number(useAllocationModal.allocation.qty_allocated) - Number(useAllocationModal.allocation.qty_used)}
                value={useAllocationModal.qty}
                onChange={(e) => setUseAllocationModal((m) => ({ ...m, qty: e.target.value }))}
              />
              <div style={S.roleHint}>
                {Number(useAllocationModal.allocation.qty_allocated) - Number(useAllocationModal.allocation.qty_used)} still set
                aside for you. Using less leaves the rest reserved.
              </div>
            </div>

            {useAllocationModal.item?.trackLength && (
              <div style={{ marginTop: 10 }}>
                <label style={S.label}>Offcuts going back to stock</label>
                <div style={S.roleHint}>
                  These come in {useAllocationModal.item.length}m lengths. Add a row for each different offcut length —
                  three 2m pieces is one row with a quantity of 3. Leave it empty if nothing usable came back.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {(useAllocationModal.offcuts || []).map((o, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        style={{ ...S.input, flex: 1 }}
                        type="number"
                        step="any"
                        min="0"
                        max={Number(useAllocationModal.item.length || 0)}
                        value={o.length}
                        onChange={(e) =>
                          setUseAllocationModal((m) => ({
                            ...m,
                            offcuts: m.offcuts.map((x, i) => (i === idx ? { ...x, length: e.target.value } : x)),
                          }))
                        }
                        placeholder="Length (m)"
                      />
                      <span style={{ color: C.muted, fontSize: 13 }}>×</span>
                      <input
                        style={{ ...S.input, width: 80, flexShrink: 0 }}
                        type="number"
                        step="1"
                        min="1"
                        value={o.qty}
                        onChange={(e) =>
                          setUseAllocationModal((m) => ({
                            ...m,
                            offcuts: m.offcuts.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)),
                          }))
                        }
                        placeholder="Qty"
                      />
                      <button
                        type="button"
                        className="stk-btn"
                        style={S.managerDelete}
                        title="Remove this offcut"
                        onClick={() =>
                          setUseAllocationModal((m) => ({ ...m, offcuts: m.offcuts.filter((_, i) => i !== idx) }))
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="stk-btn"
                  style={{ ...S.addBtn, marginTop: 6 }}
                  onClick={() =>
                    setUseAllocationModal((m) => ({ ...m, offcuts: [...(m.offcuts || []), { length: "", qty: "1" }] }))
                  }
                >
                  <Plus size={15} strokeWidth={2.5} /> Add offcut
                </button>
              </div>
            )}

            <button type="submit" className="stk-btn" style={{ ...S.submitBtn, marginTop: 12 }} disabled={!Number(useAllocationModal.qty)}>
              Confirm used
            </button>
          </form>
        </div>
      )}

      {/* What is reserved on one stock item, and the two things that can
          be done about it — hand it back, or book it out against the job
          it was set aside for. This is the only way reserved material can
          be consumed; ordinary Use is capped at what is free. */}
      {reservedModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Reserved — {reservedModal.item.name}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setReservedModal(null)}>
                <X size={18} />
              </button>
            </div>
            {(() => {
              const rows = allocationsForItem(reservedModal.item.id);
              if (rows.length === 0) {
                return <div style={S.empty}>Nothing is reserved on this item any more.</div>;
              }
              const held = reservedQtyForItem(reservedModal.item.id);
              return (
                <>
                  <div style={S.roleHint}>
                    {reservedModal.item.qty} on the shelf · {held} reserved · {Math.max(0, Number(reservedModal.item.qty) - held)} free
                    for anyone else to use.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {rows.map((a) => {
                      const outstanding = Number(a.qty_allocated) - Number(a.qty_used);
                      const entered = reservedUseQty[a.id] ?? String(outstanding);
                      return (
                        <div key={a.id} style={S.reqCard}>
                          <div style={S.reqCardTop}>
                            <span style={S.itemName}>{a.job_number || "No job number"}</span>
                            <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.accentRaw }}>{outstanding} left</span>
                          </div>
                          <div className="stk-meta-row" style={S.rowMeta}>
                            <span>For {a.process_name}</span>
                            {Number(a.qty_used) > 0 && <span>{a.qty_used} of {a.qty_allocated} already used</span>}
                            <span>Set aside by {a.allocated_by}</span>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                            <input
                              style={{ ...S.input, width: 90, flexShrink: 0 }}
                              type="number"
                              step="any"
                              min="0"
                              max={outstanding}
                              value={entered}
                              onChange={(e) => setReservedUseQty((m) => ({ ...m, [a.id]: e.target.value }))}
                            />
                            <button
                              type="button"
                              className="stk-btn"
                              style={{ ...S.reqActionBtn, flex: 1 }}
                              onClick={() => useAllocation(a, entered)}
                            >
                              Mark used on {a.job_number || "this job"}
                            </button>
                            <button
                              type="button"
                              className="stk-btn"
                              style={S.managerDelete}
                              title="Release this back — nothing is booked out"
                              onClick={() => releaseAllocation(a)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Setting material aside for a stage. Reserves only — the stock
          count is untouched until an operator books it out, so the number
          on screen keeps matching what is physically in the racks. */}
      {allocateModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>
                Allocate to {allocateModal.process.process_name} — {allocateModal.job.job_number}
              </span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setAllocateModal(null)}>
                <X size={18} />
              </button>
            </div>

            {allocateModal.item === null ? (
              <StockPicker
                items={items}
                // Reserving is not taking, so this only needs sight of the
                // department, not the right to reduce it. The permission
                // that matters is checked when the material is booked out.
                allowedDepts={TABS.filter((t) => canView(t.key))}
                emptyMessage="You can't see any stock departments, so there's nothing to allocate from."
                onPick={(it) => { setAllocateModal((m) => ({ ...m, item: it })); setAllocateQty(""); }}
              />
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); allocateStockToProcess(allocateModal.item, allocateQty); }}
              >
                <button
                  type="button"
                  className="stk-btn"
                  style={{ ...S.prominentBackBtn, marginBottom: 8 }}
                  onClick={() => setAllocateModal((m) => ({ ...m, item: null }))}
                >
                  <ChevronLeft size={18} strokeWidth={2.5} /> Pick a different item
                </button>
                <div style={S.roleHint}>
                  {allocateModal.item.name} — {allocateModal.item.qty} in stock
                  {allocateModal.item.trackLength ? ` · sold in ${allocateModal.item.length}m lengths` : ""}
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>How much to set aside</label>
                  <input
                    autoFocus
                    style={S.input}
                    type="number"
                    step="any"
                    min="0"
                    value={allocateQty}
                    onChange={(e) => setAllocateQty(e.target.value)}
                    placeholder={`Up to ${allocateModal.item.qty} available`}
                  />
                </div>
                {Number(allocateQty) > Number(allocateModal.item.qty) && (
                  <div style={{ ...S.roleHint, color: C.danger }}>
                    That's more than the {allocateModal.item.qty} currently in stock. You can still reserve it — material
                    on order often arrives after the job is planned — but nobody will be able to book out what isn't there.
                  </div>
                )}
                <button type="submit" className="stk-btn" style={{ ...S.submitBtn, marginTop: 12 }} disabled={!Number(allocateQty)}>
                  Allocate to {allocateModal.process.process_name}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Booking material out from inside a process. Hands over to the
          usual Use stock form once an item is chosen, so there is still
          one path for actually recording usage — only the way in is new. */}
      {pullStockModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Pull from stock — {pullStockModal.job.job_number}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setPullStockModal(null)}>
                <X size={18} />
              </button>
            </div>
            <StockPicker
              items={items}
              // Taking material out is a stock edit wherever it is done
              // from, so the same permission applies here as on the stock
              // screens — this must not become a way around it.
              allowedDepts={TABS.filter((t) => canEditQty(t.key))}
              emptyMessage={`You don't have permission to take stock out of any department, so there's nothing to pull from. ${
                isAdmin ? "Set this" : "Ask an admin to set it"
              } under Stock Manager → User Management → your name → Edit qty.`}
              onPick={(it) => {
                openUsageModal(it, "use", {
                  jobNumber: pullStockModal.job.job_number || "",
                  customer: pullStockModal.job.customer || "",
                  note: `Used on ${pullStockModal.process.process_name}`,
                });
                setPullStockModal(null);
              }}
            />
          </div>
        </div>
      )}

      {usageModal && (
        <div style={{ ...S.modalOverlay, zIndex: 31 }}>
          <form style={{ ...S.modal, maxWidth: 380 }} onClick={(e) => e.stopPropagation()} onSubmit={submitUsageModal}>
            {(() => {
              const isCncCut = usageModal.item.mainCat === "cncBar" && usageModal.direction === "use";
              return (
                <>
                  <div style={S.modalHead}>
                    <span style={S.modalTitle}>{isCncCut ? "Cut from stock" : usageModal.direction === "use" ? "Use stock" : "Add stock"}</span>
                    <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeUsageModal}>
                      <X size={18} />
                    </button>
                  </div>
                  <div style={S.roleHint}>
                    {usageModal.item.name}
                    {isCncCut && ` — ${usageModal.item.length}mm remaining on this piece`}
                  </div>

                  <div style={isCncCut ? S.formGrid : { marginTop: 10 }}>
                    <div>
                      <label style={S.label}>{isCncCut ? "Length per piece (mm)" : "Quantity"}</label>
                      <input
                        autoFocus
                        type="number"
                        step="any"
                        min="0"
                        max={isCncCut ? usageModal.item.length : undefined}
                        style={S.input}
                        value={usageModal.qty}
                        onChange={(e) => setUsageModal((m) => ({ ...m, qty: e.target.value }))}
                        placeholder={isCncCut ? "e.g. 50" : "e.g. 10"}
                      />
                    </div>
                    {isCncCut && (
                      <div>
                        <label style={S.label}>How many pieces</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          style={S.input}
                          value={usageModal.cutQty}
                          onChange={(e) => setUsageModal((m) => ({ ...m, cutQty: e.target.value }))}
                          placeholder="1"
                        />
                      </div>
                    )}
                  </div>
                  {isCncCut &&
                    (() => {
                      const totalMm = Number(usageModal.qty || 0) * (parseInt(usageModal.cutQty, 10) || 1);
                      if (totalMm <= 0) return null;
                      const remainder = Number(usageModal.item.length) - totalMm;
                      return (
                        <div style={{ ...S.roleHint, marginTop: 6 }}>
                          {parseInt(usageModal.cutQty, 10) > 1 ? `${usageModal.cutQty} × ${usageModal.qty}mm = ${totalMm}mm total. ` : ""}
                          {remainder >= 0
                            ? `${remainder}mm will remain as stock after this cut.`
                            : `Not enough — this piece only has ${usageModal.item.length}mm remaining.`}
                        </div>
                      );
                    })()}
                </>
              );
            })()}

            {usageModal.direction === "use" ? (
              <>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Job (optional)</label>
                  <select
                    style={S.input}
                    value={usageModal.jobNumber}
                    onChange={(e) => {
                      const selectedJobNumber = e.target.value;
                      const matchedJob = (jobsList || []).find((j) => j.job_number === selectedJobNumber);
                      setUsageModal((m) => ({
                        ...m,
                        jobNumber: selectedJobNumber,
                        // Selecting a job is a strong signal of which
                        // customer this usage is actually for — carry it
                        // over automatically rather than make someone
                        // retype what the job already knows.
                        customer: matchedJob ? matchedJob.customer || "" : m.customer,
                      }));
                    }}
                  >
                    <option value="">No specific job</option>
                    {(jobsList || [])
                      .filter((j) => j.status === "in_progress" || j.status === "complete")
                      .map((j) => (
                        <option key={j.id} value={j.job_number}>
                          {j.job_number} — {j.customer || "No customer"}
                        </option>
                      ))}
                  </select>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Customer</label>
                  <input
                    style={S.input}
                    list="usage-modal-customer-list"
                    value={usageModal.customer}
                    onChange={(e) => setUsageModal((m) => ({ ...m, customer: e.target.value }))}
                    placeholder="e.g. HPE"
                  />
                  <datalist id="usage-modal-customer-list">
                    {master.customers.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div style={{ ...S.roleHint, marginTop: 6 }}>Job number or customer — at least one is required.</div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Note (optional)</label>
                  <input
                    style={S.input}
                    value={usageModal.note || ""}
                    onChange={(e) => setUsageModal((m) => ({ ...m, note: e.target.value }))}
                    placeholder="e.g. damaged during cutting"
                  />
                </div>
              </>
            ) : (
              <div style={{ marginTop: 10 }}>
                <label style={S.label}>Note (optional)</label>
                <input
                  style={S.input}
                  value={usageModal.note}
                  onChange={(e) => setUsageModal((m) => ({ ...m, note: e.target.value }))}
                  placeholder="e.g. stocktake correction"
                />
              </div>
            )}

            <button
              type="submit"
              style={{ ...S.submitBtn, ...(usageModal.direction === "use" ? { background: C.danger } : {}) }}
              className="stk-btn"
            >
              {usageModal.item.mainCat === "cncBar" && usageModal.direction === "use"
                ? "Confirm cut"
                : usageModal.direction === "use"
                ? "Confirm use"
                : "Confirm add"}
            </button>
          </form>
        </div>
      )}

      {showDrawingUpload && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Upload Drawings</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeDrawingUpload} disabled={drawingUploadBusy}>
                <X size={18} />
              </button>
            </div>

            {drawingUploadResult ? (
              <div>
                <div style={S.roleHint}>
                  Uploaded {drawingUploadResult.succeeded} drawing{drawingUploadResult.succeeded === 1 ? "" : "s"}
                  {drawingUploadResult.failed > 0 ? `, ${drawingUploadResult.failed} failed — check your connection and try those again.` : "."}
                </div>
                <button type="button" className="stk-btn" style={S.submitBtn} onClick={closeDrawingUpload}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Customer (optional — leave blank for your own design drawings)</label>
                  <select style={S.input} value={drawingUploadCustomer} onChange={(e) => setDrawingUploadCustomer(e.target.value)}>
                    <option value="">No customer — internal drawing</option>
                    {master.customers.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="stk-btn" style={{ ...S.addBtn, cursor: "pointer", width: "100%", justifyContent: "center" }}>
                    <Upload size={14} /> Choose PDF files…
                    <input type="file" accept="application/pdf" multiple style={{ display: "none" }} onChange={handleDrawingFilesSelected} />
                  </label>
                  <div style={{ ...S.roleHint, marginTop: 6 }}>
                    Each file's name (minus .pdf) is used as the part number — re-uploading the same name later automatically
                    files it as the next revision.
                  </div>
                </div>

                {drawingUploadFiles.length > 0 && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                    {drawingUploadFiles.map((entry, idx) => (
                      <div key={idx} style={{ ...S.managerRow, opacity: entry.skip ? 0.6 : 1 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 13.5, color: entry.partNumber ? C.text : C.danger }}>
                            {entry.file.name} → <strong>{entry.partNumber || "no part number"}</strong>
                          </span>
                          {entry.matchedStockCode ? (
                            <span style={{ fontSize: 12.5, color: C.accentFinished }}>
                              ✓ Links to existing stock code — {entry.matchedStockCode.description || "no description"}
                            </span>
                          ) : entry.skip ? (
                            <span style={{ fontSize: 12.5, color: C.danger }}>
                              ✕ No matching stock code for this customer — won't be uploaded
                            </span>
                          ) : (
                            <span style={{ fontSize: 12.5, color: C.muted }}>No matching stock code — uploading unlinked (internal drawing)</span>
                          )}
                        </div>
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeDrawingUploadFile(idx)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    {drawingUploadFiles.some((f) => f.skip) && (
                      <div style={S.roleHint}>
                        Files without a matching stock code are skipped automatically — add them to Stock Codes first, then re-select the file.
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  className="stk-btn"
                  style={S.submitBtn}
                  disabled={drawingUploadFiles.filter((f) => !f.skip).length === 0 || drawingUploadBusy}
                  onClick={submitDrawingUpload}
                >
                  {drawingUploadBusy
                    ? "Uploading…"
                    : `Upload ${drawingUploadFiles.filter((f) => !f.skip).length} drawing${
                        drawingUploadFiles.filter((f) => !f.skip).length === 1 ? "" : "s"
                      }`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {jobDetail && (
        <div style={S.managerFullPage}>
          <button
            type="button"
            className="stk-btn"
            style={{ ...S.prominentBackBtn, marginBottom: 10 }}
            onClick={closeJobDetail}
          >
            <ChevronLeft size={18} strokeWidth={2.5} /> Back to Jobs
          </button>
          <div style={S.modalHead}>
            <span style={S.modalTitle}>{jobDetail.job.job_number} — {jobDetail.job.customer || "No customer"}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="stk-btn"
                style={S.iconBtn}
                onClick={() => printJobSheet(jobDetail.job, jobDetail.processes, jobDetail.quoteItems, jobDetail.deliveryNotes)}
                title="Print job sheet"
              >
                <FileText size={18} />
              </button>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => openCopyJobModal(jobDetail.job)} title="Copy job">
                <Copy size={18} />
              </button>
            </div>
          </div>

          <div className="stk-meta-row" style={S.rowMeta}>
            <span>Sales rep: {jobDetail.job.sales_rep}</span>
            {jobDetail.job.due_date && <span>Due {new Date(jobDetail.job.due_date).toLocaleDateString()}</span>}
            {jobDetail.job.quote_reference && <span>Quote: {jobDetail.job.quote_reference}</span>}
            {jobDetail.job.customer_po && <span>Customer PO: {jobDetail.job.customer_po}</span>}
          </div>

          <div style={S.segRow}>
            {[
              { key: "overview", label: "Overview" },
              { key: "items", label: "Items" },
              { key: "invoice", label: "Invoice" },
              { key: "delivery", label: "Delivery" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                className="stk-btn"
                onClick={() => setJobDetailTab(t.key)}
                style={{
                  ...S.segBtn,
                  ...(jobDetailTab === t.key ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {jobDetailTab === "overview" && (
            <>
              {canEditThisJob && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>SigmaNest / laser job number</label>
                    <input
                      style={S.input}
                      defaultValue={jobDetail.job.laser_job_reference || ""}
                      onBlur={(e) => updateJobField(jobDetail.job.id, "laser_job_reference", e.target.value)}
                      placeholder="Often only known once nesting is done — fill in when it exists"
                    />
                  </div>
                  <SavedCheck fieldKey={`job-${jobDetail.job.id}-laser_job_reference`} />
                </div>
              )}

              {/* Editable here as well as on creation: a customer's PO
                  regularly turns up after the job has already started. */}
              {canEditThisJob && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>Customer PO</label>
                    <input
                      style={S.input}
                      defaultValue={jobDetail.job.customer_po || ""}
                      onBlur={(e) => updateJobField(jobDetail.job.id, "customer_po", e.target.value)}
                      placeholder="Their PO number — fill in when it arrives"
                    />
                  </div>
                  <SavedCheck fieldKey={`job-${jobDetail.job.id}-customer_po`} />
                </div>
              )}

            {jobDetail.quoteItems.length > 0 && (
              <div style={{ marginTop: 8, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
                <span style={{ fontWeight: 600 }}>
                  {jobDetail.quoteItems.reduce((sum, it) => sum + Math.max(Number(it.qty) - Number(it.qty_invoiced), 0), 0)} outstanding
                  {" "}(not yet invoiced)
                </span>
              </div>
            )}

            {canEditThisJob && (
              <div style={{ marginTop: 8 }}>
                <label style={S.label}>Status</label>
                <select
                  style={S.input}
                  value={jobDetail.job.status}
                  onChange={(e) => updateJobStatus(jobDetail.job.id, e.target.value)}
                >
                  <option value="in_progress">In Progress</option>
                  <option value="complete">Complete</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                {jobDetail.job.status === "complete" && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {(isAdmin || !!profile?.canManageInvoicing) && (
                      <button
                        type="button"
                        className="stk-btn"
                        style={S.reqActionBtnMuted}
                        onClick={() => invoiceNowFromList(jobDetail.job)}
                      >
                        <Check size={13} /> Invoice Now (all remaining)
                      </button>
                    )}
                    <button
                      type="button"
                      className="stk-btn"
                      style={S.reqActionBtn}
                      onClick={() => openMarkInvoicedModal(jobDetail.job)}
                    >
                      <Check size={13} /> Mark as Invoiced
                    </button>
                  </div>
                )}
              </div>
            )}

            {jobDetail.job.status === "invoiced" && (
              <div style={{ ...S.roleHint, marginTop: 8, color: C.accentFinished }}>
                Invoiced — #{jobDetail.job.invoice_number} — by {jobDetail.job.invoiced_by} on {new Date(jobDetail.job.invoiced_at).toLocaleDateString()}
              </div>
            )}

            {jobDetail.job.description && (
              <div style={{ ...S.roleHint, marginTop: 8 }}>{jobDetail.job.description}</div>
            )}

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={S.label}>Process checklist</label>
                  {/* Uses canEditThisJob rather than testing the lock
                      again, so the admin override actually reaches this
                      button. Gating it separately is what left an invoiced
                      job with no way to open the editor at all. */}
                  {(isAdmin || profile?.isSalesPerson) && canEditThisJob && (
                    <button
                      type="button"
                      className="stk-btn"
                      style={S.reqActionBtnMuted}
                      onClick={() => openEditProcessesModal(jobDetail.job, jobDetail.processes)}
                    >
                      <Pencil size={12} /> Edit processes
                      {editingLockedJob && " (invoiced)"}
                    </button>
                  )}
                </div>
                {jobDetailLoading && <div style={S.empty}>Loading…</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {/* The job's own stages only. A shortage's catch-up run
                      is stored against the same job, so without this the
                      two interleave and the checklist shows nesting twice
                      with no way to tell which is the job and which is the
                      re-cut. The runs get their own section below. */}
                  {inFlowOrder(jobDetail.processes.filter((p) => !p.shortage_id), jobDetail.job).map((p) => (
                    <div key={p.id} style={{ ...S.managerRow, alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...S.checkRow, fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={p.is_complete}
                            disabled={!canEditThisJob}
                            onChange={() => toggleJobProcessComplete(p, jobDetail.job)}
                          />
                          {p.process_name}
                        </label>
                        <SavedCheck fieldKey={`process-${p.id}`} />
                        {p.is_complete && (
                          <div style={{ ...S.roleHint, marginLeft: 22 }}>
                            {p.completed_by} — {new Date(p.completed_at).toLocaleString()}
                          </div>
                        )}
                        {p.tracking_mode === "each" && !p.is_complete && (
                          <div style={{ ...S.roleHint, marginLeft: 22 }}>Each-mode progress is tracked per item on the Production tab.</div>
                        )}
                        {/* Material set aside for this stage. Shown here as
                            well as on the operator's screen so whoever
                            reserved it can see it is still waiting. */}
                        {(() => {
                          const mine = (jobDetail.allocations || []).filter(
                            (a) => a.process_id === p.id && a.status !== "released"
                          );
                          if (mine.length === 0) return null;
                          return (
                            <div style={{ marginLeft: 22, marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                              {mine.map((a) => {
                                const outstanding = Number(a.qty_allocated) - Number(a.qty_used);
                                return (
                                  <div key={a.id} className="stk-meta-row" style={{ ...S.rowMeta, alignItems: "center" }}>
                                    <span style={{ color: outstanding > 0 ? C.accentRaw : C.muted }}>
                                      <Package size={11} /> {a.item_name} — {a.qty_used > 0 ? `${a.qty_used} of ${a.qty_allocated} used` : `${a.qty_allocated} reserved`}
                                    </span>
                                    {canEditThisJob && outstanding > 0 && (
                                      <button
                                        type="button"
                                        className="stk-btn"
                                        style={S.managerDelete}
                                        title="Release this material back"
                                        onClick={() => releaseAllocation(a)}
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        {canEditThisJob && !p.is_complete && (
                          <button
                            type="button"
                            className="stk-btn"
                            style={{ ...S.reqActionBtnMuted, marginLeft: 22, marginTop: 4 }}
                            onClick={() => { setAllocateModal({ job: jobDetail.job, process: p, item: null }); setAllocateQty(""); }}
                          >
                            <Package size={12} /> Allocate stock
                          </button>
                        )}
                        {canEditThisJob && (
                          <div style={{ display: "flex", gap: 6, marginTop: 4, marginLeft: 22, flexWrap: "wrap" }}>
                            <select
                              style={{ ...S.input, fontSize: 13.5, padding: "5px 8px", flex: "1 1 140px" }}
                              value={p.assigned_to || ""}
                              onChange={(e) => updateJobProcessAssignee(p, jobDetail.job, e.target.value)}
                            >
                              <option value="">Not assigned yet</option>
                              {(people || []).map((person) => (
                                <option key={person.id} value={person.id}>{person.name}</option>
                              ))}
                            </select>
                            <input
                              style={{ ...S.input, fontSize: 13.5, padding: "5px 8px", flex: "1 1 140px" }}
                              defaultValue={p.notes || ""}
                              onBlur={(e) => updateJobProcessField(p, "notes", e.target.value)}
                              placeholder="Notes"
                            />
                            <select
                              style={{ ...S.input, fontSize: 13.5, padding: "5px 8px", width: 100, flexShrink: 0 }}
                              value={p.tracking_mode || "batch"}
                              onChange={(e) => updateJobProcessField(p, "tracking_mode", e.target.value)}
                              title="Batch: one tick completes the whole line. Each: a running count against the item's quantity."
                            >
                              <option value="batch">Batch</option>
                              <option value="each">Each</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Each shortage's catch-up run, kept apart from the job's
                    own stages and grouped by shortage, so it is clear this
                    is a replacement part working its way back rather than
                    the job repeating itself. Read-only here — the floor
                    works these from Production, same as any other stage. */}
                {(() => {
                  const runs = jobDetail.processes.filter((p) => p.shortage_id);
                  if (runs.length === 0) return null;
                  const byShortage = {};
                  for (const p of runs) (byShortage[p.shortage_id] ||= []).push(p);
                  return Object.entries(byShortage).map(([sid, stages]) => {
                    const s = (shortagesList || []).find((x) => x.id === sid);
                    const done = stages.every((p) => p.is_complete);
                    return (
                      <div key={sid} style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                        <label style={{ ...S.label, color: done ? C.accentFinished : C.danger }}>
                          {done ? "✓" : "⚠"} Shortage re-cut
                          {s ? ` — ${shortageSummary(s)}` : ""}
                          {s && s.is_priority !== false && !done ? " · Priority" : ""}
                        </label>
                        {s && (
                          <div style={S.roleHint}>
                            Flagged by {s.flagged_by} at {s.flagged_department}
                            {done ? " — replacement complete." : " — replacement working back through the shop."}
                          </div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {inFlowOrder(stages, jobDetail.job).map((p) => (
                            <span
                              key={p.id}
                              style={{
                                ...S.reqStatusTag,
                                ...(p.is_complete ? S.reqStatus_received : S.reqStatus_ordered),
                              }}
                              title={p.is_complete ? `${p.completed_by} — ${new Date(p.completed_at).toLocaleString()}` : "Not done yet"}
                            >
                              {p.is_complete ? "✓ " : ""}{p.process_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={S.label}>Documents</label>
                  {canEditThisJob && (
                    <label className="stk-btn" style={{ ...S.reqActionBtnMuted, cursor: "pointer" }}>
                      <Upload size={12} /> Upload
                      <input
                        type="file"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) uploadJobDocument(jobDetail.job.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {jobDetail.documents
                    .filter((doc) => !doc.is_quote_file || isAdmin || profile?.isSalesPerson)
                    .map((doc) => (
                    <div key={doc.id} style={S.managerRow}>
                      <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, flex: 1, justifyContent: "flex-start" }} onClick={() => viewJobDocument(doc)}>
                        <Paperclip size={13} /> {doc.file_name}
                      </button>
                      {isAdmin && (
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => deleteJobDocument(doc)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  {jobDetail.documents.filter((doc) => !doc.is_quote_file || isAdmin || profile?.isSalesPerson).length === 0 && (
                    <div style={S.empty}>No documents yet.</div>
                  )}
                </div>
              </div>
            </>
          )}

          {jobDetailTab === "items" && (
            <>
            {jobDetail.quoteItems.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <label style={S.label}>Quoted items</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {jobDetail.quoteItems.map((it) => {
                    const remaining = Number(it.qty) - Number(it.qty_invoiced);
                    const linkedItem = it.linked_item_id ? (items || []).find((i) => i.id === it.linked_item_id) : null;
                    const revision = linkedItem?.partNumber ? drawingLookup[linkedItem.partNumber.trim()] : null;
                    const status = it.item_status || "on_floor";
                    const openDeliveryNote = jobDetail.deliveryNotes.find((dn) => dn.quote_item_id === it.id && !dn.checked_back_in_at);
                    const canActOnThis = canEditThisJob && remaining > 0 && status !== "out_external";
                    return (
                      <div key={it.id} style={S.managerRow}>
                        {canActOnThis && (
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            step="0.01"
                            value={invoiceQtyInputs[it.id] || ""}
                            onChange={(e) => setInvoiceQty(it.id, e.target.value)}
                            placeholder="Qty"
                            title={`Qty to invoice or deliver — up to ${remaining} remaining`}
                            style={{ ...S.input, width: 64, fontSize: 13.5, padding: "5px 6px", marginTop: 1 }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{it.qty}×</span>
                            {it.description}
                            <SavedCheck fieldKey={`quoteitem-${it.id}`} />
                            <SavedCheck fieldKey={`quoteitem-price-${it.id}`} />
                            {status === "out_external" && (
                              <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600, color: C.danger }}>Out — external</span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                            <span style={S.roleHint}>R{Number(it.unit_price).toFixed(2)} each</span>
                            <span style={S.roleHint}>— Invoiced {it.qty_invoiced} / {it.qty}</span>
                          </div>
                          {linkedItem && (
                            <div style={S.roleHint}>
                              Available: {linkedItem.qty}
                              {revision && (
                                <>
                                  {" "}
                                  — Our rev {revision.internalRevision ?? "—"}
                                  {revision.customerRevision ? `, customer rev ${revision.customerRevision}` : ""}
                                </>
                              )}
                            </div>
                          )}
                          {revision && canView("drawings") && (
                            <button
                              type="button"
                              className="stk-btn"
                              style={{ ...S.reqActionBtnMuted, marginTop: 4 }}
                              onClick={() => openDrawingPreviewByPartNumber(linkedItem.partNumber.trim())}
                            >
                              <FileText size={12} /> View drawing
                            </button>
                          )}
                          {status === "out_external" && openDeliveryNote && canEditThisJob && (
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                              <button
                                type="button"
                                className="stk-btn"
                                style={S.reqActionBtnMuted}
                                onClick={() => viewDeliveryNoteDocument(jobDetail.job, openDeliveryNote)}
                              >
                                <FileText size={13} /> View document
                              </button>
                              <button
                                type="button"
                                className="stk-btn"
                                style={S.reqActionBtn}
                                onClick={() => checkInDeliveryNote(jobDetail.job, openDeliveryNote, it)}
                              >
                                Check back in ({openDeliveryNote.delivery_note_number})
                              </button>
                            </div>
                          )}
                        </div>
                        {remaining <= 0 && (
                          <span style={{ ...S.roleHint, color: jobDetail.job.status === "invoiced" ? C.accentFinished : C.accentRaw }}>
                            {jobDetail.job.status === "invoiced" ? "Invoiced" : "Invoice requested — awaiting accounts"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {canEditThisJob && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="stk-btn"
                      style={{ ...S.submitBtn, flex: 1 }}
                      onClick={() => submitSelectedItemsToInvoice(jobDetail.job, jobDetail.quoteItems)}
                    >
                      Invoice
                    </button>
                    <button
                      type="button"
                      className="stk-btn"
                      style={{ ...S.submitBtn, flex: 1 }}
                      onClick={() => openBatchDeliveryNoteModal(jobDetail.job, jobDetail.quoteItems)}
                    >
                      <Truck size={13} /> Delivery Note
                    </button>
                  </div>
                )}
                {jobDetail.job.quoted_value != null && (
                  <div style={{ ...S.roleHint, marginTop: 6 }}>Quoted value: R {Number(jobDetail.job.quoted_value).toFixed(2)}</div>
                )}
              </div>
            )}
            </>
          )}

          {jobDetailTab === "delivery" && (
            <>
            {jobDetail.deliveryNotes.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <label style={S.label}>Delivery notes</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {Object.values(
                    jobDetail.deliveryNotes.reduce((groups, dn) => {
                      (groups[dn.delivery_note_number] = groups[dn.delivery_note_number] || []).push(dn);
                      return groups;
                    }, {})
                  ).map((group) => {
                    const first = group[0];
                    return (
                      <div key={first.delivery_note_number} style={S.reqCard}>
                        <div style={S.reqCardTop}>
                          <span style={S.itemName}>{first.delivery_note_number}</span>
                          <span style={S.roleHint}>{first.direction === "to_supplier" ? "To supplier" : "To customer"}</span>
                        </div>
                        <div style={S.roleHint}>{first.recipient_name}</div>
                        <div className="stk-meta-row" style={S.rowMeta}>
                          <span>Sent by {first.created_by}</span>
                          <span>{new Date(first.created_at).toLocaleDateString()}</span>
                        </div>
                        {group.map((dn) => (
                          <div key={dn.id} style={{ ...S.roleHint, marginTop: 4 }}>
                            {dn.checked_back_in_at
                              ? `✓ Received by ${dn.checked_back_in_by} on ${new Date(dn.checked_back_in_at).toLocaleString()}`
                              : dn.direction === "to_supplier"
                              ? "Not yet checked back in"
                              : null}
                          </div>
                        ))}
                        <button
                          type="button"
                          className="stk-btn"
                          style={{ ...S.reqActionBtnMuted, marginTop: 8 }}
                          onClick={() => viewDeliveryNoteDocument(jobDetail.job, first)}
                        >
                          <FileText size={13} /> View document
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </>
          )}

          {jobDetailTab === "invoice" && (
            <>
            {(() => {
              const requestsForJob = jobInvoiceRequests.filter((r) => r.job_id === jobDetail.job.id);
              if (requestsForJob.length === 0) return null;
              return (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <label style={S.label}>Invoice requests</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {requestsForJob.map((req) => (
                      <div key={req.id} style={S.reqCard}>
                        <div style={S.reqCardTop}>
                          <span style={S.itemName}>{req.file_name}</span>
                          {req.total_amount != null && <span style={S.roleHint}>R {Number(req.total_amount).toFixed(2)}</span>}
                        </div>
                        <div className="stk-meta-row" style={S.rowMeta}>
                          <span>Submitted by {req.submitted_by}</span>
                          <span>{new Date(req.submitted_at).toLocaleDateString()}</span>
                        </div>
                        <button
                          type="button"
                          className="stk-btn"
                          style={{ ...S.reqActionBtnMuted, marginTop: 8 }}
                          onClick={() => viewJobInvoiceRequest(req)}
                        >
                          <FileText size={13} /> View document
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            </>
          )}

          {jobDetailTab === "items" && (
            <>
            {(() => {
              const materialsUsed = (usageLog || []).filter(
                (u) => u.direction === "use" && u.jobNumber === jobDetail.job.job_number
              );
              if (materialsUsed.length === 0) return null;
              const totalCost = materialsUsed.reduce((sum, u) => sum + Number(u.lineCost || 0), 0);
              return (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <label style={S.label}>Materials used</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {materialsUsed.map((u) => (
                      <div key={u.id} style={S.managerRow}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14 }}>{u.itemName}</div>
                          <div style={S.roleHint}>
                            {u.qty} — R{Number(u.lineCost || 0).toFixed(2)} — {u.by} on {new Date(u.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ ...S.roleHint, marginTop: 6, fontWeight: 600 }}>Total actual cost: R {totalCost.toFixed(2)}</div>
                  {jobDetail.job.quoted_value != null && (
                    <div style={S.roleHint}>
                      Quoted R {Number(jobDetail.job.quoted_value).toFixed(2)} vs actual R {totalCost.toFixed(2)} — {" "}
                      {totalCost <= Number(jobDetail.job.quoted_value)
                        ? `R ${(Number(jobDetail.job.quoted_value) - totalCost).toFixed(2)} under`
                        : `R ${(totalCost - Number(jobDetail.job.quoted_value)).toFixed(2)} over`}
                    </div>
                  )}
                </div>
              );
            })()}
            </>
          )}
        </div>
      )}

      {showAddStockItemModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Add Customer Stock Item</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setShowAddStockItemModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Part number</label>
              <input style={S.input} value={scForm.stockCode} onChange={(e) => setScForm({ ...scForm, stockCode: e.target.value })} autoFocus />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Description</label>
              <input style={S.input} value={scForm.description} onChange={(e) => setScForm({ ...scForm, description: e.target.value })} />
            </div>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Unit price (R)</label>
                <input style={S.input} type="number" step="0.01" value={scForm.price} onChange={(e) => setScForm({ ...scForm, price: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Low stock warning at</label>
                <input style={S.input} type="number" value={scForm.recommendedStock} onChange={(e) => setScForm({ ...scForm, recommendedStock: e.target.value })} />
              </div>
            </div>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Customer revision (optional)</label>
                <input style={S.input} value={scForm.revision} onChange={(e) => setScForm({ ...scForm, revision: e.target.value })} placeholder="e.g. A" />
              </div>
              <div>
                <label style={S.label}>Customer</label>
                <select style={S.input} value={scForm.customer} onChange={(e) => setScForm({ ...scForm, customer: e.target.value })}>
                  <option value="">None</option>
                  {master.customers.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={S.roleHint}>
              This creates a real Customer Stock item at qty 0 — it won't show on the main Customer Stock tab until it
              actually has stock, but it's real, searchable, and can have a drawing linked to it right away.
            </div>
            <button
              type="button"
              className="stk-btn"
              style={S.submitBtn}
              onClick={() => {
                addStockCodeRow();
                setShowAddStockItemModal(false);
              }}
            >
              Add Item
            </button>
          </div>
        </div>
      )}

      {shortageModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Flag Shortage</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setShortageModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>
              {shortageModal.job.job_number} — {shortageModal.job.customer || "No customer"}. Sends this straight to Nesting to get
              re-cut — fill in enough that the laser operator knows exactly what to cut and how many.
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>SigmaNest job number</label>
              <input
                style={S.input}
                value={shortageModal.boardNumber}
                onChange={(e) => setShortageModal((m) => ({ ...m, boardNumber: e.target.value }))}
                placeholder="Not recorded on this job yet"
                autoFocus
              />
              {shortageModal.job.laser_job_reference && (
                <div style={S.roleHint}>Taken from the job — change it if this came off a different nest.</div>
              )}
            </div>

            {/* One row per missing part. Several parts short off the same
                nest is one shortage to be re-cut together, so they belong
                on one flag rather than three. */}
            <div style={{ marginTop: 8 }}>
              <label style={S.label}>What's missing</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {shortageModal.lines.map((l, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      style={{ ...S.input, flex: 1 }}
                      value={l.description}
                      onChange={(e) =>
                        setShortageModal((m) => ({
                          ...m,
                          lines: m.lines.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                        }))
                      }
                      placeholder="What part needs to be cut"
                    />
                    <span style={{ color: C.muted, fontSize: 13 }}>×</span>
                    <input
                      style={{ ...S.input, width: 80, flexShrink: 0 }}
                      type="number"
                      min="1"
                      value={l.qty}
                      onChange={(e) =>
                        setShortageModal((m) => ({
                          ...m,
                          lines: m.lines.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)),
                        }))
                      }
                      placeholder="Qty"
                    />
                    {/* accept="image/*" alone, with no capture attribute:
                        a phone then offers both the camera and the gallery,
                        so a part already photographed is not made to be
                        photographed again. */}
                    <label
                      className="stk-btn"
                      style={{ ...S.managerDelete, cursor: "pointer", color: l.photo ? C.accentRaw : C.muted }}
                      title={l.photo ? `Photo attached: ${l.photoName || "photo"} — click to replace` : "Attach a photo of this part"}
                    >
                      {l.photo ? <ImageIcon size={14} /> : <Paperclip size={14} />}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          e.target.value = "";
                          if (!file) return;
                          uploadShortagePhoto(shortageModal.job.id, file, (path) =>
                            setShortageModal((m) => ({
                              ...m,
                              lines: m.lines.map((x, i) => (i === idx ? { ...x, photo: path, photoName: file.name } : x)),
                            }))
                          );
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="stk-btn"
                      style={{ ...S.managerDelete, opacity: shortageModal.lines.length === 1 ? 0.25 : 1 }}
                      disabled={shortageModal.lines.length === 1}
                      title="Remove this line"
                      onClick={() => setShortageModal((m) => ({ ...m, lines: m.lines.filter((_, i) => i !== idx) }))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="stk-btn"
                style={{ ...S.addBtn, marginTop: 6 }}
                onClick={() => setShortageModal((m) => ({ ...m, lines: [...m.lines, { description: "", qty: "" }] }))}
              >
                <Plus size={15} strokeWidth={2.5} /> Add another part
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Reason</label>
                <select
                  style={S.input}
                  value={shortageModal.reason}
                  onChange={(e) => setShortageModal((m) => ({ ...m, reason: e.target.value }))}
                >
                  <option value="short">Short (not enough cut)</option>
                  <option value="damaged">Damaged</option>
                  <option value="lost">Lost / misplaced</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            {/* On by default. A shortage is work that was supposed to be
                finished, so it normally jumps the queue — the exception is
                one that genuinely can wait, and that is worth saying out
                loud rather than leaving everything marked urgent until
                urgent stops meaning anything. */}
            <label style={{ ...S.checkRow, marginTop: 10, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={shortageModal.isPriority}
                onChange={(e) => setShortageModal((m) => ({ ...m, isPriority: e.target.checked }))}
              />
              Priority — cut this ahead of other work
            </label>
            {!shortageModal.isPriority && (
              <div style={{ marginTop: 6 }}>
                <label style={S.label}>Why can this one wait? (optional)</label>
                <input
                  style={S.input}
                  value={shortageModal.priorityNote}
                  onChange={(e) => setShortageModal((m) => ({ ...m, priorityNote: e.target.value }))}
                  placeholder="e.g. customer collecting next month"
                />
              </div>
            )}
            <button
              type="button"
              className="stk-btn"
              style={S.submitBtn}
              disabled={!shortageModal.lines.some((l) => (l.description || "").trim() && Number(l.qty) > 0)}
              onClick={submitNewShortage}
            >
              Flag Shortage
            </button>
          </div>
        </div>
      )}

      {copyJobModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Copy {copyJobModal.job.job_number}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setCopyJobModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>
              Creates a new job with the same customer, description, materials, processes, and quoted items — everything
              starts fresh: a new job number, no progress ticked, nothing invoiced yet.
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Due date (optional)</label>
              <input
                type="date"
                style={S.input}
                value={copyJobModal.dueDate}
                onChange={(e) => setCopyJobModal((m) => ({ ...m, dueDate: e.target.value }))}
              />
            </div>
            <button type="button" className="stk-btn" style={S.submitBtn} onClick={submitCopyJob}>
              Create Copy
            </button>
          </div>
        </div>
      )}

      {editProcessesModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Edit processes — {editProcessesModal.job.job_number}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setEditProcessesModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>
              Check what this job needs. Unchecking removes a process — completed ones can't be removed. Anything outlined in
              red needs attention: it's either on the job twice, or no longer in Job Process Types.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {/* The list of types, plus anything this job already has that
                  is no longer in it. Looping over the master list alone
                  meant a stage whose type had since been deleted was never
                  drawn — so it could not be unticked, could not be removed,
                  and could not appear in Production either. The job was
                  stuck with a stage nothing could reach. */}
              {[
                ...master.jobProcessTypes,
                ...(jobDetail?.processes || [])
                  .filter((p) => !p.shortage_id && !master.jobProcessTypes.includes(p.process_name))
                  .map((p) => p.process_name),
              ]
                .filter((name, i, all) => all.indexOf(name) === i)
                .map((name) => {
                const jobStages = (jobDetail?.processes || []).filter((p) => !p.shortage_id && p.process_name === name);
                const existingProcess = jobStages[0];
                const orphaned = !master.jobProcessTypes.includes(name);
                // Two rows for the same stage stall a job: both have to be
                // completed before it can move on. Worth saying, because
                // the buttons themselves can't show it.
                const duplicated = jobStages.length > 1;
                // A completed stage is protected from being removed by
                // accident, but an admin has to be able to clear one:
                // a job left carrying a stage from an old process list is
                // otherwise unrepairable, which is worse than the risk the
                // lock guards against. Still confirmed before it saves.
                const locked = existingProcess?.is_complete && !isAdmin;
                const checked = editProcessesModal.selected.has(name);
                return (
                  <button
                    type="button"
                    key={name}
                    className="stk-btn"
                    disabled={locked}
                    onClick={() => toggleEditProcessesSelection(name)}
                    title={
                      locked
                        ? "Already marked complete — can't be removed here"
                        : existingProcess?.is_complete
                        ? "Already marked complete. As an admin you can still untick it — the completion is lost."
                        : orphaned
                        ? "This stage is on the job but no longer in Job Process Types. Untick it to take it off the job."
                        : duplicated
                        ? `This job has ${jobStages.length} of these. Untick and save to remove them all, then tick it again to put one back.`
                        : undefined
                    }
                    style={{
                      ...S.segBtn,
                      ...(checked ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                      ...(locked ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                      ...(orphaned || duplicated ? { borderColor: C.danger } : {}),
                    }}
                  >
                    {name}
                    {duplicated && ` ×${jobStages.length}`}
                    {orphaned && " (not in list)"}
                    {locked && " 🔒"}
                  </button>
                );
              })}
            </div>
            <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 14 }} onClick={saveEditProcesses}>
              Save
            </button>
          </div>
        </div>
      )}

      {markInvoicedModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Mark {markInvoicedModal.job.job_number} as Invoiced</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setMarkInvoicedModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>Make sure the real invoice has already been created in Sage before entering its number here.</div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Invoice number</label>
              <input
                style={S.input}
                value={markInvoicedModal.invoiceNumber}
                onChange={(e) => setMarkInvoicedModal((m) => ({ ...m, invoiceNumber: e.target.value }))}
                placeholder="e.g. INV-4471"
                autoFocus
              />
            </div>
            <button type="button" className="stk-btn" style={S.submitBtn} onClick={submitMarkInvoiced}>
              Mark as Invoiced
            </button>
          </div>
        </div>
      )}

      {deliveryNoteBatchModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Create Delivery Note</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setDeliveryNoteBatchModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>
              {deliveryNoteBatchModal.itemsWithQty.map(({ item, qty }) => `${qty} × ${item.description}`).join(", ")}
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Going to</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="stk-btn"
                  style={{ ...S.segBtn, ...(deliveryNoteBatchModal.direction === "to_supplier" ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}) }}
                  onClick={() => setDeliveryNoteBatchModal((m) => ({ ...m, direction: "to_supplier", recipientName: "" }))}
                >
                  External supplier
                </button>
                <button
                  type="button"
                  className="stk-btn"
                  style={{ ...S.segBtn, ...(deliveryNoteBatchModal.direction === "to_customer" ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}) }}
                  onClick={() => setDeliveryNoteBatchModal((m) => ({ ...m, direction: "to_customer", recipientName: m.job.customer || "" }))}
                >
                  Customer
                </button>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>{deliveryNoteBatchModal.direction === "to_supplier" ? "Supplier" : "Recipient name"}</label>
              {deliveryNoteBatchModal.direction === "to_supplier" ? (
                <select
                  style={S.input}
                  value={deliveryNoteBatchModal.recipientName}
                  onChange={(e) => setDeliveryNoteBatchModal((m) => ({ ...m, recipientName: e.target.value }))}
                >
                  <option value="">Select a supplier…</option>
                  {master.suppliers.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  style={S.input}
                  value={deliveryNoteBatchModal.recipientName}
                  onChange={(e) => setDeliveryNoteBatchModal((m) => ({ ...m, recipientName: e.target.value }))}
                />
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Notes (optional)</label>
              <input
                style={S.input}
                value={deliveryNoteBatchModal.notes}
                onChange={(e) => setDeliveryNoteBatchModal((m) => ({ ...m, notes: e.target.value }))}
              />
            </div>
            <button type="button" className="stk-btn" style={S.submitBtn} onClick={submitBatchDeliveryNote}>
              Create & Print Delivery Note
            </button>
          </div>
        </div>
      )}

      {showStockImportModal && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Import / Export Customer Stock</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setShowStockImportModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Customer</label>
              <select style={S.input} value={importCustomer} onChange={(e) => setImportCustomer(e.target.value)}>
                <option value="">Select a customer — required to import</option>
                {master.customers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div style={{ ...S.managerAddRow, marginTop: 10 }}>
              <label
                className="stk-btn"
                style={{ ...S.addBtn, flex: 1, cursor: importCustomer ? "pointer" : "not-allowed", opacity: importCustomer ? 1 : 0.5 }}
              >
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: "none" }}
                  onChange={handleImportFile}
                  disabled={!importCustomer}
                />
                Import Excel
              </label>
              <button type="button" className="stk-btn" style={S.roleChip} onClick={exportStockCodes}>
                <Download size={13} />
                Export
              </button>
            </div>
            {importFileLabel && <div style={{ fontFamily: F.mono, fontSize: 12.5, color: C.muted, marginTop: 4 }}>{importFileLabel}</div>}
            <label style={{ ...S.checkRow, marginTop: 8 }}>
              <input type="checkbox" checked={importReplaceAll} onChange={(e) => setImportReplaceAll(e.target.checked)} />
              Replace the whole list with this file, instead of updating/adding
            </label>
            {importReplaceAll && (
              <div style={{ ...S.roleHint, color: C.danger }}>
                Every zero-stock catalog item not in this file will be deleted — anything with real stock on hand is
                always kept regardless. Use this for a full refresh, not for adding a few extra items.
              </div>
            )}
            <div style={S.roleHint}>
              Imports the first sheet, matching columns containing "stock code", "description", "price", and "recommended"/"reorder". Test with a
              small file first.
              {!importReplaceAll && " Existing parts with a matching part number get updated, not duplicated — and their quantity is never touched."}
            </div>
          </div>
        </div>
      )}

      {newStockItemModal && (
        // Higher z-index than the standard modal overlay — this can open
        // while the New Job modal is already open behind it, and without
        // this, the later-rendered New Job overlay paints on top and hides
        // this one completely even though it's genuinely open.
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Add to Customer Stock</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setNewStockItemModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Part number (required — needed to link drawings/revisions later)</label>
              <input
                style={S.input}
                value={newStockItemModal.partNumber}
                onChange={(e) => setNewStockItemModal((m) => ({ ...m, partNumber: e.target.value }))}
                autoFocus
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Name</label>
              <input
                style={S.input}
                value={newStockItemModal.name}
                onChange={(e) => setNewStockItemModal((m) => ({ ...m, name: e.target.value }))}
              />
            </div>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Price</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={newStockItemModal.value}
                  onChange={(e) => setNewStockItemModal((m) => ({ ...m, value: e.target.value }))}
                />
              </div>
              <div>
                <label style={S.label}>Location (optional)</label>
                <input
                  style={S.input}
                  value={newStockItemModal.loc}
                  onChange={(e) => setNewStockItemModal((m) => ({ ...m, loc: e.target.value }))}
                />
              </div>
            </div>
            <button type="button" className="stk-btn" style={S.submitBtn} onClick={submitNewStockItemFromJob}>
              Add to Customer Stock
            </button>
          </div>
        </div>
      )}

      {showNewJob && newJobForm && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>New Job</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeNewJob}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Customer</label>
              <select
                style={S.input}
                value={newJobForm.customer === CUSTOM ? CUSTOM : newJobForm.customer}
                onChange={(e) => setNewJobForm((f) => ({ ...f, customer: e.target.value }))}
              >
                <option value="">Select a customer…</option>
                {master.customers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value={CUSTOM}>+ Add new customer…</option>
              </select>
              {newJobForm.customer === CUSTOM && (
                <div style={{ marginTop: 8, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <input
                    style={S.input}
                    value={newJobForm.newCustomerName}
                    onChange={(e) => setNewJobForm((f) => ({ ...f, newCustomerName: e.target.value }))}
                    placeholder="Customer name"
                  />
                  <div style={{ ...S.formGrid, marginTop: 8 }}>
                    <input
                      style={S.input}
                      value={newJobForm.newCustomerContactName}
                      onChange={(e) => setNewJobForm((f) => ({ ...f, newCustomerContactName: e.target.value }))}
                      placeholder="Contact person (optional)"
                    />
                    <input
                      style={S.input}
                      type="email"
                      value={newJobForm.newCustomerContactEmail}
                      onChange={(e) => setNewJobForm((f) => ({ ...f, newCustomerContactEmail: e.target.value }))}
                      placeholder="Contact email (optional)"
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Description (optional)</label>
              <input
                style={S.input}
                value={newJobForm.description}
                onChange={(e) => setNewJobForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What this job is"
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Quote (optional)</label>
              <label className="stk-btn" style={{ ...S.addBtn, cursor: "pointer", justifyContent: "center", width: "100%" }}>
                <Upload size={13} /> {newJobForm.quoteExcelFile ? newJobForm.quoteExcelFile.name : "Upload Quote Excel"}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsm,.csv"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files[0] || null;
                      setNewJobForm((f) => ({ ...f, quoteExcelFile: file }));
                      if (!file) return;
                      try {
                        const parsed = await parseQuoteExcelFile(file);
                        const matchedCustomer = master.customers.find((c) => c.toLowerCase() === parsed.customer.toLowerCase());
                        setNewJobForm((f) => ({
                          ...f,
                          customer: matchedCustomer || CUSTOM,
                          newCustomerName: matchedCustomer ? "" : parsed.customer,
                          newCustomerContactName: matchedCustomer ? f.newCustomerContactName : parsed.contact,
                          quoteReference: parsed.quoteNumber || f.quoteReference,
                          quoteItems: parsed.quoteItems.map((it) => {
                            // Same match as manual entry uses on blur — exact
                            // name match within the same customer's existing
                            // Customer Stock. Doing it here too means an
                            // imported item with a drawing already on file
                            // picks it up automatically, instead of only
                            // working when someone types the item by hand.
                            const stockMatch = matchedCustomer
                              ? (items || []).find(
                                  (si) => si.mainCat === "custom" && si.customer === matchedCustomer && si.name.trim().toLowerCase() === it.description.trim().toLowerCase()
                                )
                              : null;
                            return {
                              id: uid(),
                              description: it.description,
                              qty: String(it.qty),
                              unitPrice: String(it.unitPrice),
                              priceNeedsReview: it.priceNeedsReview,
                              linkedItemId: stockMatch?.id || null,
                            };
                          }),
                        }));
                        const reviewFlags = parsed.quoteItems.filter((it) => it.priceNeedsReview).length;
                        alert(
                          `Pulled ${parsed.quoteItems.length} item(s) from the quote — check everything below before saving, especially the prices.` +
                            (reviewFlags ? `\n\n${reviewFlags} item(s) had a price that couldn't be read and were left blank — fill those in manually.` : "")
                        );
                      } catch (err) {
                        alert(typeof err === "string" ? err : "Couldn't read that file — fill in the job details manually.");
                      }
                    }}
                  />
              </label>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Due date</label>
              <input
                type="date"
                style={S.input}
                value={newJobForm.dueDate}
                onChange={(e) => setNewJobForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>

            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Quote reference (optional)</label>
                <input
                  style={S.input}
                  value={newJobForm.quoteReference}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, quoteReference: e.target.value }))}
                  placeholder="e.g. JOB-31513 or QU226331"
                />
              </div>
              <div>
                <label style={S.label}>Customer PO (optional)</label>
                <input
                  style={S.input}
                  value={newJobForm.customerPo}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, customerPo: e.target.value }))}
                  placeholder="Their PO number — often arrives later"
                />
              </div>
              <div>
                <label style={S.label}>Laser job reference (optional)</label>
                <input
                  style={S.input}
                  value={newJobForm.laserJobReference}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, laserJobReference: e.target.value }))}
                  placeholder="SigmaNest reference"
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Buy-out notes (optional)</label>
              <input
                style={S.input}
                value={newJobForm.buyOutNotes}
                onChange={(e) => setNewJobForm((f) => ({ ...f, buyOutNotes: e.target.value }))}
              />
            </div>

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={S.label}>Quoted items (optional)</label>
                <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={addNewJobQuoteItem}>
                  <Plus size={12} /> Add line
                </button>
              </div>
              {newJobForm.quoteItems.map((it, idx) => {
                const linkedItem = it.linkedItemId ? (items || []).find((i) => i.id === it.linkedItemId) : null;
                const revision = linkedItem?.partNumber ? drawingLookup[linkedItem.partNumber.trim()] : null;
                const q = it.description.trim().toLowerCase();
                const suggestions =
                  newJobItemSuggestOpen === idx && q
                    ? (items || [])
                        .filter(
                          (si) =>
                            si.mainCat === "custom" &&
                            si.customer === newJobForm.customer &&
                            ((si.partNumber || "").toLowerCase().includes(q) || si.name.toLowerCase().includes(q))
                        )
                        .slice(0, 8)
                    : [];
                return (
                  <div key={idx} style={{ marginTop: 6 }}>
                    {it.priceNeedsReview && (
                      <div style={{ ...S.roleHint, color: C.danger, marginBottom: 2 }}>
                        ⚠ Price couldn't be read from the quote — check and fill in manually
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ position: "relative", flex: 2 }}>
                        <input
                          style={S.input}
                          value={it.description}
                          onChange={(e) => {
                            updateNewJobQuoteItem(idx, "description", e.target.value);
                            setNewJobItemSuggestOpen(idx);
                          }}
                          onFocus={() => setNewJobItemSuggestOpen(idx)}
                          onBlur={() => {
                            matchNewJobQuoteItemToStock(idx);
                            // Slight delay so a tap on a suggestion below
                            // registers (via onMouseDown) before this closes
                            // the list out from under it.
                            setTimeout(() => setNewJobItemSuggestOpen((v) => (v === idx ? null : v)), 150);
                          }}
                          placeholder="Part number or description — start typing to match Customer Stock…"
                        />
                        {suggestions.length > 0 && (
                          <div style={S.suggestDropdown}>
                            {suggestions.map((si) => (
                              <button
                                key={si.id}
                                type="button"
                                className="stk-btn"
                                style={S.suggestItem}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  selectNewJobQuoteItemSuggestion(idx, si);
                                }}
                              >
                                <span style={{ fontWeight: 600 }}>{si.partNumber || "—"}</span>
                                <span style={{ color: C.muted }}> — {si.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        style={{ ...S.input, width: 60 }}
                        type="number"
                        min="0"
                        value={it.qty}
                        onChange={(e) => updateNewJobQuoteItem(idx, "qty", e.target.value)}
                        placeholder="Qty"
                      />
                      <input
                        style={{ ...S.input, width: 80 }}
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unitPrice}
                        onChange={(e) => updateNewJobQuoteItem(idx, "unitPrice", e.target.value)}
                        placeholder="Unit R"
                      />
                      <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeNewJobQuoteItem(idx)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div style={{ ...S.roleHint, marginTop: 2 }}>
                      {linkedItem ? (
                        <>
                          Linked to Customer Stock — Available: {linkedItem.qty}
                          {revision && (
                            <>
                              {" "}
                              — Our rev {revision.internalRevision ?? "—"}
                              {revision.customerRevision ? `, customer rev ${revision.customerRevision}` : ""}
                            </>
                          )}
                        </>
                      ) : it.description.trim() && newJobForm.customer && newJobForm.customer !== CUSTOM ? (
                        <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => addNewJobQuoteItemToStockManager(idx)}>
                          <Plus size={11} /> Not in Customer Stock — add it
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 10 }}>
                <label style={S.label}>Quoted value (optional)</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={newJobForm.quotedValue}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, quotedValue: e.target.value }))}
                  placeholder="Total quoted value, for comparing against actual cost later"
                />
              </div>
            </div>

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <label style={S.label}>Which processes does this job need?</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {master.jobProcessTypes.map((p) => (
                  <button
                    type="button"
                    key={p}
                    className="stk-btn"
                    onClick={() => toggleNewJobProcess(p)}
                    style={{
                      ...S.segBtn,
                      ...(newJobForm.selectedProcesses.some((sp) => sp.name === p) ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {newJobForm.selectedProcesses.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {/* No per-job reordering. The sequence is the factory
                      flow and nothing else, so it cannot drift from the
                      list: change the flow in Stock Manager and every job
                      follows, new or already running. */}
                  <div style={S.roleHint}>
                    Numbered in the order work moves through the shop — each stage opens up as the one before it is completed. This is the
                    factory flow set in Stock Manager, and it applies to every job. To change it, change it there.
                  </div>
                  {newJobForm.selectedProcesses.map((sp, idx) => (
                    <div key={sp.name} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, color: C.muted, flexShrink: 0, minWidth: 16 }}>{idx + 1}.</span>
                        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{sp.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                        <select
                          style={{ ...S.input, flex: "1 1 180px" }}
                          value={sp.assignedToId || ""}
                          onChange={(e) => updateNewJobProcessAssignee(sp.name, e.target.value)}
                        >
                          <option value="">Not assigned yet</option>
                          {(people || []).map((person) => (
                            <option key={person.id} value={person.id}>{person.name}</option>
                          ))}
                        </select>
                        <select
                          style={{ ...S.input, width: 110, flexShrink: 0 }}
                          value={sp.trackingMode}
                          onChange={(e) => updateNewJobProcessTrackingMode(sp.name, e.target.value)}
                          title="Batch: one tick completes the whole line. Each: a running count against the item's quantity."
                        >
                          <option value="batch">Batch</option>
                          <option value="each">Each</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="stk-btn"
              style={{ ...S.submitBtn, ...(jobSubmitting ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
              onClick={submitNewJob}
              disabled={jobSubmitting}
            >
              {jobSubmitting ? "Creating…" : "Create Job"}
            </button>
          </div>
        </div>
      )}

      {receivingPo && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Receive {receivingPo.poNumber}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeReceiving}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>{receivingPo.supplierName || "No supplier"}</div>

            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Supplier delivery note number</label>
              <input
                style={S.input}
                value={receivingDeliveryNote}
                onChange={(e) => setReceivingDeliveryNote(e.target.value)}
                placeholder="e.g. DN-88213"
              />
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {receivingLines.map((line, idx) => {
                const isAdjusting = receivingAdjustingIdx === idx;
                const qtyDiffers = Number(line.receivedQty) !== Number(line.orderedQty);
                return (
                  <div key={idx} style={S.managerRow}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                      <span style={{ fontSize: 14 }}>{line.description}</span>
                      <span style={{ fontSize: 12.5, color: line.linkedItemId ? C.accentFinished : C.danger }}>
                        {line.linkedItemId ? "Linked to stock — will update automatically" : "No linked stock item — won't auto-update, add manually"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12.5, color: C.muted }}>Ordered {line.orderedQty}</span>
                      {isAdjusting ? (
                        <input
                          autoFocus
                          type="number"
                          step="any"
                          min="0"
                          value={line.receivedQty}
                          onChange={(e) => updateReceivingLineQty(idx, e.target.value)}
                          onBlur={() => setReceivingAdjustingIdx(null)}
                          style={{ ...S.managerFactorInput, width: 60 }}
                          title="Quantity actually received"
                        />
                      ) : (
                        <>
                          <span style={{ fontSize: 14, fontWeight: 600, color: qtyDiffers ? C.accentRaw : C.text }}>
                            Received {line.receivedQty}
                          </span>
                          <button
                            type="button"
                            className="stk-btn"
                            style={S.reqActionBtnMuted}
                            onClick={() => setReceivingAdjustingIdx(idx)}
                          >
                            Adjust
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button type="button" className="stk-btn" style={S.submitBtn} onClick={submitReceiving}>
              Confirm receipt
            </button>
          </div>
        </div>
      )}

      {showPoReport && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Generate PO Report</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setShowPoReport(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>A summary table of Purchase Orders for the range and supplier you choose — one PDF, ready to download.</div>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>From</label>
                <input type="date" style={S.input} value={poReportFrom} onChange={(e) => setPoReportFrom(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>To</label>
                <input type="date" style={S.input} value={poReportTo} onChange={(e) => setPoReportTo(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Supplier</label>
              <select style={S.input} value={poReportSupplier} onChange={(e) => setPoReportSupplier(e.target.value)}>
                <option value="">All suppliers</option>
                {master.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Status</label>
              <select style={S.input} value={poReportStatus} onChange={(e) => setPoReportStatus(e.target.value)}>
                <option value="">Outstanding &amp; Received</option>
                <option value="outstanding">Outstanding only</option>
                <option value="received">Received only</option>
              </select>
            </div>
            <button type="button" className="stk-btn" style={S.submitBtn} onClick={generatePoReport}>
              Generate report
            </button>
          </div>
        </div>
      )}

      {poBuilder && (
        <div style={S.modalOverlay}>
          <form style={{ ...S.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()} onSubmit={submitPurchaseOrder}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Raise Purchase Order</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closePoBuilder}>
                <X size={18} />
              </button>
            </div>

            <label style={S.label}>Supplier</label>
            <select
              style={S.input}
              value={poBuilder.supplierId}
              onChange={(e) => setPoBuilder((b) => ({ ...b, supplierId: e.target.value }))}
              required
            >
              <option value="">Select a supplier…</option>
              {master.suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {master.suppliers.length === 0 && (
              <div style={{ ...S.roleHint, marginTop: 6 }}>
                No suppliers set up yet — add one in Stock Manager → Suppliers first.
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <label style={S.label}>Line items</label>
              {poBuilder.lineItems.map((li, idx) => (
                <div key={idx} style={S.poLineRow}>
                  <input
                    style={{ ...S.input, flex: 3 }}
                    value={li.description}
                    onChange={(e) => updatePoLineItem(idx, "description", e.target.value)}
                    placeholder="Description"
                  />
                  <input
                    style={{ ...S.input, flex: 1 }}
                    type="number"
                    min="0"
                    value={li.qty}
                    onChange={(e) => updatePoLineItem(idx, "qty", e.target.value)}
                    placeholder="Qty"
                  />
                  <input
                    style={{ ...S.input, flex: 1 }}
                    type="number"
                    step="0.01"
                    min="0"
                    value={li.unitPrice}
                    onChange={(e) => updatePoLineItem(idx, "unitPrice", e.target.value)}
                    placeholder="R each"
                  />
                  <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removePoLineItem(idx)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 6 }} onClick={addPoLineItem}>
                <Plus size={13} /> Add line
              </button>
            </div>

            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Reference (job number)</label>
                <input
                  style={S.input}
                  value={poBuilder.reference}
                  onChange={(e) => setPoBuilder((b) => ({ ...b, reference: e.target.value }))}
                  placeholder="e.g. Job #4471"
                />
              </div>
              <div>
                <label style={S.label}>Sales person</label>
                <div style={{ ...S.input, display: "flex", alignItems: "center", color: C.muted }}>{roleLabel}</div>
              </div>
            </div>

            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Delivery date (optional)</label>
                <input
                  type="date"
                  style={S.input}
                  value={poBuilder.deliveryDate}
                  onChange={(e) => setPoBuilder((b) => ({ ...b, deliveryDate: e.target.value }))}
                />
              </div>
              <div>
                <label style={S.label}>VAT %</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  style={S.input}
                  value={poBuilder.vatRate}
                  onChange={(e) => setPoBuilder((b) => ({ ...b, vatRate: e.target.value }))}
                />
              </div>
            </div>

            {(() => {
              const exclusiveTotal = poBuilder.lineItems.reduce((sum, li) => sum + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0), 0);
              const vatRate = Number(poBuilder.vatRate) || 0;
              const vatTotal = exclusiveTotal * (vatRate / 100);
              return (
                <div style={S.poTotalRow}>
                  Exclusive: R{exclusiveTotal.toFixed(2)} &nbsp;+&nbsp; VAT: R{vatTotal.toFixed(2)} &nbsp;=&nbsp; Total: R{(exclusiveTotal + vatTotal).toFixed(2)}
                </div>
              );
            })()}

            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Notes (optional)</label>
              <input
                style={S.input}
                value={poBuilder.notes}
                onChange={(e) => setPoBuilder((b) => ({ ...b, notes: e.target.value }))}
                placeholder="e.g. delivery instructions"
              />
            </div>

            <button type="submit" style={S.submitBtn} className="stk-btn">
              Generate PDF & Save
            </button>
          </form>
        </div>
      )}

      {showLowStock && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Low stock — {lowCount}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setShowLowStock(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.managerList}>
              {Object.entries(
                lowStockItems.reduce((acc, it) => {
                  const label = TABS.find((t) => t.key === it.mainCat)?.label || it.mainCat;
                  (acc[label] = acc[label] || []).push(it);
                  return acc;
                }, {})
              )
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([label, list]) => (
                  <div key={label}>
                    <div style={S.managerGroupHeader}>{label} · {list.length}</div>
                    {list
                      .sort((a, b) => Number(a.qty) - Number(b.qty))
                      .map((it) => (
                        <div key={it.id} style={S.lowStockRow}>
                          <button type="button" className="stk-btn" style={S.lowStockRowMain} onClick={() => jumpToLowStockItem(it)}>
                            <div style={S.itemName}>
                              {it.partNumber ? `${it.partNumber} — ` : ""}
                              {it.name}
                              {it.grade ? ` (${it.grade})` : ""}
                            </div>
                            <div style={S.lowStockThreshold}>min {it.low}</div>
                          </button>
                          {canEditQty(it.mainCat) ? (
                            <button
                              type="button"
                              className="stk-btn"
                              style={S.usageBtnAdd}
                              onClick={(e) => {
                                e.stopPropagation();
                                openUsageModal(it, "add");
                              }}
                            >
                              Add stock
                            </button>
                          ) : (
                            <span style={{ ...S.qtyNum, fontSize: 15, color: C.danger }}>{it.qty}</span>
                          )}
                        </div>
                      ))}
                  </div>
                ))}
              {lowStockItems.length === 0 && <div style={S.empty}>Nothing low right now.</div>}
            </div>
          </div>
        </div>
      )}

      {showRequisitionPicker && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Request stock</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeRequisitionPicker}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>Find the item to request — this searches everything, including items already at zero.</div>
            <input
              autoFocus
              style={{ ...S.input, marginTop: 10 }}
              value={requisitionPickerQuery}
              onChange={(e) => setRequisitionPickerQuery(e.target.value)}
              placeholder="Search by name, grade, or customer…"
            />
            <div style={{ ...S.managerList, marginTop: 10, maxHeight: "60vh", overflowY: "auto" }}>
              {(() => {
                const q = requisitionPickerQuery.trim().toLowerCase();
                if (!q) return <div style={S.empty}>Start typing to search.</div>;
                const matches = (items || [])
                  .filter((it) => it.mainCat !== "custom")
                  .filter(
                    (it) =>
                      (it.name || "").toLowerCase().includes(q) ||
                      (it.grade || "").toLowerCase().includes(q) ||
                      (it.customer || "").toLowerCase().includes(q) ||
                      (it.partNumber || "").toLowerCase().includes(q)
                  )
                  .slice(0, 50);
                return (
                  <>
                    {matches.length === 0 && <div style={S.empty}>No matching items.</div>}
                    {matches.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        className="stk-btn"
                        style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer" }}
                        onClick={() => pickItemForRequisition(it)}
                      >
                        <div style={S.reqCardTop}>
                          <span style={S.itemName}>{it.grade ? `${it.grade} — ` : ""}{it.name}</span>
                          <span style={{ ...S.reqStatusTag, ...(Number(it.qty) > 0 ? S.reqStatus_received : S.reqStatus_ordered) }}>
                            {Number(it.qty) > 0 ? `${it.qty} in stock` : "0 in stock"}
                          </span>
                        </div>
                        {it.customer && <div className="stk-meta-row" style={S.rowMeta}><span>{it.customer}</span></div>}
                      </button>
                    ))}
                    {canAdd && (
                      <button
                        type="button"
                        className="stk-btn"
                        style={{ ...S.reqActionBtnMuted, width: "100%", marginTop: matches.length > 0 ? 6 : 0 }}
                        onClick={() => createItemForRequisition(requisitionPickerQuery.trim())}
                      >
                        <Plus size={13} /> Not in Stock yet? Create "{requisitionPickerQuery.trim()}" as a new item
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {requisitionTarget && (
        <div style={S.modalOverlay}>
          <form style={S.modal} onClick={(e) => e.stopPropagation()} onSubmit={submitRequisition}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>{editingRequisitionId ? "Edit request" : "Request stock"}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeRequisition}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>
              {requisitionTarget.grade ? `${requisitionTarget.grade} — ` : ""}
              {requisitionTarget.name}
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Quantity needed</label>
              <input
                autoFocus
                type="number"
                step="any"
                min="0"
                style={S.input}
                value={requisitionQty}
                onChange={(e) => setRequisitionQty(e.target.value)}
                placeholder={
                  requisitionTarget.mainCat === "plate" ? "Number of sheets" : requisitionTarget.mainCat === "structural" ? "Number of pieces" : "Quantity"
                }
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Supplier (optional)</label>
              <select style={S.input} value={requisitionSupplier} onChange={(e) => setRequisitionSupplier(e.target.value)}>
                <option value="">No supplier chosen yet</option>
                {master.suppliers.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Notes (optional)</label>
              <input
                style={S.input}
                value={requisitionNotes}
                onChange={(e) => setRequisitionNotes(e.target.value)}
                placeholder="e.g. needed by Friday for job #4471"
              />
            </div>
            <button type="submit" style={S.submitBtn} className="stk-btn">
              {editingRequisitionId ? "Save changes" : "Send request"}
            </button>
          </form>
        </div>
      )}

      <div style={S.footer}>Shared across everyone on this link — changes sync automatically.</div>
    </div>
  );
}
