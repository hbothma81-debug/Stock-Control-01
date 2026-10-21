import { useState } from "react";
import Section from "../Section.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { FileText, Upload, X } from "lucide-react";
import { C, S } from "../theme.js";
import { noDrawingReason, revisionText } from "./jobDrawings.js";

// The Drawings tab on a job (Heinrich, 21 Oct 2026). Shows the library's
// current drawing for each line and the drawings kept for this job only,
// and takes new ones: dropped anywhere on the tab, or through Upload.
// Choosing the stages a drawing goes to comes next (step 4).
//
// rows: drawingRows() from jobDrawings.js. jobOnly: drawing rows kept for
// this job only. jobOnlyReady: the database can keep them
// (setup-drawings-job.sql); without it "This job only" is not offered.
// loading: the drawings are still being read.
// onOpen(partNumber): opens the drawing.
// canUpload: may add drawings. onFiles(fileList): files dropped or picked.
// upload: the pop-up's state from App, or null when shut:
//   { entries: [{ key, file, target, mode, customerRevision }], busy }
//   target is a part number, "__job__" for This job only, or "" not yet
//   chosen; mode is "revision" or "replace".
// partOptions: [{ value: partNumber, label, hint }] for the Goes to box.
// existingFor(entry): the part already has a current drawing.
// onUploadChange(key, patch), onUploadRemove(key), onUploadConfirm(),
// onUploadCancel().

const JOB_ONLY = "__job__";
const head = { textAlign: "left", padding: "4px 6px", fontSize: 12, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" };
const cell = { padding: "4px 6px", fontSize: 13, borderTop: `1px solid ${C.border}`, verticalAlign: "top" };

export default function JobDrawings({
  rows,
  jobOnly,
  jobOnlyReady,
  loading,
  onOpen,
  canUpload,
  onFiles,
  upload,
  partOptions,
  existingFor,
  onUploadChange,
  onUploadRemove,
  onUploadConfirm,
  onUploadCancel,
}) {
  const { withDrawing, withoutDrawing } = rows;
  // Only the border's colour changes while files are held over the tab:
  // nothing moves under the pointer.
  const [dragOver, setDragOver] = useState(false);
  const count = withDrawing.length + jobOnly.length;
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
  const drawingButton = (partNumber, drawing) => (
    <button
      type="button"
      className="stk-btn"
      style={{ ...S.reqActionBtnMuted, padding: "2px 8px", fontSize: 12, justifyContent: "flex-start" }}
      onClick={() => onOpen(partNumber)}
      title="Open the drawing"
    >
      <FileText size={12} /> {drawing.file_name || partNumber}
    </button>
  );
  const loaded = (drawing) => (
    <td style={{ ...cell, whiteSpace: "nowrap" }} title={drawing.uploaded_by ? `by ${drawing.uploaded_by}` : undefined}>
      {drawing.created_at ? new Date(drawing.created_at).toLocaleDateString() : ""}
    </td>
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
      <Section title="Drawings" count={count} defaultOpen>
        {loading && count === 0 ? (
          <div style={S.roleHint}>Loading…</div>
        ) : count === 0 ? (
          <div style={S.roleHint}>No line on this job has a drawing on file.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="stk-sheet" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={head}>Drawing</th>
                  <th style={head}>Part number</th>
                  <th style={head}>Revision</th>
                  <th style={head}>Loaded</th>
                  <th style={head}>Line</th>
                  <th style={head} title="The stages this line goes to on the floor">Goes to</th>
                </tr>
              </thead>
              <tbody>
                {withDrawing.map((r) => (
                  <tr key={r.line.id}>
                    <td style={cell}>{drawingButton(r.partNumber, r.drawing)}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{r.partNumber}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{revisionText(r.drawing)}</td>
                    {loaded(r.drawing)}
                    <td style={cell}>{r.line.description}</td>
                    <td style={cell}>{r.stages.join(", ")}</td>
                  </tr>
                ))}
                {jobOnly.map((d) => (
                  <tr key={d.id}>
                    <td style={cell}>{drawingButton(d.part_number, d)}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{d.part_number}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{revisionText(d)}</td>
                    {loaded(d)}
                    <td style={{ ...cell, color: C.muted }}>This job only</td>
                    <td style={{ ...cell, color: C.muted }}>Every stage</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      {upload && renderUploadPopup()}
    </div>
  );

  // The question asked only of the files that need one: no part number
  // found in the name, or a part that already has a drawing.
  function renderUploadPopup() {
    const ready = upload.entries.length > 0 && upload.entries.every((e) => e.target);
    return (
      <div style={{ ...S.modalOverlay, zIndex: 29 }}>
        <div style={{ ...S.modal, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
          <div style={S.modalHead}>
            <span style={S.modalTitle}>Upload drawings</span>
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
                  <th style={head}>Already has a drawing</th>
                  <th style={head}></th>
                </tr>
              </thead>
              <tbody>
                {upload.entries.map((entry) => {
                  const existing = entry.target && existingFor(entry);
                  return (
                    <tr key={entry.key}>
                      <td style={{ ...cell, wordBreak: "break-word" }}>{entry.file.name}</td>
                      <td style={{ ...cell, minWidth: 200 }}>
                        <TypeToFind
                          options={jobOnlyReady ? [{ value: JOB_ONLY, label: "This job only" }, ...partOptions] : partOptions}
                          value={entry.target}
                          onChange={(v) => onUploadChange(entry.key, { target: v || "" })}
                          emptyLabel={jobOnlyReady ? "Pick a line, or This job only" : "Pick a line"}
                        />
                      </td>
                      <td style={cell}>
                        {existing ? (
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
                        ) : (
                          <span style={S.roleHint}>{entry.target ? "No: first drawing" : ""}</span>
                        )}
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
                  );
                })}
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
