import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./lib/supabaseClient.js";
import {
  Plus, Minus, Search, Trash2, PackagePlus, AlertTriangle, X,
  ChevronDown, ChevronRight, ChevronLeft, User, UserCheck, ShieldCheck, Lock, Database, Truck,
  Download, Pencil, Copy, Filter as FilterIcon, Paperclip, FileText, Image as ImageIcon,
  Wrench, Users, Eye, EyeOff, ShoppingCart, ClipboardList, Check, Package, Upload, RefreshCw,
} from "lucide-react";

// window.storage is installed in main.jsx before this component ever
// renders — backed by Supabase. See src/lib/storage.js.

const TABS = [
  { key: "plate", label: "Plate & Sheet" },
  { key: "structural", label: "Structural Steel" },
  { key: "cncBar", label: "CNC Bar" },
  { key: "custom", label: "Customer Stock" },
  { key: "stores", label: "Stores" },
  { key: "fasteners", label: "Fasteners" },
  { key: "assets", label: "Assets" },
];

// TABS above stays as the physical stock divisions (used by the Add form,
// exports, etc). NAV_TABS adds Requisitions on top of that just for the
// main tab bar, since requisitions aren't a stock division themselves.
// Jobs and Notifications deliberately aren't in here — they get their own
// prominent header buttons instead of getting lost in this already-long
// wrapped tab row.
const NAV_TABS = [
  { key: "jobs", label: "Jobs" },
  { key: "production", label: "Production" },
  ...TABS,
  { key: "requisitions", label: "Requisitions" },
  { key: "purchaseOrders", label: "Purchase Orders" },
  { key: "receiving", label: "Receiving" },
  { key: "invoicing", label: "Invoicing" },
  { key: "deliveryNotes", label: "Delivery Notes" },
  { key: "invoiceRequests", label: "Invoice Requests" },
  { key: "processSheets", label: "Process Sheets" },
  { key: "poReports", label: "PO Reports" },
  { key: "usageLog", label: "Usage Log" },
  { key: "drawings", label: "Drawings" },
  { key: "shortageCenter", label: "Shortage Center" },
];

// The tab bar groups related divisions under a shared dropdown instead of
// showing each as its own button — keeps the row to a small, stable set of
// top-level buttons (Jobs and Production stay standalone since they're
// used the most) with everything else folded into a few logical groups.
const TAB_GROUPS = [
  { label: "Stock", keys: ["plate", "structural", "cncBar", "custom", "fasteners", "stores", "assets"] },
  { label: "Procurement", keys: ["requisitions", "purchaseOrders", "receiving", "shortageCenter"] },
  { label: "Records", keys: ["invoicing", "deliveryNotes", "invoiceRequests", "processSheets", "poReports", "usageLog", "drawings"] },
];

// Jobs and Notifications still need a canView() entry (for the header
// buttons and permission checks) even though they're not part of the main
// tab row — this covers that without duplicating them into NAV_TABS.
const EXTRA_SECTIONS = [{ key: "notifications", label: "Notifications" }];

const SECTIONS = ["plate", "structural", "cncBar", "custom", "stores", "fasteners", "assets", "drawings", "deliveryNotes", "invoiceRequests", "processSheets", "poReports", "jobs"];

const MANAGER_TABS = [
  { key: "sizes", label: "Sheet Sizes" },
  { key: "sections", label: "Sections" },
  { key: "sectionTypes", label: "Section Types" },
  { key: "grades", label: "Material Types" },
  { key: "cncGrades", label: "CNC Bar Grades" },
  { key: "staffDepartments", label: "Staff Departments" },
  { key: "jobProcessTypes", label: "Job Process Types" },
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
];
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
    supabase.from("master_string_lists").select("*"),
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

function EditableName({ value, onCommit, style }) {
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  return (
    <input
      className="stk-editable"
      style={{ ...S.editableName, ...style }}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val.trim() && val !== value) onCommit(val.trim());
        else setVal(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
      }}
    />
  );
}

// "Each"-tracked process control — a running count against the item's
// total quantity, not a checkbox. Logging a batch subtracts against the
// remaining total; the process completes itself once the count reaches it.
// "Each"-tracked process control — one row per item on the job, matching
// the printed process sheet, each with its own running count against that
// item's own quantity. Never lumps different items into one shared total.
function QtyProgressControl({ process, job, quoteItems, itemProgress, isReady, onSubmit }) {
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
        return (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, flex: "1 1 140px", color: itemDone ? C.accentFinished : C.text }}>
              {item.description || "Item"} — {done}/{itemQty}
            </span>
            {itemDone ? (
              <span style={{ fontSize: 12, color: C.accentFinished, fontWeight: 600 }}>Done</span>
            ) : (
              <>
                <input
                  type="number"
                  min="0"
                  max={remaining}
                  disabled={!isReady}
                  style={{ ...S.input, width: 64, fontSize: 13.5, padding: "5px 6px" }}
                  value={inputs[item.id] || ""}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Qty"
                />
                <button
                  type="button"
                  className="stk-btn"
                  style={S.reqActionBtn}
                  disabled={!isReady}
                  onClick={() => {
                    const qty = Math.min(parseFloat(inputs[item.id]) || 0, remaining);
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
  const [assetRemoveModal, setAssetRemoveModal] = useState(null); // { item, reason, date }
  const [showAssetArchive, setShowAssetArchive] = useState(false);
  const [poBuilder, setPoBuilder] = useState(null); // { supplierId, lineItems: [...], linkedRequisitionIds: [...], notes }
  const [poSupplierFilter, setPoSupplierFilter] = useState("");
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
  const [jobsList, setJobsList] = useState(null);
  const [productionQueue, setProductionQueue] = useState(null);
  const [invoicedSectionOpen, setInvoicedSectionOpen] = useState(false);
  const [notificationsViewedOpen, setNotificationsViewedOpen] = useState(false);
  const [jobsCompletedSectionOpen, setJobsCompletedSectionOpen] = useState(false);
  const [shortagesResolvedOpen, setShortagesResolvedOpen] = useState(false);
  const [productionSelectedDept, setProductionSelectedDept] = useState(null);
  // Which specific job card is open within the current department — null
  // shows the compact list (job number, SigmaNest number, customer, sales
  // rep only); selecting a card opens that one job's full management view
  // in its own right. This is a pattern to reuse across other tabs going
  // forward too, not just here.
  const [productionSelectedProcessId, setProductionSelectedProcessId] = useState(null);
  const [personExpanded, setPersonExpanded] = useState({});
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
  const [newJobItemSuggestOpen, setNewJobItemSuggestOpen] = useState(null); // which quote item row index has its suggestion dropdown open
  const [notificationsList, setNotificationsList] = useState(null);
  const [shortagesList, setShortagesList] = useState(null);
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
  // Which customer/supplier is currently open in its own detail view within
  // Stock Manager — null shows the plain list of names, matching the same
  // list-then-detail pattern used for Sections and Production.
  const [managerCustomerOpen, setManagerCustomerOpen] = useState(null);
  const [managerSupplierOpen, setManagerSupplierOpen] = useState(null);
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
  const [collapsed, setCollapsed] = useState({});
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
        ops.push(supabase.from("master_string_lists").insert(added.map((v) => ({ id: uid(), list_name: listName, value: v }))));
      }
      if (removed.length) {
        ops.push(supabase.from("master_string_lists").delete().eq("list_name", listName).in("value", removed));
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
    productionSelectedProcessId || showManager || requisitionTarget || showRequisitionPicker
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

  async function addAssetHistoryEntry({ itemId, entryType, note, reading, attachmentFile, serviceMode }) {
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

  function toggleNewJobProcess(processName) {
    setNewJobForm((f) => ({
      ...f,
      selectedProcesses: f.selectedProcesses.some((p) => p.name === processName)
        ? f.selectedProcesses.filter((p) => p.name !== processName)
        : [...f.selectedProcesses, { name: processName, operator: "", assignedToId: null, trackingMode: "batch" }],
    }));
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
    if (!newJobForm.customer || (newJobForm.customer === CUSTOM && !newJobForm.newCustomerName.trim())) {
      alert("Pick or add a customer before creating the job.");
      return;
    }
    if (newJobForm.selectedProcesses.length === 0) {
      alert("Select at least one process this job needs.");
      return;
    }
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
    }
  }

  async function openJobDetail(job) {
    setJobDetail({ job, processes: [], documents: [], quoteItems: [], deliveryNotes: [] });
    setJobDetailLoading(true);
    try {
      const [{ data: processes, error: procError }, { data: documents, error: docError }, { data: quoteItems, error: qiError }, { data: deliveryNotes, error: dnError }] = await Promise.all([
        supabase.from("job_processes").select("*").eq("job_id", job.id).order("sort_order"),
        supabase.from("job_documents").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
        supabase.from("job_quote_items").select("*").eq("job_id", job.id).order("sort_order"),
        supabase.from("delivery_notes").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
      ]);
      if (procError) throw procError;
      if (docError) throw docError;
      if (qiError) throw qiError;
      if (dnError) throw dnError;
      setJobDetail({ job, processes: processes || [], documents: documents || [], quoteItems: quoteItems || [], deliveryNotes: deliveryNotes || [] });
    } catch (err) {
      console.error("Failed to load job detail:", err);
    }
    setJobDetailLoading(false);
  }

  function closeJobDetail() {
    setJobDetail(null);
    setSelectedForInvoice(new Set());
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
  // sort_order, on the same job) is marked complete — the order processes
  // were selected in becomes the real workflow sequence, one after
  // another, not all open at once.
  function isProcessActionable(process, jobProcesses) {
    return jobProcesses.filter((p) => p.sort_order < process.sort_order).every((p) => p.is_complete);
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
      const [{ data: allProcesses, error: procError }, { data: allQuoteItems, error: qiError }, { data: allDocs, error: docError }] = await Promise.all([
        supabase.from("job_processes").select("*").in("job_id", jobIds).order("sort_order"),
        supabase.from("job_quote_items").select("*").in("job_id", jobIds),
        supabase.from("job_documents").select("*").in("job_id", jobIds).not("process_name", "is", null),
      ]);
      if (procError) throw procError;
      if (qiError) throw qiError;
      if (docError) throw docError;

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
      const byProcessType = {};
      for (const procType of profile.allowedProcessTypes) byProcessType[procType] = [];

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
          });
        }
      }
      // Within each department: urgent first, then ready-before-waiting,
      // then oldest due date first.
      for (const procType of Object.keys(byProcessType)) {
        byProcessType[procType].sort((a, b) => {
          if (a.process.is_urgent !== b.process.is_urgent) return a.process.is_urgent ? -1 : 1;
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
  function openShortageFlagModal(job, process) {
    setShortageModal({ job, process, boardNumber: "", description: "", qty: "", reason: "short" });
  }

  async function submitNewShortage() {
    const { job, process, boardNumber, description, qty, reason } = shortageModal;
    if (!description.trim() || !qty || Number(qty) <= 0) return;
    try {
      // A direct, fresh lookup rather than relying on productionQueue,
      // which only ever holds the process types the person flagging this
      // is themselves allowed to see — a Packer flagging a shortage may
      // have no Nesting entries loaded there at all.
      const { data: nestingRows } = await supabase.from("job_processes").select("assigned_to").eq("job_id", job.id).eq("process_name", "Nesting").limit(1);
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
        description: description.trim(),
        qty: Number(qty),
        reason,
        status: "flagged",
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
            message: `Shortage flagged on ${job.job_number} (${job.customer || "no customer"}) by ${roleLabel}: ${description.trim()} × ${qty}`,
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

  async function markShortageNested(shortage) {
    try {
      const { error } = await supabase
        .from("shortages")
        .update({ status: "nested", nested_by: roleLabel, nested_at: new Date().toISOString() })
        .eq("id", shortage.id);
      if (error) throw error;
      fetchShortages();
    } catch (err) {
      console.error("Failed to update shortage:", err);
      alert("That didn't save — check your connection and try again.");
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
          message: `Shortage cut and ready — ${shortage.description} × ${shortage.qty} for ${shortage.job_number} (${shortage.customer || "no customer"})`,
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
    setEditProcessesModal({ job, selected: new Set(processes.map((p) => p.process_name)) });
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
    const existing = jobDetail?.processes || [];
    const existingNames = new Set(existing.map((p) => p.process_name));
    const toAdd = [...selected].filter((name) => !existingNames.has(name));
    // Completed processes are hard-protected in the UI itself (checkbox
    // disabled, can't reach here unchecked). Anything else being removed
    // still gets a plain confirmation first — an Each-mode process with
    // partial progress logged doesn't show that here reliably (its
    // progress lives in a separate per-item table this editor doesn't
    // load), so a confirmation covers that gap honestly instead of
    // guessing at a check that could miss it.
    const toRemove = existing.filter((p) => !selected.has(p.process_name));
    if (toRemove.length > 0) {
      const names = toRemove.map((p) => p.process_name).join(", ");
      if (!window.confirm(`Remove ${names} from this job? Any notes, urgent flag, or logged progress on it will be lost.`)) {
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
      body: processes.map((p) => [
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
  const canEditThisJob = canEditQty("jobs") && !jobIsLocked;

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
  function renameMasterEntry(listKey, oldValue, newValue) {
    if (!newValue.trim() || newValue === oldValue) return;
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

  function openUsageModal(item, direction) {
    setUsageModal({ item, direction, qty: "", cutQty: "1", jobNumber: "", customer: "", note: "" });
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
    setRequisitionQty("");
    setRequisitionNotes("");
    setRequisitionSupplier(it.supplier || "");
  }

  function openRequisitionPicker() {
    setShowRequisitionPicker(true);
    setRequisitionPickerQuery("");
  }

  function closeRequisitionPicker() {
    setShowRequisitionPicker(false);
    setRequisitionPickerQuery("");
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
    setRequisitionQty("");
    setRequisitionNotes("");
    setRequisitionSupplier("");
  }

  function submitRequisition(e) {
    e.preventDefault();
    if (!requisitionTarget || !requisitionQty.trim()) return;
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

  function toggleGrade(key) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
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
      // A brand-new item saved at zero stock would otherwise vanish from the
      // home page the instant it's added (zero-qty items only stay visible
      // once a requisition is tracking them) — so if this login can request
      // stock, walk straight into that instead of leaving the item stranded.
      if (Number(newItem.qty) === 0 && canRequisition && newItem.mainCat !== "custom") {
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
          {["pending", "ordered"].map((status) => {
            const list = requisitions
              .filter((r) => r.status === status)
              .filter((r) => canManageRequisitions || r.requestedBy === roleLabel)
              .sort((a, b) => new Date(b.dateRequested) - new Date(a.dateRequested));
            if (list.length === 0) return null;
            return (
              <div key={status} style={S.gradeBlock}>
                <div style={S.gradeHeader}>
                  <span style={S.gradeTitle}>{status}</span>
                  <span style={S.gradeCount}>{list.length}</span>
                </div>
                <div style={S.gradeItems}>
                  {list.map((r) => {
                    const price = resolveReqPrice(r);
                    return (
                      <div key={r.id} style={S.reqCard}>
                        <div style={S.reqCardTop}>
                          <span style={S.itemName}>{r.itemLabel}</span>
                          <span style={{ ...S.reqStatusTag, ...S["reqStatus_" + r.status] }}>{r.status}</span>
                        </div>
                        <div className="stk-meta-row" style={S.rowMeta}>
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
                            {canRaisePO && (
                              <label style={S.reqSelectLabel}>
                                <input type="checkbox" checked={selectedReqIds.includes(r.id)} onChange={() => toggleReqSelection(r.id)} />
                                Add to PO
                              </label>
                            )}
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
                      </div>
                    );
                  })}
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

          {purchaseOrders.length > 5 && (
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Supplier</label>
              <select style={S.input} value={poSupplierFilter} onChange={(e) => setPoSupplierFilter(e.target.value)}>
                <option value="">All suppliers</option>
                {master.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {purchaseOrders.length === 0 && <div style={S.empty}>No Purchase Orders yet.</div>}
          <div style={{ ...S.gradeItems, marginTop: 10 }}>
            {[...purchaseOrders]
              .filter((po) => po.status !== "received")
              .filter((po) => !poSupplierFilter || po.supplierId === poSupplierFilter)
              .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))
              .map((po) => (
                <div key={po.id} style={S.reqCard}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{po.poNumber} — {po.supplierName || "No supplier"}</span>
                    <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>R{po.totalValue.toFixed(2)}</span>
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>Raised by {po.createdBy}</span>
                    <span>{new Date(po.dateCreated).toLocaleDateString()}</span>
                    <span>{po.lineItems.length} line{po.lineItems.length === 1 ? "" : "s"}</span>
                  </div>
                  {po.notes && <div style={S.itemComment}>{po.notes}</div>}
                  <div style={S.reqActions}>
                    <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => viewPoPdf(po)}>
                      <FileText size={13} /> View PDF
                    </button>
                    {canMarkReceivedPerm && (
                      <button type="button" className="stk-btn" style={{ ...S.reqActionBtn, background: C.accentFinished }} onClick={() => openReceiving(po)}>
                        <Check size={13} /> Receive
                      </button>
                    )}
                  </div>
                </div>
              ))}
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
                  .filter((po) => !poSupplierFilter || po.supplierId === poSupplierFilter)
                  .sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate))
                  .map((po) => (
                    <div key={po.id} style={S.reqCard}>
                      <div style={S.reqCardTop}>
                        <span style={S.itemName}>{po.poNumber} — {po.supplierName || "No supplier"}</span>
                        <span style={{ ...S.reqStatusTag, ...S.reqStatus_received }}>R{po.totalValue.toFixed(2)}</span>
                      </div>
                      <div className="stk-meta-row" style={S.rowMeta}>
                        <span>Raised by {po.createdBy}</span>
                        <span>{new Date(po.dateCreated).toLocaleDateString()}</span>
                        <span>Received by {po.receivedBy} on {new Date(po.receivedDate).toLocaleDateString()}</span>
                        {po.deliveryNoteNumber && <span>Delivery note: {po.deliveryNoteNumber}</span>}
                      </div>
                      <div style={S.reqActions}>
                        <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => viewPoPdf(po)}>
                          <FileText size={13} /> View PDF
                        </button>
                      </div>
                    </div>
                  ))}
                {purchaseOrders.filter((po) => po.status === "received").length === 0 && (
                  <div style={S.empty}>Nothing received yet.</div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : tab === "receiving" ? (
        <div style={S.list}>
          <div style={S.roleHint}>Pick an outstanding Purchase Order to confirm what actually arrived.</div>
          {purchaseOrders.filter((po) => po.status !== "received").length === 0 && (
            <div style={S.empty}>Nothing outstanding to receive.</div>
          )}
          <div style={{ ...S.gradeItems, marginTop: 10 }}>
            {[...purchaseOrders]
              .filter((po) => po.status !== "received")
              .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))
              .map((po) => (
                <div key={po.id} style={S.reqCard}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{po.poNumber} — {po.supplierName || "No supplier"}</span>
                    <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>R{po.totalValue.toFixed(2)}</span>
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>Raised by {po.createdBy}</span>
                    <span>{new Date(po.dateCreated).toLocaleDateString()}</span>
                    <span>{po.lineItems.length} line{po.lineItems.length === 1 ? "" : "s"}</span>
                  </div>
                  <div style={S.reqActions}>
                    <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => openReceiving(po)}>
                      <Check size={13} /> Receive this PO
                    </button>
                  </div>
                </div>
              ))}
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

          <label style={{ ...S.label, marginTop: 10, display: "block" }}>Active</label>
          <div style={{ ...S.gradeItems, marginTop: 6 }}>
            {(jobsList || [])
              .filter((j) => j.status === "in_progress" || j.status === "complete")
              .map((job) => {
                const jobItems = allJobQuoteItems.filter((it) => it.job_id === job.id);
                const invoicedCount = jobItems.filter((it) => it.item_status === "invoiced").length;
                return (
                <div key={job.id} style={S.reqCard}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{job.job_number} — {job.customer || "No customer"}</span>
                    <span style={{ ...S.reqStatusTag, ...(job.status === "complete" ? S.reqStatus_received : S.reqStatus_ordered) }}>
                      {job.status === "in_progress" ? "In Progress" : "Complete"}
                    </span>
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>Sales rep: {job.sales_rep}</span>
                    {job.due_date && <span>Due {new Date(job.due_date).toLocaleDateString()}</span>}
                    {job.quote_reference && <span>Quote: {job.quote_reference}</span>}
                    {job.laser_job_reference && <span>Laser: {job.laser_job_reference}</span>}
                    {jobItems.length > 0 && <span>{invoicedCount}/{jobItems.length} invoiced</span>}
                    {job.invoice_number && <span>Invoice #{job.invoice_number}</span>}
                  </div>
                  <div style={S.reqActions}>
                    <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => openJobDetail(job)}>
                      <ClipboardList size={13} /> Open
                    </button>
                    {jobInvoiceRequests.find((r) => r.job_id === job.id) && (
                      <button
                        type="button"
                        className="stk-btn"
                        style={S.reqActionBtnMuted}
                        onClick={() => viewJobInvoiceRequest(jobInvoiceRequests.find((r) => r.job_id === job.id))}
                      >
                        <FileText size={13} /> Open Invoice
                      </button>
                    )}
                    {(isAdmin || !!profile?.canManageInvoicing) && (
                      <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => invoiceNowFromList(job)}>
                        <Check size={13} /> Invoice Now
                      </button>
                    )}
                    <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => openCopyJobModal(job)}>
                      <Copy size={13} /> Copy Job
                    </button>
                  </div>
                </div>
                );
              })}
            {(jobsList || []).filter((j) => j.status === "in_progress" || j.status === "complete").length === 0 && (
              <div style={S.empty}>Nothing active.</div>
            )}
          </div>

          <button
            type="button"
            className="stk-btn"
            style={{ ...S.productionPill, marginTop: 16 }}
            onClick={() => setJobsCompletedSectionOpen((o) => !o)}
          >
            <span>Completed</span>
            <span style={S.gradeCount}>{(jobsList || []).filter((j) => j.status === "invoiced").length}</span>
            <ChevronDown size={14} style={{ transform: jobsCompletedSectionOpen ? "rotate(180deg)" : "none" }} />
          </button>
          {jobsCompletedSectionOpen && (
          <div style={{ ...S.gradeItems, marginTop: 6 }}>
            {(jobsList || [])
              .filter((j) => j.status === "invoiced")
              .map((job) => (
                <div key={job.id} style={S.reqCard}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{job.job_number} — {job.customer || "No customer"}</span>
                    <span style={{ ...S.reqStatusTag, ...S.reqStatus_received }}>Invoiced</span>
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>Invoice #{job.invoice_number}</span>
                    <span>{job.invoiced_by} on {new Date(job.invoiced_at).toLocaleDateString()}</span>
                  </div>
                  <div style={S.reqActions}>
                    <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => openJobDetail(job)}>
                      <ClipboardList size={13} /> Open
                    </button>
                  </div>
                </div>
              ))}
            {(jobsList || []).filter((j) => j.status === "invoiced").length === 0 && <div style={S.empty}>Nothing completed yet.</div>}
          </div>
          )}
        </div>
      ) : tab === "production" ? (
        productionSelectedDept === null ? (
          <div style={S.list}>
            {productionLoading && <div style={S.empty}>Loading…</div>}
            {(() => {
              const visibleDepts = Object.entries(productionQueue || {})
                .map(([procType, allEntries]) => {
                  const readyCount = allEntries.filter(({ process, quoteItems }) => {
                    const totalQty = (quoteItems || []).reduce((sum, it) => sum + Number(it.qty || 0), 0);
                    return !!process.assigned_to && totalQty > 0;
                  }).length;
                  const hasPendingShortage =
                    (procType === "Nesting" && (shortagesList || []).some((s) => s.status === "flagged")) ||
                    (procType === "Laser Operator" && (shortagesList || []).some((s) => s.status === "nested"));
                  return { procType, readyCount, hasPendingShortage };
                })
                // A department with nothing ready and no shortage needing
                // attention has nothing to actually do right now — hide it
                // rather than list empty departments alongside real work.
                // One with a pending shortage stays visible regardless of
                // readyCount, so that alert is never accidentally hidden.
                .filter(({ readyCount, hasPendingShortage }) => readyCount > 0 || hasPendingShortage);
              return (
                <>
                  {!productionLoading && visibleDepts.length === 0 && <div style={S.empty}>Nothing outstanding right now.</div>}
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
              placeholder="Search job number or SigmaNest number…"
            />
            {(() => {
              const procType = productionSelectedDept;
              const allEntries = productionQueue?.[procType] || [];
              const q = productionSearchQuery.trim().toLowerCase();
              let entries = q
                ? allEntries.filter(
                    ({ job }) =>
                      (job.job_number || "").toLowerCase().includes(q) || (job.laser_job_reference || "").toLowerCase().includes(q)
                  )
                : allEntries;
              // Nothing assigned yet, or nothing to actually do yet (zero
              // quantity) — hide it from the everyday view so the list only
              // shows work that's genuinely ready to act on. A search is a
              // deliberate, specific request though, so it isn't filtered by
              // this — it should always find what you're looking for.
              if (!q) {
                entries = entries.filter(({ process, quoteItems }) => {
                  const totalQty = (quoteItems || []).reduce((sum, it) => sum + Number(it.qty || 0), 0);
                  return !!process.assigned_to && totalQty > 0;
                });
              }
              return (
                <div style={{ ...S.gradeItems, marginTop: 8 }}>
                  {(procType === "Nesting" || procType === "Laser Operator") &&
                    (() => {
                      const relevantStatus = procType === "Nesting" ? "flagged" : "nested";
                      const relevant = (shortagesList || []).filter((s) => s.status === relevantStatus);
                      if (relevant.length === 0) return null;
                      return (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ ...S.label, color: C.danger }}>⚠ Shortages needing {procType === "Nesting" ? "nesting" : "cutting"}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                            {relevant.map((s) => (
                              <div key={s.id} style={{ ...S.reqCard, borderColor: C.danger, borderWidth: 2 }}>
                                <div style={S.reqCardTop}>
                                  <span style={S.itemName}>{s.job_number} — {s.customer || "No customer"}</span>
                                </div>
                                <div style={{ ...S.itemComment, marginTop: 2 }}>
                                  {s.description} × {s.qty} {s.board_number && `— board ${s.board_number}`}
                                </div>
                                <div className="stk-meta-row" style={S.rowMeta}>
                                  <span>Reason: {s.reason}</span>
                                  <span>Flagged by {s.flagged_by} ({s.flagged_department})</span>
                                </div>
                                <button
                                  type="button"
                                  className="stk-btn"
                                  style={{ ...S.reqActionBtn, marginTop: 6, width: "100%" }}
                                  onClick={() => (procType === "Nesting" ? markShortageNested(s) : markShortageCut(s))}
                                >
                                  {procType === "Nesting" ? "Shortage nested" : "Shortage cut"}
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
                      const { job, process, isReady, quoteItems, documents, itemProgress } = selected;
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
                            {process.process_name === "Nesting" && (
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
                            <div style={{ marginTop: 6 }}>
                              {process.tracking_mode === "each" ? (
                                <QtyProgressControl
                                  process={process}
                                  job={job}
                                  quoteItems={quoteItems}
                                  itemProgress={itemProgress}
                                  isReady={isReady}
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
                            {process.process_name === "Nesting" && (
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
                                        if (file) uploadJobDocument(job.id, file, "Nesting");
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
                    entries.map(({ job, process, isReady, quoteItems }) => {
                      const totalQty = quoteItems.reduce((sum, it) => sum + Number(it.qty || 0), 0);
                      return (
                        <button
                          key={process.id}
                          type="button"
                          className="stk-btn"
                          style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer" }}
                          onClick={() => setProductionSelectedProcessId(process.id)}
                        >
                          <div style={S.reqCardTop}>
                            <span style={S.itemName}>{job.job_number} — {job.customer || "No customer"}</span>
                            <span style={{ ...S.reqStatusTag, ...(isReady ? S.reqStatus_received : S.reqStatus_ordered) }}>
                              {isReady ? "Ready" : "Waiting"}
                            </span>
                          </div>
                          <div className="stk-meta-row" style={S.rowMeta}>
                            {job.sales_rep && <span>Sales: {job.sales_rep}</span>}
                            {job.laser_job_reference && <span>SigmaNest: {job.laser_job_reference}</span>}
                            {totalQty > 0 && <span>Qty: {totalQty}</span>}
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
          {(() => {
            const open = (shortagesList || []).filter((s) => s.status !== "cut");
            const resolved = (shortagesList || []).filter((s) => s.status === "cut");
            const statusLabel = { flagged: "Needs nesting", nested: "Needs cutting" };
            return (
              <>
                {shortagesList?.length > 0 && open.length === 0 && <div style={{ ...S.empty, marginTop: 10 }}>Nothing open — everything's cut.</div>}
                <div style={{ ...S.gradeItems, marginTop: 10 }}>
                  {open.map((s) => (
                    <div key={s.id} style={{ ...S.reqCard, borderColor: C.danger, borderWidth: 2 }}>
                      <div style={S.reqCardTop}>
                        <span style={S.itemName}>{s.job_number} — {s.customer || "No customer"}</span>
                        <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>{statusLabel[s.status] || s.status}</span>
                      </div>
                      <div style={{ ...S.itemComment, marginTop: 2 }}>
                        {s.description} × {s.qty} {s.board_number && `— board ${s.board_number}`}
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
                              {s.description} × {s.qty} {s.board_number && `— board ${s.board_number}`}
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
              { key: "received", label: "Received" },
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

          {usageViewMode === "received" ? (
            <div style={{ marginTop: 12 }}>
              <div style={S.filterBar}>
                <div>
                  <label style={S.label}>From</label>
                  <input type="date" style={S.input} value={usageDateFrom} onChange={(e) => setUsageDateFrom(e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>To</label>
                  <input type="date" style={S.input} value={usageDateTo} onChange={(e) => setUsageDateTo(e.target.value)} />
                </div>
                <input
                  style={S.input}
                  value={usageSearchQuery}
                  onChange={(e) => setUsageSearchQuery(e.target.value)}
                  placeholder="Search item, supplier note, or person…"
                />
              </div>
              {(() => {
                const received = [...usageLog]
                  .filter((u) => u.direction === "add")
                  .filter((u) => !usageDateFrom || new Date(u.timestamp) >= new Date(usageDateFrom))
                  .filter((u) => !usageDateTo || new Date(u.timestamp) <= new Date(usageDateTo + "T23:59:59"))
                  .filter((u) => {
                    if (!usageSearchQuery.trim()) return true;
                    const q = usageSearchQuery.toLowerCase();
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
          ) : usageViewMode === "jobCosting" ? (
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
        {grouped.length === 0 && (
          <div style={S.empty}>
            {query ? "Nothing matches that search." : "Nothing here yet — add an item to get started."}
          </div>
        )}
        {grouped.map(([grade, list]) => {
          const key = tab + ":" + grade;
          const isCollapsed = !!collapsed[key];
          return (
            <div key={key} style={S.gradeBlock}>
              <button className="stk-grade" style={S.gradeHeader} onClick={() => toggleGrade(key)}>
                <ChevronDown size={15} style={{ transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform .15s" }} />
                <span style={S.gradeTitle}>{grade}</span>
                <span style={S.gradeCount}>{list.length}</span>
              </button>
              {!isCollapsed && (
                <div style={S.gradeItems}>
                  {list.map((it) => {
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
                            <div style={S.qtyDisplay}>
                              <span style={{ ...S.qtyNum, color: low ? C.danger : C.text }}>{it.qty}</span>
                              <span style={S.qtyUnit}>{it.trackLength ? "pcs" : it.unit}</span>
                            </div>
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
                </div>
              )}
            </div>
          );
        })}

        {tab === "assets" && (
          <div style={S.gradeBlock}>
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
                        style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
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
                        style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
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
              <>
                <div style={S.roleHint}>This is your own letterhead — it appears at the top of every Purchase Order.</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  {master.companyDetails.logo ? (
                    <img src={master.companyDetails.logo} alt="" style={S.supplierLogoPreview} />
                  ) : (
                    <div style={S.supplierLogoPlaceholder}>
                      <ImageIcon size={16} color={C.muted} />
                    </div>
                  )}
                  <label className="stk-btn" style={{ ...S.addBtn, cursor: "pointer" }}>
                    <Paperclip size={14} />
                    Upload logo
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleCompanyLogoSelect} />
                  </label>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={S.label}>Company name</label>
                  <input
                    style={S.input}
                    value={master.companyDetails.name}
                    onChange={(e) => updateCompanyDetail("name", e.target.value)}
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Address</label>
                  <input
                    style={S.input}
                    value={master.companyDetails.address}
                    onChange={(e) => updateCompanyDetail("address", e.target.value)}
                  />
                </div>
                <div style={S.formGrid}>
                  <div>
                    <label style={S.label}>Phone</label>
                    <input
                      style={S.input}
                      value={master.companyDetails.phone}
                      onChange={(e) => updateCompanyDetail("phone", e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={S.label}>Email</label>
                    <input
                      style={S.input}
                      type="email"
                      value={master.companyDetails.email}
                      onChange={(e) => updateCompanyDetail("email", e.target.value)}
                    />
                  </div>
                </div>
                <div style={S.formGrid}>
                  <div>
                    <label style={S.label}>VAT number</label>
                    <input
                      style={S.input}
                      value={master.companyDetails.vatNumber}
                      onChange={(e) => updateCompanyDetail("vatNumber", e.target.value)}
                      placeholder="e.g. 4420263735"
                    />
                  </div>
                  <div>
                    <label style={S.label}>Registration number</label>
                    <input
                      style={S.input}
                      value={master.companyDetails.regNumber}
                      onChange={(e) => updateCompanyDetail("regNumber", e.target.value)}
                      placeholder="e.g. 2013/089712/07"
                    />
                  </div>
                </div>
              </>
            ) : managerTab === "departments" && isAdmin ? (
              <>
                <div style={S.roleHint}>
                  Everyone here signed up for their own account — you can't create a login for someone else. Once they've
                  signed up, they'll appear below with zero access; tick what they should be able to do.
                </div>
                {people === null && <div style={S.empty}>Loading people…</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                  {(people || []).map((p) => (
                    <div key={p.id} style={S.deptCard}>
                      <div style={S.deptCardHead}>
                        <button
                          type="button"
                          className="stk-btn"
                          style={S.iconBtn}
                          onClick={() => setPersonExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                          title={personExpanded[p.id] ? "Collapse" : "Expand to set permissions"}
                        >
                          <ChevronDown size={16} style={{ transform: personExpanded[p.id] ? "rotate(180deg)" : "none" }} />
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center" }}>
                            {p.name}
                            <SavedCheck fieldKey={`person-${p.id}`} />
                          </div>
                          <div style={{ fontFamily: F.mono, fontSize: 12.5, color: C.muted }}>{p.email}</div>
                        </div>
                        <label style={{ ...S.deptToggleItem, flexShrink: 0 }}>
                          <input type="checkbox" checked={p.isAdmin} onChange={(e) => updatePersonField(p.id, "isAdmin", e.target.checked)} />
                          Admin
                        </label>
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => resetPersonAccess(p.id)} title="Reset all access (keeps their login)">
                          <RefreshCw size={13} />
                        </button>
                        <button
                          type="button"
                          className="stk-btn"
                          style={{ ...S.managerDelete, color: C.danger }}
                          onClick={() => deletePersonPermanently(p.id, p.name)}
                          title="Permanently delete — removes their login entirely"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {personExpanded[p.id] && (
                      <>
                      {!p.isAdmin && (
                        <>
                          <div style={S.deptPermGrid}>
                            <div />
                            <div style={S.deptPermHead}>View</div>
                            <div style={S.deptPermHead}>Edit qty</div>
                            {SECTIONS.map((sec) => (
                              <Fragment key={sec}>
                                <div style={S.deptPermLabel}>{[...NAV_TABS, ...EXTRA_SECTIONS].find((t) => t.key === sec)?.label}</div>
                                <input
                                  type="checkbox"
                                  checked={!!p.permissions[sec]?.view}
                                  onChange={(e) => updatePersonPermission(p.id, sec, "view", e.target.checked)}
                                />
                                <input
                                  type="checkbox"
                                  checked={!!p.permissions[sec]?.edit}
                                  onChange={(e) => updatePersonPermission(p.id, sec, "edit", e.target.checked)}
                                />
                              </Fragment>
                            ))}
                          </div>
                          <div style={S.deptToggleGrid}>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canAddItems}
                                onChange={(e) => updatePersonField(p.id, "canAddItems", e.target.checked)}
                              />
                              Can add new material
                            </label>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canEditItems}
                                onChange={(e) => updatePersonField(p.id, "canEditItems", e.target.checked)}
                              />
                              Can edit / duplicate items
                            </label>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canRequisition}
                                onChange={(e) => updatePersonField(p.id, "canRequisition", e.target.checked)}
                              />
                              Can request stock
                            </label>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canMarkReceived}
                                onChange={(e) => updatePersonField(p.id, "canMarkReceived", e.target.checked)}
                              />
                              Can mark stock received
                            </label>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canSeeValue}
                                onChange={(e) => updatePersonField(p.id, "canSeeValue", e.target.checked)}
                              />
                              Can see Rand values
                            </label>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canAccessStockManager}
                                onChange={(e) => updatePersonField(p.id, "canAccessStockManager", e.target.checked)}
                              />
                              Can access Stock Manager
                            </label>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canManageRequisitions}
                                onChange={(e) => updatePersonField(p.id, "canManageRequisitions", e.target.checked)}
                              />
                              Can manage requisitions (full buyer powers)
                            </label>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canRaisePO}
                                onChange={(e) => updatePersonField(p.id, "canRaisePO", e.target.checked)}
                              />
                              Can raise Purchase Orders
                            </label>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canViewUsageLog}
                                onChange={(e) => updatePersonField(p.id, "canViewUsageLog", e.target.checked)}
                              />
                              Can view Usage Log
                            </label>
                            <label style={S.deptToggleItem}>
                              <input
                                type="checkbox"
                                checked={!!p.canManageInvoicing}
                                onChange={(e) => updatePersonField(p.id, "canManageInvoicing", e.target.checked)}
                              />
                              Can manage Invoicing
                            </label>
                          </div>
                        </>
                      )}
                      <label style={S.deptToggleItem}>
                        <input
                          type="checkbox"
                          checked={!!p.isSalesPerson}
                          onChange={(e) => updatePersonField(p.id, "isSalesPerson", e.target.checked)}
                        />
                        Is a Sales Person (can be assigned to jobs, appears in Sales Person pickers)
                      </label>
                      <label style={S.deptToggleItem}>
                        <input
                          type="checkbox"
                          checked={!!p.isShortageHandler}
                          onChange={(e) => updatePersonField(p.id, "isShortageHandler", e.target.checked)}
                        />
                        Is a Shortage Handler (always notified of shortages, sees the Shortage Center tab)
                      </label>
                      <div style={{ marginTop: 8 }}>
                        <label style={S.label}>Department</label>
                        <select
                          style={S.input}
                          value={p.department || ""}
                          onChange={(e) => updatePersonField(p.id, "department", e.target.value)}
                        >
                          <option value="">Not set</option>
                          {master.staffDepartments.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <label style={S.label}>
                          Production access — which processes this person handles (gives them the Production tab, scoped to just these)
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                          {master.jobProcessTypes.map((proc) => {
                            const has = (p.allowedProcessTypes || []).includes(proc);
                            return (
                              <button
                                type="button"
                                key={proc}
                                className="stk-btn"
                                onClick={() => toggleProcessTypeAccess(p.id, proc)}
                                style={{ ...S.segBtn, ...(has ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}) }}
                              >
                                {proc}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      </>
                      )}
                    </div>
                  ))}
                  {people && people.length === 0 && <div style={S.empty}>Nobody's signed up yet.</div>}
                </div>
              </>
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
                        style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
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
                        .map((entry) => (
                        <div key={entry} style={S.managerRow}>
                          <EditableName value={entry} onCommit={(v) => renameMasterEntry(managerTab, entry, v)} />
                          <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeMasterEntry(entry)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
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

      {usageModal && (
        <div style={S.modalOverlay}>
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
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
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
                <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeJobDetail}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="stk-meta-row" style={S.rowMeta}>
              <span>Sales rep: {jobDetail.job.sales_rep}</span>
              {jobDetail.job.due_date && <span>Due {new Date(jobDetail.job.due_date).toLocaleDateString()}</span>}
              {jobDetail.job.quote_reference && <span>Quote: {jobDetail.job.quote_reference}</span>}
            </div>

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
                  <button
                    type="button"
                    className="stk-btn"
                    style={{ ...S.reqActionBtn, marginTop: 8 }}
                    onClick={() => openMarkInvoicedModal(jobDetail.job)}
                  >
                    <Check size={13} /> Mark as Invoiced
                  </button>
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

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={S.label}>Process checklist</label>
                {(isAdmin || profile?.isSalesPerson) && !jobIsLocked && (
                  <button
                    type="button"
                    className="stk-btn"
                    style={S.reqActionBtnMuted}
                    onClick={() => openEditProcessesModal(jobDetail.job, jobDetail.processes)}
                  >
                    <Pencil size={12} /> Edit processes
                  </button>
                )}
              </div>
              {jobDetailLoading && <div style={S.empty}>Loading…</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {jobDetail.processes.map((p) => (
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
          </div>
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
              <label style={S.label}>Board number</label>
              <input
                style={S.input}
                value={shortageModal.boardNumber}
                onChange={(e) => setShortageModal((m) => ({ ...m, boardNumber: e.target.value }))}
                placeholder="Which sheet/board this comes from"
                autoFocus
              />
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={S.label}>Description</label>
              <input
                style={S.input}
                value={shortageModal.description}
                onChange={(e) => setShortageModal((m) => ({ ...m, description: e.target.value }))}
                placeholder="What part needs to be cut"
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Quantity</label>
                <input
                  style={S.input}
                  type="number"
                  min="1"
                  value={shortageModal.qty}
                  onChange={(e) => setShortageModal((m) => ({ ...m, qty: e.target.value }))}
                  placeholder="How many"
                />
              </div>
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
            <button
              type="button"
              className="stk-btn"
              style={S.submitBtn}
              disabled={!shortageModal.description.trim() || !shortageModal.qty || Number(shortageModal.qty) <= 0}
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
            <div style={S.roleHint}>Check what this job needs. Unchecking removes a process — completed ones can't be removed.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {master.jobProcessTypes.map((name) => {
                const existingProcess = (jobDetail?.processes || []).find((p) => p.process_name === name);
                const locked = existingProcess?.is_complete;
                const checked = editProcessesModal.selected.has(name);
                return (
                  <button
                    type="button"
                    key={name}
                    className="stk-btn"
                    disabled={locked}
                    onClick={() => toggleEditProcessesSelection(name)}
                    title={locked ? "Already marked complete — can't be removed here" : undefined}
                    style={{
                      ...S.segBtn,
                      ...(checked ? { background: C.accentTint, color: C.accentRaw, borderColor: C.accentRaw } : {}),
                      ...(locked ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                    }}
                  >
                    {name}
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
                  {newJobForm.selectedProcesses.map((sp) => (
                    <div key={sp.name} style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{sp.name}</span>
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

            <button type="button" className="stk-btn" style={S.submitBtn} onClick={submitNewJob}>
              Create Job
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
                if (matches.length === 0) return <div style={S.empty}>No matching items.</div>;
                return matches.map((it) => (
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
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {requisitionTarget && (
        <div style={S.modalOverlay}>
          <form style={S.modal} onClick={(e) => e.stopPropagation()} onSubmit={submitRequisition}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Request stock</span>
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
              Send request
            </button>
          </form>
        </div>
      )}

      <div style={S.footer}>Shared across everyone on this link — changes sync automatically.</div>
    </div>
  );
}

const F = {
  display: "'Oswald', sans-serif",
  body: "'Inter', sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

// Real theme values live in CSS custom properties (set below, switched via
// a data-theme attribute) rather than hardcoded here — that's what lets a
// theme change take effect everywhere instantly, without needing the
// entire S object (thousands of lines, used everywhere below) to live
// inside the component and re-render on every theme change.
const THEMES = {
  dark: {
    bg: "#1B1D1F", surface: "#232629", surfaceHover: "#282C2F", border: "#33383C",
    text: "#ECEAE4", muted: "#8B9096", accentRaw: "#F2A900", accentTint: "#3A2E10",
    accentFinished: "#4A9B8E", danger: "#D6543B", dangerTint: "#3A1E17",
  },
  medium: {
    bg: "#4A4A4A", surface: "#565656", surfaceHover: "#616161", border: "#6E6E6E",
    text: "#F5F5F5", muted: "#B8B8B8", accentRaw: "#F2A900", accentTint: "#5C4A1E",
    accentFinished: "#4A9B8E", danger: "#D6543B", dangerTint: "#5C3A30",
  },
  light: {
    bg: "#F7F7F5", surface: "#FFFFFF", surfaceHover: "#F0F0EE", border: "#DCDCD8",
    text: "#1B1D1F", muted: "#6B6F73", accentRaw: "#C98600", accentTint: "#FBEDD1",
    accentFinished: "#2F7A6E", danger: "#C23D26", dangerTint: "#FBE0DA",
  },
};

const C = {
  bg: "var(--stk-bg)",
  surface: "var(--stk-surface)",
  surfaceHover: "var(--stk-surfaceHover)",
  border: "var(--stk-border)",
  text: "var(--stk-text)",
  muted: "var(--stk-muted)",
  accentRaw: "var(--stk-accentRaw)",
  accentTint: "var(--stk-accentTint)",
  accentFinished: "var(--stk-accentFinished)",
  danger: "var(--stk-danger)",
  dangerTint: "var(--stk-dangerTint)",
};

// Generated once from THEMES above, rather than hand-duplicated in CSS —
// one selector per theme, each setting every custom property at once.
// Switching themes is just changing the data-stk-theme attribute; every
// place C.bg (etc.) is used anywhere in the app re-resolves instantly,
// with no re-render needed at all.
const THEME_CSS = Object.entries(THEMES)
  .map(([name, colors]) => {
    const decls = Object.entries(colors)
      .map(([key, value]) => `--stk-${key}: ${value};`)
      .join(" ");
    return `[data-stk-theme="${name}"] { ${decls} }`;
  })
  .join("\n");

const S = {
  page: {
    minHeight: "100%",
    background: C.bg,
    color: C.text,
    fontFamily: F.body,
    padding: "20px 16px 40px",
    maxWidth: 1200,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
    gap: 12,
    flexWrap: "wrap",
  },
  saveErrorBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    marginBottom: 12,
    borderRadius: 6,
    background: "rgba(220, 60, 60, 0.12)",
    border: `1px solid ${C.danger}`,
    color: C.danger,
    fontFamily: F.mono,
    fontSize: 14,
  },
  saveErrorRetry: {
    marginLeft: "auto",
    padding: "4px 10px",
    borderRadius: 5,
    border: `1px solid ${C.danger}`,
    background: "transparent",
    color: C.danger,
    fontFamily: F.mono,
    fontSize: 13,
  },
  eyebrow: {
    fontFamily: F.mono,
    fontSize: 12.5,
    letterSpacing: "0.14em",
    color: C.accentRaw,
    marginBottom: 4,
  },
  h1: {
    fontFamily: F.display,
    fontWeight: 600,
    fontSize: 28,
    margin: 0,
    letterSpacing: "0.01em",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  lowBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontFamily: F.mono,
    fontSize: 13.5,
    color: C.danger,
    background: C.dangerTint,
    border: `1px solid ${C.danger}55`,
    borderRadius: 6,
    padding: "5px 9px",
    cursor: "pointer",
  },
  totalValueBadge: {
    fontFamily: F.mono,
    fontSize: 13.5,
    fontWeight: 600,
    color: C.accentRaw,
    background: C.accentTint,
    border: `1px solid ${C.accentRaw}55`,
    borderRadius: 6,
    padding: "5px 9px",
  },
  pendingReqBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontFamily: F.mono,
    fontSize: 13.5,
    fontWeight: 600,
    color: C.accentFinished,
    background: "#16302C",
    border: `1px solid ${C.accentFinished}55`,
    borderRadius: 6,
    padding: "5px 9px",
    cursor: "pointer",
  },
  roleChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: F.mono,
    fontSize: 13.5,
    color: C.text,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  jobsHeaderBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: F.mono,
    fontSize: 13.5,
    fontWeight: 700,
    color: C.bg,
    background: C.accentRaw,
    border: `1px solid ${C.accentRaw}`,
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  notifBadgeCount: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 16,
    height: 16,
    padding: "0 4px",
    borderRadius: 8,
    background: C.danger,
    color: "#fff",
    fontSize: 11.5,
    fontWeight: 700,
  },
  mainTabs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 9,
    padding: 4,
    marginBottom: 10,
  },
  mainTab: {
    flex: "0 1 auto",
    background: "transparent",
    border: "none",
    color: C.muted,
    borderRadius: 6,
    padding: "9px 8px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  productionPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: "10px 16px",
    fontSize: 15,
    fontWeight: 600,
  },
  productionDeptCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "18px 20px",
    fontSize: 18,
    fontWeight: 700,
    textAlign: "left",
    color: C.text,
    cursor: "pointer",
  },
  stockDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 4,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 4,
    display: "flex",
    flexDirection: "column",
    minWidth: 160,
    zIndex: 20,
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  },
  stockDropdownItem: {
    background: "transparent",
    border: "none",
    color: C.text,
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 14,
    fontWeight: 500,
    textAlign: "left",
    cursor: "pointer",
  },
  stockDropdownItemActive: {
    background: C.accentTint,
    color: C.accentRaw,
  },
  mainTabActive: {
    background: C.accentRaw,
    color: C.bg,
    fontWeight: 600,
  },
  loginPrompt: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: "60px 20px",
    textAlign: "center",
  },
  loginPromptText: {
    color: C.muted,
    fontSize: 15,
    fontFamily: F.mono,
  },
  authTabs: {
    display: "flex",
    gap: 4,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 9,
    padding: 4,
  },
  authTab: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: C.muted,
    borderRadius: 6,
    padding: "9px 8px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  authTabActive: {
    background: C.accentRaw,
    color: C.bg,
    fontWeight: 600,
  },
  summaryBanner: {
    fontFamily: F.mono,
    fontSize: 13.5,
    color: C.accentRaw,
    background: C.accentTint,
    border: `1px solid ${C.accentRaw}44`,
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 12,
    textAlign: "center",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
    alignItems: "center",
  },
  chipRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  chip: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    color: C.muted,
    borderRadius: 20,
    padding: "6px 13px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  chipActive: {
    background: C.accentFinished,
    color: "#0D1E1B",
    borderColor: C.accentFinished,
    fontWeight: 600,
  },
  filterBar: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "10px 12px 14px",
    marginBottom: 14,
  },
  clearFiltersBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    background: "transparent",
    border: "none",
    color: C.accentRaw,
    fontSize: 13.5,
    fontFamily: F.mono,
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "9px 12px",
    flex: "1 1 180px",
  },
  searchInput: {
    background: "transparent",
    border: "none",
    outline: "none",
    color: C.text,
    fontSize: 15,
    width: "100%",
  },
  addBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: C.accentFinished,
    color: "#0D1E1B",
    border: "none",
    borderRadius: 8,
    padding: "9px 14px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  staffNote: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: F.mono,
    fontSize: 12.5,
    color: C.muted,
  },
  list: { display: "flex", flexDirection: "column", gap: 14 },
  empty: {
    color: C.muted,
    fontSize: 14,
    padding: "32px 8px",
    textAlign: "center",
    fontFamily: F.mono,
  },
  gradeBlock: { display: "flex", flexDirection: "column", gap: 6 },
  gradeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "transparent",
    border: "none",
    color: C.text,
    cursor: "pointer",
    padding: "4px 2px",
    textAlign: "left",
  },
  gradeTitle: {
    fontFamily: F.display,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  gradeCount: {
    fontFamily: F.mono,
    fontSize: 12.5,
    color: C.muted,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1px 7px",
  },
  gradeItems: { display: "flex", flexDirection: "column", gap: 6 },
  row: {
    display: "flex",
    flexDirection: "column",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    overflow: "hidden",
  },
  rowMain: { padding: "11px 12px", minWidth: 0 },
  itemName: { fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: 0.2 },
  itemComment: { fontSize: 13, color: C.muted, fontStyle: "italic", marginTop: 2 },
  partTag: {
    fontFamily: F.mono,
    fontSize: 12,
    color: C.accentRaw,
    background: C.accentTint,
    border: `1px solid ${C.accentRaw}44`,
    borderRadius: 4,
    padding: "2px 6px",
  },
  attachmentIndicator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 5,
    background: C.surfaceHover,
    border: `1px solid ${C.border}`,
    color: C.muted,
    cursor: "pointer",
  },
  attachBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: C.bg,
    border: `1px solid ${C.border}`,
    color: C.text,
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 14,
    cursor: "pointer",
  },
  attachmentChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 10px",
  },
  attachmentName: {
    flex: 1,
    fontSize: 14,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  previewImage: {
    width: "100%",
    borderRadius: 8,
    marginTop: 8,
    display: "block",
  },
  previewPdf: {
    width: "100%",
    height: 420,
    marginTop: 8,
    borderRadius: 8,
    border: `1px solid ${C.border}`,
  },
  previewDownload: {
    display: "inline-block",
    marginTop: 10,
    color: C.accentRaw,
    fontFamily: F.mono,
    fontSize: 13.5,
    textDecoration: "underline",
  },
  rowMeta: {
    display: "flex",
    gap: 12,
    marginTop: 5,
    fontSize: 12.5,
    color: C.muted,
    fontFamily: F.mono,
    flexWrap: "wrap",
  },
  customerSalesRow: {
    display: "flex",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  customerTag: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 14,
    fontWeight: 700,
    color: C.accentRaw,
    background: C.accentTint,
    border: `1px solid ${C.accentRaw}66`,
    borderRadius: 5,
    padding: "3px 8px",
  },
  salesTag: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 14,
    fontWeight: 600,
    color: C.accentFinished,
    background: "#16302C",
    border: `1px solid ${C.accentFinished}55`,
    borderRadius: 5,
    padding: "3px 8px",
  },
  drawingTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 14,
    fontWeight: 700,
    color: "#3B82F6",
    background: "#1B2A4A",
    border: "1px solid #3B82F655",
    borderRadius: 5,
    padding: "3px 8px",
    cursor: "pointer",
  },
  lowTag: { display: "flex", alignItems: "center", gap: 4, color: C.danger },
  offcutTag: {
    fontFamily: F.mono,
    fontSize: 11.5,
    color: C.accentRaw,
    background: C.accentTint,
    border: `1px solid ${C.accentRaw}44`,
    borderRadius: 4,
    padding: "1px 6px",
    textTransform: "uppercase",
  },
  rowControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    padding: "8px 10px",
    borderTop: `1px solid ${C.border}`,
    background: C.bg,
  },
  qtyBlock: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: C.surface,
    color: C.text,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  },
  qtyDisplay: { display: "flex", flexDirection: "column", alignItems: "center", minWidth: 40 },
  qtyNum: { fontFamily: F.mono, fontSize: 17, fontWeight: 600, lineHeight: 1 },
  qtyUnit: { fontFamily: F.mono, fontSize: 11.5, color: C.muted, marginTop: 2 },
  usageBtnUse: {
    padding: "8px 14px",
    borderRadius: 7,
    border: `1px solid ${C.danger}55`,
    background: C.dangerTint,
    color: C.danger,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  usageBtnAdd: {
    padding: "8px 14px",
    borderRadius: 7,
    border: `1px solid ${C.accentFinished}55`,
    background: "#16302C",
    color: C.accentFinished,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  rowActionIcons: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    background: C.surface,
    border: `1px solid ${C.border}`,
    color: C.muted,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconRowBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    background: C.surface,
    border: `1px solid ${C.border}`,
    color: C.muted,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "#00000099",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 10,
  },
  modal: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 18,
    width: "100%",
    maxWidth: 480,
    maxHeight: "90vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  roleModal: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 18,
    width: "100%",
    maxWidth: 320,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  managerModal: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 18,
    width: "100%",
    maxWidth: 820,
    maxHeight: "92vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  // Full page, not a popup — fills the whole viewport rather than floating
  // as a centered, size-constrained overlay on top of whatever tab was
  // open underneath. No backdrop needed since there's nothing left showing
  // behind it to dim.
  managerFullPage: {
    position: "fixed",
    inset: 0,
    background: C.surface,
    zIndex: 10,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    padding: 18,
  },
  modalHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontFamily: F.display, fontSize: 17, fontWeight: 600 },
  iconBtn: {
    background: "transparent",
    border: "none",
    color: C.muted,
    cursor: "pointer",
    display: "flex",
  },
  label: {
    fontFamily: F.mono,
    fontSize: 12,
    letterSpacing: "0.06em",
    color: C.muted,
    marginTop: 10,
    marginBottom: 5,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: C.text,
    marginTop: 12,
    cursor: "pointer",
  },
  input: {
    width: "100%",
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 10px",
    color: C.text,
    fontSize: 15,
    outline: "none",
  },
  suggestDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 25,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    marginTop: 2,
    maxHeight: 220,
    overflowY: "auto",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  },
  suggestItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${C.border}`,
    padding: "8px 10px",
    fontSize: 13.5,
    color: C.text,
    cursor: "pointer",
  },
  segRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  segBtn: {
    flex: "1 1 30%",
    background: C.bg,
    border: `1px solid ${C.border}`,
    color: C.muted,
    borderRadius: 6,
    padding: "8px 6px",
    fontSize: 14,
    cursor: "pointer",
  },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 },
  submitBtn: {
    marginTop: 16,
    background: C.accentRaw,
    color: "#241B00",
    border: "none",
    borderRadius: 7,
    padding: "11px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  submitBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  warnBox: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    background: C.dangerTint,
    border: `1px solid ${C.danger}55`,
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 13.5,
    color: C.danger,
    marginTop: 8,
  },
  warnLink: {
    marginLeft: "auto",
    background: "transparent",
    border: "none",
    color: C.danger,
    textDecoration: "underline",
    fontSize: 13.5,
    cursor: "pointer",
    flexShrink: 0,
  },
  roleOption: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 7,
    padding: "10px 12px",
    fontSize: 14,
    color: C.text,
    cursor: "pointer",
  },
  roleOptionActive: {
    borderColor: C.accentRaw,
    color: C.accentRaw,
  },
  roleHint: {
    fontFamily: F.mono,
    fontSize: 12,
    color: C.muted,
    marginTop: 8,
    lineHeight: 1.5,
  },
  pinError: {
    fontFamily: F.mono,
    fontSize: 12.5,
    color: C.danger,
  },
  backupRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  backupBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 13.5,
    color: C.text,
    cursor: "pointer",
  },
  managerTabs: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 4,
    marginBottom: 12,
  },
  managerMenuRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 500,
    color: C.text,
    cursor: "pointer",
  },
  managerBackBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "none",
    color: C.accentRaw,
    fontSize: 13.5,
    fontWeight: 600,
    padding: "4px 0",
    marginBottom: 10,
    cursor: "pointer",
    width: "fit-content",
  },
  managerTab: {
    flex: "1 1 auto",
    background: "transparent",
    border: "none",
    color: C.muted,
    borderRadius: 5,
    padding: "7px 8px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  managerTabActive: {
    background: C.accentRaw,
    color: C.bg,
    fontWeight: 600,
  },
  managerAddRow: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  managerList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 320,
    overflowY: "auto",
  },
  // Same list, no inner height cap — for Stock Manager specifically, now
  // that it's a full page rather than a small popup. The old 320px cap
  // was sized for the popup it used to live in; left in place here it cut
  // the list off well before the actual page boundary. The full-page
  // container itself already scrolls, so this can just grow naturally.
  managerListFullPage: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  managerItemRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 10px",
  },
  lowStockRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 10px",
    marginBottom: 6,
  },
  lowStockRowMain: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
    background: "transparent",
    border: "none",
    color: C.text,
    cursor: "pointer",
    padding: 0,
  },
  lowStockThreshold: {
    fontFamily: F.mono,
    fontSize: 12.5,
    color: C.muted,
    marginTop: 2,
  },
  managerGroupHeader: {
    fontFamily: F.mono,
    fontSize: 12,
    letterSpacing: "0.06em",
    color: C.accentRaw,
    textTransform: "uppercase",
    padding: "8px 2px 4px",
  },
  managerGroupHeaderBtn: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: 4,
  },
  managerGroupHeaderActive: {
    color: C.bg,
    background: C.accentRaw,
    padding: "8px 6px 4px",
    marginBottom: 2,
  },
  reqCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "11px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  reqCardTop: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingBottom: 7,
    marginBottom: 2,
    borderBottom: `2px solid ${C.accentRaw}55`,
  },
  reqStatusTag: {
    fontFamily: F.mono,
    fontSize: 11.5,
    textTransform: "uppercase",
    borderRadius: 4,
    padding: "2px 7px",
    flexShrink: 0,
  },
  reqStatus_pending: {
    color: C.accentRaw,
    background: C.accentTint,
    border: `1px solid ${C.accentRaw}44`,
  },
  reqStatus_ordered: {
    color: C.accentFinished,
    background: "#16302C",
    border: `1px solid ${C.accentFinished}44`,
  },
  reqStatus_received: {
    color: C.muted,
    background: C.bg,
    border: `1px solid ${C.border}`,
  },
  reqStatus_cancelled: {
    color: C.danger,
    background: C.dangerTint,
    border: `1px solid ${C.danger}44`,
  },
  reqFlag: {
    fontFamily: F.mono,
    fontSize: 11.5,
    fontWeight: 700,
    textTransform: "uppercase",
    borderRadius: 4,
    padding: "2px 7px",
    border: "none",
    cursor: "pointer",
    flexShrink: 0,
  },
  reqFlag_pending: { color: "#fff", background: "#D6453D" },
  reqFlag_ordered: { color: "#1A1200", background: "#E8890C" },
  reqFlag_received: { color: "#08210F", background: "#3DBE6B" },
  reqFlagColor_pending: "#D6453D",
  reqFlagColor_ordered: "#E8890C",
  reqFlagColor_received: "#3DBE6B",
  reqPriceRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    paddingTop: 6,
    borderTop: `1px solid ${C.border}`,
  },
  reqPriceLabel: {
    fontFamily: F.mono,
    fontSize: 12.5,
    color: C.muted,
  },
  reqPriceMissing: {
    borderColor: C.danger,
    color: C.danger,
  },
  reqQtyEditRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  reqQtyInput: {
    width: 60,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    padding: "2px 5px",
    color: C.text,
    fontSize: 13.5,
    fontFamily: F.mono,
  },
  poSelectBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    background: C.accentTint,
    border: `1px solid ${C.accentRaw}55`,
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    color: C.accentRaw,
    fontWeight: 500,
  },
  reqSelectLabel: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 13.5,
    color: C.muted,
    whiteSpace: "nowrap",
  },
  poLineRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
  },
  poTotalRow: {
    fontFamily: F.mono,
    fontSize: 15,
    fontWeight: 600,
    color: C.accentRaw,
    textAlign: "right",
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px solid ${C.border}`,
  },
  reqActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  reqActionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: C.accentFinished,
    color: "#0D1E1B",
    border: "none",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  reqActionBtnMuted: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "transparent",
    color: C.muted,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13.5,
    cursor: "pointer",
  },
  // Deliberately louder than reqActionBtnMuted — a plain, low-contrast
  // back control was easy to miss, especially on a phone screen. Solid
  // border, bold text, larger touch target.
  prominentBackBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: C.bg,
    color: C.text,
    border: `2px solid ${C.text}`,
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  deptCard: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 12,
  },
  deptCardHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  deptPinRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  deptPinInput: {
    width: 60,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    padding: "4px 6px",
    color: C.text,
    fontSize: 13.5,
    fontFamily: F.mono,
  },
  deptPermGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 50px 60px",
    alignItems: "center",
    rowGap: 6,
    fontSize: 14,
  },
  deptPermHead: {
    fontFamily: F.mono,
    fontSize: 11.5,
    color: C.muted,
    textAlign: "center",
  },
  deptPermLabel: {
    color: C.text,
  },
  deptReqRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px solid ${C.border}`,
    fontSize: 13.5,
    color: C.muted,
    cursor: "pointer",
  },
  deptCoreTag: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.accentRaw,
    background: C.accentTint,
    border: `1px solid ${C.accentRaw}44`,
    borderRadius: 4,
    padding: "2px 6px",
    textTransform: "uppercase",
    flexShrink: 0,
  },
  supplierLogoPreview: {
    width: 34,
    height: 34,
    borderRadius: 6,
    objectFit: "contain",
    background: C.bg,
    border: `1px solid ${C.border}`,
    flexShrink: 0,
  },
  supplierLogoPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 6,
    background: C.bg,
    border: `1px solid ${C.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  deptToggleGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 16px",
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px solid ${C.border}`,
  },
  deptToggleItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13.5,
    color: C.muted,
    cursor: "pointer",
  },
  managerRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 14,
  },
  editableName: {
    flex: 1,
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 4,
    padding: "3px 5px",
    color: C.text,
    fontSize: 14,
    outline: "none",
  },
  managerFactorInput: {
    width: 80,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    padding: "5px 7px",
    color: C.text,
    fontSize: 13.5,
    fontFamily: F.mono,
  },
  managerDelete: {
    background: "transparent",
    border: "none",
    color: C.muted,
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
  },
  footer: {
    marginTop: 20,
    textAlign: "center",
    fontFamily: F.mono,
    fontSize: 12.5,
    color: C.muted,
  },
};
