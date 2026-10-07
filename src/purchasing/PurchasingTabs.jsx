// The Requisitions, Purchase Orders, Receiving and PO Reports tabs, moved word
// for word out of App.jsx on 2026-10-05. Each gets what it reads from App in ctx.

import ErrorBoundary from "../ErrorBoundary.jsx";
import RecordRow from "../RecordRow.jsx";
import Section from "../Section.jsx";
import SendEmailButton, { SentEmailLines } from "../email/SendEmailButton.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { Check, ChevronDown, Copy, FileText, Plus, X } from "lucide-react";
import { TABS } from "../constants.js";
import { poEmailDefaults } from "../email/emailRules.js";
import { requisitionSearchText, searchWords, matchesWords } from "../lib/stockSearch.js";

// Requisitions tab.
export function RequisitionsTab({ ctx }) {
  const { archiveDateFrom, archiveDateTo, archiveTypeFilter, canManageRequisitions, canRaisePO,
    canRequisition, master, openRequest, raisePoForSupplierGroup, raisePoFromSelected,
    renderRequisitionCard, requisitions, requisitionsSearchQuery, requisitionsSupplierFilter, roleLabel,
    selectedReqIds, setArchiveDateFrom, setArchiveDateTo, setArchiveTypeFilter, setRequisitionsSearchQuery,
    setRequisitionsSupplierFilter, setSelectedReqIds } = ctx;
  return (
    <div style={S.list}>
      {canRequisition && (
        <button type="button" className="stk-btn" style={S.addBtn} onClick={() => openRequest()}>
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
            placeholder="Search item, supplier, who requested it, or the note…"
          />
          <TypeToFind
            style={{ flex: 1, minWidth: 130 }}
            options={master.suppliers.map((s) => s.name)}
            value={requisitionsSupplierFilter}
            onChange={setRequisitionsSupplierFilter}
            emptyLabel="All suppliers"
          />
        </div>
      )}
      {["pending", "ordered"].map((status) => {
        // Word by word over the whole request, notes included
        // (src/lib/stockSearch.js), the same way the Stock tab searches.
        const words = searchWords(requisitionsSearchQuery);
        const list = requisitions
          .filter((r) => r.status === status)
          .filter((r) => canManageRequisitions || r.requestedBy === roleLabel)
          .filter((r) => !requisitionsSupplierFilter || r.supplier === requisitionsSupplierFilter)
          .filter((r) => matchesWords(requisitionSearchText(r), words))
          .sort((a, b) => new Date(b.dateRequested) - new Date(a.dateRequested));
        if (list.length === 0) return null;
        return (
          // Quiet, because on this screen the blocks nest -- a supplier
          // inside a status -- and two filled pills one inside the other
          // is a lot of yellow to read past.
          <Section
            key={status}
            title={status === "pending" ? "Pending" : "Ordered"}
            count={list.length}
            quiet
          >
            <>
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
                    // The PO button sits on the supplier it applies to.
                    // Above the list it read as a page action, and it is
                    // not one -- it orders these lines from this supplier.
                    <Section
                      key={supplierName}
                      title={supplierName}
                      count={supplierReqs.length}
                      quiet
                      // The supplier is what is being looked for on this
                      // screen, so it carries more weight than the pill
                      // around it or the lines under it.
                      titleSize={18}
                      right={
                        canRaisePO && supplierName !== "No supplier set" ? (
                          <button
                            type="button"
                            className="stk-btn"
                            style={S.reqActionBtn}
                            onClick={() => raisePoForSupplierGroup(supplierName, supplierReqs)}
                          >
                            <FileText size={13} /> Raise PO for all {supplierReqs.length}
                          </button>
                        ) : null
                      }
                    >
                      {supplierReqs.map(renderRequisitionCard)}
                    </Section>
                  ))
              ) : (
                list.map(renderRequisitionCard)
              )}
            </>
          </Section>
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
        <Section
          title="Completed / Archived"
          defaultOpen={false}
          count={requisitions.filter((r) => ["received", "fulfilled", "cancelled"].includes(r.status)).length}
        >
          {(
            <>
              <div className="stk-filter-bar" style={S.filterBar}>
                <div>
                  <label style={S.label}>Type</label>
                  <select style={S.input} value={archiveTypeFilter} onChange={(e) => setArchiveTypeFilter(e.target.value)}>
                    <option value="">All types</option>
                    {TABS.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="stk-date-pair" style={S.formGrid}>
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
                  .filter((r) => matchesWords(requisitionSearchText(r), searchWords(requisitionsSearchQuery)))
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
                        {r.jobNumber && <span>For job {r.jobNumber}</span>}
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
        </Section>
      )}
    </div>
  );
}

// Purchase Orders tab.
export function PurchaseOrdersTab({ ctx }) {
  const { buildPoDoc, canManageRequisitions, canRaisePO, canSeeSpendTotals, copyPurchaseOrder, currentUser,
    emailSentTick, expandedPoId, master, openPoBuilder, poExclusive, poIsOpen, poMonthKey, poMonthLabel,
    poSearchQuery, poSupplierFilter, purchaseOrders, roleLabel, setCancelPoModal, setEmailSentTick,
    setExpandedPoId, setPoSearchQuery, setPoSupplierFilter, setShowPoReport, viewPoPdf } = ctx;
  return (
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

      {/* What the shop is spending. All three exclude VAT, because that
          is what it actually costs the business -- the VAT comes back --
          and each says so rather than leaving anyone to guess.

          Ordered and Received will not tie up, and should not: an order
          raised in August and delivered in September belongs to August's
          Ordered and September's Received. They answer two different
          questions, so each counts off its own date. */}
      {purchaseOrders.length > 0 && canSeeSpendTotals && (() => {
        const thisMonth = new Date().toISOString().slice(0, 7);
        const open = purchaseOrders.filter(poIsOpen);
        const raisedThisMonth = purchaseOrders.filter((po) => poMonthKey(po) === thisMonth);
        // By the day the goods landed, not the day the order went out.
        // An order received with no date recorded cannot be counted into
        // any month, so it falls out rather than being guessed at.
        const receivedThisMonth = purchaseOrders.filter(
          (po) => po.status === "received" && (po.receivedDate || "").slice(0, 7) === thisMonth
        );
        const openTotal = open.reduce((s, po) => s + poExclusive(po), 0);
        const monthTotal = raisedThisMonth.reduce((s, po) => s + poExclusive(po), 0);
        const receivedTotal = receivedThisMonth.reduce((s, po) => s + poExclusive(po), 0);
        const money = (n) => `R ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const figure = (label, value, count, noun) => (
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "10px 14px",
              flex: "1 1 220px",
            }}
          >
            <div style={S.label}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {money(value)}
            </div>
            <div style={S.roleHint}>
              {count} {count === 1 ? noun : `${noun}s`} · excluding VAT
            </div>
          </div>
        );

        return (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {figure("Still on order", openTotal, open.length, "order")}
            {figure(
              `Ordered in ${poMonthLabel(thisMonth)}`,
              monthTotal,
              raisedThisMonth.length,
              "order"
            )}
            {figure(
              `Received in ${poMonthLabel(thisMonth)}`,
              receivedTotal,
              receivedThisMonth.length,
              "order"
            )}
          </div>
        );
      })()}

      {purchaseOrders.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input
            style={{ ...S.input, flex: 2, minWidth: 160 }}
            value={poSearchQuery}
            onChange={(e) => setPoSearchQuery(e.target.value)}
            placeholder="Search PO number, supplier, or reference…"
          />
          <TypeToFind
            style={{ flex: 1, minWidth: 130 }}
            options={master.suppliers.map((s) => ({ value: s.id, label: s.name }))}
            value={poSupplierFilter}
            onChange={setPoSupplierFilter}
            emptyLabel="All suppliers"
          />
        </div>
      )}

      {purchaseOrders.length === 0 && <div style={S.empty}>Nothing here yet.</div>}
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
                <span style={{ flex: 1, minWidth: 0, color: C.muted, fontSize: 14 }}>
                  {po.supplierName || "No supplier"}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span
                    style={{
                      ...S.reqStatusTag,
                      ...(po.status === "received" ? S.reqStatus_received : S.reqStatus_ordered),
                      ...(po.status === "cancelled"
                        ? { color: C.danger, borderColor: C.danger, textDecoration: "line-through" }
                        : {}),
                    }}
                  >
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
                    {po.reference && <span>Ref {po.reference}</span>}
                    {po.jobNumber && <span>For {po.jobNumber}</span>}
                    {po.status === "received" && (
                      <>
                        <span>Received by {po.receivedBy} on {new Date(po.receivedDate).toLocaleDateString()}</span>
                        {po.deliveryNoteNumber && <span>Delivery note: {po.deliveryNoteNumber}</span>}
                      </>
                    )}
                    {po.status === "cancelled" && (
                      <span style={{ color: C.danger }}>
                        Cancelled by {po.cancelledBy || "—"}
                        {po.cancelledDate ? ` on ${new Date(po.cancelledDate).toLocaleDateString()}` : ""}
                      </span>
                    )}
                  </div>
                  {po.notes && <div style={S.itemComment}>{po.notes}</div>}
                  {/* The reason is the point of the button, so it sits with
                      the order rather than only in the audit trail. */}
                  {po.status === "cancelled" && po.cancelReason && (
                    <div style={{ ...S.itemComment, color: C.danger }}>Cancelled: {po.cancelReason}</div>
                  )}

                  {/* The lines themselves, priced. Saying "3 lines" meant
                      opening the PDF to find out what had been ordered and
                      for how much, which is the one thing this screen is
                      for. */}
                  {(() => {
                    const rate = po.vatRate != null ? po.vatRate : 15;
                    const excl = (po.lineItems || []).reduce((sum, li) => sum + Number(li.qty) * Number(li.unitPrice), 0);
                    const vat = po.vatTotal != null ? po.vatTotal : excl * (rate / 100);
                    return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {(po.lineItems || []).map((li, i) => (
                            <div
                              key={i}
                              style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 14 }}
                            >
                              <span style={{ color: C.muted, minWidth: 16, textAlign: "right" }}>{i + 1}</span>
                              {li.partNumber && <span style={{ color: C.muted }}>{li.partNumber}</span>}
                              <span style={{ flex: "1 1 160px", minWidth: 0 }}>{li.description}</span>
                              <span style={{ fontWeight: 600 }}>{li.qty}</span>
                              <span style={{ color: C.muted }}>@ R {Number(li.unitPrice || 0).toFixed(2)}</span>
                              <span style={{ fontWeight: 600, minWidth: 74, textAlign: "right" }}>
                                R {(Number(li.qty) * Number(li.unitPrice)).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            paddingTop: 6,
                            borderTop: `1px solid ${C.border}`,
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 14,
                            flexWrap: "wrap",
                            fontSize: 14,
                          }}
                        >
                          <span style={{ color: C.muted }}>Excl. R {excl.toFixed(2)}</span>
                          <span style={{ color: C.muted }}>VAT ({rate}%) R {vat.toFixed(2)}</span>
                          <span style={{ fontWeight: 700 }}>Total R {po.totalValue.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={S.reqActions}>
                    <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => viewPoPdf(po)}>
                      <FileText size={13} /> View PDF
                    </button>
                    {/* Sent from the person's own Outlook mailbox, PDF
                        attached (src/email). Anyone who may raise an
                        order may send one; a cancelled order is not
                        sent. Draws nothing until the Microsoft setup's
                        IDs are in the build. */}
                    {canRaisePO && po.status !== "cancelled" && (
                      <ErrorBoundary box what="the email button" where={po.poNumber}>
                        <SendEmailButton
                          label="Email to supplier"
                          title="Send this order to the supplier from your Outlook"
                          appUser={{ id: currentUser?.id, name: roleLabel }}
                          getDefaults={() =>
                            poEmailDefaults({
                              po,
                              supplier: master.suppliers.find((s) => s.id === po.supplierId),
                              company: master.companyDetails || {},
                              senderName: roleLabel,
                            })
                          }
                          buildAttachment={async () => ({ fileName: `${po.poNumber}.pdf`, blob: (await buildPoDoc(po)).output("blob") })}
                          record={{ documentType: "purchase_order", relatedId: po.poNumber, jobId: po.jobId }}
                          onSent={() => setEmailSentTick((n) => n + 1)}
                        />
                      </ErrorBoundary>
                    )}
                    {canRaisePO && (
                      <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => copyPurchaseOrder(po)}>
                        <Copy size={13} /> Copy
                      </button>
                    )}
                    {/* Only while it is still coming. A received order is a
                        record of goods that arrived, and cancelling one would
                        be rewriting history rather than stopping anything. */}
                    {canRaisePO && poIsOpen(po) && (
                      <button
                        type="button"
                        className="stk-btn"
                        style={{ ...S.reqActionBtnMuted, color: C.danger, borderColor: C.danger }}
                        onClick={() => setCancelPoModal({ po, reason: "" })}
                      >
                        <X size={13} /> Cancel
                      </button>
                    )}
                  </div>
                  <SentEmailLines documentType="purchase_order" relatedId={po.poNumber} refresh={emailSentTick} />
                </>
              )}
            </div>
          );
        };

        // One list, newest first. Grouping by supplier meant hunting for
        // a PO number across several collapsed headings when the number
        // is the thing you are looking for -- the supplier just needs to
        // be readable once you have found it.
        const outstanding = [...purchaseOrders]
          .filter(poIsOpen)
          .filter(matchesSearch)
          .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

        return (
          <>
            <Section title="Outstanding" count={outstanding.length}>
              {outstanding.map(renderPoCard)}
              {outstanding.length === 0 && <div style={S.empty}>Nothing matches that.</div>}
            </Section>

            <Section
              title="Received / Completed"
              defaultOpen={false}
              count={purchaseOrders.filter((po) => po.status === "received").length}
            >
              {[...purchaseOrders]
                .filter((po) => po.status === "received")
                .filter(matchesSearch)
                .sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate))
                .map(renderPoCard)}
              {purchaseOrders.filter((po) => po.status === "received").filter(matchesSearch).length === 0 && (
                <div style={S.empty}>Nothing matches that.</div>
              )}
            </Section>

            {/* Only appears once something has been cancelled. An empty
                heading on every screen would be a permanent reminder of a
                thing that has never happened. */}
            {purchaseOrders.some((po) => po.status === "cancelled") && (
              <Section
                title="Cancelled"
                defaultOpen={false}
                count={purchaseOrders.filter((po) => po.status === "cancelled").length}
              >
                {[...purchaseOrders]
                  .filter((po) => po.status === "cancelled")
                  .filter(matchesSearch)
                  .sort((a, b) => new Date(b.cancelledDate || 0) - new Date(a.cancelledDate || 0))
                  .map(renderPoCard)}
                {purchaseOrders.filter((po) => po.status === "cancelled").filter(matchesSearch).length === 0 && (
                  <div style={S.empty}>Nothing matches that.</div>
                )}
              </Section>
            )}
          </>
        );
      })()}
    </div>
  );
}

// Receiving tab.
export function ReceivingTab({ ctx }) {
  const { canSeeValue, expandedReceivingId, openReceiving, poIsOpen, purchaseOrders, receivingHistoryDateFrom,
    receivingHistoryDateTo, receivingHistorySearchQuery, receivingSearchQuery, setExpandedReceivingId,
    setReceivingHistoryDateFrom, setReceivingHistoryDateTo, setReceivingHistorySearchQuery,
    setReceivingSearchQuery, usageLog } = ctx;
  return (
    <div style={S.list}>
      <div style={S.roleHint}>Pick an outstanding Purchase Order to confirm what actually arrived.</div>
      {purchaseOrders.filter(poIsOpen).length > 0 && (
        <input
          style={{ ...S.input, marginTop: 10 }}
          value={receivingSearchQuery}
          onChange={(e) => setReceivingSearchQuery(e.target.value)}
          placeholder="Search PO number or supplier…"
        />
      )}
      {purchaseOrders.filter(poIsOpen).length === 0 && (
        <div style={S.empty}>Nothing outstanding to receive.</div>
      )}
      <Section
        title="Outstanding"
        count={purchaseOrders.filter(poIsOpen).length}
      >
        {(() => {
          const rq = receivingSearchQuery.trim().toLowerCase();
          const list = [...purchaseOrders]
            .filter(poIsOpen)
            .filter(
              (po) =>
                !rq ||
                (po.poNumber || "").toLowerCase().includes(rq) ||
                (po.supplierName || "").toLowerCase().includes(rq)
            )
            .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
          if (list.length === 0 && rq) return <div style={S.empty}>Nothing matches that.</div>;
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
                    {/* Signing for a delivery does not need the price of it.
                        Receiving is the widest audience of the three
                        Procurement screens -- its own permission, held by
                        people with no purchase-order access at all -- so this
                        is the one place "Can see Rand values" can be honoured
                        without stopping anybody doing their job. */}
                    {canSeeValue && (
                      <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>R{po.totalValue.toFixed(2)}</span>
                    )}
                    <ChevronDown size={16} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                  </span>
                </button>
                {isOpen && (
                  <>
                    <div className="stk-meta-row" style={{ ...S.rowMeta, marginTop: 6 }}>
                      <span>Raised by {po.createdBy}</span>
                      <span>{new Date(po.dateCreated).toLocaleDateString()}</span>
                      {po.jobNumber && <span>For {po.jobNumber}</span>}
                      {po.reference && <span>Ref {po.reference}</span>}
                    </div>

                    {/* What is actually on the order. Saying "1 line" and
                        nothing else meant opening the receive screen just
                        to remember what had been ordered. */}
                    <div style={{ marginTop: 8 }}>
                      <label style={S.label}>On this order</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                        {(po.lineItems || []).map((li, i) => (
                          <div
                            key={i}
                            style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontSize: 14 }}
                          >
                            <span style={{ fontWeight: 600, minWidth: 40 }}>{li.qty}</span>
                            <span style={{ flex: "1 1 200px" }}>{li.description}</span>
                            {canSeeValue && (
                              <span style={{ color: C.muted }}>R {Number(li.unitPrice || 0).toFixed(2)} each</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={S.roleHint}>
                        Press Receive this PO to confirm what arrived. Anything short of what was ordered is set
                        with Adjust on the line.
                      </div>
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
      </Section>

      <Section title="Completed / History" defaultOpen={false}>
        {(
          <div>
            <div className="stk-filter-bar" style={S.filterBar}>
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
      </Section>
    </div>
  );
}

// PO Reports tab.
export function PoReportsTab({ ctx }) {
  const { generatedDocuments, poReportsDateFrom, poReportsDateTo, setPoReportsDateFrom, setPoReportsDateTo,
    viewGeneratedDocument } = ctx;
  return (
    <div style={S.list}>
      <div style={S.roleHint}>Every PO spend report ever generated — each run is its own dated snapshot, not overwritten by the next one.</div>
      <div className="stk-filter-bar" style={S.filterBar}>
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
            <Section title="PO reports" count={rows.length}>
              {rows.length === 0 && <div style={S.empty}>Nothing matches that.</div>}
              {rows.map((d) => (
                <RecordRow
                  key={d.id}
                  title={d.file_name}
                  summary={new Date(d.generated_at).toLocaleDateString()}
                >
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>Generated by {d.generated_by}</span>
                    <span>{new Date(d.generated_at).toLocaleString()}</span>
                  </div>
                  <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 8 }} onClick={() => viewGeneratedDocument(d)}>
                    <FileText size={13} /> View document
                  </button>
                </RecordRow>
              ))}
            </Section>
          );
        })()
      )}
    </div>
  );
}
