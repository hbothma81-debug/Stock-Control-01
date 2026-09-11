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
  // Bought in, marked up, resold. Stocked like any other division; what
  // makes it different is that it carries two prices rather than one.
  { key: "buyouts", label: "Buy-outs" },
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
  { key: "tubeLaser", label: "Tube Laser" },
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
  { label: "Stock", keys: ["plate", "structural", "cncBar", "custom", "buyouts", "fasteners", "stores", "assets"] },
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

// The two lasers, and how they differ. Both run the same screens and the
// same hook (src/laser); this is everything that changes between them,
// so a difference lives here once rather than as an if-tube in six files.
//
//   machine       the value stored on laser_programs.machine, and what
//                 filters every screen to one laser's programs
//   lane          which shortages belong to it (shortages.lane)
//   unit / units  the repeat: a plate program is cut off N sheets, a tube
//                 program off N lengths of section
//   hasCutTime    plate carries planned minutes per sheet off SigmaNest;
//                 the tube software gives no time, so nothing asks for one
//   hasSheetName  the plate operator hunts for the sheet on the rack; a
//                 tube program has nothing like it
//   materialFrom  where the material picker's list comes from: the Laser
//                 Thicknesses list plus a grade, or the Structural Steel
//                 sections list as it stands
//   numbering     "typed" -- the nester types the SigmaNest number;
//                 "generated" -- the app hands out the next number when
//                 the program is made, and that is what the nest is saved
//                 under in the tube software, which has no numbers of
//                 its own. A generated program also carries a nesting
//                 name, which is what the nester calls it.
//   shiftFlag     the tick on a shift under Time Manager saying this
//                 laser cuts on it
//   cutStageIsPacking
//                 on the plate laser the "Laser" stage closes by itself
//                 when a job's programs are cut, and packing is a separate
//                 Packer stage worked on Laser Status. On the tube laser
//                 the operator packs under the "Tube Laser" stage itself,
//                 so that stage is never closed by cutting: it closes when
//                 he ticks the parts packed, on the tab's Packing screen.
//   hasPacking    whether the tab gets a Packing screen of its own
//
// The two stage-name rules (which stage is this laser's nesting, which is
// its cutting) are functions and live in App.jsx beside the other
// process-name rules; App.jsx attaches them as isNestingStage and
// isCutStage before handing a profile to the hook.
export const LASER_MACHINES = {
  laser4kw: {
    key: "laser4kw",
    label: "Laser 4kw",
    machine: LASER_MACHINE,
    lane: "plate",
    unit: "sheet",
    units: "sheets",
    hasCutTime: true,
    hasSheetName: true,
    materialFrom: "thicknesses",
    numbering: "typed",
    shiftFlag: "cuts_laser",
    cutStageIsPacking: false,
    hasPacking: false,
    partsLabel: "Laser parts",
    otherMachineNote: "tube parts are packed under Tube Laser",
  },
  tubeLaser: {
    key: "tubeLaser",
    label: "Tube Laser",
    machine: "Tube Laser",
    lane: "tube",
    unit: "length",
    units: "lengths",
    hasCutTime: false,
    hasSheetName: false,
    materialFrom: "sections",
    numbering: "generated",
    // A plain five-digit number, nothing in front: the nester types it
    // into the tube software when he exports the cut file.
    numberPrefix: "",
    // The nester can bring in the software's spreadsheet export instead
    // of typing programs by hand: one program per section in the file.
    importsReport: true,
    shiftFlag: "cuts_tube_laser",
    // Tube work is not nested all in one go. A job of 8000 parts may
    // have 4000 nested this week and the rest later, so the nesting row
    // lists the job's parts and takes a quantity against each. The job
    // stays on the list with its progress showing, and the parts that
    // have been nested carry on through the rest of the job without it.
    // The plate laser nests whole sheets and counts nothing per part.
    nestPerItem: true,
    cutStageIsPacking: true,
    hasPacking: true,
    partsLabel: "Tube parts",
    otherMachineNote: "plate parts are packed on Laser Status under Production",
  },
};

export const EXTRA_SECTIONS = [{ key: "notifications", label: "Notifications" }];

export const SECTIONS = ["plate", "structural", "cncBar", "custom", "stores", "fasteners", "assets", "drawings", "deliveryNotes", "invoiceRequests", "processSheets", "poReports", "jobs"];
