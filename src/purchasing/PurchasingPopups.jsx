// The purchasing pop-ups, moved word for word out of App.jsx on 2026-10-05.
// They are drawn in two places, as before, so the Request stock pop-up still
// sits on top of the Low stock list it can be opened from.

import TypeToFind from "../TypeToFind.jsx";
import RequestStock from "./RequestStock.jsx";
import { mixedJobsWords } from "./poJob.js";
import { C, S } from "../theme.js";
import { Plus, Trash2, X } from "lucide-react";
import { stockSearchText, searchWords, matchesWords } from "../lib/stockSearch.js";

// Receive, Cancel PO, PO report and the PO builder.
export function PurchasingPopups({ ctx }) {
  const { addPoLineItem, cancelPoModal, cancelPurchaseOrder, closePoBuilder, closeReceiving,
    fillPoLineFromDescription, fillPoLineFromPartNumber, generatePoReport, jobsList, master, poBuilder,
    poDescriptionLookup, poMonthKey, poMonthLabel, poPartLookup, poReportFrom, poReportMonths, poReportStatus,
    poReportSupplier, poReportTo, poSupplierName, purchaseOrders, receivingAdjustingIdx,
    receivingDeliveryNote, receivingLines, receivingPo, removePoLineItem, roleLabel, setCancelPoModal,
    setPoBuilder, setPoReportFrom, setPoReportMonths, setPoReportStatus, setPoReportSupplier, setPoReportTo,
    setReceivingAdjustingIdx, setReceivingDeliveryNote, setShowPoReport, showPoReport, submitPurchaseOrder,
    submitReceiving, updatePoLineItem, updateReceivingLineQty } = ctx;
  return (
    <>
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

      {/* Why, not just that. A cancelled order with no explanation is a gap
          somebody has to go and ask about weeks later, so the reason is
          required rather than optional. */}
      {cancelPoModal && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Cancel {cancelPoModal.po.poNumber}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setCancelPoModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>
              {cancelPoModal.po.supplierName || "No supplier"} · R{Number(cancelPoModal.po.totalValue || 0).toFixed(2)}
            </div>
            <div style={{ ...S.roleHint, marginTop: 8 }}>
              The order stays on the books with the reason against it — it is not deleted. If the supplier has already
              been sent it, tell them too; this only records the decision here.
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Why is it being cancelled?</label>
              <input
                autoFocus
                style={S.input}
                value={cancelPoModal.reason}
                onChange={(e) => setCancelPoModal((m) => ({ ...m, reason: e.target.value }))}
                placeholder="e.g. ordered in error, job cancelled, supplier cannot supply"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && cancelPoModal.reason.trim()) {
                    e.preventDefault();
                    cancelPurchaseOrder(cancelPoModal.po, cancelPoModal.reason);
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="stk-btn"
              style={{
                ...S.submitBtn,
                marginTop: 12,
                background: C.danger,
                ...(cancelPoModal.reason.trim() ? {} : S.submitBtnDisabled),
              }}
              disabled={!cancelPoModal.reason.trim()}
              onClick={() => cancelPurchaseOrder(cancelPoModal.po, cancelPoModal.reason)}
            >
              Cancel this purchase order
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
            {/* Months first, because a month is what somebody is nearly
                always after and typing two dates to mean "September" is
                three chances to get it wrong. The dates below still work,
                for a range that is not whole months. */}
            {(() => {
              const monthKeys = [...new Set(purchaseOrders.map(poMonthKey).filter(Boolean))].sort().reverse();
              if (monthKeys.length === 0) return null;
              const toggle = (key) =>
                setPoReportMonths((prev) =>
                  prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                );
              return (
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Months</label>
                  <div style={{ maxHeight: 160, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    {monthKeys.map((key) => (
                      <label key={key} style={{ ...S.checkRow, marginBottom: 2 }}>
                        <input
                          type="checkbox"
                          checked={poReportMonths.includes(key)}
                          onChange={() => toggle(key)}
                        />
                        {poMonthLabel(key)}
                      </label>
                    ))}
                  </div>
                  <div style={S.roleHint}>
                    {poReportMonths.length > 0
                      ? `${poReportMonths.length} ${poReportMonths.length === 1 ? "month" : "months"} picked — the dates below are ignored. Each month gets its own subtotal.`
                      : "Tick one or more, or leave them all unticked and use the dates below."}
                  </div>
                </div>
              );
            })()}

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
              <TypeToFind
                options={master.suppliers.map((s) => ({ value: s.id, label: s.name }))}
                value={poReportSupplier}
                onChange={setPoReportSupplier}
                emptyLabel="All suppliers"
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Status</label>
              <select style={S.input} value={poReportStatus} onChange={(e) => setPoReportStatus(e.target.value)}>
                <option value="">Outstanding &amp; Received</option>
                <option value="outstanding">Outstanding only</option>
                <option value="received">Received only</option>
                <option value="cancelled">Cancelled only</option>
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
            <TypeToFind
              options={master.suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={poBuilder.supplierId || ""}
              onChange={(v) => setPoBuilder((b) => ({ ...b, supplierId: v }))}
              emptyLabel="Select a supplier…"
            />
            {master.suppliers.length === 0 && (
              <div style={{ ...S.roleHint, marginTop: 6 }}>
                No suppliers set up yet — add one in Stock Manager → Suppliers first.
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <label style={S.label}>Line items</label>
              {/* Typing a part number here fills the rest of the line from
                  stock, so a purchase order does not get retyped from a
                  screen somebody already filled in. Customer Stock is left
                  out on purpose -- those are the customer's parts, not
                  things we buy. Same rule the Request stock picker uses. */}
              <datalist id="po-part-numbers">
                {poPartLookup.map((it) => (
                  <option key={it.id} value={it.partNumber}>
                    {it.name}
                  </option>
                ))}
              </datalist>
              {/* Either box finds the item: the code when somebody has it,
                  the description when they only know what it is. */}
              <datalist id="po-descriptions">
                {poDescriptionLookup.map((it) => (
                  <option key={it.id} value={it.name}>
                    {it.partNumber}
                  </option>
                ))}
              </datalist>
              {poBuilder.lineItems.map((li, idx) => {
                const typed = (li.partNumber || "").trim().toLowerCase();
                const hits = typed
                  ? poPartLookup.filter((it) => (it.partNumber || "").toLowerCase() === typed)
                  : [];
                return (
                <div key={idx} style={{ ...S.poLineRow, flexWrap: "wrap" }}>
                  <input
                    style={{ ...S.input, flex: 1, minWidth: 90 }}
                    value={li.partNumber || ""}
                    list="po-part-numbers"
                    onChange={(e) => fillPoLineFromPartNumber(idx, e.target.value)}
                    placeholder="Part no"
                  />
                  <input
                    style={{ ...S.input, flex: 3 }}
                    value={li.description}
                    list="po-descriptions"
                    onChange={(e) => fillPoLineFromDescription(idx, e.target.value)}
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
                  {/* The same part number can sit in more than one division --
                      something we make and something we buy in. Say so rather
                      than filling in one of them and hoping it was the right
                      one. */}
                  {hits.length > 1 && (
                    <div style={{ ...S.roleHint, color: C.accentRaw, flexBasis: "100%" }}>
                      {hits.length} items share that part number ({hits.map((h) => h.mainCat).join(", ")}) — filled from
                      the first, so check the price.
                    </div>
                  )}
                  {hits.length === 1 && hits[0].supplier && hits[0].supplier !== poSupplierName && (
                    <div style={{ ...S.roleHint, flexBasis: "100%" }}>
                      Normally bought from {hits[0].supplier}.
                    </div>
                  )}
                </div>
                );
              })}
              <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 6 }} onClick={addPoLineItem}>
                <Plus size={13} /> Add line
              </button>
            </div>

            {/* A real job, not just text. When the steel arrives, receiving
                sets it aside for this job on its own. Optional: an order for
                general stock leaves it blank and behaves as it always has. */}
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>For a job (optional)</label>
              {poBuilder.jobId ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...S.chip, borderColor: C.accentRaw, color: C.accentRaw }}>
                    {poBuilder.jobNumber}
                  </span>
                  <button
                    type="button"
                    className="stk-btn"
                    style={S.reqActionBtnMuted}
                    onClick={() => setPoBuilder((b) => ({ ...b, jobId: null, jobNumber: "", jobQuery: "" }))}
                  >
                    Not for a job
                  </button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input
                    style={S.input}
                    value={poBuilder.jobQuery || ""}
                    onChange={(e) => setPoBuilder((b) => ({ ...b, jobQuery: e.target.value }))}
                    placeholder="Type a job number or customer to find the job…"
                  />
                  {(() => {
                    const q = (poBuilder.jobQuery || "").trim().toLowerCase();
                    if (!q) return null;
                    const hits = (jobsList || [])
                      .filter((j) => j.status === "in_progress")
                      .filter(
                        (j) =>
                          (j.job_number || "").toLowerCase().includes(q) ||
                          (j.customer || "").toLowerCase().includes(q)
                      )
                      .slice(0, 8);
                    if (hits.length === 0) {
                      return <div style={{ ...S.roleHint, marginTop: 6 }}>No open job matches that.</div>;
                    }
                    return (
                      <div style={S.suggestDropdown}>
                        {hits.map((j) => (
                          <button
                            key={j.id}
                            type="button"
                            className="stk-btn"
                            style={{ ...S.suggestItem, width: "100%", textAlign: "left" }}
                            onClick={() =>
                              setPoBuilder((b) => ({
                                ...b,
                                jobId: j.id,
                                jobNumber: j.job_number || "",
                                jobQuery: "",
                              }))
                            }
                          >
                            <b>{j.job_number}</b> {j.customer || "No customer"}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
              {poBuilder.jobId && (
                <div style={S.roleHint}>
                  Everything received against this order will be set aside for {poBuilder.jobNumber}.
                </div>
              )}
              {!poBuilder.jobId && mixedJobsWords(poBuilder.mixedJobs) && (
                <div style={{ ...S.roleHint, color: C.danger }}>{mixedJobsWords(poBuilder.mixedJobs)}</div>
              )}
            </div>

            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Reference (your own note)</label>
                <input
                  style={S.input}
                  value={poBuilder.reference}
                  onChange={(e) => setPoBuilder((b) => ({ ...b, reference: e.target.value }))}
                  placeholder="e.g. quote 12345"
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
    </>
  );
}

// The Request stock basket, and the one-item form that now only edits an
// existing request (openEditRequisition); new requests all go through the
// basket since 7 Oct 2026.
export function RequestStockPopups({ ctx }) {
  const { closeRequisition, editingRequisitionId, master, reqTargetLines, requisitionNotes,
    requisitionQty, requisitionSupplier, requisitionTarget, sameText, setRequisitionNotes,
    setRequisitionQty, setRequisitionSupplier, submitRequisition, supplierPriceChips } = ctx;
  return (
    <>
      {ctx.requestBasket && !ctx.requestBasket.hidden && <RequestStock ctx={ctx} />}
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
              <TypeToFind
                options={master.suppliers.map((s) => s.name)}
                value={requisitionSupplier}
                onChange={setRequisitionSupplier}
                emptyLabel="No supplier chosen yet"
              />
              {/* Each supplier's price for this material; a tap picks one. What
                  is delivered lands on that supplier's own stock row. */}
              {(() => {
                const lines = reqTargetLines(requisitionTarget);
                if (lines.length === 0) return null;
                const rowSupplier = requisitionTarget.supplier || "";
                return (
                  <>
                    {supplierPriceChips(lines, requisitionTarget.mainCat === "structural" ? "/m" : "/kg", requisitionSupplier, setRequisitionSupplier, rowSupplier)}
                    {requisitionSupplier && rowSupplier && !sameText(requisitionSupplier, rowSupplier) && (
                      <div style={S.roleHint}>
                        This row is {rowSupplier}'s. Stock from {requisitionSupplier} will land on {requisitionSupplier}'s own row when it is received.
                      </div>
                    )}
                  </>
                );
              })()}
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
    </>
  );
}
