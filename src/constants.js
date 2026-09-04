// What sections and tabs exist in the app.
//
// Split out of App.jsx so files other than App.jsx can render navigation
// or permission UI without importing back from it, which would be a
// circular import. Pure data, no logic.

export const TABS = [
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
export const NAV_TABS = [
  { key: "jobs", label: "Jobs" },
  { key: "production", label: "Production" },
  { key: "laser4kw", label: "Laser 4kw" },
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
];

// The tab bar groups related divisions under a shared dropdown instead of
// showing each as its own button — keeps the row to a small, stable set of
// top-level buttons (Jobs and Production stay standalone since they're
// used the most) with everything else folded into a few logical groups.
export const TAB_GROUPS = [
  { label: "Stock", keys: ["plate", "structural", "cncBar", "custom", "fasteners", "stores", "assets"] },
  // Shortages used to be their own top-level button here. They now live
  // inside the Laser 4kw tab beside Nesting and Cutting, because that is
  // where one is dealt with: a re-cut goes on a program like any other
  // work, and cutting that program is what resolves it. Keeping the list
  // in a separate tab meant leaving the screen to look at it and coming
  // back to act on it.
  { label: "Procurement", keys: ["requisitions", "purchaseOrders", "receiving"] },
  { label: "Records", keys: ["invoicing", "deliveryNotes", "invoiceRequests", "processSheets", "poReports", "usageLog", "drawings"] },
];

// Jobs and Notifications still need a canView() entry (for the header
// buttons and permission checks) even though they're not part of the main
// tab row — this covers that without duplicating them into NAV_TABS.
// The laser the programs are cut on. Named here rather than typed in two
// places so the tab label and the value stored on a program cannot drift
// apart. A second machine becomes a list rather than a rename.
export const LASER_MACHINE = "Laser 4kw";

export const EXTRA_SECTIONS = [{ key: "notifications", label: "Notifications" }];

export const SECTIONS = ["plate", "structural", "cncBar", "custom", "stores", "fasteners", "assets", "drawings", "deliveryNotes", "invoiceRequests", "processSheets", "poReports", "jobs"];
