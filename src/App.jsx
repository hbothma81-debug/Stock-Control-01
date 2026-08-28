import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./lib/supabaseClient.js";
import {
  Plus, Minus, Search, Trash2, PackagePlus, AlertTriangle, X,
  ChevronDown, User, UserCheck, ShieldCheck, Lock, Database,
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
  { key: "assets", label: "Assets" },
];

// TABS above stays as the physical stock divisions (used by the Add form,
// exports, etc). NAV_TABS adds Requisitions on top of that just for the
// main tab bar, since requisitions aren't a stock division themselves.
const NAV_TABS = [
  ...TABS,
  { key: "requisitions", label: "Requisitions" },
  { key: "purchaseOrders", label: "Purchase Orders" },
  { key: "receiving", label: "Receiving" },
  { key: "usageLog", label: "Usage Log" },
  { key: "drawings", label: "Drawings" },
];

const SECTIONS = ["plate", "structural", "cncBar", "custom", "stores", "assets", "drawings"];

const MANAGER_TABS = [
  { key: "sizes", label: "Sheet Sizes" },
  { key: "sections", label: "Sections" },
  { key: "sectionTypes", label: "Section Types" },
  { key: "grades", label: "Material Types" },
  { key: "cncGrades", label: "CNC Bar Grades" },
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
    assets: noPerm(),
    drawings: noPerm(),
  };
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
  stockCodes: [],
  storeCategories: ["Electrical", "CNC Tooling", "Fasteners", "Welding Consumables", "PPE"],
  nextToolNumber: 1,
  nextPoNumber: 1,
  suppliers: [],
  companyDetails: { name: "East Rand Supplies", address: "", phone: "", email: "", vatNumber: "", regNumber: "" },
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
  const [loadError, setLoadError] = useState({});
  const [master, setMaster] = useState(null);
  const [requisitions, setRequisitions] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState(null);
  const [usageLog, setUsageLog] = useState(null);
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
  const [stockCodeCustomerFilter, setStockCodeCustomerFilter] = useState("");
  const [storesCatalogCategoryFilter, setStoresCatalogCategoryFilter] = useState("");
  const [managerSearchQuery, setManagerSearchQuery] = useState("");
  const [sectionTypeFilterInManager, setSectionTypeFilterInManager] = useState("");
  const [scForm, setScForm] = useState({ stockCode: "", description: "", price: "", recommendedStock: "", customer: "", revision: "" });
  const [scCatalogForm, setScCatalogForm] = useState({ name: "", category: "", price: "" });
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

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  // Shared by the initial load and both the manual and automatic refresh.
  // isInitialLoad matters: on first load, "nothing saved yet" legitimately
  // means seed the defaults. On a refresh, previously-existing data
  // suddenly coming back empty is suspicious, not a fresh start — so a
  // refresh never falls back to seed/empty, it just leaves the current
  // state alone and tries again next time. Same reasoning as the earlier
  // fix that stopped a failed load from silently overwriting good data.
  async function loadAllData(isInitialLoad) {
    try {
      const res = await window.storage.get("stock-items-v3", true);
      if (res && res.value) {
        let loadedItems = JSON.parse(res.value);
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
        setItems(loadedItems);
      } else if (isInitialLoad) {
        setItems(seed);
      }
    } catch (err) {
      console.error("Failed to load items:", err);
      if (isInitialLoad) setLoadError((prev) => ({ ...prev, items: true }));
    }
    try {
      const res = await window.storage.get("stock-master-data-v2", true);
      if (res && res.value) {
        let loaded = { ...DEFAULT_MASTER, ...JSON.parse(res.value) };
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
        // Fix-up: a bug briefly let bare strings get added to cncGrades
        // (which needs {name, factor, price} objects like Material Types) —
        // upgrade any stragglers instead of leaving them broken.
        if (loaded.cncGrades) {
          loaded = {
            ...loaded,
            cncGrades: loaded.cncGrades.map((g) => (typeof g === "string" ? { name: g, factor: 0, price: 0 } : g)),
          };
        }
        setMaster(loaded);
      } else if (isInitialLoad) {
        setMaster(DEFAULT_MASTER);
      }
    } catch (err) {
      console.error("Failed to load master data:", err);
      if (isInitialLoad) setLoadError((prev) => ({ ...prev, master: true }));
    }
    try {
      const res = await window.storage.get("stock-requisitions-v1", true);
      if (res && res.value) setRequisitions(JSON.parse(res.value));
      else if (isInitialLoad) setRequisitions([]);
    } catch (err) {
      console.error("Failed to load requisitions:", err);
      if (isInitialLoad) setLoadError((prev) => ({ ...prev, requisitions: true }));
    }
    try {
      const res = await window.storage.get("stock-purchase-orders-v1", true);
      if (res && res.value) setPurchaseOrders(JSON.parse(res.value));
      else if (isInitialLoad) setPurchaseOrders([]);
    } catch (err) {
      console.error("Failed to load purchase orders:", err);
      if (isInitialLoad) setLoadError((prev) => ({ ...prev, purchaseOrders: true }));
    }
    try {
      const res = await window.storage.get("stock-usage-log-v1", true);
      if (res && res.value) setUsageLog(JSON.parse(res.value));
      else if (isInitialLoad) setUsageLog([]);
    } catch (err) {
      console.error("Failed to load usage log:", err);
      if (isInitialLoad) setLoadError((prev) => ({ ...prev, usageLog: true }));
    }
    setLastRefreshedAt(new Date());
  }

  async function manualRefresh() {
    setIsRefreshing(true);
    await loadAllData(false);
    setIsRefreshing(false);
  }

  useEffect(() => {
    loadAllData(true);
  }, []);

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
                canViewUsageLog: !!data.can_view_usage_log,
              }
            : null
        );
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Saves happen immediately, not debounced — a delay here is exactly what
  // can get lost if a phone locks or a tab gets backgrounded right after
  // adding something. Immediate writes close that window entirely.
  useEffect(() => {
    if (items === null) return;
    setSaveState("saving");
    window.storage
      .set("stock-items-v3", JSON.stringify(items), true)
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }, [items]);

  useEffect(() => {
    if (master === null) return;
    window.storage.set("stock-master-data-v2", JSON.stringify(master), true).catch(() => {});
  }, [master]);

  useEffect(() => {
    if (requisitions === null) return;
    window.storage.set("stock-requisitions-v1", JSON.stringify(requisitions), true).catch(() => {});
  }, [requisitions]);

  useEffect(() => {
    if (purchaseOrders === null) return;
    window.storage.set("stock-purchase-orders-v1", JSON.stringify(purchaseOrders), true).catch(() => {});
  }, [purchaseOrders]);

  useEffect(() => {
    if (usageLog === null) return;
    window.storage.set("stock-usage-log-v1", JSON.stringify(usageLog), true).catch(() => {});
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

  // Belt-and-suspenders on top of the immediate saves above: the moment this
  // tab/app gets backgrounded or closed — phone locking, switching apps,
  // closing the tab — re-fire every save with whatever's current right then.
  // Covers the (much smaller) remaining risk of a save being mid-flight
  // right when that happens.
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
      if (itemsRef.current !== null) window.storage.set("stock-items-v3", JSON.stringify(itemsRef.current), true).catch(() => {});
      if (masterRef.current !== null) window.storage.set("stock-master-data-v2", JSON.stringify(masterRef.current), true).catch(() => {});
      if (requisitionsRef.current !== null)
        window.storage.set("stock-requisitions-v1", JSON.stringify(requisitionsRef.current), true).catch(() => {});
      if (purchaseOrdersRef.current !== null)
        window.storage.set("stock-purchase-orders-v1", JSON.stringify(purchaseOrdersRef.current), true).catch(() => {});
      if (usageLogRef.current !== null) window.storage.set("stock-usage-log-v1", JSON.stringify(usageLogRef.current), true).catch(() => {});
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

  async function fetchDrawingsForPartNumber(partNumber) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("drawings")
      .select("*")
      .eq("part_number", partNumber)
      .order("internal_revision", { ascending: false });
    if (error) throw error;
    return data || [];
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
      const { data, error } = await supabase.from("drawings").select("id, part_number, description").eq("status", "current");
      if (error) throw error;
      const map = {};
      (data || []).forEach((d) => {
        map[d.part_number.trim()] = { id: d.id, description: d.description };
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
        const matchedStockCode = (master.stockCodes || []).find(
          (sc) =>
            sc.stockCode.toLowerCase() === partNumber.toLowerCase() &&
            (sc.customer || "") === (drawingUploadCustomer || "")
        );
        // The "must already exist in Stock Codes" rule only applies when a
        // customer is selected — an internal drawing (no customer chosen)
        // isn't expected to already have a pre-loaded stock code, so it's
        // never auto-skipped just for not matching one.
        const requiresMatch = !!drawingUploadCustomer;
        return {
          file: f,
          partNumber,
          skip: requiresMatch && !matchedStockCode,
          matchedStockCode: matchedStockCode || null,
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
              canViewUsageLog: false,
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
        can_view_usage_log: false,
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
    if (section === "receiving") return !!profile?.canMarkReceived;
    if (section === "usageLog") return !!profile?.canViewUsageLog;
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
      .filter((it) => tab !== "assets" || it.status !== "removed")
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

  // Used by the R/unit ⇄ R/kg price toggle on the Add/Edit form — writes
  // straight back to the shared grade or section price, same underlying
  // value Requisitions and Stock Manager already read from.
  function setMaterialPrice(listKey, name, price) {
    setMaster((prev) => ({
      ...prev,
      [listKey]: (prev[listKey] || []).map((x) => (x.name.toLowerCase() === (name || "").toLowerCase() ? { ...x, price } : x)),
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
    if (tab === "custom" || tab === "stores") return tabItems.reduce((sum, it) => sum + Number(it.value || 0) * Number(it.qty || 0), 0);
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

  function openRequisition(it) {
    setRequisitionTarget(it);
    setRequisitionQty("");
    setRequisitionNotes("");
    setRequisitionSupplier(it.supplier || "");
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
    let logoY = 10;
    const textX = leftX;
    if (company.logo) {
      try {
        const imgProps = doc.getImageProperties(company.logo);
        const maxW = 45;
        const maxH = 22;
        let logoW = maxW;
        let logoH = (imgProps.height / imgProps.width) * logoW;
        if (logoH > maxH) {
          logoH = maxH;
          logoW = (imgProps.width / imgProps.height) * logoH;
        }
        doc.addImage(company.logo, "JPEG", leftX, logoY, logoW, logoH);
        logoY += logoH + 6;
      } catch {
        // bad image data — just skip it rather than fail the whole PDF
      }
    }
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

  function downloadPoPdf(po) {
    buildPoDoc(po).save(`${po.poNumber}.pdf`);
  }

  // Opens the PO in the same inline viewer already used for drawing/photo
  // attachments — no forced download just to look at something.
  function viewPoPdf(po) {
    const doc = buildPoDoc(po);
    setPreviewItem({ id: po.id, attachmentType: "pdf", attachmentName: `${po.poNumber}.pdf` });
    setPreviewData(doc.output("datauristring"));
    setPreviewLoading(false);
  }

  // A summary-table report across many POs at once — for spend review, not
  // for sending to a supplier, so this is a plain table, not a letterhead.
  function generatePoReport() {
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
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(`${company.name || "Purchase Order Report"}`, 14, 18);
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const supplierLabel = poReportSupplier ? master.suppliers.find((s) => s.id === poReportSupplier)?.name || "" : "All suppliers";
    const rangeLabel = `${poReportFrom || "earliest"} to ${poReportTo || "latest"}`;
    doc.text(`${supplierLabel} · ${rangeLabel}`, 14, 25);

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

    doc.save(`PO-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
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
    setQuery(it.mainCat === "custom" || it.mainCat === "stores" ? (it.partNumber || it.name) : it.name);
  }

  const managerIsFactorTable = FACTOR_TABLES.includes(managerTab);

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

  // A targeted way to clear out one customer's stock codes before a fresh
  // re-import — deliberately scoped to whichever customer is currently
  // filtered to, never a blanket wipe of everyone's data.
  function batchDeleteStockCodesForCustomer(customer) {
    const count = (master.stockCodes || []).filter((r) => (r.customer || "") === (customer || "")).length;
    if (count === 0) {
      alert(customer ? `No stock codes found for ${customer}.` : "No unassigned stock codes found.");
      return;
    }
    const ok = window.confirm(
      `Delete all ${count} stock code${count === 1 ? "" : "s"} for ${customer || "(no customer)"}? This can't be undone.`
    );
    if (!ok) return;
    setMaster((prev) => ({
      ...prev,
      stockCodes: (prev.stockCodes || []).filter((r) => (r.customer || "") !== (customer || "")),
    }));
  }

  function addStockCodeRow() {
    if (!scForm.stockCode.trim()) return;
    const code = scForm.stockCode.trim();
    setMaster((prev) => {
      const existing = (prev.stockCodes || []).find((r) => r.stockCode.toLowerCase() === code.toLowerCase());
      if (existing) {
        // Same stock code already exists — update it in place rather than
        // creating a second entry for the same part.
        return {
          ...prev,
          stockCodes: prev.stockCodes.map((r) =>
            r.id === existing.id
              ? {
                  ...r,
                  description: scForm.description.trim() || r.description,
                  price: parseFloat(scForm.price) || r.price,
                  recommendedStock: parseFloat(scForm.recommendedStock) || r.recommendedStock,
                  customer: scForm.customer || r.customer,
                  revision: scForm.revision.trim() || r.revision,
                }
              : r
          ),
        };
      }
      return {
        ...prev,
        stockCodes: [
          ...(prev.stockCodes || []),
          {
            id: uid(),
            stockCode: code,
            description: scForm.description.trim(),
            price: parseFloat(scForm.price) || 0,
            recommendedStock: parseFloat(scForm.recommendedStock) || 0,
            customer: scForm.customer,
            revision: scForm.revision.trim(),
          },
        ],
      };
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
      suppliers: [...prev.suppliers, { id: uid(), name: newSupplierName.trim(), email: "", phone: "", address: "", logo: "", vatNumber: "" }],
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
          setMaster((prev) => ({ ...prev, stockCodes: newRows }));
          alert(`Replaced the whole Stock Codes list with ${newRows.length} rows${importCustomer ? ` for ${importCustomer}` : ""}.\n\n${diagnosticSummary}`);
        } else {
          // Merge by stock code — update anything that already exists
          // instead of creating a duplicate row for the same part.
          setMaster((prev) => {
            const existing = [...(prev.stockCodes || [])];
            let updated = 0;
            newRows.forEach((row) => {
              const idx = existing.findIndex((r) => r.stockCode.toLowerCase() === row.stockCode.toLowerCase());
              if (idx >= 0) {
                // Only overwrite a field if the import actually found a real
                // value for it — a parsing miss shouldn't silently erase a
                // price/revision that was already there from before.
                existing[idx] = {
                  ...existing[idx],
                  description: row.description || existing[idx].description,
                  price: row.price || existing[idx].price,
                  recommendedStock: row.recommendedStock || existing[idx].recommendedStock,
                  revision: row.revision || existing[idx].revision,
                  customer: row.customer || existing[idx].customer,
                };
                updated++;
              } else {
                existing.push(row);
              }
            });
            return { ...prev, stockCodes: existing };
          });
          const addedCount = newRows.length;
          alert(
            `Processed ${addedCount} rows${importCustomer ? ` for ${importCustomer}` : ""}.\n\n${diagnosticSummary}`
          );
        }
      } catch (err) {
        alert("Couldn't read that file — make sure it's a .xlsx, .xls, or .csv export.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  const hasLoadError = Object.values(loadError).some(Boolean);

  if (hasLoadError) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontFamily: F.mono, color: C.danger, fontSize: 14, marginBottom: 10 }}>
            Couldn't load your data — stopped here rather than risk overwriting anything.
          </div>
          <div style={{ fontFamily: F.mono, color: C.muted, fontSize: 12, marginBottom: 16 }}>
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
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <header style={S.header}>
        <div>
          <div style={S.eyebrow}>EAST RAND SUPPLIES</div>
          <h1 style={S.h1}>Stock Control</h1>
        </div>
        <div style={S.headerRight}>
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
                  <div style={S.rowMeta}>
                    <span>Raised by {po.createdBy}</span>
                    <span>{new Date(po.dateCreated).toLocaleDateString()}</span>
                    <span>{po.lineItems.length} line{po.lineItems.length === 1 ? "" : "s"}</span>
                  </div>
                  {po.notes && <div style={S.itemComment}>{po.notes}</div>}
                  <div style={S.reqActions}>
                    <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => viewPoPdf(po)}>
                      <FileText size={13} /> View PDF
                    </button>
                    <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => downloadPoPdf(po)}>
                      <Download size={13} /> Download
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
                      <div style={S.rowMeta}>
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
                  <div style={S.rowMeta}>
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
                          <div style={S.rowMeta}>
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
                  <div style={S.rowMeta}>
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
                    <div style={S.rowMeta}>
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
                            <span style={{ fontSize: 12, color: C.muted }}>
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
      </div>

      {showFilters && tab !== "custom" && tab !== "stores" && (
        <div style={S.filterBar}>
          <div>
            <label style={S.label}>Material</label>
            <select style={S.input} value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
              <option value="">All materials</option>
              {(tab === "cncBar" ? master.cncGrades : master.grades).map((g) => (
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
                              {it.partNumber && drawingLookup[it.partNumber.trim()] && (
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
                          <div style={S.rowMeta}>
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
                            {(tab === "custom" || tab === "stores") && canSeeValue && (
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
                      <div style={S.rowMeta}>
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

            {form.mainCat === "assets" ? (
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
            ) : form.mainCat === "custom" || form.mainCat === "stores" ? (
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
                      options={master.grades.map((g) => g.name)}
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
        <div style={S.modalOverlay} onClick={() => setShowManager(false)}>
          <div style={S.managerModal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Stock Manager</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setShowManager(false)}>
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
                    setManagerSearchQuery("");
                    setSectionTypeFilterInManager("");
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
                    <option value="">Select a customer — required to import</option>
                    {master.customers.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <label
                    className="stk-btn"
                    style={{ ...S.addBtn, cursor: importCustomer ? "pointer" : "not-allowed", opacity: importCustomer ? 1 : 0.5 }}
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
                {importFileLabel && <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 4 }}>{importFileLabel}</div>}
                <label style={{ ...S.checkRow, marginTop: 8 }}>
                  <input type="checkbox" checked={importReplaceAll} onChange={(e) => setImportReplaceAll(e.target.checked)} />
                  Replace the whole list with this file, instead of updating/adding
                </label>
                {importReplaceAll && (
                  <div style={{ ...S.roleHint, color: C.danger }}>
                    Every stock code not in this file will be deleted. Use this for a full refresh (e.g. re-uploading a
                    supplier's updated pricing sheet) — not for adding a few extra items.
                  </div>
                )}
                <div style={S.roleHint}>
                  Imports the first sheet, matching columns containing "stock code", "description", "price", and "recommended"/"reorder". Test with a
                  small file first and check a few rows below before importing the full 400.
                  {!importReplaceAll && " Existing stock codes with a matching code get updated, not duplicated."}
                </div>

                <div style={{ ...S.managerAddRow, marginTop: 12 }}>
                  <input style={{ ...S.input, flex: 1 }} value={scForm.stockCode} onChange={(e) => setScForm({ ...scForm, stockCode: e.target.value })} placeholder="Stock code" />
                  <input style={{ ...S.input, flex: 2 }} value={scForm.description} onChange={(e) => setScForm({ ...scForm, description: e.target.value })} placeholder="Description" />
                </div>
                <div style={{ ...S.managerAddRow, marginTop: 6 }}>
                  <input style={{ ...S.input, flex: 1 }} type="number" step="0.01" value={scForm.price} onChange={(e) => setScForm({ ...scForm, price: e.target.value })} placeholder="Unit price (R)" />
                  <input style={{ ...S.input, flex: 1 }} type="number" value={scForm.recommendedStock} onChange={(e) => setScForm({ ...scForm, recommendedStock: e.target.value })} placeholder="Recommended stock" />
                  <input style={{ ...S.input, flex: 1 }} value={scForm.revision} onChange={(e) => setScForm({ ...scForm, revision: e.target.value })} placeholder="Revision (e.g. A)" />
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

                <div style={{ ...S.managerAddRow, marginTop: 12 }}>
                  <input
                    style={{ ...S.input, flex: 2 }}
                    value={stockCodeQuery}
                    onChange={(e) => setStockCodeQuery(e.target.value)}
                    placeholder="Search stock code or description…"
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
                  {isAdmin && stockCodeCustomerFilter && (
                    <button
                      type="button"
                      className="stk-btn"
                      style={S.usageBtnUse}
                      onClick={() => batchDeleteStockCodesForCustomer(stockCodeCustomerFilter)}
                      title={`Delete all stock codes for ${stockCodeCustomerFilter}`}
                    >
                      <Trash2 size={13} /> Delete for {stockCodeCustomerFilter}
                    </button>
                  )}
                </div>
                {isAdmin && stockCodeCustomerFilter && (
                  <div style={S.roleHint}>
                    Filter to a customer above, then use this to clear their stock codes before a fresh re-import — only
                    affects that customer, nobody else's data.
                  </div>
                )}

                <div style={{ ...S.managerAddRow, marginTop: 12, marginBottom: 4, opacity: 0.7 }}>
                  <span style={{ ...S.label, flex: "0 0 110px" }}>Stock code</span>
                  <span style={{ ...S.label, flex: 1 }}>Description</span>
                  <span style={{ ...S.label, flex: "0 0 70px" }}>Price (R)</span>
                  <span style={{ ...S.label, flex: "0 0 70px" }}>Recomm.</span>
                  <span style={{ ...S.label, flex: "0 0 60px" }}>Revision</span>
                  <span style={{ ...S.label, flex: "0 0 110px" }}>Customer</span>
                </div>
                <div style={S.managerList}>
                  {(master.stockCodes || [])
                    .filter((r) => (r.stockCode + " " + r.description).toLowerCase().includes(stockCodeQuery.toLowerCase()))
                    .filter((r) => !stockCodeCustomerFilter || r.customer === stockCodeCustomerFilter)
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
                        <input
                          type="text"
                          value={r.revision || ""}
                          placeholder="—"
                          onChange={(e) => updateStockCodeRow(r.id, "revision", e.target.value)}
                          style={{ ...S.managerFactorInput, width: 50 }}
                          title="Revision (customer's own, e.g. a letter or number)"
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

                <div style={S.managerList}>
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
                      <input
                        style={{ ...S.input, marginTop: 8 }}
                        value={s.vatNumber || ""}
                        onChange={(e) => updateSupplierField(s.id, "vatNumber", e.target.value)}
                        placeholder="VAT number (optional)"
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
                                <div style={S.deptPermLabel}>{NAV_TABS.find((t) => t.key === sec)?.label}</div>
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
                        placeholder={managerTab !== "sections" ? "Density g/cm³" : "kg/m"}
                      />
                      <input
                        style={{ ...S.input, flex: 1 }}
                        type="number"
                        step="0.01"
                        value={managerPrice}
                        onChange={(e) => setManagerPrice(e.target.value)}
                        placeholder={managerTab !== "sections" ? "R/kg" : "R/m"}
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

                {master[managerTab].length > 8 && (
                  <input
                    style={{ ...S.input, marginTop: 10 }}
                    value={managerSearchQuery}
                    onChange={(e) => setManagerSearchQuery(e.target.value)}
                    placeholder={`Search ${MANAGER_TABS.find((t) => t.key === managerTab).label.toLowerCase()}…`}
                  />
                )}

                <div style={S.managerList}>
                  {master[managerTab].length === 0 && <div style={S.empty}>Nothing here yet — add one above.</div>}
                  {managerIsFactorTable
                    ? (managerTab === "sections"
                        ? Object.entries(
                            master.sections
                              .filter((s) => s.name.toLowerCase().includes(managerSearchQuery.toLowerCase()))
                              .filter((s) => !sectionTypeFilterInManager || (s.type || "Ungrouped") === sectionTypeFilterInManager)
                              .reduce((acc, s) => {
                              const k = s.type || "Ungrouped";
                              (acc[k] = acc[k] || []).push(s);
                              return acc;
                            }, {})
                          ).sort((a, b) => a[0].localeCompare(b[0]))
                        : [[null, master[managerTab].filter((e) => e.name.toLowerCase().includes(managerSearchQuery.toLowerCase()))]]
                      ).map(([groupName, list]) => (
                        <div key={groupName || "flat"}>
                          {groupName && (
                            <button
                              type="button"
                              className="stk-btn"
                              style={{
                                ...S.managerGroupHeader,
                                ...S.managerGroupHeaderBtn,
                                ...(sectionTypeFilterInManager === groupName ? S.managerGroupHeaderActive : {}),
                              }}
                              onClick={() => setSectionTypeFilterInManager((prev) => (prev === groupName ? "" : groupName))}
                              title={sectionTypeFilterInManager === groupName ? "Showing only this type — tap to show all" : "Tap to show only this type"}
                            >
                              {groupName} · {list.length}
                            </button>
                          )}
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
                                title={managerTab !== "sections" ? "Density g/cm³" : "kg/m"}
                              />
                              <input
                                type="number"
                                step="0.01"
                                value={!entry.price ? "" : entry.price}
                                placeholder="0"
                                onChange={(e) => updateFactorField(entry.name, "price", e.target.value)}
                                style={S.managerFactorInput}
                                title={managerTab !== "sections" ? "R/kg" : "R/m"}
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
                {(!previewItem.restrictDownload || isAdmin) && (
                  <a href={previewData} download={previewItem.attachmentName || "drawing.pdf"} style={S.previewDownload}>
                    Download PDF
                  </a>
                )}
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
        <div style={S.modalOverlay} onClick={closeAssetRemoveModal}>
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
        <div style={S.modalOverlay} onClick={closeAssetHistory}>
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
                  <div style={S.rowMeta}>
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
        <div style={S.modalOverlay} onClick={closeUsageModal}>
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
                  <label style={S.label}>Job number</label>
                  <input
                    style={S.input}
                    value={usageModal.jobNumber}
                    onChange={(e) => setUsageModal((m) => ({ ...m, jobNumber: e.target.value }))}
                    placeholder="e.g. 4471"
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Customer</label>
                  <input
                    style={S.input}
                    value={usageModal.customer}
                    onChange={(e) => setUsageModal((m) => ({ ...m, customer: e.target.value }))}
                    placeholder="e.g. HPE"
                  />
                </div>
                <div style={{ ...S.roleHint, marginTop: 6 }}>Job number or customer — at least one is required.</div>
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
        <div style={S.modalOverlay} onClick={drawingUploadBusy ? undefined : closeDrawingUpload}>
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
                          <span style={{ fontSize: 12, color: entry.partNumber ? C.text : C.danger }}>
                            {entry.file.name} → <strong>{entry.partNumber || "no part number"}</strong>
                          </span>
                          {entry.matchedStockCode ? (
                            <span style={{ fontSize: 11, color: C.accentFinished }}>
                              ✓ Links to existing stock code — {entry.matchedStockCode.description || "no description"}
                            </span>
                          ) : entry.skip ? (
                            <span style={{ fontSize: 11, color: C.danger }}>
                              ✕ No matching stock code for this customer — won't be uploaded
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: C.muted }}>No matching stock code — uploading unlinked (internal drawing)</span>
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

      {receivingPo && (
        <div style={S.modalOverlay} onClick={closeReceiving}>
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
                      <span style={{ fontSize: 12.5 }}>{line.description}</span>
                      <span style={{ fontSize: 11, color: line.linkedItemId ? C.accentFinished : C.danger }}>
                        {line.linkedItemId ? "Linked to stock — will update automatically" : "No linked stock item — won't auto-update, add manually"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: C.muted }}>Ordered {line.orderedQty}</span>
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
                          <span style={{ fontSize: 13, fontWeight: 600, color: qtyDiffers ? C.accentRaw : C.text }}>
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
        <div style={S.modalOverlay} onClick={() => setShowPoReport(false)}>
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
    fontSize: 11,
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
    fontSize: 12.5,
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
    fontSize: 12.5,
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
    fontSize: 12.5,
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
  qtyUnit: { fontFamily: F.mono, fontSize: 10, color: C.muted, marginTop: 2 },
  usageBtnUse: {
    padding: "8px 14px",
    borderRadius: 7,
    border: `1px solid ${C.danger}55`,
    background: C.dangerTint,
    color: C.danger,
    fontSize: 13,
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
    fontSize: 13,
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
    flexWrap: "wrap",
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
    fontSize: 12,
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
    flexWrap: "wrap",
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
    flexWrap: "wrap",
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
    flexWrap: "wrap",
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
