// The asset pop-ups (Remove asset, Asset history, Service now, Repair list),
// moved word for word out of App.jsx on 2026-10-07. Each gets what it reads
// from App in ctx; App draws each inside its own crash net.

import { C, S } from "../theme.js";
import { Check, Paperclip, Plus, Trash2, X } from "lucide-react";

// Remove an asset, with a reason.
export function AssetRemovePopup({ ctx }) {
  const { assetRemoveModal, closeAssetRemoveModal, setAssetRemoveModal, submitAssetRemoveModal } = ctx;
  return (
    <div style={S.modalOverlay}>
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
  );
}

// An asset's maintenance history.
export function AssetHistoryPopup({ ctx }) {
  const { assetHistoryBusy, assetHistoryEntries, assetHistoryFile, assetHistoryItem, assetHistoryNote,
    assetHistoryReading, canEditQty, closeAssetHistory, getServiceStatus, handleDeleteAssetHistoryEntry,
    isAdmin, setAssetHistoryFile, setAssetHistoryNote, setAssetHistoryReading, submitAssetNote,
    submitAssetReading, viewAssetAttachment } = ctx;
  return (
    <div style={S.modalOverlay}>
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
          {assetHistoryEntries?.length === 0 && <div style={S.empty}>Nothing here yet — add a note or log a reading above.</div>}
          {assetHistoryEntries?.map((entry) => (
            <div key={entry.id} style={S.reqCard}>
              <div style={S.reqCardTop}>
                <span style={S.itemName}>
                  {entry.entry_type === "meter_reading"
                    ? `Reading logged: ${entry.hours_reading ?? entry.km_reading}${entry.hours_reading != null ? "hrs" : "km"}`
                    : entry.entry_type === "service"
                    ? `Serviced${entry.note ? " — " + entry.note : ""}`
                    : entry.note}
                </span>
                {isAdmin && (
                  <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => handleDeleteAssetHistoryEntry(entry)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="stk-meta-row" style={S.rowMeta}>
                <span>{entry.logged_by}</span>
                <span>{new Date(entry.created_at).toLocaleString()}</span>
              </div>
              {entry.entry_type === "service" && entry.consumables && entry.consumables.length > 0 && (
                <div style={{ ...S.roleHint, marginTop: 4 }}>
                  Used: {entry.consumables.map((c) => `${c.name} × ${c.qty}${c.unit || ""}`).join(", ")}
                </div>
              )}
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
  );
}

// Service now.
export function ServiceNowPopup({ ctx }) {
  const { addServiceConsumableCustom, addServiceConsumableFromStores, closeServiceNow, items,
    removeServiceConsumable, serviceNowBusy, serviceNowConsumableSearch, serviceNowConsumables,
    serviceNowCustomName, serviceNowCustomQty, serviceNowFile, serviceNowItem, serviceNowNote,
    serviceNowReading, setServiceNowConsumableSearch, setServiceNowCustomName, setServiceNowCustomQty,
    setServiceNowFile, setServiceNowNote, setServiceNowReading, submitServiceNow, updateServiceConsumableQty } = ctx;
  return (
    <div style={S.modalOverlay}>
      <form style={{ ...S.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()} onSubmit={submitServiceNow}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Service now — {serviceNowItem.name}</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeServiceNow}>
            <X size={18} />
          </button>
        </div>
        <div style={S.roleHint}>Recording this updates the service counter and works out the next due date automatically.</div>

        {(serviceNowItem.serviceMode === "hours" || serviceNowItem.serviceMode === "km") && (
          <div style={{ marginTop: 10 }}>
            <label style={S.label}>Reading at time of service ({serviceNowItem.serviceMode === "hours" ? "hours" : "km"})</label>
            <input
              type="number"
              min="0"
              style={S.input}
              value={serviceNowReading}
              onChange={(e) => setServiceNowReading(e.target.value)}
              placeholder="0"
            />
          </div>
        )}

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <label style={S.label}>Consumables used</label>
          {serviceNowConsumables.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {serviceNowConsumables.map((c, idx) => (
                <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ flex: 1, fontSize: 14 }}>
                    {c.name} {c.source === "stores" && <span style={{ color: C.muted }}>(Stores)</span>}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    style={{ ...S.managerFactorInput, width: 70 }}
                    value={c.qty}
                    onChange={(e) => updateServiceConsumableQty(idx, e.target.value)}
                  />
                  <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => removeServiceConsumable(idx)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <input
              style={S.input}
              value={serviceNowConsumableSearch}
              onChange={(e) => setServiceNowConsumableSearch(e.target.value)}
              placeholder="Search Stores to add a consumable…"
            />
            {serviceNowConsumableSearch.trim() && (
              <div style={{ ...S.managerList, marginTop: 6, maxHeight: 160 }}>
                {items
                  .filter((it) => it.mainCat === "stores")
                  .filter((it) => it.name.toLowerCase().includes(serviceNowConsumableSearch.trim().toLowerCase()))
                  .slice(0, 20)
                  .map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className="stk-btn"
                      style={{ ...S.reqActionBtnMuted, justifyContent: "space-between", width: "100%" }}
                      onClick={() => addServiceConsumableFromStores(it)}
                    >
                      <span>{it.name}</span>
                      <span style={{ color: C.muted }}>{it.qty} {it.unit} in stock</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div style={{ ...S.roleHint, marginTop: 10 }}>Not in Stores yet? Type its name below — this creates a real Stores item and uses it.</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              style={{ ...S.input, flex: 2 }}
              value={serviceNowCustomName}
              onChange={(e) => setServiceNowCustomName(e.target.value)}
              placeholder="New item name…"
            />
            <input
              type="number"
              min="0"
              step="any"
              style={{ ...S.input, flex: 1 }}
              value={serviceNowCustomQty}
              onChange={(e) => setServiceNowCustomQty(e.target.value)}
              placeholder="Qty"
            />
            <button type="button" className="stk-btn" style={S.addBtn} onClick={addServiceConsumableCustom} disabled={!serviceNowCustomName.trim()}>
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={S.label}>Note (optional)</label>
          <input
            style={S.input}
            value={serviceNowNote}
            onChange={(e) => setServiceNowNote(e.target.value)}
            placeholder="e.g. Full service, replaced filters"
          />
        </div>

        <div style={{ marginTop: 8 }}>
          <label className="stk-btn" style={{ ...S.reqActionBtnMuted, cursor: "pointer" }}>
            <Paperclip size={13} /> {serviceNowFile ? serviceNowFile.name : "Attach document (optional)"}
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => setServiceNowFile(e.target.files[0] || null)}
            />
          </label>
        </div>

        <button type="submit" className="stk-btn" style={S.submitBtn} disabled={serviceNowBusy}>
          {serviceNowBusy ? "Saving…" : "Mark serviced"}
        </button>
      </form>
    </div>
  );
}

// An asset's repair list.
export function RepairListPopup({ ctx }) {
  const { canEditQty, closeRepairList, deleteRepairEntry, isAdmin, repairListBusy, repairListDescription,
    repairListEntries, repairListFailed, repairListItem, repairListResolvedOpen, resolveRepairEntry,
    setRepairListDescription, setRepairListResolvedOpen, submitRepairEntry } = ctx;
  return (
    <div style={S.modalOverlay}>
      <div style={{ ...S.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Repair list — {repairListItem.name}</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={closeRepairList}>
            <X size={18} />
          </button>
        </div>
        <div style={S.roleHint}>Small problems to come back to later — not urgent enough to stop using it now.</div>

        {canEditQty("assets") && (
          <form onSubmit={submitRepairEntry} style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input
              style={{ ...S.input, flex: 1 }}
              value={repairListDescription}
              onChange={(e) => setRepairListDescription(e.target.value)}
              placeholder="e.g. Guard is loose, needs a new bolt"
            />
            <button type="submit" className="stk-btn" style={S.addBtn} disabled={repairListBusy || !repairListDescription.trim()}>
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </form>
        )}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {repairListEntries === null && <div style={S.empty}>Loading…</div>}
          {repairListEntries?.filter((e) => e.status === "open").length === 0 && repairListEntries !== null && (
            repairListFailed ? (
              <div style={{ ...S.empty, color: C.danger }}>
                Couldn't load the repair list — check your signal. This is not the same as nothing being
                outstanding.
              </div>
            ) : (
              <div style={S.empty}>Nothing outstanding.</div>
            )
          )}
          {repairListEntries?.filter((e) => e.status === "open").map((entry) => (
            <div key={entry.id} style={S.reqCard}>
              <div style={S.reqCardTop}>
                <span style={S.itemName}>{entry.description}</span>
                {isAdmin && (
                  <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => deleteRepairEntry(entry)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="stk-meta-row" style={S.rowMeta}>
                <span>{entry.logged_by}</span>
                <span>{new Date(entry.created_at).toLocaleString()}</span>
              </div>
              {canEditQty("assets") && (
                <button type="button" className="stk-btn" style={{ ...S.reqActionBtn, marginTop: 6 }} onClick={() => resolveRepairEntry(entry)}>
                  <Check size={13} /> Mark fixed
                </button>
              )}
            </div>
          ))}
        </div>

        {repairListEntries?.some((e) => e.status === "resolved") && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="stk-btn"
              style={S.reqActionBtnMuted}
              onClick={() => setRepairListResolvedOpen((v) => !v)}
            >
              {repairListResolvedOpen ? "Hide" : "Show"} fixed ({repairListEntries.filter((e) => e.status === "resolved").length})
            </button>
            {repairListResolvedOpen && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {repairListEntries.filter((e) => e.status === "resolved").map((entry) => (
                  <div key={entry.id} style={{ ...S.reqCard, opacity: 0.7 }}>
                    <div style={S.reqCardTop}>
                      <span style={S.itemName}>{entry.description}</span>
                      {isAdmin && (
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => deleteRepairEntry(entry)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="stk-meta-row" style={S.rowMeta}>
                      <span>Fixed by {entry.resolved_by}</span>
                      <span>{new Date(entry.resolved_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
