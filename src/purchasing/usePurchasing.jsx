// Purchasing: requisitions, purchase orders, receiving and the PO report.
//
// Moved word for word out of App.jsx on 2026-10-05; see docs/SPLIT-PURCHASING-PLAN.md.
// usePurchasingState() holds the screens' state and runs where that state was
// declared, because the top of App.jsx reads some of it while drawing.
// usePurchasing() holds the functions and runs where they used to be; it
// takes everything it borrows from the rest of the app in one deps object.

import { useState, useMemo } from "react";
import NumberBox from "../manager/NumberBox.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { Check, ChevronDown, Pencil, ShoppingCart } from "lucide-react";
import { MATERIAL_CATS, landDelivery, rateFromLinePrice } from "../manager/receiving.js";
import { S } from "../theme.js";
import { cheapest as cheapestPrice, sectionLines } from "../manager/supplierPrices.js";
import { supabase } from "../lib/supabaseClient.js";
import { withFullMaterial } from "../manager/materialNames.js";
import { jobForPurchaseOrder } from "./poJob.js";

export function usePurchasingState() {
  const [poBuilder, setPoBuilder] = useState(null); // { supplierId, lineItems: [...], linkedRequisitionIds: [...], notes }
  const [poSearchQuery, setPoSearchQuery] = useState("");
  const [poSupplierFilter, setPoSupplierFilter] = useState("");
  const [expandedPoId, setExpandedPoId] = useState(null);
  const [receivingSearchQuery, setReceivingSearchQuery] = useState("");
  const [expandedReceivingId, setExpandedReceivingId] = useState(null);
  const [receivingHistoryDateFrom, setReceivingHistoryDateFrom] = useState("");
  const [receivingHistoryDateTo, setReceivingHistoryDateTo] = useState("");
  const [receivingHistorySearchQuery, setReceivingHistorySearchQuery] = useState("");
  const [showPoReport, setShowPoReport] = useState(false);
  const [receivingPo, setReceivingPo] = useState(null);
  const [receivingLines, setReceivingLines] = useState([]);
  const [receivingDeliveryNote, setReceivingDeliveryNote] = useState("");
  const [receivingAdjustingIdx, setReceivingAdjustingIdx] = useState(null);
  const [addingItemForRequisition, setAddingItemForRequisition] = useState(false);
  const [poReportsDateFrom, setPoReportsDateFrom] = useState("");
  const [poReportsDateTo, setPoReportsDateTo] = useState("");
  const [poReportFrom, setPoReportFrom] = useState("");
  const [poReportTo, setPoReportTo] = useState("");
  const [poReportSupplier, setPoReportSupplier] = useState("");
  const [poReportStatus, setPoReportStatus] = useState("");
  const [poReportMonths, setPoReportMonths] = useState([]);
  const [cancelPoModal, setCancelPoModal] = useState(null); // { po, reason }
  const [selectedReqIds, setSelectedReqIds] = useState([]);
  const [requisitionTarget, setRequisitionTarget] = useState(null);
  const [editingRequisitionId, setEditingRequisitionId] = useState(null);
  const [requisitionQty, setRequisitionQty] = useState("");
  const [requisitionNotes, setRequisitionNotes] = useState("");
  const [requisitionSupplier, setRequisitionSupplier] = useState("");
  const [showRequisitionPicker, setShowRequisitionPicker] = useState(false);
  const [requisitionPickerQuery, setRequisitionPickerQuery] = useState("");
  const [requisitionsSearchQuery, setRequisitionsSearchQuery] = useState("");
  const [requisitionsSupplierFilter, setRequisitionsSupplierFilter] = useState("");
  const [expandedReqId, setExpandedReqId] = useState(null);
  const [archiveTypeFilter, setArchiveTypeFilter] = useState("");
  const [archiveDateFrom, setArchiveDateFrom] = useState("");
  const [archiveDateTo, setArchiveDateTo] = useState("");
  // The Request stock basket: null when shut, else { query, lines, hidden }
  // with one line per item { item, qty, supplier, jobId, jobNumber, notes }.
  // hidden is set while the add-item form is open over it.
  const [requestBasket, setRequestBasket] = useState(null);
  return { requestBasket, setRequestBasket, poBuilder, setPoBuilder, poSearchQuery, setPoSearchQuery, poSupplierFilter, setPoSupplierFilter,
    expandedPoId, setExpandedPoId, receivingSearchQuery, setReceivingSearchQuery, expandedReceivingId,
    setExpandedReceivingId, receivingHistoryDateFrom, setReceivingHistoryDateFrom, receivingHistoryDateTo,
    setReceivingHistoryDateTo, receivingHistorySearchQuery, setReceivingHistorySearchQuery, showPoReport,
    setShowPoReport, receivingPo, setReceivingPo, receivingLines, setReceivingLines, receivingDeliveryNote,
    setReceivingDeliveryNote, receivingAdjustingIdx, setReceivingAdjustingIdx, addingItemForRequisition,
    setAddingItemForRequisition, poReportsDateFrom, setPoReportsDateFrom, poReportsDateTo, setPoReportsDateTo,
    poReportFrom, setPoReportFrom, poReportTo, setPoReportTo, poReportSupplier, setPoReportSupplier,
    poReportStatus, setPoReportStatus, poReportMonths, setPoReportMonths, cancelPoModal, setCancelPoModal,
    selectedReqIds, setSelectedReqIds, requisitionTarget, setRequisitionTarget, editingRequisitionId,
    setEditingRequisitionId, requisitionQty, setRequisitionQty, requisitionNotes, setRequisitionNotes,
    requisitionSupplier, setRequisitionSupplier, showRequisitionPicker, setShowRequisitionPicker,
    requisitionPickerQuery, setRequisitionPickerQuery, requisitionsSearchQuery, setRequisitionsSearchQuery,
    requisitionsSupplierFilter, setRequisitionsSupplierFilter, expandedReqId, setExpandedReqId,
    archiveTypeFilter, setArchiveTypeFilter, archiveDateFrom, setArchiveDateFrom, archiveDateTo,
    setArchiveDateTo };
}

export function usePurchasing(deps) {
  const { addCompanyLogo, byName, byText, canManageRequisitions, canMarkReceivedPerm, canRaisePO,
    cncBarWeight, currentUser, editingRequisitionId, emptyForm, expandedReqId, fetchAllocations,
    findMaterialEntry, findPrice, findSectionEntry, findSectionPrice, formatPoNumber,
    generateAndStoreDocument, getPdf, items, jobDetail, logJobEvent, master, materialSupplierLines,
    openJobDetail, plateWeight, poBuilder, poReportFrom, poReportMonths, poReportStatus, poReportSupplier,
    poReportTo, purchaseOrders, receivingDeliveryNote, receivingLines, receivingPo, requestBasket, requisitionNotes,
    requisitionQty, requisitionSupplier, requisitionTarget, requisitions, roleLabel, sameText, selectedReqIds,
    setRequestBasket,
    setAddingItemForRequisition, setAllowDuplicate, setCancelPoModal, setEditingId, setEditingRequisitionId,
    setExpandedReqId, setForm, setItems, setMaster, setPoBuilder, setPurchaseOrders, setReceivingAdjustingIdx,
    setReceivingDeliveryNote, setReceivingLines, setReceivingPo, setRequisitionNotes,
    setRequisitionPickerQuery, setRequisitionQty, setRequisitionSupplier, setRequisitionTarget,
    setRequisitions, setSectionPrice, setSelectedReqIds, setShowAdd, setShowPoReport,
    setShowRequisitionPicker, setSupplierPrice, setTab, setUsageLog, stockHasPaidPrice, supplierNameOf, tab,
    uid } = deps;

  // The cheapest supplier is filled in (his answer, 21 Sep 2026), unless
  // the no-supplier price beats every supplier's; the row's own
  // supplier when the material has no supplier prices.
  function defaultSupplierFor(it) {
    const lines = reqTargetLines(it);
    const best = cheapestPrice(lines);
    const mat = stockItemMaterial(it);
    const base = !mat ? 0 : mat.listKey === "sections" ? findSectionEntry(mat.name, mat.grade)?.price || 0 : findMaterialEntry(mat.listKey, mat.name)?.price || 0;
    return best && !(base > 0 && base < best.price) ? supplierNameOf(best.supplierId) || it.supplier || "" : it.supplier || "";
  }
  function openRequisition(it) {
    setRequisitionTarget(it);
    setEditingRequisitionId(null);
    setRequisitionQty("");
    setRequisitionNotes("");
    setRequisitionSupplier(defaultSupplierFor(it));
  }

  // ---- The Request stock basket (docs/REQUISITIONS-PLAN.md, 7 Oct 2026) ----
  // One pop-up for every door. openRequest({ lines, job }) opens it, with
  // any lines already in ({ item, qty, notes }) and a job every line
  // starts on. A basket hidden behind the add-item form comes back with
  // its lines kept.
  function basketLine(it, extra = {}, job = null) {
    return {
      item: it,
      qty: extra.qty != null ? String(extra.qty) : "",
      supplier: extra.supplier != null ? extra.supplier : defaultSupplierFor(it),
      jobId: extra.jobId != null ? extra.jobId : job?.id || "",
      jobNumber: extra.jobNumber != null ? extra.jobNumber : job?.job_number || "",
      notes: extra.notes || "",
    };
  }
  function openRequest({ lines = [], job = null } = {}) {
    setRequestBasket((b) => {
      const kept = b?.hidden ? b.lines : [];
      const seen = new Set(kept.map((l) => l.item.id));
      const added = lines.filter((l) => l.item && !seen.has(l.item.id)).map((l) => basketLine(l.item, l, job));
      return { query: "", lines: [...kept, ...added], hidden: false, error: "" };
    });
  }
  function closeRequest() {
    setRequestBasket(null);
  }
  function addBasketLine(it, extra = {}) {
    setRequestBasket((b) => {
      if (!b) return { query: "", lines: [basketLine(it, extra)], hidden: false, error: "" };
      if (b.lines.some((l) => l.item.id === it.id)) return { ...b, hidden: false };
      // A new line takes the job the line above it is for.
      const last = b.lines[b.lines.length - 1];
      const job = last ? { id: last.jobId, job_number: last.jobNumber } : null;
      return { ...b, lines: [...b.lines, basketLine(it, extra, job)], hidden: false, error: "" };
    });
  }
  // The add-item form's way back in: a basket that is open gets the new
  // item as a line; none open, one opens with it.
  function addToRequest(it) {
    addBasketLine(it);
  }
  function updateBasketLine(itemId, fields) {
    setRequestBasket((b) => (b ? { ...b, error: "", lines: b.lines.map((l) => (l.item.id === itemId ? { ...l, ...fields } : l)) } : b));
  }
  function removeBasketLine(itemId) {
    setRequestBasket((b) => (b ? { ...b, lines: b.lines.filter((l) => l.item.id !== itemId) } : b));
  }
  function requisitionLabel(it) {
    return it.mainCat === "plate" || it.mainCat === "structural"
      ? `${it.grade} — ${it.name}`
      : `${it.customer ? it.customer + " — " : ""}${it.name}`;
  }
  // One requisition row per line, the same row the one-item form wrote.
  function submitRequest() {
    if (!requestBasket) return;
    const lines = requestBasket.lines;
    const short = lines.filter((l) => !(Number(l.qty) > 0));
    if (short.length > 0) {
      setRequestBasket((b) => ({ ...b, error: `Every line needs a quantity: ${short.map((l) => l.item.name).join(", ")}.` }));
      return;
    }
    const now = new Date().toISOString();
    setRequisitions((prev) => [
      ...prev,
      ...lines.map((l) => ({
        id: uid(),
        mainCat: l.item.mainCat,
        itemId: l.item.id,
        itemLabel: requisitionLabel(l.item),
        itemGrade: l.item.grade || "",
        itemRawName: l.item.name || "",
        qty: String(l.qty).trim(),
        notes: (l.notes || "").trim(),
        requestedBy: roleLabel,
        dateRequested: now,
        status: "pending",
        supplier: l.supplier || "",
        jobId: l.jobId || "",
        jobNumber: l.jobNumber || "",
        orderedBy: "",
        dateOrdered: "",
        receivedBy: "",
        dateReceived: "",
      })),
    ]);
    closeRequest();
  }
  // The price lines for the stock row a requisition is being made for.
  function reqTargetLines(it) {
    return reqSupplierLines({ mainCat: it.mainCat, itemRawName: it.name, itemGrade: it.grade });
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
    // The add-item form draws under the basket, so the basket steps aside
    // and keeps its lines; the saved item comes back in through addToRequest.
    setRequestBasket((b) => (b ? { ...b, hidden: true } : b));
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

  // ---- Receiving and supplier prices (step 5, 21 Sep 2026) ----
  // Writes the rows landDelivery changed or made into the stock list.
  function applyLanded(next) {
    const before = new Map((items || []).map((it) => [it.id, it]));
    const changed = new Map(next.filter((it) => before.get(it.id) !== it).map((it) => [it.id, it]));
    if (changed.size === 0) return;
    setItems((prev) => {
      const seen = new Set(prev.map((it) => it.id));
      return [...prev.map((it) => changed.get(it.id) || it), ...[...changed.values()].filter((it) => !seen.has(it.id))];
    });
  }
  // One sheet's or one bar's weight, for working a PO price back to R/kg.
  function kgEachOf(it) {
    if (!it) return 0;
    if (it.mainCat === "plate") return plateWeight({ ...it, qty: 1 })?.perSheet || 0;
    if (it.mainCat === "cncBar") return (cncBarWeight({ ...it, qty: 1 })?.perM || 0) * ((Number(it.length) || 0) / 1000);
    return 0;
  }
  // A plate, section or bar row's material, as the supplier prices file it.
  function stockItemMaterial(it) {
    if (!it || !MATERIAL_CATS.includes(it.mainCat)) return null;
    if (it.mainCat === "structural") return { listKey: "sections", name: it.name, grade: it.grade || "" };
    const listKey = it.mainCat === "plate" ? "grades" : "cncGrades";
    const hit = findMaterialEntry(listKey, it.grade);
    return (hit ? hit.name : it.grade) ? { listKey, name: hit ? hit.name : it.grade, grade: "" } : null;
  }
  const supplierIdByName = (name) => (master?.suppliers || []).find((s) => sameText(s.name, name))?.id || "";
  // A delivery's price becomes that supplier's list price, dated today
  // even when it has not changed: a delivery proves the price is current.
  function recordReceivedPrice(it, supplierName, rate) {
    const mat = stockItemMaterial(it);
    const supplierId = supplierIdByName(supplierName);
    if (mat && supplierId && rate > 0) setSupplierPrice(mat.listKey, mat.name, mat.grade, supplierId, Math.round(rate * 100) / 100);
  }
  // The price lines for what a requisition asks for.
  function reqSupplierLines(req) {
    if (!master || !MATERIAL_CATS.includes(req.mainCat)) return [];
    if (req.mainCat === "structural") return sectionLines(master.supplierPrices, req.itemRawName, req.itemGrade);
    return materialSupplierLines(req.mainCat === "plate" ? "grades" : "cncGrades", req.itemGrade);
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
      // Plate, sections and bar land on the requisition's supplier's row,
      // averaged at the requisition's price (src/manager/receiving.js).
      // No PO price was agreed here, so the price list is left alone.
      const landed = landDelivery(items, {
        itemId: req.itemId, qty: qtyToAdd, supplier: req.supplier, rate: resolveReqPrice(req), newId: uid(), keepPaid: stockHasPaidPrice,
      });
      applyLanded(landed.items);
      setUsageLog((prev) => [
        ...prev,
        {
          id: uid(),
          itemId: landed.targetId || req.itemId,
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

  async function buildPoDoc(po) {
    const { jsPDF, autoTable } = await getPdf();
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
    // Supplier logos were dropped in Sept 2026; only the company's own
    // logo appears on documents now.
    const supX = leftX;
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
      head: [["#", "Part No", "Description", "Qty", "Excl. Price", "VAT %", "Excl. Total", "Incl. Total"]],
      body: po.lineItems.map((li, i) => {
        const exclTotal = Number(li.qty) * Number(li.unitPrice);
        const inclTotal = exclTotal * (1 + vatRate / 100);
        return [
          String(i + 1),
          li.partNumber || "",
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
      // Eight columns on A4 -- the description takes whatever is left so
      // the numbers never wrap, which is what makes a priced order hard
      // to read.
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 8, halign: "right" },
        1: { cellWidth: 24 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 12, halign: "right" },
        4: { cellWidth: 20, halign: "right" },
        5: { cellWidth: 12, halign: "right" },
        6: { cellWidth: 20, halign: "right" },
        7: { cellWidth: 20, halign: "right" },
      },
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
      // A line raised from a requisition finds its stock item through the
      // requisition. A line raised from a job's Buy-outs tab has no
      // requisition and carries the stock item itself, so receiving it
      // still counts the stock in and sets it aside for the job.
      const linkedItem = linkedReq ? items.find((it) => it.id === linkedReq.itemId) : li.linkedItemId ? items.find((it) => it.id === li.linkedItemId) : null;
      return {
        description: li.description,
        orderedQty: li.qty,
        // Per sheet, length or piece, as the PO has it: the received price.
        unitPrice: Number(li.unitPrice) || 0,
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

  // Material bought for a job should not land in general stock and wait
  // to be found. If the order names a job, whatever actually arrives is
  // set aside for it -- the short-delivery case included, since this uses
  // the received quantity, not the ordered one.
  //
  // No stage is set. Whoever raised the order rarely knows whether the
  // steel is for bending or the laser, and guessing would put it under
  // the wrong one. It shows on the job as not yet assigned to a stage,
  // for someone who does know to place.
  async function allocateReceivedToJob(po, lines, timestamp) {
    if (!supabase || !po.jobId) return;
    const rows = [];
    for (const line of lines) {
      const qty = parseFloat(line.receivedQty) || 0;
      if (qty <= 0 || !line.linkedItemId) continue;
      rows.push({
        id: uid(),
        job_id: po.jobId,
        job_number: po.jobNumber || "",
        process_id: null,
        process_name: "",
        item_id: line.linkedItemId,
        item_name: line.linkedItemName || "",
        main_cat: line.linkedItemMainCat || "",
        qty_allocated: qty,
        qty_used: 0,
        allocated_by: roleLabel,
        allocated_by_id: currentUser?.id || null,
        note: `Received against ${po.poNumber} on ${new Date(timestamp).toLocaleDateString()}`,
        status: "open",
      });
    }
    if (rows.length === 0) return;
    try {
      const { error } = await supabase.from("job_allocations").insert(rows);
      if (error) throw error;
      fetchAllocations();
    } catch (err) {
      // Never block the delivery over this. The stock is in either way,
      // and an allocation can be made by hand -- losing the receipt could
      // not be undone.
      console.error("Failed to set received material aside for the job:", err);
      alert(
        "The delivery was received, but setting it aside for " +
          (po.jobNumber || "the job") +
          " did not save. Allocate it from the job when you get a moment."
      );
    }
  }

  function submitReceiving() {
    if (!receivingDeliveryNote.trim()) {
      alert("Please enter the supplier's delivery note number before confirming.");
      return;
    }
    const timestamp = new Date().toISOString();
    // Plate, sections and bar land on the PO supplier's row, averaged at
    // the PO's price, and that price becomes the supplier's list price,
    // dated today (src/manager/receiving.js; Heinrich, 21 Sep 2026: the
    // PO price is the received price for now). Lines are worked through
    // one copy of the stock list, so two lines for one row add up.
    let working = items;
    const landedLines = receivingLines.map((line) => {
      const receivedQty = parseFloat(line.receivedQty) || 0;
      if (receivedQty <= 0 || !line.linkedItemId) return line;
      const from = working.find((it) => it.id === line.linkedItemId);
      const rate = rateFromLinePrice(from, line.unitPrice, kgEachOf(from));
      const landed = landDelivery(working, {
        itemId: line.linkedItemId, qty: receivedQty, supplier: receivingPo.supplierName, rate, newId: uid(), keepPaid: stockHasPaidPrice,
      });
      working = landed.items;
      if (from && rate > 0) recordReceivedPrice(from, receivingPo.supplierName, rate);
      return { ...line, linkedItemId: landed.targetId || line.linkedItemId };
    });
    applyLanded(working);
    landedLines.forEach((line) => {
      const receivedQty = parseFloat(line.receivedQty) || 0;
      if (receivedQty <= 0) return;
      if (line.linkedItemId) {
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
            jobNumber: receivingPo.jobNumber || "",
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
    allocateReceivedToJob(receivingPo, landedLines, timestamp);
    closeReceiving();
  }

  // Opens the PO in the same inline viewer already used for drawing/photo
  // attachments, and stores it properly so it can be reopened later
  // instead of only existing for this one moment — same fix as every
  // other document generator needed. This replaces the old separate
  // "Download" action too: the viewer already has its own download link,
  // so a second, differently-behaving button next to it was redundant.
  async function viewPoPdf(po) {
    const doc = await buildPoDoc(po);
    await generateAndStoreDocument({
      doc,
      documentType: "purchase_order",
      bucket: "job-documents",
      path: `po/${po.id}/${po.poNumber}.pdf`,
      fileName: `${po.poNumber}.pdf`,
      relatedId: po.poNumber,
    });
  }

  // What a purchase order actually cost, before VAT. The VAT comes back, so
  // this is the figure to watch against a budget rather than the inclusive
  // one. Older orders were saved without the exclusive column, so it falls
  // back to adding the lines up -- same fallback the single-PO document uses.
  function poExclusive(po) {
    if (po.exclusiveTotal != null) return Number(po.exclusiveTotal) || 0;
    return (po.lineItems || []).reduce(
      (sum, li) => sum + Number(li.qty || 0) * Number(li.unitPrice || 0),
      0
    );
  }

  // A purchase order belongs to the month it was raised in, not the month
  // the goods turned up. That way the month stops changing once it is over:
  // September's spend is what September committed to, whenever it arrives.
  function poMonthKey(po) {
    return (po.dateCreated || "").slice(0, 7);
  }

  function poMonthLabel(key) {
    if (!key) return "No date";
    return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-ZA", {
      month: "long",
      year: "numeric",
    });
  }

  // A summary-table report across many POs at once — for spend review, not
  // for sending to a supplier, so this is a plain table, not a letterhead.
  //
  // Grouped by month with its own subtotal per month, because one flat list
  // of two hundred orders answers "what did we spend" only after somebody
  // adds it up by hand.
  async function generatePoReport() {
    const { jsPDF, autoTable } = await getPdf();

    // Months win if any are ticked; the dates are the fallback for a range
    // that is not whole months.
    const byMonths = poReportMonths.length > 0;
    const matches = purchaseOrders
      .filter((po) => !poReportSupplier || po.supplierId === poReportSupplier)
      .filter((po) => {
        if (!poReportStatus) return true;
        if (poReportStatus === "received") return po.status === "received";
        if (poReportStatus === "cancelled") return po.status === "cancelled";
        return poIsOpen(po);
      })
      .filter((po) => (byMonths ? poReportMonths.includes(poMonthKey(po)) : true))
      .filter((po) => byMonths || !poReportFrom || new Date(po.dateCreated) >= new Date(poReportFrom))
      .filter((po) => byMonths || !poReportTo || new Date(po.dateCreated) <= new Date(poReportTo + "T23:59:59"))
      .sort((a, b) => new Date(a.dateCreated) - new Date(b.dateCreated));

    if (matches.length === 0) {
      alert(
        byMonths
          ? "No Purchase Orders in the months you picked."
          : "No Purchase Orders match that date range/supplier."
      );
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
    const rangeLabel = byMonths
      ? [...poReportMonths].sort().map(poMonthLabel).join(", ")
      : `${poReportFrom || "earliest"} to ${poReportTo || "latest"}`;
    doc.text(`${supplierLabel} · ${rangeLabel}`, textX, 25);

    const months = new Map();
    for (const po of matches) {
      const key = poMonthKey(po);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(po);
    }

    // Same formatting as the figures on the screen. R 1234567.00 is a
    // number you have to count the digits of; R 1 234 567.00 is one you
    // can read.
    const money = (n) =>
      `R ${Number(n || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    let y = 32;
    let allEx = 0;
    let allInc = 0;
    let stillOnOrderEx = 0;

    for (const key of [...months.keys()].sort()) {
      const list = months.get(key);
      const ex = list.reduce((s, po) => s + poExclusive(po), 0);
      const inc = list.reduce((s, po) => s + Number(po.totalValue || 0), 0);
      const open = list.filter(poIsOpen);
      const openEx = open.reduce((s, po) => s + poExclusive(po), 0);
      allEx += ex;
      allInc += inc;
      stillOnOrderEx += openEx;

      // autoTable breaks its own pages, but this heading is drawn by hand
      // and would land off the bottom without asking.
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.text(poMonthLabel(key), 14, y);
      doc.setFont(undefined, "normal");

      autoTable(doc, {
        startY: y + 3,
        head: [["PO Number", "Date", "Supplier", "Status", "Excl VAT", "VAT", "Incl VAT"]],
        body: list.map((po) => {
          const poEx = poExclusive(po);
          const poInc = Number(po.totalValue || 0);
          return [
            po.poNumber,
            new Date(po.dateCreated).toLocaleDateString(),
            po.supplierName || "—",
            po.status === "received" ? "Received" : po.status === "cancelled" ? "Cancelled" : "Outstanding",
            money(poEx),
            money(poInc - poEx),
            money(poInc),
          ];
        }),
        foot: [[
          `${list.length} ${list.length === 1 ? "order" : "orders"}`,
          "",
          "",
          // Whether anything is still out, not whether it is worth
          // anything. An order for nothing is still an order not received.
          open.length
            ? `${open.length} still on order · ${money(openEx)}`
            : "all received",
          money(ex),
          money(inc - ex),
          money(inc),
        ]],
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [27, 29, 31] },
        footStyles: { fillColor: [242, 169, 0], textColor: [27, 29, 31], fontStyle: "bold" },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    autoTable(doc, {
      startY: y,
      head: [[months.size > 1 ? `All ${months.size} months` : "Total", "Excl VAT", "VAT", "Incl VAT"]],
      body: [
        ["Ordered", money(allEx), money(allInc - allEx), money(allInc)],
        ["Of that, still on order", money(stillOnOrderEx), "", ""],
      ],
      theme: "grid",
      headStyles: { fillColor: [27, 29, 31] },
      bodyStyles: { fontStyle: "bold" },
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

  function openPoBuilder(linkedRequisitionIds = [], prefillSupplierId = "", prefillLineItems = [], job = null, mixedJobs = []) {
    setPoBuilder({
      supplierId: prefillSupplierId,
      lineItems: prefillLineItems.length ? prefillLineItems : [{ description: "", partNumber: "", qty: "", unitPrice: "" }],
      // Started from a job's own Purchase orders tab, or from requests
      // all for one job: that job, filled in. Requests for several jobs
      // leave it empty and name them (mixedJobs, shown under the box).
      jobId: job?.id || null,
      jobNumber: job?.job_number || "",
      mixedJobs,
      jobQuery: "",
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
      po.lineItems.map((li) => ({
        description: li.description,
        partNumber: li.partNumber || "",
        qty: String(li.qty),
        unitPrice: String(li.unitPrice),
      }))
    );
  }

  function closePoBuilder() {
    setPoBuilder(null);
  }

  function addPoLineItem() {
    setPoBuilder((b) => ({
      ...b,
      lineItems: [...b.lineItems, { description: "", partNumber: "", qty: "", unitPrice: "" }],
    }));
  }

  // Everything a purchase order can be raised against: anything with a part
  // number, except Customer Stock -- those are the customer's own parts, not
  // things we buy. Same rule the Request stock picker already uses, so the
  // two cannot drift apart on what is orderable.
  const poPartLookup = useMemo(() => {
    return (items || [])
      .filter((it) => it.mainCat !== "custom")
      .filter((it) => (it.partNumber || "").trim())
      .sort((a, b) => byText(a.partNumber, b.partNumber));
  }, [items]);

  // The same items again, by description, because half the time the code is
  // the thing nobody remembers. One entry per description -- two items with
  // the same wording would otherwise show as two identical suggestions.
  const poDescriptionLookup = useMemo(() => {
    const seen = new Set();
    return poPartLookup
      .filter((it) => {
        const name = (it.name || "").trim();
        if (!name || seen.has(name.toLowerCase())) return false;
        seen.add(name.toLowerCase());
        return true;
      })
      .sort(byName);
  }, [poPartLookup]);

  // Typing a part number fills the rest of the line in. If nothing matches,
  // the other fields are left alone -- somebody ordering something we have
  // never stocked still types it by hand, as before.
  function fillPoLineFromPartNumber(idx, value) {
    const typed = value.trim().toLowerCase();
    const hit = typed
      ? poPartLookup.find((it) => (it.partNumber || "").toLowerCase() === typed)
      : null;
    setPoBuilder((b) => ({
      ...b,
      lineItems: b.lineItems.map((li, i) =>
        i === idx
          ? {
              ...li,
              partNumber: value,
              ...(hit
                ? {
                    description: li.description.trim() ? li.description : hit.name || "",
                    unitPrice: li.unitPrice ? li.unitPrice : String(Number(hit.value) || ""),
                  }
                : {}),
            }
          : li
      ),
    }));
  }

  // The other way round: type what the thing is called and the code and
  // price follow. Same rule -- anything already on the line is left alone.
  function fillPoLineFromDescription(idx, value) {
    const typed = value.trim().toLowerCase();
    const hit = typed
      ? poPartLookup.find((it) => (it.name || "").toLowerCase() === typed)
      : null;
    setPoBuilder((b) => ({
      ...b,
      lineItems: b.lineItems.map((li, i) =>
        i === idx
          ? {
              ...li,
              description: value,
              ...(hit
                ? {
                    partNumber: (li.partNumber || "").trim() ? li.partNumber : hit.partNumber || "",
                    unitPrice: li.unitPrice ? li.unitPrice : String(Number(hit.value) || ""),
                  }
                : {}),
            }
          : li
      ),
    }));
  }

  // Still coming: not received, and not cancelled. Until an order could be
  // cancelled, "not received" meant the same thing and was written out in
  // eight places -- the list, receiving, the figures and the report. One
  // definition now, so a cancelled order cannot go on counting as money on
  // order in a place somebody forgot to change.
  // Cancelling is deliberately not deleting. The order was sent to a
  // supplier and may have been acted on, so the record stays and says who
  // stopped it and why -- which is the whole point of the reason box.
  function cancelPurchaseOrder(po, reason) {
    const why = (reason || "").trim();
    if (!why) return;
    // Changing the list is what saves it -- purchase orders write
    // themselves to the database whenever this state changes, the same way
    // receiving does. A second write here would race that one.
    setPurchaseOrders((prev) =>
      prev.map((x) =>
        x.id === po.id
          ? {
              ...x,
              status: "cancelled",
              cancelledBy: roleLabel,
              cancelledDate: new Date().toISOString(),
              cancelReason: why,
            }
          : x
      )
    );
    setCancelPoModal(null);
  }

  function poIsOpen(po) {
    return po.status !== "received" && po.status !== "cancelled";
  }

  function updatePoLineItem(idx, field, value) {
    setPoBuilder((b) => ({
      ...b,
      lineItems: b.lineItems.map((li, i) => (i === idx ? { ...li, [field]: value } : li)),
    }));
  }

  const poSupplierName = poBuilder
    ? (master.suppliers.find((sup) => sup.id === poBuilder.supplierId) || {}).name || ""
    : "";

  function removePoLineItem(idx) {
    setPoBuilder((b) => ({ ...b, lineItems: b.lineItems.filter((_, i) => i !== idx) }));
  }

  // Selecting requisitions on the Buyer page to bundle into one PO — reused
  // by the checkbox flow on each pending requisition card.
  function toggleReqSelection(id) {
    setSelectedReqIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // What the supplier actually reads on the order.
  //
  // A requisition label is "MS — 50x50x2", which says nothing about how
  // long the pieces should be. Ordering 10 of those is meaningless: the
  // supplier needs 10 pieces of 6m. The length lives on the stock item,
  // so it is put back on here rather than being baked into the label --
  // which also means requisitions raised before this fix get it too.
  // What a supplier should see on the order. Deliberately not the label
  // used inside the app: for a Stores item that label starts with where
  // we keep it on the shelf, which is our business and not theirs.
  //
  // The material is printed in full, whatever the screens call it (his
  // answer, 29 Sep 2026): a label "MS — SHS 50x50x3" goes to the supplier
  // as "Mild Steel — SHS 50x50x3". Plate and sections only: CNC bar has
  // materials of its own, and a Stores label starts with no material.
  function poLineDescription(req) {
    const it = (items || []).find((x) => x.id === req.itemId);
    const label = ["plate", "structural"].includes(req.mainCat) ? withFullMaterial(master?.grades, req.itemLabel) : req.itemLabel;
    const base = it && it.mainCat === "stores" ? it.name || req.itemRawName || label : label;
    const metres = Number(it?.length) || 0;
    if (!metres || !it?.trackLength) return base;
    return `${base} — ${metres}m lengths`;
  }

  // Blank for a line typed in by hand, and for every order raised before
  // the part number was carried through at all.
  function poLinePartNumber(req) {
    const it = (items || []).find((x) => x.id === req.itemId);
    return it?.partNumber || "";
  }

  function raisePoFromSelected() {
    const selected = requisitions.filter((r) => selectedReqIds.includes(r.id));
    if (selected.length === 0) return;
    const lineItems = selected.map((r) => ({
      description: poLineDescription(r),
      partNumber: poLinePartNumber(r),
      qty: r.qty,
      unitPrice: resolvePoLineUnitPrice(r),
    }));
    // If every selected requisition already has the same supplier text set,
    // try to match it to a real supplier record to prefill the picker.
    const supplierNames = [...new Set(selected.map((r) => r.supplier).filter(Boolean))];
    const matched = supplierNames.length === 1 ? master.suppliers.find((s) => s.name === supplierNames[0]) : null;
    // The requests' job goes onto the order (src/purchasing/poJob.js):
    // one job fills the box, several leave it empty and are named.
    const { job, mixed } = jobForPurchaseOrder(selected);
    openPoBuilder(selected.map((r) => r.id), matched?.id || "", lineItems, job, mixed);
  }

  // One-click version of the same bundling, for an entire supplier's group
  // of pending requisitions at once — the everyday case this exists for:
  // several separate requests for the same supplier, submitted together as
  // one PO instead of raising one at a time throughout the day.
  function raisePoForSupplierGroup(supplierName, reqList) {
    if (reqList.length === 0) return;
    const lineItems = reqList.map((r) => ({
      description: poLineDescription(r),
      partNumber: poLinePartNumber(r),
      qty: r.qty,
      unitPrice: resolvePoLineUnitPrice(r),
    }));
    const matched = master.suppliers.find((s) => s.name === supplierName);
    const { job, mixed } = jobForPurchaseOrder(reqList);
    openPoBuilder(reqList.map((r) => r.id), matched?.id || "", lineItems, job, mixed);
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
              <span>{r.jobNumber ? `For job ${r.jobNumber}` : "For stores"}</span>
            </div>
            {r.notes && <div style={S.itemComment}>{r.notes}</div>}
            {canManageRequisitions && r.mainCat !== "custom" && (
              <div style={S.reqPriceRow}>
                <span style={S.reqPriceLabel}>
                  Current price ({r.mainCat === "plate" || r.mainCat === "cncBar" ? "R/kg" : r.mainCat === "structural" ? "R/m" : "R/ea"})
                  {price === 0 ? " — not set" : ""}:
                </span>
                <NumberBox
                  style={{ ...S.managerFactorInput, ...(price === 0 ? S.reqPriceMissing : {}) }}
                  value={price}
                  onCommit={(v) => updateReqPrice(r, v)}
                />
              </div>
            )}
            {canManageRequisitions && r.status === "pending" && (
              <div style={S.reqActions}>
                <TypeToFind
                  style={{ flex: 1 }}
                  options={master.suppliers.map((s) => s.name)}
                  value={r.supplier || ""}
                  onChange={(v) => updateRequisition(r.id, { supplier: v })}
                  emptyLabel="Supplier (optional)"
                />
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
      // Set only when a real job was picked. Receiving reads this to set
      // the material aside for that job instead of dropping it into
      // general stock for someone to find later.
      jobId: poBuilder.jobId || null,
      jobNumber: poBuilder.jobNumber || "",
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
    // A PO raised from a job's Buy-outs tab: stamp the order's number on
    // the lines it covers, so the tab reads "On PO1573" and refuses to
    // let those lines drift from what the supplier was sent.
    if (poBuilder.buyoutLineIds?.length && supabase) {
      const stampedJobId = poBuilder.jobId;
      supabase
        .from("job_buyout_items")
        .update({ po_id: po.id, po_number: po.poNumber })
        .in("id", poBuilder.buyoutLineIds)
        .then(({ error }) => {
          if (error) {
            console.error("The PO was raised, but the job's buy-out lines were not marked as ordered:", error);
            alert(`${po.poNumber} was raised, but the job's buy-out lines could not be marked as ordered. Refresh the job and check.`);
          }
          if (stampedJobId) {
            logJobEvent(stampedJobId, "PO raised", `${po.poNumber} — ${po.supplierName}, ${validLines.length} line${validLines.length === 1 ? "" : "s"}`);
            if (jobDetail?.job.id === stampedJobId) openJobDetail(jobDetail.job);
          }
        });
    }
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
    // Its own supplier's price first; the cheapest when that supplier has
    // none, or the requisition names nobody.
    const own = req.supplier ? reqSupplierLines(req).find((p) => p.supplierId === supplierIdByName(req.supplier)) : null;
    if (own && own.price > 0) return own.price;
    if (req.mainCat === "plate") return findPrice("grades", req.itemGrade);
    if (req.mainCat === "structural") return findSectionPrice(req.itemRawName, req.itemGrade);
    if (req.mainCat === "cncBar") return findPrice("cncGrades", req.itemGrade);
    const it = (items || []).find((i) => i.id === req.itemId);
    return it ? Number(it.value || 0) : 0;
  }

  function updateReqPrice(req, newPriceStr) {
    const price = parseFloat(newPriceStr) || 0;
    // A price typed on a requisition that names a supplier is that
    // supplier's price. Without one, or without the table, it is the
    // no-supplier price below, as it always was.
    const supplierId = req.supplier ? supplierIdByName(req.supplier) : "";
    if (supplierId && Array.isArray(master?.supplierPrices) && MATERIAL_CATS.includes(req.mainCat)) {
      const it = (items || []).find((i) => i.id === req.itemId);
      const mat = stockItemMaterial(it || { mainCat: req.mainCat, name: req.itemRawName, grade: req.itemGrade });
      if (mat) {
        setSupplierPrice(mat.listKey, mat.name, mat.grade, supplierId, price);
        return;
      }
    }
    // A material is stored by its short name when it has one ("SS304"),
    // so match either, the way findPrice reads it.
    const q = (req.itemGrade || "").toLowerCase();
    const isGrade = (g) => g.name.toLowerCase() === q || (g.shortName || "").toLowerCase() === q;
    if (req.mainCat === "plate") {
      setMaster((prev) => ({
        ...prev,
        grades: prev.grades.map((g) => (isGrade(g) ? { ...g, price } : g)),
      }));
    } else if (req.mainCat === "structural") {
      setSectionPrice(req.itemRawName, req.itemGrade, price);
    } else if (req.mainCat === "cncBar") {
      setMaster((prev) => ({
        ...prev,
        cncGrades: prev.cncGrades.map((g) => (isGrade(g) ? { ...g, price } : g)),
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

  return { addBasketLine, addPoLineItem, addToRequest, buildPoDoc, cancelPurchaseOrder, closePoBuilder,
    closeReceiving, closeRequest, closeRequisition, openRequest, removeBasketLine, submitRequest, updateBasketLine,
    copyPurchaseOrder, createItemForRequisition, fillPoLineFromDescription,
    fillPoLineFromPartNumber, generatePoReport, handleFlagClick, openPoBuilder, openReceiving,
    openRequisition, poDescriptionLookup, poExclusive,
    poIsOpen, poMonthKey, poMonthLabel, poPartLookup, poSupplierName, raisePoForSupplierGroup,
    raisePoFromSelected, removePoLineItem, renderRequisitionCard, reqTargetLines, submitPurchaseOrder,
    submitReceiving, submitRequisition, updatePoLineItem, updateReceivingLineQty, viewPoPdf };
}
