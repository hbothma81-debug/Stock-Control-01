import { useState, useEffect, useMemo, Fragment } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./lib/supabaseClient.js";
import {
  Plus, Minus, Search, Trash2, PackagePlus, AlertTriangle, X,
  ChevronDown, User, UserCheck, ShieldCheck, Lock, Database,
  Download, Pencil, Copy, Filter as FilterIcon, Paperclip, FileText, Image as ImageIcon,
  Wrench, Users, Eye, EyeOff, ShoppingCart, ClipboardList, Check, Package,
} from "lucide-react";

// window.storage is installed in main.jsx before this component ever
// renders — backed by Supabase. See src/lib/storage.js.

const TABS = [
  { key: "plate", label: "Plate & Sheet" },
  { key: "structural", label: "Structural Steel" },
  { key: "custom", label: "Customer Stock" },
  { key: "stores", label: "Stores" },
];

// TABS above stays as the four physical stock divisions (used by the Add
// form, exports, etc). NAV_TABS adds Requisitions on top of that just for
// the main tab bar, since requisitions aren't a stock division themselves.
const NAV_TABS = [...TABS, { key: "requisitions", label: "Requisitions" }, { key: "purchaseOrders", label: "Purchase Orders" }];

const SECTIONS = ["plate", "structural", "custom", "stores"];

const MANAGER_TABS = [
  { key: "sizes", label: "Sheet Sizes" },
  { key: "sections", label: "Sections" },
  { key: "sectionTypes", label: "Section Types" },
  { key: "grades", label: "Material Types" },
  { key: "salesPeople", label: "Sales People" },
  { key: "customers", label: "Customers" },
  { key: "stockCodes", label: "Stock Codes" },
  { key: "storeCategories", label: "Store Categories" },
  { key: "suppliers", label: "Suppliers" },
  { key: "sheetNames", label: "Sheet Names" },
  { key: "storesCatalog", label: "Stores Catalog" },
  { key: "companyDetails", label: "Company Details" },
  { key: "departments", label: "User Management" },
];

const FACTOR_TABLES = ["grades", "sections"];

const CUSTOM = "__custom__";

const noPerm = () => ({ view: false, edit: false });
const fullPerm = () => ({ view: true, edit: true });
const viewOnly = () => ({ view: true, edit: false });

function blankPermissions() {
  return { plate: noPerm(), structural: noPerm(), custom: noPerm(), stores: noPerm() };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatToolNumber(n) {
  return "ERT-" + String(n).padStart(4, "0");
}

function formatPoNumber(n) {
  return "PO-" + String(n).padStart(4, "0");
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
  salesPeople: [],
  customers: ["HPE", "BPW"],
  stockCodes: [],
  storeCategories: ["Electrical", "CNC Tooling", "Fasteners", "Welding Consumables", "PPE"],
  nextToolNumber: 1,
  nextPoNumber: 1,
  suppliers: [],
  companyDetails: { name: "East Rand Supplies", address: "", phone: "", email: "" },
  sheetNames: [],
  storesCatalog: [
    { id: "sc1", name: "M6 Hex Bolt", category: "Fasteners", price: 0 },
    { id: "sc2", name: "M8 Hex Bolt", category: "Fasteners", price: 0 },
    { id: "sc3", name: "M10 Hex Bolt", category: "Fasteners", price: 0 },
    { id: "sc4", name: "M12 Hex Bolt", category: "Fasteners", price: 0 },
    { id: "sc5", name: "M16 Hex Bolt", category: "Fasteners", price: 0 },
    { id: "sc6", name: "M6 Hex Nut", category: "Fasteners", price: 0 },
    { id: "sc7", name: "M8 Hex Nut", category: "Fasteners", price: 0 },
    { id: "sc8", name: "M10 Hex Nut", category: "Fasteners", price: 0 },
    { id: "sc9", name: "M12 Hex Nut", category: "Fasteners", price: 0 },
    { id: "sc10", name: "M16 Hex Nut", category: "Fasteners", price: 0 },
    { id: "sc11", name: "M6 Flat Washer", category: "Fasteners", price: 0 },
    { id: "sc12", name: "M8 Flat Washer", category: "Fasteners", price: 0 },
    { id: "sc13", name: "M10 Flat Washer", category: "Fasteners", price: 0 },
    { id: "sc14", name: "M12 Flat Washer", category: "Fasteners", price: 0 },
    { id: "sc15", name: "M16 Flat Washer", category: "Fasteners", price: 0 },
    { id: "sc16", name: "M6 Spring Washer", category: "Fasteners", price: 0 },
    { id: "sc17", name: "M8 Spring Washer", category: "Fasteners", price: 0 },
    { id: "sc18", name: "M10 Spring Washer", category: "Fasteners", price: 0 },
    { id: "sc19", name: "M12 Spring Washer", category: "Fasteners", price: 0 },
    { id: "sc20", name: "M16 Spring Washer", category: "Fasteners", price: 0 },
  ],
};

const seed = [
  // ---- Plate & Sheet ----
  { id: "p1", mainCat: "plate", grade: "Mild Steel", size: "1225x2450mm", thickness: "0.9mm", name: plateName("1225x2450mm", "0.9mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p2", mainCat: "plate", grade: "Mild Steel", size: "1500x3000mm", thickness: "6mm", name: plateName("1500x3000mm", "6mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p3", mainCat: "plate", grade: "Stainless 430 BA PVC", size: "1250x2500mm", thickness: "0.9mm", name: plateName("1250x2500mm", "0.9mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p4", mainCat: "plate", grade: "Stainless 304 2B", size: "1250x2500mm", thickness: "2.5mm", name: plateName("1250x2500mm", "2.5mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p5", mainCat: "plate", grade: "Stainless 304 2B", size: "1250x2500mm", thickness: "3mm", name: plateName("1250x2500mm", "3mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p6", mainCat: "plate", grade: "Stainless 316 2B", size: "1250x2500mm", thickness: "3mm", name: plateName("1250x2500mm", "3mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p7", mainCat: "plate", grade: "Stainless 316 2B", size: "1250x2500mm", thickness: "4.5mm", name: plateName("1250x2500mm", "4.5mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p8", mainCat: "plate", grade: "Stainless 316 N4 PVC", size: "1250x2500mm", thickness: "3mm", name: plateName("1250x2500mm", "3mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p9", mainCat: "plate", grade: "3CR12", size: "2500x1250mm", thickness: "6mm", name: plateName("2500x1250mm", "6mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p10", mainCat: "plate", grade: "3CR12", size: "3000x1500mm", thickness: "6mm", name: plateName("3000x1500mm", "6mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },
  { id: "p11", mainCat: "plate", grade: "DOMEX 700", size: "1300x3200mm", thickness: "8mm", name: plateName("1300x3200mm", "8mm"), unit: "sheet", trackLength: false, length: 0, qty: 0, low: 0, loc: "", comment: "", salesPerson: "", customer: "" },

  // ---- Structural Steel ----
  ...DEFAULT_MASTER.sections.map((s, i) => ({
    id: "st" + i,
    mainCat: "structural",
    grade: s.name.includes("SS304") || s.name.includes("19.05mm") || s.name.includes("41.27mm") || s.name.includes("22.2mm") || (s.name.includes("38.1mm") && s.factor > 1 && s.factor < 2 && !s.name.includes("3.18") && !s.name.includes("1.6mm")) || s.name === "Round Bar 5mm"
      ? "Stainless 304"
      : s.name.includes("3.18mm") || s.name.includes("38.1mm x 1.6mm")
      ? "Aluminium"
      : "Mild Steel",
    name: s.name,
    unit: "m",
    trackLength: true,
    length: 6,
    qty: 0,
    low: 0,
    loc: "",
    comment: "",
    salesPerson: "",
    customer: "",
  })),

  // ---- Customer Stock (examples) ----
  { id: "c1", mainCat: "custom", customer: "HPE", partNumber: "HPE-1042", name: "Jackhammer Handle — Std", grade: "", qty: 42, value: 185, low: 15, loc: "Shelf F3", comment: "", salesPerson: "" },
  { id: "c2", mainCat: "custom", customer: "BPW", partNumber: "BPW-3307", name: "Fuel Theft Cover — SS", grade: "", qty: 11, value: 640, low: 12, loc: "Shelf F5", comment: "", salesPerson: "" },

  // ---- Stores (examples) ----
  { id: "s1", mainCat: "stores", customer: "CNC Tooling", partNumber: "", name: "10mm Carbide End Mill", grade: "", qty: 6, value: 320, low: 2, loc: "Tool Crib A", comment: "", salesPerson: "" },
  { id: "s2", mainCat: "stores", customer: "Fasteners", partNumber: "", name: "M10 x 30mm Hex Bolt (box of 100)", grade: "", qty: 4, value: 145, low: 1, loc: "Bin 12", comment: "", salesPerson: "" },
];

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
  const [master, setMaster] = useState(null);
  const [requisitions, setRequisitions] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState(null);
  const [poBuilder, setPoBuilder] = useState(null); // { supplierId, lineItems: [...], linkedRequisitionIds: [...], notes }
  const [selectedReqIds, setSelectedReqIds] = useState([]);
  const [requisitionTarget, setRequisitionTarget] = useState(null);
  const [requisitionQty, setRequisitionQty] = useState("");
  const [requisitionNotes, setRequisitionNotes] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);
  const [archiveTypeFilter, setArchiveTypeFilter] = useState("");
  const [archiveDateFrom, setArchiveDateFrom] = useState("");
  const [archiveDateTo, setArchiveDateTo] = useState("");
  const [session, setSession] = useState(undefined); // undefined = still checking, null = signed out
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [people, setPeople] = useState(null);
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup"
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [tab, setTab] = useState("plate");
  const [query, setQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState(null);
  const [sectionTypeFilter, setSectionTypeFilter] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [form, setForm] = useState(emptyForm);
  const [collapsed, setCollapsed] = useState({});
  const [showManager, setShowManager] = useState(false);
  const [managerTab, setManagerTab] = useState("sizes");
  const [managerInput, setManagerInput] = useState("");
  const [managerFactor, setManagerFactor] = useState("");
  const [managerPrice, setManagerPrice] = useState("");
  const [managerType, setManagerType] = useState("");
  const [stockCodeQuery, setStockCodeQuery] = useState("");
  const [scForm, setScForm] = useState({ stockCode: "", description: "", price: "", recommendedStock: "", customer: "" });
  const [scCatalogForm, setScCatalogForm] = useState({ name: "", category: "", price: "" });
  const [storesCatalogQuery, setStoresCatalogQuery] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [importFileLabel, setImportFileLabel] = useState("");
  const [importCustomer, setImportCustomer] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [filterGrade, setFilterGrade] = useState("");
  const [filterWidth, setFilterWidth] = useState("");
  const [filterLength, setFilterLength] = useState("");
  const [filterAreaMin, setFilterAreaMin] = useState("");
  const [filterAreaMax, setFilterAreaMax] = useState("");
  const [filterWeightMin, setFilterWeightMin] = useState("");
  const [filterWeightMax, setFilterWeightMax] = useState("");
  const [filterThickness, setFilterThickness] = useState("");
  const [filterPieceLength, setFilterPieceLength] = useState("");
  const [filterStockType, setFilterStockType] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("stock-items-v3", true);
        setItems(res && res.value ? JSON.parse(res.value) : seed);
      } catch {
        setItems(seed);
      }
      try {
        const res = await window.storage.get("stock-master-data-v2", true);
        let loaded = res && res.value ? { ...DEFAULT_MASTER, ...JSON.parse(res.value) } : DEFAULT_MASTER;
        // Migration: sections saved before the Section Types feature don't have
        // a `type` field. Backfill it by matching against the default library
        // so existing data doesn't silently vanish from the filtered picker.
        if (loaded.sections) {
          loaded = {
            ...loaded,
            sections: loaded.sections.map((s) => {
              if (s.type) return s;
              const match = DEFAULT_MASTER.sections.find((d) => d.name.toLowerCase() === s.name.toLowerCase());
              return { ...s, type: match ? match.type : "" };
            }),
          };
        }
        // Migration: suppliers used to be a plain list of names before they
        // gained email/phone/address (for Purchase Orders) — upgrade any
        // bare strings into proper entries instead of losing them.
        if (loaded.suppliers) {
          loaded = {
            ...loaded,
            suppliers: loaded.suppliers.map((s) =>
              typeof s === "string" ? { id: uid(), name: s, email: "", phone: "", address: "" } : s
            ),
          };
        }
        setMaster(loaded);
      } catch {
        setMaster(DEFAULT_MASTER);
      }
      try {
        const res = await window.storage.get("stock-requisitions-v1", true);
        setRequisitions(res && res.value ? JSON.parse(res.value) : []);
      } catch {
        setRequisitions([]);
      }
      try {
        const res = await window.storage.get("stock-purchase-orders-v1", true);
        setPurchaseOrders(res && res.value ? JSON.parse(res.value) : []);
      } catch {
        setPurchaseOrders([]);
      }
    })();
  }, []);

  // Real sign-in via Supabase Auth, replacing the old shared-PIN system.
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });
    return () => sub.subscription.unsubscribe();
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
              }
            : null
        );
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (items === null) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        await window.storage.set("stock-items-v3", JSON.stringify(items), true);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [items]);

  useEffect(() => {
    if (master === null) return;
    const t = setTimeout(() => {
      window.storage.set("stock-master-data-v2", JSON.stringify(master), true).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [master]);

  useEffect(() => {
    if (requisitions === null) return;
    const t = setTimeout(() => {
      window.storage.set("stock-requisitions-v1", JSON.stringify(requisitions), true).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [requisitions]);

  useEffect(() => {
    if (purchaseOrders === null) return;
    const t = setTimeout(() => {
      window.storage.set("stock-purchase-orders-v1", JSON.stringify(purchaseOrders), true).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [purchaseOrders]);

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
  };

  async function updatePersonField(id, field, value) {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    const column = FIELD_TO_COLUMN[field] || field;
    await supabase.from("profiles").update({ [column]: value }).eq("id", id);
  }

  async function updatePersonPermission(id, section, kind, value) {
    const person = people.find((p) => p.id === id);
    if (!person) return;
    const newPermissions = { ...person.permissions, [section]: { ...person.permissions[section], [kind]: value } };
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, permissions: newPermissions } : p)));
    await supabase.from("profiles").update({ permissions: newPermissions }).eq("id", id);
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
            }
          : p
      )
    );
    await supabase
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
      })
      .eq("id", id);
  }

  const isAdmin = !!profile?.isAdmin;
  const currentUser = session?.user || null;

  useEffect(() => {
    if (isAdmin && showManager && people === null) {
      loadPeople();
    }
  }, [isAdmin, showManager, people]);

  function canView(section) {
    if (isAdmin) return true;
    if (section === "requisitions") return !!profile?.canRequisition || !!profile?.canManageRequisitions;
    if (section === "purchaseOrders") return !!profile?.canManageRequisitions || !!profile?.canRaisePO;
    return profile ? !!profile.permissions?.[section]?.view : false;
  }

  function canEditQty(section) {
    if (isAdmin) return true;
    return profile ? !!profile.permissions?.[section]?.edit : false;
  }

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
      // Home page normally hides zero-stock items — except when there's an
      // active requisition tracking it, so the red/orange/green flag stays
      // visible until the order is actually fulfilled.
      .filter((it) => Number(it.qty) > 0 || !!activeRequisitionForItem(it.id))
      .filter((it) => (tab !== "custom" && tab !== "stores") || !customerFilter || it.customer === customerFilter)
      .filter((it) => tab !== "structural" || !sectionTypeFilter || findSectionType(it.name) === sectionTypeFilter)
      .filter((it) => !filterGrade || it.grade === filterGrade)
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
      const g = isGrouped ? it.customer || "Unassigned" : it.grade || "Ungraded";
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
    const hit = (master[listKey] || []).find((e) => e.name.toLowerCase() === (name || "").toLowerCase());
    return hit ? hit.price || 0 : 0;
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

  const tabWeightTotal = useMemo(() => {
    if (!master) return null;
    if (tab === "plate") return tabItems.reduce((sum, it) => sum + (plateWeight(it)?.total || 0), 0);
    if (tab === "structural") return tabItems.reduce((sum, it) => sum + (structuralWeight(it)?.total || 0), 0);
    return null;
  }, [tabItems, tab, master]);

  const tabValueTotal = useMemo(() => {
    if (!master) return null;
    if (tab === "custom" || tab === "stores") return tabItems.reduce((sum, it) => sum + Number(it.value || 0) * Number(it.qty || 0), 0);
    if (tab === "plate") return tabItems.reduce((sum, it) => sum + (plateValue(it)?.total || 0), 0);
    if (tab === "structural") return tabItems.reduce((sum, it) => sum + (structuralValue(it)?.total || 0), 0);
    return null;
  }, [tabItems, tab, master]);

  // Company-wide total, independent of the current tab/filters — every division, everything on hand.
  const grandTotalValue = useMemo(() => {
    if (!master || !items) return 0;
    return items.reduce((sum, it) => {
      if (it.mainCat === "plate") return sum + (plateValue(it)?.total || 0);
      if (it.mainCat === "structural") return sum + (structuralValue(it)?.total || 0);
      if (it.mainCat === "custom" || it.mainCat === "stores") return sum + Number(it.value || 0) * Number(it.qty || 0);
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
  }, [specCatalog, editingId, effectiveGrade, effectiveSize, effectiveSection, effectiveCustomer, form.thickness, form.partNumber, form.name, form.mainCat, form.length, form.trackLength, form.stockType, master]);

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

  function adjust(id, delta) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, qty: Math.max(0, Number(it.qty) + delta) } : it)));
    if (delta > 0) closeOutRequisitionsForItem(id);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    window.storage.delete(`attachment:${id}`, true).catch(() => {});
  }

  function openRequisition(it) {
    setRequisitionTarget(it);
    setRequisitionQty("");
    setRequisitionNotes("");
  }

  function closeRequisition() {
    setRequisitionTarget(null);
    setRequisitionQty("");
    setRequisitionNotes("");
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
        supplier: "",
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

  function generatePoPdf(po) {
    const doc = new jsPDF();
    const company = master.companyDetails || {};
    const supplier = master.suppliers.find((s) => s.id === po.supplierId);
    const leftX = 14;

    let headerY = 18;
    let textX = leftX;
    if (company.logo) {
      try {
        doc.addImage(company.logo, "JPEG", leftX, headerY - 6, 22, 22);
        textX = leftX + 28;
      } catch {
        // bad image data — just skip it rather than fail the whole PDF
      }
    }
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(company.name || "Purchase Order", textX, headerY);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    let compY = headerY + 6;
    [company.address, company.phone, company.email].filter(Boolean).forEach((line) => {
      doc.text(line, textX, compY);
      compY += 5;
    });

    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("PURCHASE ORDER", 196, 16, { align: "right" });
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(po.poNumber, 196, 23, { align: "right" });
    doc.text(new Date(po.dateCreated).toLocaleDateString(), 196, 29, { align: "right" });

    let y = Math.max(compY, 40) + 8;

    let supX = leftX;
    if (supplier?.logo) {
      try {
        doc.addImage(supplier.logo, "JPEG", leftX, y, 18, 18);
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
    doc.text(supplier?.name || po.supplierName || "—", supX, supY);
    supY += 5;
    [supplier?.email, supplier?.phone, supplier?.address].filter(Boolean).forEach((line) => {
      doc.text(line, supX, supY);
      supY += 5;
    });

    y = Math.max(supY, y + 22) + 6;

    autoTable(doc, {
      startY: y,
      head: [["Description", "Qty", "Unit Price", "Total"]],
      body: po.lineItems.map((li) => [
        li.description,
        String(li.qty),
        `R ${Number(li.unitPrice).toFixed(2)}`,
        `R ${(Number(li.qty) * Number(li.unitPrice)).toFixed(2)}`,
      ]),
      foot: [["", "", "Total", `R ${po.totalValue.toFixed(2)}`]],
      theme: "grid",
      headStyles: { fillColor: [27, 29, 31] },
      footStyles: { fillColor: [242, 169, 0], textColor: [27, 29, 31], fontStyle: "bold" },
    });

    if (po.notes) {
      const finalY = (doc.lastAutoTable?.finalY || y + 20) + 10;
      doc.setFontSize(9);
      doc.text(`Notes: ${po.notes}`, leftX, finalY);
    }

    doc.save(`${po.poNumber}.pdf`);
  }

  function openPoBuilder(linkedRequisitionIds = [], prefillSupplierId = "", prefillLineItems = []) {
    setPoBuilder({
      supplierId: prefillSupplierId,
      lineItems: prefillLineItems.length ? prefillLineItems : [{ description: "", qty: "", unitPrice: "" }],
      notes: "",
      linkedRequisitionIds,
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
      unitPrice: resolveReqPrice(r),
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
    const totalValue = validLines.reduce((sum, li) => sum + Number(li.qty) * Number(li.unitPrice || 0), 0);
    const po = {
      id: uid(),
      poNumber: formatPoNumber(master.nextPoNumber),
      supplierId: poBuilder.supplierId,
      supplierName: master.suppliers.find((s) => s.id === poBuilder.supplierId)?.name || "",
      dateCreated: new Date().toISOString(),
      createdBy: roleLabel,
      lineItems: validLines.map((li) => ({ ...li, qty: Number(li.qty), unitPrice: Number(li.unitPrice) || 0 })),
      totalValue,
      notes: poBuilder.notes.trim(),
      linkedRequisitionIds: poBuilder.linkedRequisitionIds,
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
    generatePoPdf(po);
    closePoBuilder();
  }

  // Requisitions are never deleted from here — completed ones (received,
  // fulfilled, or cancelled) move into the archived section for record
  // keeping instead. See ARCHIVE_STATUSES below.
  function resolveReqPrice(req) {
    if (!master) return 0;
    if (req.mainCat === "plate") return findPrice("grades", req.itemGrade);
    if (req.mainCat === "structural") return findPrice("sections", req.itemRawName);
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
    } else {
      setItems((prev) => prev.map((it) => (it.id === req.itemId ? { ...it, value: price } : it)));
    }
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
    const rows = (master.stockCodes || []).map((r) => ({
      "Stock Code": r.stockCode,
      Description: r.description,
      "Unit Price (R)": r.price,
      "Recommended Stock": r.recommendedStock,
    }));
    if (rows.length === 0) {
      alert("Nothing in the stock codes catalog yet.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Codes");
    XLSX.writeFile(wb, `Stock-Codes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function toggleGrade(key) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function addItem(e) {
    e.preventDefault();
    if (matchedExisting && !allowDuplicate) return;

    if (form.grade === CUSTOM && effectiveGrade) ensureFactorEntry("grades", effectiveGrade, 7.85);
    if (form.size === CUSTOM && effectiveSize) ensureStringEntry("sizes", effectiveSize);
    if (form.sectionType === CUSTOM && effectiveSectionType) ensureStringEntry("sectionTypes", effectiveSectionType);
    if (form.section === CUSTOM && effectiveSection) ensureFactorEntry("sections", effectiveSection, 0, effectiveSectionType);
    if (form.customer === CUSTOM && effectiveCustomer) ensureStringEntry("customers", effectiveCustomer);
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
    } else {
      // Customer Stock requires a part number; Stores items don't have to —
      // except Tools, which get one assigned automatically.
      const isNewTool = form.mainCat === "stores" && form.storesKind === "tool" && !editingId;
      const assignedPartNumber = isNewTool ? formatToolNumber(master.nextToolNumber) : form.partNumber.trim();
      if (!effectiveCustomer || !form.name.trim() || (form.mainCat === "custom" && !form.partNumber.trim())) return;
      payload = {
        ...base,
        mainCat: form.mainCat,
        grade: "",
        partNumber: assignedPartNumber,
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
      if (isNewTool) {
        setMaster((prev) => ({ ...prev, nextToolNumber: (prev.nextToolNumber || 1) + 1 }));
      }
    }

    if (editingId) {
      const before = items.find((it) => it.id === editingId);
      setItems((prev) => prev.map((it) => (it.id === editingId ? { ...payload, id: editingId } : it)));
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
    const grade = resolveField(master.grades.map((g) => g.name), it.grade);
    const sp = resolveField(master.salesPeople, it.salesPerson);
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
    return {
      ...base,
      customer: cust.field, customCustomer: cust.custom,
      // Duplicating a Tool should get its own fresh number, not reuse the
      // original — clear the part number so the auto-assign logic kicks in.
      partNumber: duplicate && it.storesKind === "tool" ? "" : it.partNumber || "",
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
    setQuery(it.mainCat === "custom" || it.mainCat === "stores" ? (it.partNumber || it.name) : it.name);
  }

  const managerIsFactorTable = managerTab === "grades" || managerTab === "sections";

  function addMasterEntry() {
    const val = managerInput.trim();
    if (!val) return;
    if (managerIsFactorTable) {
      const factor = parseFloat(managerFactor) || 0;
      const price = parseFloat(managerPrice) || 0;
      const extra = managerTab === "sections" ? { type: managerType } : {};
      setMaster((prev) => {
        const list = prev[managerTab] || [];
        if (list.some((x) => x.name.toLowerCase() === val.toLowerCase())) return prev;
        return { ...prev, [managerTab]: [...list, { name: val, factor, price, ...extra }] };
      });
      setManagerFactor("");
      setManagerPrice("");
      setManagerType("");
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

  function updateSectionType(name, newType) {
    setMaster((prev) => ({
      ...prev,
      sections: (prev.sections || []).map((x) => (x.name === name ? { ...x, type: newType } : x)),
    }));
  }

  function updateStockCodeRow(id, field, value) {
    setMaster((prev) => ({
      ...prev,
      stockCodes: (prev.stockCodes || []).map((r) =>
        r.id === id ? { ...r, [field]: field === "price" || field === "recommendedStock" ? parseFloat(value) || 0 : value } : r
      ),
    }));
  }

  function removeStockCodeRow(id) {
    setMaster((prev) => ({ ...prev, stockCodes: (prev.stockCodes || []).filter((r) => r.id !== id) }));
  }

  function addStockCodeRow() {
    if (!scForm.stockCode.trim()) return;
    setMaster((prev) => ({
      ...prev,
      stockCodes: [
        ...(prev.stockCodes || []),
        {
          id: uid(),
          stockCode: scForm.stockCode.trim(),
          description: scForm.description.trim(),
          price: parseFloat(scForm.price) || 0,
          recommendedStock: parseFloat(scForm.recommendedStock) || 0,
          customer: scForm.customer,
        },
      ],
    }));
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
      suppliers: [...prev.suppliers, { id: uid(), name: newSupplierName.trim(), email: "", phone: "", address: "", logo: "" }],
    }));
    setNewSupplierName("");
  }

  function updateSupplierField(id, field, value) {
    setMaster((prev) => ({ ...prev, suppliers: prev.suppliers.map((s) => (s.id === id ? { ...s, [field]: value } : s)) }));
  }

  function removeSupplierRow(id) {
    setMaster((prev) => ({ ...prev, suppliers: prev.suppliers.filter((s) => s.id !== id) }));
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
        { id: uid(), name: scCatalogForm.name.trim(), category: scCatalogForm.category || (prev.storeCategories[0] || ""), price: parseFloat(scCatalogForm.price) || 0 },
      ],
    }));
    setScCatalogForm({ name: "", category: scCatalogForm.category, price: "" });
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportFileLabel(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!rows.length) return;
        const header = rows[0].map((h) => String(h).toLowerCase());
        const codeIdx = header.findIndex((h) => h.includes("stockcode") || h.includes("stock code") || h.includes("code"));
        const descIdx = header.findIndex((h) => h.includes("desc"));
        const priceIdx = header.findIndex((h) => h.includes("price") || h.includes("cost") || h.includes("r/") || h.includes("rand"));
        const recIdx = header.findIndex((h) => h.includes("recommend") || h.includes("reorder") || h.includes("par"));
        const newRows = rows
          .slice(1)
          .filter((r) => r.length && r.some((c) => String(c).trim() !== ""))
          .map((r) => ({
            id: uid(),
            stockCode: codeIdx >= 0 ? String(r[codeIdx] || "").trim() : String(r[0] || "").trim(),
            description: descIdx >= 0 ? String(r[descIdx] || "").trim() : String(r[1] || "").trim(),
            price: priceIdx >= 0 ? parseFloat(String(r[priceIdx]).replace(/[^0-9.]/g, "")) || 0 : 0,
            recommendedStock: recIdx >= 0 ? parseFloat(r[recIdx]) || 0 : 0,
            customer: importCustomer,
          }))
          .filter((r) => r.stockCode);
        setMaster((prev) => ({ ...prev, stockCodes: [...(prev.stockCodes || []), ...newRows] }));
        alert(
          `Imported ${newRows.length} rows${importCustomer ? ` for ${importCustomer}` : ""}. Check a few entries below to confirm the columns mapped correctly — rename this section's columns in your file and re-import if anything looks off.`
        );
      } catch (err) {
        alert("Couldn't read that file — make sure it's a .xlsx, .xls, or .csv export.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  if (items === null || master === null || requisitions === null || purchaseOrders === null) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: F.mono, color: C.muted, letterSpacing: "0.08em" }}>LOADING STOCK…</div>
      </div>
    );
  }

  const RoleIcon = isAdmin ? ShieldCheck : User;
  const roleLabel = profile?.name || currentUser?.email || "Someone";

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
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
      `}</style>

      <header style={S.header}>
        <div>
          <div style={S.eyebrow}>EAST RAND SUPPLIES</div>
          <h1 style={S.h1}>Stock Control</h1>
        </div>
        <div style={S.headerRight}>
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
          <div style={S.mainTabs}>
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            className="stk-btn"
            onClick={() => {
              setTab(t.key);
              setCustomerFilter(null);
              setSectionTypeFilter(null);
            }}
            style={{ ...S.mainTab, ...(tab === t.key ? S.mainTabActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "requisitions" ? (
        <div style={S.list}>
          {requisitions.length === 0 && <div style={S.empty}>No requisitions yet.</div>}
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
                        <div style={S.rowMeta}>
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
                              Current price ({r.mainCat === "plate" ? "R/kg" : r.mainCat === "structural" ? "R/m" : "R/ea"})
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
                            <input
                              style={{ ...S.input, flex: 1 }}
                              placeholder="Supplier (optional)"
                              value={r.supplier}
                              onChange={(e) => updateRequisition(r.id, { supplier: e.target.value })}
                            />
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
                          <div style={S.rowMeta}>
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
          {canRaisePO && (
            <button type="button" className="stk-btn" style={S.addBtn} onClick={() => openPoBuilder()}>
              <Plus size={15} strokeWidth={2.5} /> Raise Purchase Order
            </button>
          )}
          {purchaseOrders.length === 0 && <div style={S.empty}>No Purchase Orders yet.</div>}
          <div style={{ ...S.gradeItems, marginTop: 10 }}>
            {[...purchaseOrders]
              .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))
              .map((po) => (
                <div key={po.id} style={S.reqCard}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{po.poNumber} — {po.supplierName || "No supplier"}</span>
                    <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>R{po.totalValue.toFixed(2)}</span>
                  </div>
                  <div style={S.rowMeta}>
                    <span>Raised by {po.createdBy}</span>
                    <span>{new Date(po.dateCreated).toLocaleDateString()}</span>
                    <span>{po.lineItems.length} line{po.lineItems.length === 1 ? "" : "s"}</span>
                  </div>
                  {po.notes && <div style={S.itemComment}>{po.notes}</div>}
                  <div style={S.reqActions}>
                    <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => generatePoPdf(po)}>
                      <FileText size={13} /> Download PDF
                    </button>
                  </div>
                </div>
              ))}
          </div>
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
      </div>

      {showFilters && tab !== "custom" && tab !== "stores" && (
        <div style={S.filterBar}>
          <div>
            <label style={S.label}>Material</label>
            <select style={S.input} value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
              <option value="">All materials</option>
              {master.grades.map((g) => (
                <option key={g.name} value={g.name}>{g.name}</option>
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
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {(tab === "custom" || tab === "stores") && (
        <div style={S.chipRow}>
          <button className="stk-btn" style={{ ...S.chip, ...(!customerFilter ? S.chipActive : {}) }} onClick={() => setCustomerFilter(null)}>
            All
          </button>
          {(tab === "custom" ? master.customers : master.storeCategories).map((c) => (
            <button
              key={c}
              className="stk-btn"
              style={{ ...S.chip, ...(customerFilter === c ? S.chipActive : {}) }}
              onClick={() => setCustomerFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {tab === "structural" && master.sectionTypes.length > 0 && (
        <div style={S.chipRow}>
          <button className="stk-btn" style={{ ...S.chip, ...(!sectionTypeFilter ? S.chipActive : {}) }} onClick={() => setSectionTypeFilter(null)}>
            All types
          </button>
          {master.sectionTypes.map((t) => (
            <button
              key={t}
              className="stk-btn"
              style={{ ...S.chip, ...(sectionTypeFilter === t ? S.chipActive : {}) }}
              onClick={() => setSectionTypeFilter(t)}
            >
              {t}
            </button>
          ))}
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
                          {tab === "custom" || tab === "stores" ? (
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
                          {it.comment && <div style={S.itemComment}>{it.comment}</div>}
                          <div style={S.rowMeta}>
                            {tab === "plate" && it.sheetName && <span>{it.sheetName}</span>}
                            {(tab === "plate" || tab === "structural") && it.stockType === "offcut" && (
                              <span style={S.offcutTag}>Offcut</span>
                            )}
                            {tab === "stores" && it.storesKind === "tool" && <span style={S.offcutTag}>Tool</span>}
                            {tab === "stores" && it.storesKind === "toolConsumable" && (
                              <span style={S.offcutTag}>Tool Consumable</span>
                            )}
                            {pw && <span>{pw.perSheet.toFixed(1)}kg/sheet · {pw.total.toFixed(1)}kg total</span>}
                            {sw && <span>{sw.perM.toFixed(2)}kg/m · {sw.total.toFixed(1)}kg total</span>}
                            {it.trackLength && it.length > 0 && (
                              <span>{it.length}m lengths</span>
                            )}
                            {it.loc && <span>{it.loc}</span>}
                            {it.salesPerson && <span>Sales: {it.salesPerson}</span>}
                            {it.supplier && <span>Supplier: {it.supplier}</span>}
                            {tab !== "custom" && tab !== "stores" && it.customer && <span>Customer: {it.customer}</span>}
                            {(tab === "custom" || tab === "stores") && canSeeValue && (
                              <span>R{Number(it.value || 0).toFixed(2)} ea · R{(Number(it.value || 0) * Number(it.qty || 0)).toFixed(2)} total</span>
                            )}
                            {tab === "plate" && canSeeValue && pw && (
                              <span>R{(plateValue(it)?.total || 0).toFixed(2)} value</span>
                            )}
                            {tab === "structural" && canSeeValue && sw && (
                              <span>R{(structuralValue(it)?.total || 0).toFixed(2)} value</span>
                            )}
                            {low && (
                              <span style={S.lowTag}>
                                <AlertTriangle size={11} strokeWidth={2.5} /> below {it.low}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={S.rowControls}>
                          <div style={S.qtyBlock}>
                            {canEditQty(tab) && (
                              <button className="stk-btn" style={S.qtyBtn} onClick={() => adjust(it.id, -1)}>
                                <Minus size={15} strokeWidth={2.5} />
                              </button>
                            )}
                            <div style={S.qtyDisplay}>
                              <span style={{ ...S.qtyNum, color: low ? C.danger : C.text }}>{it.qty}</span>
                              <span style={S.qtyUnit}>{it.trackLength ? "pcs" : it.unit}</span>
                            </div>
                            {canEditQty(tab) && (
                              <button className="stk-btn" style={S.qtyBtn} onClick={() => adjust(it.id, 1)}>
                                <Plus size={15} strokeWidth={2.5} />
                              </button>
                            )}
                          </div>
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
      </div>
        </>
      )}
        </>
      )}

      {showAdd && (canAdd || canEditItems) && (
        <div style={S.modalOverlay} onClick={closeAdd}>
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

            {form.mainCat === "custom" || form.mainCat === "stores" ? (
              <>
                <LibraryField
                  label={form.mainCat === "stores" ? "Category" : "Customer"}
                  options={form.mainCat === "stores" ? master.storeCategories : master.customers}
                  value={form.customer}
                  onChange={(v) => setForm({ ...form, customer: v })}
                  customValue={form.customCustomer}
                  onCustomChange={(v) => setForm({ ...form, customCustomer: v })}
                  placeholder={form.mainCat === "stores" ? "e.g. Hand Tools" : "e.g. New Customer Pty Ltd"}
                />
                {form.mainCat === "stores" && (
                  <div style={{ marginTop: 10 }}>
                    <label style={S.label}>Type</label>
                    <div style={S.segRow}>
                      {[
                        { key: "tool", label: "Tool" },
                        { key: "consumable", label: "Consumable" },
                        { key: "toolConsumable", label: "Tool Consumable" },
                      ].map((t) => (
                        <button
                          type="button"
                          key={t.key}
                          className="stk-btn"
                          onClick={() => setForm({ ...form, storesKind: t.key, partNumber: t.key === "tool" ? "" : form.partNumber })}
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
                {form.mainCat === "custom" && master.stockCodes.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <label style={S.label}>Fill from Stock Codes (optional)</label>
                    <input
                      style={S.input}
                      list="stock-code-options"
                      placeholder="Start typing a stock code or description…"
                      onChange={(e) => {
                        const hit = master.stockCodes.find((r) => `${r.stockCode} — ${r.description}` === e.target.value);
                        if (hit) {
                          const custResolved = hit.customer ? resolveField(master.customers, hit.customer) : null;
                          setForm((f) => ({
                            ...f,
                            partNumber: hit.stockCode,
                            name: hit.description,
                            value: String(hit.price || ""),
                            low: f.low || String(hit.recommendedStock || ""),
                            ...(custResolved ? { customer: custResolved.field, customCustomer: custResolved.custom } : {}),
                          }));
                        }
                      }}
                    />
                    <datalist id="stock-code-options">
                      {master.stockCodes.map((r) => (
                        <option key={r.id} value={`${r.stockCode} — ${r.description}`} />
                      ))}
                    </datalist>
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
                    {form.mainCat === "stores" && form.storesKind === "tool"
                      ? "Part number"
                      : form.mainCat === "stores" && form.storesKind === "toolConsumable"
                      ? "Supplier part code (optional)"
                      : `Part number ${form.mainCat === "stores" ? "(optional)" : ""}`}
                  </label>
                  {form.mainCat === "stores" && form.storesKind === "tool" ? (
                    <div style={S.roleHint}>
                      {editingId ? (
                        <>
                          This tool's number: <strong style={{ color: C.accentRaw }}>{form.partNumber || "—"}</strong> (doesn't change when editing)
                        </>
                      ) : (
                        <>
                          Assigned automatically when you save — will be{" "}
                          <strong style={{ color: C.accentRaw }}>{formatToolNumber(master.nextToolNumber)}</strong>
                        </>
                      )}
                    </div>
                  ) : (
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

                <div style={{ marginTop: form.mainCat === "structural" ? 10 : 0 }}>
                  <LibraryField
                    label="Material grade"
                    options={master.grades.map((g) => g.name)}
                    value={form.grade}
                    onChange={(v) => setForm({ ...form, grade: v })}
                    customValue={form.customGrade}
                    onCustomChange={(v) => setForm({ ...form, customGrade: v })}
                    placeholder="e.g. Duplex 2205"
                  />
                </div>

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

            {form.mainCat === "custom" || form.mainCat === "stores" ? (
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
              <LibraryField
                label="Sales person"
                options={master.salesPeople}
                value={form.salesPerson}
                onChange={(v) => setForm({ ...form, salesPerson: v })}
                customValue={form.customSalesPerson}
                onCustomChange={(v) => setForm({ ...form, customSalesPerson: v })}
                placeholder="e.g. Sipho M"
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
        <div style={S.modalOverlay} onClick={() => setShowManager(false)}>
          <div style={S.managerModal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Stock Manager</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setShowManager(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={S.managerTabs}>
              {MANAGER_TABS.filter((t) => t.key !== "departments" || isAdmin).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="stk-btn"
                  onClick={() => {
                    setManagerTab(t.key);
                    setManagerInput("");
                    setManagerFactor("");
                  }}
                  style={{ ...S.managerTab, ...(managerTab === t.key ? S.managerTabActive : {}) }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {managerTab === "stockCodes" ? (
              <>
                <div style={S.managerAddRow}>
                  <select
                    style={{ ...S.input, flex: 1 }}
                    value={importCustomer}
                    onChange={(e) => setImportCustomer(e.target.value)}
                  >
                    <option value="">Customer for import (optional) — none</option>
                    {master.customers.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <label className="stk-btn" style={{ ...S.addBtn, cursor: "pointer" }}>
                    <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleImportFile} />
                    Import Excel
                  </label>
                  <button type="button" className="stk-btn" style={S.roleChip} onClick={exportStockCodes}>
                    <Download size={13} />
                    Export
                  </button>
                </div>
                {importFileLabel && <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 4 }}>{importFileLabel}</div>}
                <div style={S.roleHint}>
                  Imports the first sheet, matching columns containing "stock code", "description", "price", and "recommended"/"reorder". Test with a
                  small file first and check a few rows below before importing the full 400. Leave the customer blank to import shared/general stock codes.
                </div>

                <div style={{ ...S.managerAddRow, marginTop: 12 }}>
                  <input style={{ ...S.input, flex: 1 }} value={scForm.stockCode} onChange={(e) => setScForm({ ...scForm, stockCode: e.target.value })} placeholder="Stock code" />
                  <input style={{ ...S.input, flex: 2 }} value={scForm.description} onChange={(e) => setScForm({ ...scForm, description: e.target.value })} placeholder="Description" />
                </div>
                <div style={{ ...S.managerAddRow, marginTop: 6 }}>
                  <input style={{ ...S.input, flex: 1 }} type="number" step="0.01" value={scForm.price} onChange={(e) => setScForm({ ...scForm, price: e.target.value })} placeholder="Unit price (R)" />
                  <input style={{ ...S.input, flex: 1 }} type="number" value={scForm.recommendedStock} onChange={(e) => setScForm({ ...scForm, recommendedStock: e.target.value })} placeholder="Recommended stock" />
                </div>
                <div style={{ ...S.managerAddRow, marginTop: 6 }}>
                  <select style={{ ...S.input, flex: 1 }} value={scForm.customer} onChange={(e) => setScForm({ ...scForm, customer: e.target.value })}>
                    <option value="">Customer (optional) — none</option>
                    {master.customers.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button type="button" className="stk-btn" style={S.addBtn} onClick={addStockCodeRow}>
                    <Plus size={15} />
                    Add
                  </button>
                </div>

                <input
                  style={{ ...S.input, marginTop: 12, marginBottom: 10 }}
                  value={stockCodeQuery}
                  onChange={(e) => setStockCodeQuery(e.target.value)}
                  placeholder="Search stock code or description…"
                />

                <div style={S.managerList}>
                  {(master.stockCodes || [])
                    .filter((r) => (r.stockCode + " " + r.description).toLowerCase().includes(stockCodeQuery.toLowerCase()))
                    .map((r) => (
                      <div key={r.id} style={S.managerRow}>
                        <EditableName value={r.stockCode} onCommit={(v) => updateStockCodeRow(r.id, "stockCode", v)} style={{ maxWidth: 110 }} />
                        <EditableName value={r.description} onCommit={(v) => updateStockCodeRow(r.id, "description", v)} />
                        <input
                          type="number"
                          step="0.01"
                          value={r.price === 0 ? "" : r.price}
                          placeholder="0"
                          onChange={(e) => updateStockCodeRow(r.id, "price", e.target.value)}
                          style={S.managerFactorInput}
                          title="Unit price (R)"
                        />
                        <input
                          type="number"
                          value={r.recommendedStock === 0 ? "" : r.recommendedStock}
                          placeholder="0"
                          onChange={(e) => updateStockCodeRow(r.id, "recommendedStock", e.target.value)}
                          style={S.managerFactorInput}
                          title="Recommended stock"
                        />
                        <select
                          value={r.customer || ""}
                          onChange={(e) => updateStockCodeRow(r.id, "customer", e.target.value)}
                          style={{ ...S.managerFactorInput, width: 110 }}
                        >
                          <option value="">No customer</option>
                          {master.customers.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeStockCodeRow(r.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  {(master.stockCodes || []).length === 0 && <div style={S.empty}>Nothing here yet — import a file or add one above.</div>}
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

                <input
                  style={{ ...S.input, marginTop: 12, marginBottom: 10 }}
                  value={storesCatalogQuery}
                  onChange={(e) => setStoresCatalogQuery(e.target.value)}
                  placeholder="Search the catalog…"
                />

                <div style={S.managerList}>
                  {Object.entries(
                    (master.storesCatalog || [])
                      .filter((r) => (r.name + " " + r.category).toLowerCase().includes(storesCatalogQuery.toLowerCase()))
                      .reduce((acc, r) => {
                        const k = r.category || "Uncategorised";
                        (acc[k] = acc[k] || []).push(r);
                        return acc;
                      }, {})
                  )
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([cat, list]) => (
                      <div key={cat}>
                        <div style={S.managerGroupHeader}>{cat} · {list.length}</div>
                        {list.map((r) => (
                          <div key={r.id} style={S.managerRow}>
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
            ) : managerTab === "suppliers" ? (
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
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                  {master.suppliers.map((s) => (
                    <div key={s.id} style={S.deptCard}>
                      <div style={S.deptCardHead}>
                        {s.logo ? (
                          <img src={s.logo} alt="" style={S.supplierLogoPreview} />
                        ) : (
                          <div style={S.supplierLogoPlaceholder}>
                            <ImageIcon size={16} color={C.muted} />
                          </div>
                        )}
                        <EditableName value={s.name} onCommit={(v) => updateSupplierField(s.id, "name", v)} style={{ fontWeight: 600, fontSize: 14 }} />
                        <label className="stk-btn" style={S.managerDelete} title="Upload logo">
                          <Paperclip size={13} />
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleSupplierLogoSelect(s.id, e)} />
                        </label>
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeSupplierRow(s.id)}>
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
                    </div>
                  ))}
                  {master.suppliers.length === 0 && <div style={S.empty}>No suppliers yet — add one above.</div>}
                </div>
              </>
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
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted }}>{p.email}</div>
                        </div>
                        <label style={{ ...S.deptToggleItem, flexShrink: 0 }}>
                          <input type="checkbox" checked={p.isAdmin} onChange={(e) => updatePersonField(p.id, "isAdmin", e.target.checked)} />
                          Admin
                        </label>
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => resetPersonAccess(p.id)} title="Reset all access">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {!p.isAdmin && (
                        <>
                          <div style={S.deptPermGrid}>
                            <div />
                            <div style={S.deptPermHead}>View</div>
                            <div style={S.deptPermHead}>Edit qty</div>
                            {SECTIONS.map((sec) => (
                              <Fragment key={sec}>
                                <div style={S.deptPermLabel}>{TABS.find((t) => t.key === sec)?.label}</div>
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
                        placeholder={managerTab === "grades" ? "Density g/cm³" : "kg/m"}
                      />
                      <input
                        style={{ ...S.input, flex: 1 }}
                        type="number"
                        step="0.01"
                        value={managerPrice}
                        onChange={(e) => setManagerPrice(e.target.value)}
                        placeholder={managerTab === "grades" ? "R/kg" : "R/m"}
                      />
                    </>
                  )}
                  <button type="button" className="stk-btn" style={S.addBtn} onClick={addMasterEntry}>
                    <Plus size={15} strokeWidth={2.5} />
                    Add
                  </button>
                </div>
                {managerTab === "sections" && (
                  <div style={{ ...S.managerAddRow, marginTop: 6 }}>
                    <select style={S.input} value={managerType} onChange={(e) => setManagerType(e.target.value)}>
                      <option value="">New section's type — none yet</option>
                      {master.sectionTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={S.managerList}>
                  {master[managerTab].length === 0 && <div style={S.empty}>Nothing here yet — add one above.</div>}
                  {managerIsFactorTable
                    ? (managerTab === "sections"
                        ? Object.entries(
                            master.sections.reduce((acc, s) => {
                              const k = s.type || "Ungrouped";
                              (acc[k] = acc[k] || []).push(s);
                              return acc;
                            }, {})
                          ).sort((a, b) => a[0].localeCompare(b[0]))
                        : [[null, master[managerTab]]]
                      ).map(([groupName, list]) => (
                        <div key={groupName || "flat"}>
                          {groupName && <div style={S.managerGroupHeader}>{groupName} · {list.length}</div>}
                          {list.map((entry) => (
                            <div key={entry.name} style={S.managerRow}>
                              <EditableName value={entry.name} onCommit={(v) => renameMasterEntry(managerTab, entry.name, v)} />
                              <input
                                type="number"
                                step="0.01"
                                value={entry.factor === 0 ? "" : entry.factor}
                                placeholder="0"
                                onChange={(e) => updateFactorField(entry.name, "factor", e.target.value)}
                                style={S.managerFactorInput}
                                title={managerTab === "grades" ? "Density g/cm³" : "kg/m"}
                              />
                              <input
                                type="number"
                                step="0.01"
                                value={!entry.price ? "" : entry.price}
                                placeholder="0"
                                onChange={(e) => updateFactorField(entry.name, "price", e.target.value)}
                                style={S.managerFactorInput}
                                title={managerTab === "grades" ? "R/kg" : "R/m"}
                              />
                              {managerTab === "sections" && (
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
                              )}
                              <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeMasterEntry(entry)}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ))
                    : master[managerTab].map((entry) => (
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
          </div>
        </div>
      )}

      {previewItem && (
        <div style={S.modalOverlay} onClick={closePreview}>
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
                <embed src={previewData} type="application/pdf" style={S.previewPdf} />
                <a href={previewData} download={previewItem.attachmentName || "drawing.pdf"} style={S.previewDownload}>
                  Download PDF
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {poBuilder && (
        <div style={S.modalOverlay} onClick={closePoBuilder}>
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

            <div style={S.poTotalRow}>
              Total: R
              {poBuilder.lineItems
                .reduce((sum, li) => sum + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0), 0)
                .toFixed(2)}
            </div>

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
        <div style={S.modalOverlay} onClick={() => setShowLowStock(false)}>
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
                            <div style={S.qtyBlock}>
                              <button
                                type="button"
                                className="stk-btn"
                                style={S.qtyBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  adjust(it.id, -1);
                                }}
                              >
                                <Minus size={13} strokeWidth={2.5} />
                              </button>
                              <span style={{ ...S.qtyNum, fontSize: 14, color: C.danger, minWidth: 22, textAlign: "center" }}>{it.qty}</span>
                              <button
                                type="button"
                                className="stk-btn"
                                style={S.qtyBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  adjust(it.id, 1);
                                }}
                              >
                                <Plus size={13} strokeWidth={2.5} />
                              </button>
                            </div>
                          ) : (
                            <span style={{ ...S.qtyNum, fontSize: 14, color: C.danger }}>{it.qty}</span>
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

      {requisitionTarget && (
        <div style={S.modalOverlay} onClick={closeRequisition}>
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

const C = {
  bg: "#1B1D1F",
  surface: "#232629",
  surfaceHover: "#282C2F",
  border: "#33383C",
  text: "#ECEAE4",
  muted: "#8B9096",
  accentRaw: "#F2A900",
  accentTint: "#3A2E10",
  accentFinished: "#4A9B8E",
  danger: "#D6543B",
  dangerTint: "#3A1E17",
};

const S = {
  page: {
    minHeight: "100%",
    background: C.bg,
    color: C.text,
    fontFamily: F.body,
    padding: "20px 16px 40px",
    maxWidth: 760,
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
  eyebrow: {
    fontFamily: F.mono,
    fontSize: 11,
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
    fontSize: 12,
    color: C.danger,
    background: C.dangerTint,
    border: `1px solid ${C.danger}55`,
    borderRadius: 6,
    padding: "5px 9px",
    cursor: "pointer",
  },
  totalValueBadge: {
    fontFamily: F.mono,
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
    color: C.text,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  mainTabs: {
    display: "flex",
    gap: 4,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 9,
    padding: 4,
    marginBottom: 10,
  },
  mainTab: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: C.muted,
    borderRadius: 6,
    padding: "9px 8px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
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
    fontSize: 14,
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
    fontSize: 13,
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
    fontSize: 12,
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
    fontSize: 12.5,
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
    fontSize: 12,
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
    fontSize: 14,
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
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  staffNote: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: F.mono,
    fontSize: 11,
    color: C.muted,
  },
  list: { display: "flex", flexDirection: "column", gap: 14 },
  empty: {
    color: C.muted,
    fontSize: 13,
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
    fontSize: 11,
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
  itemName: { fontSize: 14, fontWeight: 500, color: C.text },
  itemComment: { fontSize: 11.5, color: C.muted, fontStyle: "italic", marginTop: 2 },
  partTag: {
    fontFamily: F.mono,
    fontSize: 10.5,
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
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 12,
    textDecoration: "underline",
  },
  rowMeta: {
    display: "flex",
    gap: 12,
    marginTop: 5,
    fontSize: 12,
    color: C.muted,
    fontFamily: F.mono,
    flexWrap: "wrap",
  },
  lowTag: { display: "flex", alignItems: "center", gap: 4, color: C.danger },
  offcutTag: {
    fontFamily: F.mono,
    fontSize: 10,
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
  qtyUnit: { fontFamily: F.mono, fontSize: 10, color: C.muted, marginTop: 2 },
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
    maxWidth: 400,
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
    maxWidth: 460,
    maxHeight: "88vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
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
    fontSize: 10.5,
    letterSpacing: "0.06em",
    color: C.muted,
    marginTop: 10,
    marginBottom: 5,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
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
    fontSize: 14,
    outline: "none",
  },
  segRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  segBtn: {
    flex: "1 1 30%",
    background: C.bg,
    border: `1px solid ${C.border}`,
    color: C.muted,
    borderRadius: 6,
    padding: "8px 6px",
    fontSize: 12.5,
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
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  submitBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  warnBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: C.dangerTint,
    border: `1px solid ${C.danger}55`,
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 12,
    color: C.danger,
    marginTop: 8,
  },
  warnLink: {
    marginLeft: "auto",
    background: "transparent",
    border: "none",
    color: C.danger,
    textDecoration: "underline",
    fontSize: 12,
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
    fontSize: 13,
    color: C.text,
    cursor: "pointer",
  },
  roleOptionActive: {
    borderColor: C.accentRaw,
    color: C.accentRaw,
  },
  roleHint: {
    fontFamily: F.mono,
    fontSize: 10.5,
    color: C.muted,
    marginTop: 8,
    lineHeight: 1.5,
  },
  pinError: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.danger,
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
  managerTab: {
    flex: "1 1 auto",
    background: "transparent",
    border: "none",
    color: C.muted,
    borderRadius: 5,
    padding: "7px 8px",
    fontSize: 11.5,
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
  },
  managerList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 320,
    overflowY: "auto",
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
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
  },
  managerGroupHeader: {
    fontFamily: F.mono,
    fontSize: 10.5,
    letterSpacing: "0.06em",
    color: C.accentRaw,
    textTransform: "uppercase",
    padding: "8px 2px 4px",
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
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  reqStatusTag: {
    fontFamily: F.mono,
    fontSize: 10,
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
    fontSize: 10,
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
    fontSize: 11,
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
    fontSize: 12,
    fontFamily: F.mono,
  },
  poSelectBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: C.accentTint,
    border: `1px solid ${C.accentRaw}55`,
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: C.accentRaw,
    fontWeight: 500,
  },
  reqSelectLabel: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: C.muted,
    whiteSpace: "nowrap",
  },
  poLineRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
    fontFamily: F.mono,
  },
  deptPermGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 50px 60px",
    alignItems: "center",
    rowGap: 6,
    fontSize: 12.5,
  },
  deptPermHead: {
    fontFamily: F.mono,
    fontSize: 10,
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
    fontSize: 12,
    color: C.muted,
    cursor: "pointer",
  },
  deptCoreTag: {
    fontFamily: F.mono,
    fontSize: 9.5,
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
    fontSize: 12,
    color: C.muted,
    cursor: "pointer",
  },
  managerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 13,
  },
  editableName: {
    flex: 1,
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 4,
    padding: "3px 5px",
    color: C.text,
    fontSize: 13,
    outline: "none",
  },
  managerFactorInput: {
    width: 80,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    padding: "5px 7px",
    color: C.text,
    fontSize: 12,
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
    fontSize: 11,
    color: C.muted,
  },
};
