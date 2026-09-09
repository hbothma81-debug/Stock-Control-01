import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { C, S } from "../theme.js";

// The Buy-outs tab on a job: the bought-in parts this job needs, one
// line each, and later the purchase orders raised for them.
//
// A line is typed to find against Buy-out Codes -- part number,
// description or supplier -- and picking one brings the supplier and
// the cost. A part not in the codes can be typed as a free line with a
// supplier chosen by hand.
//
// Not invoiced: a buy-out is a cost inside something quoted, never a
// line the customer is billed for. So there is no selling price here,
// and the total at the foot is what the job costs to buy in.
//
// Lives in its own file, the same as CutToSize, so the quoting module
// can show the same list on a quote. It owns only the line being typed;
// everything saved comes in as `lines` and goes out through onAdd /
// onUpdate / onRemove.

const blankLine = () => ({ query: "", itemId: null, partNumber: "", description: "", supplier: "", qty: "", unitCost: "", note: "" });

const cell = (width) => ({ ...S.input, width, fontSize: 14, padding: "4px 6px" });

const money = (n) => `R ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BuyOuts({
  lines,
  canEdit,
  canSeeValue,
  codes,
  suppliers,
  purchaseOrders,
  allocations,
  items,
  onAdd,
  onUpdate,
  onRemove,
  onRaisePo,
  onAddSupplier,
  onViewPo,
  SavedCheck,
}) {
  // What each line's order has come to. The PO is the record of whether
  // the goods are here; the line only remembers which PO it went on.
  const poFor = (line) => (line.po_id ? (purchaseOrders || []).find((po) => po.id === line.po_id) || null : null);
  const lineState = (line) => {
    const po = poFor(line);
    if (!line.po_id) return { text: "Not ordered", color: null };
    if (po?.status === "received") return { text: `Received — ${line.po_number}`, color: C.accentFinished };
    return { text: `On ${line.po_number || "a PO"} — waiting for delivery`, color: C.accentRaw };
  };
  const [draft, setDraft] = useState(blankLine);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const q = draft.query.trim().toLowerCase();
  const suggestions =
    suggestOpen && q && !draft.itemId
      ? (codes || [])
          .filter(
            (c) =>
              (c.partNumber || "").toLowerCase().includes(q) ||
              (c.name || "").toLowerCase().includes(q) ||
              (c.supplier || "").toLowerCase().includes(q)
          )
          .slice(0, 8)
      : [];
  const supplierNames = [...new Set([...(suppliers || []).map((s) => s.name), ...(codes || []).map((c) => c.supplier)].filter(Boolean))].sort();
  // Known to the suppliers list, which is what a purchase order needs. A
  // name that only appears on Buy-out Codes is not enough to address one.
  const supplierKnown = (name) => (suppliers || []).some((s) => (s.name || "").trim().toLowerCase() === (name || "").trim().toLowerCase());

  const pick = (c) => {
    setDraft((d) => ({
      ...d,
      query: c.name,
      itemId: c.id,
      partNumber: c.partNumber || "",
      description: c.name,
      supplier: c.supplier || "",
      unitCost: c.value != null ? String(c.value) : "",
    }));
    setSuggestOpen(false);
  };

  async function submitDraft() {
    const description = (draft.itemId ? draft.description : draft.query).trim();
    if (!description) return alert("What is it? Type a part number or description.");
    if (!(Number(draft.qty) > 0)) return alert("How many?");
    if (!draft.supplier.trim()) return alert("Which supplier? A buy-out with no supplier cannot go on a purchase order.");
    setAdding(true);
    const ok = await onAdd({
      item_id: draft.itemId || null,
      part_number: draft.partNumber.trim(),
      description,
      supplier: draft.supplier.trim(),
      qty: Number(draft.qty),
      unit_cost: Number(draft.unitCost) || 0,
      note: draft.note.trim(),
    });
    setAdding(false);
    // The next line is usually from the same supplier.
    if (ok) setDraft((d) => ({ ...blankLine(), supplier: d.supplier }));
  }

  const total = (lines || []).reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);
  const bySupplier = {};
  for (const l of lines || []) (bySupplier[l.supplier || "No supplier"] = bySupplier[l.supplier || "No supplier"] || []).push(l);

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
      <label style={S.label}>To buy in</label>
      {(lines || []).length === 0 && <div style={S.empty}>Nothing to buy in for this job yet.</div>}

      {/* Grouped by supplier, because that is how they will be ordered:
          one purchase order per supplier. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
        {Object.entries(bySupplier).map(([supplier, group]) => (
          <div key={supplier}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {supplier}
                <span style={{ ...S.roleHint, fontWeight: 400 }}>
                  {" "}
                  · {group.length} line{group.length === 1 ? "" : "s"}
                  {canSeeValue ? ` · ${money(group.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0))}` : ""}
                </span>
              </div>
              {/* A supplier typed on a line but not in the suppliers list
                  cannot be sent a PO. One press adds them, name only. */}
              {onAddSupplier && supplier !== "No supplier" && !supplierKnown(supplier) && (
                <button
                  type="button"
                  className="stk-btn"
                  style={S.reqActionBtnMuted}
                  onClick={() => onAddSupplier(supplier)}
                  title="Not in your suppliers list yet — add them with just the name; email, phone and address can be filled in later in Stock Manager"
                >
                  <Plus size={11} /> Add {supplier} to suppliers
                </button>
              )}
              {/* One order per supplier, for the lines not yet ordered.
                  A line added after the first order gets its own. */}
              {onRaisePo &&
                supplier !== "No supplier" &&
                (() => {
                  const open = group.filter((l) => !l.po_id);
                  if (open.length === 0) return null;
                  return (
                    <button
                      type="button"
                      className="stk-btn"
                      style={S.reqActionBtn}
                      onClick={() => onRaisePo(supplier, open)}
                      title={`Open the purchase order form for ${supplier} with these ${open.length} line${open.length === 1 ? "" : "s"} and this job filled in`}
                    >
                      Raise PO for {supplier} · {open.length} line{open.length === 1 ? "" : "s"}
                    </button>
                  );
                })()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {group.map((it) => (
                <div key={it.id} style={S.managerRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {canEdit ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            defaultValue={it.qty}
                            onBlur={(e) => onUpdate(it, "qty", e.target.value)}
                            style={cell(62)}
                            title="Quantity"
                          />
                          <span style={{ color: C.muted }}>×</span>
                          <input
                            defaultValue={it.part_number}
                            placeholder="Part no"
                            onBlur={(e) => onUpdate(it, "part_number", e.target.value)}
                            style={cell(110)}
                          />
                          <input
                            defaultValue={it.description}
                            placeholder="Description"
                            onBlur={(e) => onUpdate(it, "description", e.target.value)}
                            style={{ ...cell(160), flex: 1, minWidth: 120 }}
                          />
                          <input
                            defaultValue={it.supplier}
                            list="buyout-supplier-options"
                            placeholder="Supplier"
                            onBlur={(e) => onUpdate(it, "supplier", e.target.value)}
                            style={cell(130)}
                          />
                          {canSeeValue && (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={it.unit_cost}
                              onBlur={(e) => onUpdate(it, "unit_cost", e.target.value)}
                              style={cell(90)}
                              title="Cost each, excluding VAT"
                            />
                          )}
                          <input
                            defaultValue={it.note}
                            placeholder="Note"
                            onBlur={(e) => onUpdate(it, "note", e.target.value)}
                            style={{ ...cell(120), flex: 1, minWidth: 80 }}
                          />
                          <SavedCheck fieldKey={`buyout-${it.id}`} />
                          <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => onRemove(it)} title="Remove this line">
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontWeight: 600 }}>{it.qty} ×</span>
                          {it.part_number && <span style={S.roleHint}>{it.part_number}</span>}
                          <span>{it.description}</span>
                          {it.note && <span style={S.roleHint}>— {it.note}</span>}
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                      {canSeeValue && (
                        <span style={S.roleHint}>
                          {money(it.unit_cost)} each · {money((Number(it.qty) || 0) * (Number(it.unit_cost) || 0))}
                        </span>
                      )}
                      {(() => {
                        const state = lineState(it);
                        return (
                          <span style={{ ...S.roleHint, ...(state.color ? { color: state.color, fontWeight: 600 } : {}) }}>{state.text}</span>
                        );
                      })()}
                      {!it.item_id && <span style={S.roleHint}>· not in Buy-out Codes</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {(lines || []).length > 0 && canSeeValue && (
        <div style={{ ...S.roleHint, marginTop: 8, fontWeight: 600 }}>Buy-in cost for this job: {money(total)} excluding VAT</div>
      )}

      {canEdit && (
        <div style={{ marginTop: 10, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <label style={S.label}>Add a buy-out</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <input
              type="number"
              min="1"
              step="1"
              value={draft.qty}
              placeholder="Qty"
              onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
              style={cell(62)}
            />
            <span style={{ color: C.muted }}>×</span>
            <div style={{ position: "relative", flex: "1 1 220px" }}>
              <input
                value={draft.query}
                placeholder="Part number, description or supplier — start typing to match Buy-out Codes…"
                onChange={(e) => {
                  // Typing again un-links: the line no longer says what
                  // the code says.
                  setDraft((d) => ({ ...d, query: e.target.value, itemId: null, partNumber: "", description: "" }));
                  setSuggestOpen(true);
                }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                style={S.input}
              />
              {suggestions.length > 0 && (
                <div style={S.suggestDropdown}>
                  {suggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="stk-btn"
                      style={S.suggestItem}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(c);
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{c.partNumber || "—"}</span>
                      <span style={{ color: C.muted }}> — {c.name}</span>
                      <span style={{ color: C.muted }}> · {c.supplier || "no supplier"}</span>
                      {canSeeValue && c.value != null && c.value !== "" && <span style={{ color: C.muted }}> · {money(c.value)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              value={draft.supplier}
              list="buyout-supplier-options"
              placeholder="Supplier"
              onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value }))}
              style={cell(130)}
            />
            {canSeeValue && (
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.unitCost}
                placeholder="Cost each"
                onChange={(e) => setDraft((d) => ({ ...d, unitCost: e.target.value }))}
                style={cell(90)}
                title="Cost each, excluding VAT"
              />
            )}
            <input
              value={draft.note}
              placeholder="Note (optional)"
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              style={{ ...cell(120), flex: 1, minWidth: 80 }}
              onKeyDown={(e) => e.key === "Enter" && submitDraft()}
            />
            <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={submitDraft} disabled={adding}>
              <Plus size={12} /> Add
            </button>
          </div>
          <div style={{ ...S.roleHint, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>
              {draft.itemId
                ? `Linked to Buy-out Codes${draft.partNumber ? ` — ${draft.partNumber}` : ""}`
                : q
                  ? "Not matched to Buy-out Codes — pick from the list, or leave it as a free line with a supplier typed in."
                  : null}
            </span>
            {onAddSupplier && draft.supplier.trim() && !supplierKnown(draft.supplier) && (
              <button
                type="button"
                className="stk-btn"
                style={S.reqActionBtnMuted}
                onClick={() => onAddSupplier(draft.supplier)}
                title="Not in your suppliers list yet — add them with just the name; the rest can be filled in later in Stock Manager"
              >
                <Plus size={11} /> Add {draft.supplier.trim()} to suppliers
              </button>
            )}
          </div>
        </div>
      )}

      {/* The orders raised for this job, whichever tab they were raised
          from, and what has arrived and been set aside. Both read from
          data the Purchase Orders and Receiving tabs already keep; this
          is the job's view of it. */}
      {(purchaseOrders || []).length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <label style={S.label}>Orders for this job</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {(purchaseOrders || []).map((po) => {
              const received = po.status === "received";
              const lineCount = (po.lineItems || []).length;
              return (
                <div key={po.id} style={{ ...S.managerRow, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{po.poNumber}</span>
                  <span style={{ fontSize: 14 }}>{po.supplierName}</span>
                  <span style={S.roleHint}>
                    {lineCount} line{lineCount === 1 ? "" : "s"}
                    {po.dateCreated ? ` · raised ${new Date(po.dateCreated).toLocaleDateString()}` : ""}
                    {po.createdBy ? ` by ${po.createdBy}` : ""}
                  </span>
                  {canSeeValue && <span style={S.roleHint}>{money(po.totalValue)} incl. VAT</span>}
                  <span
                    style={{
                      ...S.chip,
                      flexShrink: 0,
                      ...(received ? { color: C.accentFinished, borderColor: C.accentFinished, fontWeight: 700 } : { color: C.accentRaw, borderColor: C.accentRaw, fontWeight: 700 }),
                    }}
                    title={
                      received
                        ? `Received${po.receivedDate ? ` ${new Date(po.receivedDate).toLocaleDateString()}` : ""}${po.receivedBy ? ` by ${po.receivedBy}` : ""}${po.deliveryNoteNumber ? ` — delivery note ${po.deliveryNoteNumber}` : ""}`
                        : "Sent to the supplier, not delivered yet"
                    }
                  >
                    {received ? "Received" : "Outstanding"}
                  </span>
                  {onViewPo && (
                    <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => onViewPo(po)}>
                      View PO
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(() => {
        // What receiving set aside for this job. Anything received
        // against an order names the order in its note, which is how
        // these are told apart from material set aside by hand.
        const arrived = (allocations || []).filter((a) => a.status !== "released" && /^Received against/i.test(a.note || ""));
        if (arrived.length === 0) return null;
        return (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <label style={S.label}>Arrived and set aside for this job</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {arrived.map((a) => {
                const outstanding = Number(a.qty_allocated) - Number(a.qty_used);
                const stockItem = (items || []).find((i) => i.id === a.item_id);
                return (
                  <div key={a.id} style={{ ...S.managerRow, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {a.qty_allocated} × {a.item_name}
                    </span>
                    <span style={S.roleHint}>{a.note}</span>
                    {stockItem?.loc && <span style={S.roleHint}>· {stockItem.loc}</span>}
                    <span style={{ ...S.roleHint, ...(outstanding > 0 ? { color: C.accentRaw, fontWeight: 600 } : { color: C.accentFinished, fontWeight: 600 }) }}>
                      {outstanding > 0 ? `${outstanding} still to use` : "all used"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <datalist id="buyout-supplier-options">
        {supplierNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}
