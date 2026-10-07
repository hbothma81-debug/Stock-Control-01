// The one Request stock pop-up (docs/REQUISITIONS-PLAN.md, 7 Oct 2026).
//
// Search at the top, a basket underneath. A tap on a match adds a line;
// each line has its own quantity, supplier, job and note. Send writes one
// requisition row per line, exactly as the old one-item form did, so the
// list, Raise PO, receiving and the archive never change. Every door in
// the app opens this (openRequest in usePurchasing.jsx); the old
// pick-an-item pop-up and one-item form go as each door switches over.

import { useRef, useEffect } from "react";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { Plus, X } from "lucide-react";
import { TABS } from "../constants.js";
import { stockSearchText, searchWords, matchesWords } from "../lib/stockSearch.js";

const divisionLabel = (key) => TABS.find((t) => t.key === key)?.label || key || "";

export default function RequestStock({ ctx }) {
  const { addBasketLine, canAdd, closeRequest, createItemForRequisition, items, jobsList, master,
    removeBasketLine, reqTargetLines, requestBasket, sameText, setRequestBasket, submitRequest,
    supplierPriceChips, updateBasketLine } = ctx;
  // Focus the quantity box of the line just added.
  const lastAdded = useRef(null);
  const qtyRefs = useRef({});
  useEffect(() => {
    if (lastAdded.current && qtyRefs.current[lastAdded.current]) {
      qtyRefs.current[lastAdded.current].focus();
      lastAdded.current = null;
    }
  });
  if (!requestBasket) return null;
  const { query, lines, error } = requestBasket;
  const setQuery = (q) => setRequestBasket((b) => ({ ...b, query: q, error: "" }));
  const words = searchWords(query);
  const inBasket = new Set(lines.map((l) => l.item.id));
  const all =
    words.length === 0
      ? []
      : (items || []).filter((it) => it.mainCat !== "assets").filter((it) => matchesWords(stockSearchText(it), words));
  const matches = all.slice(0, 60);
  const openJobs = (jobsList || [])
    .filter((j) => j.status === "in_progress")
    .map((j) => ({ value: j.id, label: j.job_number || "", hint: j.customer || "" }));

  function add(it) {
    lastAdded.current = it.id;
    addBasketLine(it);
    setQuery("");
  }

  return (
    <div style={S.modalOverlay}>
      <form
        style={{ ...S.modal, maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submitRequest();
        }}
      >
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Request stock</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeRequest}>
            <X size={18} />
          </button>
        </div>
        <div style={S.roleHint}>Find an item and tap it to add it. Add as many as you need, then send once.</div>
        <input
          autoFocus={lines.length === 0}
          style={{ ...S.input, marginTop: 10 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search anything on the row: name, grade, size, supplier, customer…"
        />
        {words.length > 0 && (
          <div style={{ ...S.managerList, marginTop: 8, maxHeight: "32vh", overflowY: "auto" }}>
            {matches.length === 0 && <div style={S.empty}>Nothing matches that.</div>}
            {all.length > matches.length && (
              <div style={S.roleHint}>Showing {matches.length} of {all.length} — type more to narrow it down.</div>
            )}
            {matches.map((it) => {
              const taken = inBasket.has(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  className="stk-btn"
                  disabled={taken}
                  style={{ ...S.reqCard, width: "100%", textAlign: "left", cursor: taken ? "default" : "pointer", opacity: taken ? 0.5 : 1 }}
                  onClick={() => add(it)}
                >
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{it.grade ? `${it.grade} — ` : ""}{it.name}</span>
                    <span style={{ ...S.reqStatusTag, ...(Number(it.qty) > 0 ? S.reqStatus_received : S.reqStatus_ordered) }}>
                      {taken ? "in the basket" : Number(it.qty) > 0 ? `${it.qty} in stock` : "0 in stock"}
                    </span>
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>{divisionLabel(it.mainCat)}</span>
                    {it.size && <span>{it.size}</span>}
                    {it.thickness && <span>{it.thickness}</span>}
                    {/* The length tells the three 30x30x2 rows apart (6 m, 2.2 m, 0.5 m). */}
                    {Number(it.length) > 0 && <span>{it.length} m</span>}
                    {it.diameter && <span>{it.diameter}</span>}
                    {it.customer && <span>{it.customer}</span>}
                    {it.supplier && <span>{it.supplier}</span>}
                  </div>
                </button>
              );
            })}
            {canAdd && (
              <button
                type="button"
                className="stk-btn"
                style={{ ...S.reqActionBtnMuted, width: "100%", marginTop: matches.length > 0 ? 6 : 0 }}
                onClick={() => createItemForRequisition(query.trim())}
              >
                <Plus size={13} /> Not in Stock yet? Create "{query.trim()}" as a new item
              </button>
            )}
          </div>
        )}

        {lines.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <label style={S.label}>Requesting ({lines.length})</label>
            {lines.map((line) => {
              const it = line.item;
              const priceLines = reqTargetLines(it);
              const unit = it.mainCat === "structural" ? "/m" : "/kg";
              const rowSupplier = it.supplier || "";
              return (
                <div key={it.id} style={{ ...S.reqCard, marginTop: 6 }}>
                  <div style={S.reqCardTop}>
                    <span style={S.itemName}>{it.grade ? `${it.grade} — ` : ""}{it.name}</span>
                    <button type="button" className="stk-btn" style={S.iconBtn} title="Take this line off" onClick={() => removeBasketLine(it.id)}>
                      <X size={16} />
                    </button>
                  </div>
                  <div className="stk-meta-row" style={S.rowMeta}>
                    <span>{divisionLabel(it.mainCat)}</span>
                    {Number(it.length) > 0 && <span>{it.length} m</span>}
                    {it.customer && <span>{it.customer}</span>}
                    <span>{Number(it.qty) > 0 ? `${it.qty} in stock` : "0 in stock"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: "0 0 120px" }}>
                      <label style={S.label}>Quantity</label>
                      <input
                        ref={(el) => (qtyRefs.current[it.id] = el)}
                        type="number"
                        step="any"
                        min="0"
                        style={S.input}
                        value={line.qty}
                        onChange={(e) => updateBasketLine(it.id, { qty: e.target.value })}
                        placeholder={it.mainCat === "plate" ? "Sheets" : it.mainCat === "structural" ? "Pieces" : "Qty"}
                      />
                    </div>
                    <div style={{ flex: "1 1 180px" }}>
                      <label style={S.label}>Supplier (optional)</label>
                      <TypeToFind
                        options={master.suppliers.map((s) => s.name)}
                        value={line.supplier}
                        onChange={(v) => updateBasketLine(it.id, { supplier: v })}
                        emptyLabel="No supplier chosen yet"
                      />
                    </div>
                    <div style={{ flex: "1 1 180px" }}>
                      <label style={S.label}>For job</label>
                      <TypeToFind
                        options={openJobs}
                        value={line.jobId}
                        onChange={(v) => updateBasketLine(it.id, { jobId: v, jobNumber: openJobs.find((j) => j.value === v)?.label || "" })}
                        emptyLabel="Stores (no job)"
                      />
                    </div>
                  </div>
                  {priceLines.length > 0 && (
                    <>
                      {supplierPriceChips(priceLines, unit, line.supplier, (v) => updateBasketLine(it.id, { supplier: v }), rowSupplier)}
                      {line.supplier && rowSupplier && !sameText(line.supplier, rowSupplier) && (
                        <div style={S.roleHint}>
                          This row is {rowSupplier}'s. Stock from {line.supplier} will land on {line.supplier}'s own row when it is received.
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <input
                      style={S.input}
                      value={line.notes}
                      onChange={(e) => updateBasketLine(it.id, { notes: e.target.value })}
                      placeholder="Note (optional), e.g. needed by Friday"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error && <div style={{ ...S.roleHint, color: C.danger, marginTop: 8 }}>{error}</div>}
        <button type="submit" style={S.submitBtn} className="stk-btn" disabled={lines.length === 0}>
          {lines.length === 0 ? "Add an item first" : lines.length === 1 ? "Send request" : `Send ${lines.length} requests`}
        </button>
      </form>
    </div>
  );
}
