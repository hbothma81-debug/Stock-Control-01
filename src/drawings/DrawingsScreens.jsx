// The Drawings tab and the drawing upload pop-up, moved word for word out of
// App.jsx on 2026-10-07. Each gets what it reads from App in ctx; App draws
// each inside its own crash net.

import RecordRow from "../RecordRow.jsx";
import Section from "../Section.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { FileText, Trash2, Upload, X } from "lucide-react";

// Drawings tab.
export function DrawingsTab({ ctx }) {
  const { batchDeleteDrawingsForCustomer, canEditQty, deleteDrawing, drawingCustomerFilter,
    drawingSearchFailed, drawingSearchLoading, drawingSearchQuery, drawingSearchResults,
    expandedDrawingHistory, isAdmin, master, openDrawingPreview, refreshDrawings, setDrawingCustomerFilter,
    setDrawingSearchQuery, setExpandedDrawingHistory, setShowDrawingUpload } = ctx;
  return (
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
          <TypeToFind
            options={[{ value: "__internal__", label: "Internal (no customer)" }, ...master.customers]}
            value={drawingCustomerFilter}
            onChange={(v) => {
              setDrawingCustomerFilter(v);
              refreshDrawings(drawingSearchQuery, v);
            }}
            emptyLabel="All customers"
          />
        </div>
      </div>

      {drawingSearchLoading && <div style={{ ...S.empty, marginTop: 10 }}>Loading…</div>}

      {!drawingSearchLoading && drawingSearchResults !== null && (
        <Section title="Drawings" count={drawingSearchResults.length}>
          {drawingSearchResults.length === 0 &&
            (drawingSearchFailed ? (
              <div style={{ ...S.empty, color: C.danger }}>
                Couldn't load the drawings — check your signal and search again. This is not the same as
                there being none.
              </div>
            ) : !drawingSearchQuery.trim() && !drawingCustomerFilter ? (
              <div style={S.empty}>Pick a customer, or type a part number or description, to see drawings.</div>
            ) : (
              <div style={S.empty}>No drawings match — check the spelling, or upload one.</div>
            ))}
          {drawingSearchResults.map(([partNumber, revisions]) => {
            const current = revisions.find((r) => r.status === "current") || revisions[0];
            const history = revisions.filter((r) => r.id !== current.id);
            return (
              <RecordRow
                key={partNumber}
                title={partNumber}
                summary={current.description || current.customer || ""}
                right={
                  <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>
                    {current.customer_revision ? `Rev ${current.customer_revision}` : `Rev ${current.internal_revision}`}
                  </span>
                }
              >
                <div className="stk-meta-row" style={S.rowMeta}>
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
                        <span style={{ fontSize: 14, color: C.muted }}>
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
              </RecordRow>
            );
          })}
        </Section>
      )}
    </div>
  );
}

// The drawing upload pop-up.
export function DrawingUploadPopup({ ctx }) {
  const { closeDrawingUpload, drawingUploadBusy, drawingUploadCustomer, drawingUploadFiles,
    drawingUploadResult, handleDrawingFilesSelected, master, removeDrawingUploadFile,
    setDrawingUploadCustomer, submitDrawingUpload } = ctx;
  return (
    <div style={S.modalOverlay}>
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
              <TypeToFind
                options={master.customers}
                value={drawingUploadCustomer}
                onChange={setDrawingUploadCustomer}
                emptyLabel="No customer — internal drawing"
              />
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
                      <span style={{ fontSize: 14, color: entry.partNumber ? C.text : C.danger }}>
                        {entry.file.name} → <strong>{entry.partNumber || "no part number"}</strong>
                      </span>
                      {entry.matchedStockCode ? (
                        <span style={{ fontSize: 12.5, color: C.accentFinished }}>
                          ✓ Links to existing stock code — {entry.matchedStockCode.description || "no description"}
                        </span>
                      ) : entry.skip ? (
                        <span style={{ fontSize: 12.5, color: C.danger }}>
                          ✕ No matching stock code for this customer — won't be uploaded
                        </span>
                      ) : (
                        <span style={{ fontSize: 12.5, color: C.muted }}>No matching stock code — uploading unlinked (internal drawing)</span>
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
  );
}
