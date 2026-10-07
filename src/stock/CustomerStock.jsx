// The Customer Stock list (Heinrich, 7 Oct 2026; docs/CUSTOMER-STOCK-SUPPLIER-PLAN.md).
//
// The catalogue of every customer's parts: one pill per customer, A to Z,
// shut; one row per part, A to Z by stock code, zero quantities included
// (1,724 of the 1,732 parts on live are at zero, and the old list hid
// them). A tap opens the row in place with its boxes; no new page.
//
// What the row reads: the stock code in its own box, the description in
// its own box, the customer's revision, the quantity, the cost (Rand
// values only; it is what we pay, never "price"), the supplier.
//
// Everything that changes a row goes through the same functions the old
// list used (ctx): Use / Add through the usage pop-up, Edit, Duplicate,
// Remove, Request stock, and updateCustomerStockField for the boxes.

import { useState } from "react";
import { AlertTriangle, ClipboardList, Copy, FileText, ImageIcon, Pencil, Trash2 } from "lucide-react";
import Section from "../Section.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { stockSearchText, searchWords, matchesWords } from "../lib/stockSearch.js";

// Codes sort as people read them: HPE-10 after HPE-9, letters case ignored.
const byCode = (a, b) =>
  String(a.partNumber || "").localeCompare(String(b.partNumber || ""), undefined, { numeric: true, sensitivity: "base" }) ||
  String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const box = {
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "3px 8px",
  background: "transparent",
  whiteSpace: "nowrap",
};

// A text box that saves when it is left or on Enter, never per keystroke,
// and is rebuilt when the stored value changes under it.
function SaveOnLeave({ value, onSave, style, placeholder, title, type = "text" }) {
  return (
    <input
      key={value ?? ""}
      type={type}
      step={type === "number" ? "any" : undefined}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      title={title}
      style={style}
      onBlur={(e) => {
        if (e.target.validity?.badInput) return;
        if (String(e.target.value) !== String(value ?? "")) onSave(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
      }}
    />
  );
}

export default function CustomerStock({ ctx }) {
  const { allocationsForItem, canDelete, canEditItems, canEditQty, canRequisition, canSeeValue, canView, drawingLookup,
    isLowStock, items, master, openDrawingPreviewByPartNumber, openDuplicate, openEdit, openPreview, openRequest,
    openUsageModal, query, removeItem, updateCustomerStockField } = ctx;
  const [hasStockOnly, setHasStockOnly] = useState(false);
  const [openId, setOpenId] = useState(null);

  const words = searchWords(query);
  const all = (items || []).filter((it) => it.mainCat === "custom");
  const shown = all
    .filter((it) => !hasStockOnly || Number(it.qty) > 0)
    .filter((it) => matchesWords(stockSearchText(it, [it.customerRevision]), words));
  const byCustomer = new Map();
  for (const it of shown) {
    const k = (it.customer || "").trim() || "No customer";
    if (!byCustomer.has(k)) byCustomer.set(k, []);
    byCustomer.get(k).push(it);
  }
  const customers = [...byCustomer.keys()].sort(byName);
  const onHand = all.filter((it) => Number(it.qty) > 0).length;

  function row(it) {
    const isOpen = openId === it.id;
    const low = isLowStock(it);
    const drawing = it.partNumber && drawingLookup?.[it.partNumber.trim()];
    const reserved = allocationsForItem ? allocationsForItem(it.id) : [];
    const held = reserved.reduce((sum, a) => sum + (Number(a.qty_allocated) - Number(a.qty_used)), 0);
    return (
      <div key={it.id} style={{ ...S.reqCard, padding: "8px 10px", borderLeft: `4px solid ${low ? C.danger : Number(it.qty) > 0 ? C.accentFinished : C.border}` }}>
        <button
          type="button"
          className="stk-btn"
          onClick={() => setOpenId(isOpen ? null : it.id)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", color: C.text, cursor: "pointer", padding: 0, textAlign: "left", flexWrap: "wrap", font: "inherit" }}
        >
          <span style={{ ...box, fontFamily: "monospace", fontSize: 13, color: C.accentRaw, borderColor: `${C.accentRaw}88` }} title="Stock code">
            {it.partNumber || "no code"}
          </span>
          <span style={{ ...box, flex: "1 1 220px", minWidth: 0, whiteSpace: "normal", fontWeight: 600 }} title="Description">
            {it.name}
          </span>
          {it.customerRevision && <span style={{ ...box, color: C.muted }} title="Customer's revision">rev {it.customerRevision}</span>}
          <span style={{ ...box, fontWeight: 700, color: low ? C.danger : Number(it.qty) > 0 ? C.text : C.muted }} title="On hand">
            {it.qty} {it.unit || "ea"}
          </span>
          {canSeeValue && <span style={{ ...box, color: C.muted }} title="Cost, what we pay">R{Number(it.value || 0).toFixed(2)}</span>}
          {it.supplier && <span style={{ ...box, color: C.muted }} title="Supplier">{it.supplier}</span>}
          {low && (
            <span style={S.lowTag}>
              <AlertTriangle size={11} strokeWidth={2.5} /> below {it.low}
            </span>
          )}
        </button>
        {isOpen && (
          <div style={{ marginTop: 8 }}>
            <div className="stk-meta-row" style={S.rowMeta}>
              {it.customer && <span style={S.customerTag}>{it.customer}</span>}
              {held > 0 && <span style={{ color: C.accentRaw, fontWeight: 600 }}>{held} reserved for jobs</span>}
              {canSeeValue && <span>Cost R{Number(it.value || 0).toFixed(2)} each · R{(Number(it.value || 0) * Number(it.qty || 0)).toFixed(2)} on hand</span>}
              {it.loc && <span>Shelf {it.loc}</span>}
              {drawing && canView("drawings") && (
                <button type="button" className="stk-btn" style={S.drawingTag} onClick={() => openDrawingPreviewByPartNumber(it.partNumber.trim())}>
                  <FileText size={14} /> Drawing
                </button>
              )}
              {it.attachmentType && (
                <button type="button" className="stk-btn" style={S.drawingTag} onClick={() => openPreview(it)} title={`View ${it.attachmentName || "attachment"}`}>
                  {it.attachmentType === "pdf" ? <FileText size={14} /> : <ImageIcon size={14} />} {it.attachmentName || "Attachment"}
                </button>
              )}
            </div>
            {it.comment && <div style={S.itemComment}>{it.comment}</div>}
            {canEditItems && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                {canSeeValue && (
                  <div>
                    <label style={S.label}>Cost (R)</label>
                    <SaveOnLeave type="number" value={it.value === 0 ? "" : it.value} placeholder="0" title="What we pay, each" style={{ ...S.managerFactorInput, display: "block" }} onSave={(v) => updateCustomerStockField(it.id, "value", v)} />
                  </div>
                )}
                <div>
                  <label style={S.label}>Low at</label>
                  <SaveOnLeave type="number" value={it.low === 0 ? "" : it.low} placeholder="0" title="Warn when on hand drops below this" style={{ ...S.managerFactorInput, display: "block" }} onSave={(v) => updateCustomerStockField(it.id, "low", v)} />
                </div>
                <div>
                  <label style={S.label}>Customer revision</label>
                  <SaveOnLeave value={it.customerRevision || ""} placeholder="e.g. A" title="The customer's own revision" style={{ ...S.managerFactorInput, width: 70, display: "block" }} onSave={(v) => updateCustomerStockField(it.id, "customerRevision", v.trim())} />
                </div>
                <div>
                  <label style={S.label}>Supplier (optional)</label>
                  <TypeToFind
                    style={{ width: 180 }}
                    inputStyle={{ ...S.managerFactorInput, width: "100%", padding: "5px 24px 5px 7px", boxSizing: "border-box" }}
                    options={(master.suppliers || []).map((s) => s.name)}
                    value={it.supplier || ""}
                    allowNew
                    onChange={(v) => updateCustomerStockField(it.id, "supplier", v)}
                    emptyLabel="None: the customer's own part"
                  />
                </div>
                <div>
                  <label style={S.label}>Customer</label>
                  <TypeToFind
                    style={{ width: 160 }}
                    inputStyle={{ ...S.managerFactorInput, width: "100%", padding: "5px 24px 5px 7px", boxSizing: "border-box" }}
                    options={master.customers || []}
                    value={it.customer || ""}
                    // allowNew so a customer not on the master list (an
                    // imported sheet's name) still reads in the box.
                    allowNew
                    onChange={(v) => updateCustomerStockField(it.id, "customer", v)}
                    emptyLabel="No customer"
                  />
                </div>
              </div>
            )}
            <div style={{ ...S.rowControls, marginTop: 8 }}>
              <div style={S.qtyBlock}>
                {canEditQty("custom") && (
                  <button type="button" className="stk-btn" style={S.usageBtnUse} onClick={() => openUsageModal(it, "use")}>
                    Use
                  </button>
                )}
                <div style={S.qtyDisplay}>
                  <span style={{ ...S.qtyNum, color: low ? C.danger : C.text }}>{it.qty}</span>
                  <span style={S.qtyUnit}>{it.unit || "ea"}</span>
                </div>
                {canEditQty("custom") && (
                  <button type="button" className="stk-btn" style={S.usageBtnAdd} onClick={() => openUsageModal(it, "add")}>
                    Add
                  </button>
                )}
              </div>
              <div style={S.rowActionIcons}>
                {canRequisition && (
                  <button type="button" className="stk-btn" style={S.iconRowBtn} onClick={() => openRequest({ lines: [{ item: it }] })} title="Request stock for this part">
                    <ClipboardList size={14} />
                  </button>
                )}
                {canEditItems && (
                  <button type="button" className="stk-btn" style={S.iconRowBtn} onClick={() => openEdit(it)} title="Edit item">
                    <Pencil size={14} />
                  </button>
                )}
                {canEditItems && (
                  <button type="button" className="stk-btn" style={S.iconRowBtn} onClick={() => openDuplicate(it)} title="Duplicate">
                    <Copy size={14} />
                  </button>
                )}
                {canDelete && (
                  <button type="button" className="stk-btn" style={S.deleteBtn} onClick={() => removeItem(it.id)} title="Remove item">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={S.list}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={S.roleHint}>
          {all.length} part{all.length === 1 ? "" : "s"} for {customers.length || byCustomer.size} customer{byCustomer.size === 1 ? "" : "s"}, {onHand} with stock on hand.
        </span>
        <label style={S.checkRow}>
          <input type="checkbox" checked={hasStockOnly} onChange={(e) => setHasStockOnly(e.target.checked)} />
          Has stock only
        </label>
      </div>
      {shown.length === 0 && (
        <div style={S.empty}>{all.length === 0 ? "Nothing here yet — add one above, or import a customer's sheet under Stock Manager." : "Nothing matches that."}</div>
      )}
      {customers.map((name) => {
        const list = [...byCustomer.get(name)].sort(byCode);
        return (
          // A search opens every pill it still shows (the key change rebuilds
          // them); with the box empty they start shut.
          <Section key={name + (words.length > 0 ? ":searching" : "")} title={name} count={list.length} defaultOpen={words.length > 0} quiet>
            {list.map(row)}
          </Section>
        );
      })}
    </div>
  );
}
