import { useState } from "react";
import Section from "../Section.jsx";
import { FileText, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { C, S } from "../theme.js";
import { KEPT_IN, noDrawingReason, revisionText } from "./jobDrawings.js";

// The Drawings tab on a job (Heinrich, 21 Oct 2026). Every drawing on the
// job, one row per file, each saying where it is kept: the library (the
// part's drawing, on every job with that part), this job only, or the
// stock part's own attachment. Files dropped anywhere on the tab, or
// through Upload, go in at once (see App.jsx, startJobDrawingUpload).
//
// list: jobDrawingList() from jobDrawings.js. loading: still being read.
// onOpen(row): opens the file.
// canUpload: may add drawings. onFiles(fileList): files dropped or picked.
// canRemove: may take a drawing off this job (never out of the library).
// onRemove(row), onPutBack(row).
// upload: the pop-up's state from App, or null when shut. It holds only
// the files that would land on a drawing already there:
//   { entries: [{ key, file, lineText, mode, customerRevision }], busy }
//   mode is "revision" or "replace".
// onUploadChange(key, patch), onUploadRemove(key), onUploadConfirm(),
// onUploadCancel().

const head = { textAlign: "left", padding: "4px 6px", fontSize: 12, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" };
const cell = { padding: "4px 6px", fontSize: 13, borderTop: `1px solid ${C.border}`, verticalAlign: "top" };

export default function JobDrawings({
  list,
  loading,
  onOpen,
  canUpload,
  onFiles,
  canRemove,
  onRemove,
  onPutBack,
  upload,
  onUploadChange,
  onUploadRemove,
  onUploadConfirm,
  onUploadCancel,
}) {
  const { rows, withoutDrawing, removed } = list;
  // Only the border's colour changes while files are held over the tab:
  // nothing moves under the pointer.
  const [dragOver, setDragOver] = useState(false);
  const dropProps = canUpload
    ? {
        onDragOver: (e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        },
        onDragLeave: (e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
        },
        onDrop: (e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
        },
      }
    : {};
  const goesTo = (r) => (r.everyStage ? "Every stage" : r.onFloor ? r.stages.join(", ") : "This page only");
  const sheet = (list, action) => (
    <div style={{ overflowX: "auto" }}>
      <table className="stk-sheet" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head}>Drawing</th>
            <th style={head} title="Library: the part's drawing, on every job with that part. This job only: kept here and nowhere else.">Kept in</th>
            <th style={head}>Line</th>
            <th style={head}>Revision</th>
            <th style={head}>Loaded</th>
            <th style={head} title="Where the floor sees it">Goes to</th>
            {action && <th style={head}></th>}
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.key}>
              <td style={cell}>
                <button
                  type="button"
                  className="stk-btn"
                  style={{ ...S.reqActionBtnMuted, padding: "2px 8px", fontSize: 12, justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => onOpen(r)}
                  title="Open it"
                >
                  <FileText size={12} /> {r.name}
                </button>
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap", color: r.kind === "library" ? C.text : C.muted }}>{KEPT_IN[r.kind]}</td>
              <td style={cell}>
                {r.line ? (
                  <>
                    {r.line.description}
                    {r.partNumber && <span style={{ color: C.muted }}> · {r.partNumber}</span>}
                  </>
                ) : (
                  <span style={{ color: C.muted }}>No line</span>
                )}
              </td>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>{revisionText(r.drawing)}</td>
              <td style={{ ...cell, whiteSpace: "nowrap" }} title={r.drawing?.uploaded_by ? `by ${r.drawing.uploaded_by}` : undefined}>
                {r.drawing?.created_at ? new Date(r.drawing.created_at).toLocaleDateString() : ""}
              </td>
              <td style={{ ...cell, color: r.onFloor ? C.text : C.muted }}>{goesTo(r)}</td>
              {action && <td style={{ ...cell, whiteSpace: "nowrap" }}>{action(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div {...dropProps} style={{ marginTop: 10 }}>
      {canUpload && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            marginBottom: 8,
            border: `1px dashed ${dragOver ? C.accentRaw : C.border}`,
            borderRadius: 8,
            background: dragOver ? C.accentTint : "transparent",
          }}
        >
          <span style={{ ...S.roleHint, flex: 1 }}>Drop drawings anywhere here, any file type, or</span>
          <label className="stk-btn" style={{ ...S.reqActionBtnMuted, cursor: "pointer" }}>
            <Upload size={12} /> Upload
            <input
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.length) onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}
      <Section title="Drawings" count={rows.length} defaultOpen>
        {loading && rows.length === 0 ? (
          <div style={S.roleHint}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={S.roleHint}>No drawings on this job yet.</div>
        ) : (
          sheet(
            rows,
            canRemove
              ? (r) => (
                  <button
                    type="button"
                    className="stk-btn"
                    style={S.iconBtn}
                    onClick={() => onRemove(r)}
                    title={r.kind === "library" ? "Take off this job (it stays in the library)" : "Take off this job (the file is kept)"}
                  >
                    <Trash2 size={14} />
                  </button>
                )
              : null
          )
        )}
      </Section>
      <Section title="Lines with no drawing" count={withoutDrawing.length} defaultOpen={false}>
        {withoutDrawing.length === 0 ? (
          <div style={S.roleHint}>Every line has a drawing.</div>
        ) : (
          withoutDrawing.map((r) => (
            <div key={r.line.id} style={{ ...S.roleHint, padding: "3px 0" }}>
              <span style={{ color: C.text }}>{r.line.description}</span> — {noDrawingReason(r)}
            </div>
          ))
        )}
      </Section>
      {removed.length > 0 && (
        <Section title="Taken off this job" count={removed.length} defaultOpen={false}>
          {sheet(
            removed,
            canRemove
              ? (r) => (
                  <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, padding: "2px 8px", fontSize: 12 }} onClick={() => onPutBack(r)}>
                    <RotateCcw size={12} /> Put back
                  </button>
                )
              : null
          )}
        </Section>
      )}
      {upload && renderUploadPopup()}
    </div>
  );

  // Asked only of the files that would land on a drawing already there.
  function renderUploadPopup() {
    const ready = upload.entries.length > 0;
    return (
      <div style={{ ...S.modalOverlay, zIndex: 29 }}>
        <div style={{ ...S.modal, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
          <div style={S.modalHead}>
            <span style={S.modalTitle}>Already has a drawing</span>
            <button type="button" className="stk-btn" style={S.iconBtn} onClick={onUploadCancel} disabled={upload.busy}>
              <X size={18} />
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="stk-sheet" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={head}>File</th>
                  <th style={head}>Goes to</th>
                  <th style={head}>Replace it, or keep it as history?</th>
                  <th style={head}></th>
                </tr>
              </thead>
              <tbody>
                {upload.entries.map((entry) => (
                  <tr key={entry.key}>
                    <td style={{ ...cell, wordBreak: "break-word" }}>{entry.file.name}</td>
                    <td style={cell}>{entry.lineText}</td>
                    <td style={cell}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[
                            { mode: "revision", label: "New revision" },
                            { mode: "replace", label: "Replace existing" },
                          ].map((o) => (
                            <button
                              key={o.mode}
                              type="button"
                              className="stk-btn"
                              style={{
                                ...S.segBtn,
                                ...(entry.mode === o.mode ? { background: C.accentTint, color: C.accentRaw, border: `1px solid ${C.accentRaw}` } : {}),
                              }}
                              onClick={() => onUploadChange(entry.key, { mode: o.mode })}
                              title={
                                o.mode === "replace"
                                  ? "The old file is removed for good; the revision stays the same"
                                  : "The old drawing is kept as superseded history"
                              }
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                        <input
                          value={entry.customerRevision}
                          onChange={(e) => onUploadChange(entry.key, { customerRevision: e.target.value })}
                          placeholder="Customer rev (optional)"
                          style={{ ...S.input, padding: "4px 6px", fontSize: 13 }}
                        />
                      </div>
                    </td>
                    <td style={cell}>
                      <button
                        type="button"
                        className="stk-btn"
                        style={S.iconBtn}
                        onClick={() => onUploadRemove(entry.key)}
                        disabled={upload.busy}
                        title="Leave this file out"
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.reqActionBtnMuted, flex: 1, justifyContent: "center", alignItems: "center" }}
              onClick={onUploadCancel}
              disabled={upload.busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.submitBtn, flex: 1, ...(!ready || upload.busy ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
              disabled={!ready || upload.busy}
              onClick={onUploadConfirm}
            >
              {upload.busy ? "Uploading…" : `Upload ${upload.entries.length} file${upload.entries.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
