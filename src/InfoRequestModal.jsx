import { useState } from "react";
import { X, Paperclip, Image as ImageIcon } from "lucide-react";
import { C, S } from "./theme.js";
import { INFO_REQUEST_KINDS, standingFor } from "./lib/infoRequests.js";

// The office's side: the Answer pop-up behind the red banner. Files picked
// here are filed on the stage the request came from, so the operator
// finds the drawing on the card they are working at. onSubmit gets
// { answer, files } and resolves true when saved.
export function InfoAnswerModal({ req, onViewPhoto, onSubmit, onClose }) {
  const [answer, setAnswer] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const canSend = answer.trim() && !busy;
  const stage = req.stage_name || "the job's";

  async function send() {
    if (!canSend) return;
    setBusy(true);
    const ok = await onSubmit({ answer: answer.trim(), files });
    if (!ok) setBusy(false);
  }

  return (
    <div style={{ ...S.modalOverlay, zIndex: 30 }}>
      <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Answer Info Request</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={S.roleHint}>
          {req.job_number} — {req.job?.customer || "No customer"} · standing at {req.stage_name || "a stage"} for{" "}
          {standingFor(req)}
        </div>
        <div
          style={{ border: `2px solid ${C.danger}`, borderRadius: 6, padding: 8, marginTop: 8, background: C.dangerTint }}
        >
          <div style={S.itemComment}>
            <strong>{req.kind}:</strong> {req.note}
            {req.photo_path && (
              <button
                type="button"
                className="stk-btn"
                style={{ background: "none", border: "none", padding: 0, marginLeft: 6, color: C.accentRaw, cursor: "pointer" }}
                title="See the photo"
                onClick={() => onViewPhoto(req.photo_path, req.photo_name || "Info request photo")}
              >
                <ImageIcon size={13} />
              </button>
            )}
          </div>
          <div style={S.rowMeta}>
            <span>Asked by {req.raised_by || "someone"}</span>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={S.label}>Your answer</label>
          <textarea
            style={{ ...S.input, minHeight: 70, resize: "vertical" }}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="e.g. Rev B is on the card now — 3 holes is right."
            autoFocus
          />
        </div>

        <label
          className="stk-btn"
          style={{ ...S.reqActionBtnMuted, display: "inline-flex", marginTop: 10, cursor: "pointer", width: "fit-content" }}
        >
          <Paperclip size={13} />
          {files.length ? `${files.length} file${files.length === 1 ? "" : "s"}: ${files.map((f) => f.name).join(", ")}` : "Attach a drawing or file (optional)"}
          <input
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              setFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
        </label>
        <div style={{ ...S.roleHint, marginTop: 4 }}>Files go on the {stage} card, where the operator is working.</div>

        <button
          type="button"
          className="stk-btn"
          style={{ ...S.submitBtn, ...(canSend ? {} : { opacity: 0.5 }) }}
          disabled={!canSend}
          onClick={send}
        >
          {busy ? "Sending…" : "Send answer"}
        </button>
      </div>
    </div>
  );
}

// The pop-up behind a Production card's Info Request button. Its own file
// and its own state, so typing here never re-renders App.
//
// What is needed is a handful of fixed choices, so buttons rather than a
// type-to-find box. The note is required: "Drawing" alone does not say
// which drawing, or what is wrong with the one on the floor.
//
// onUploadPhoto(file) resolves to the stored path, or null when it failed
// (the caller has already said so). onSubmit resolves true when saved;
// false keeps the pop-up open with everything typed still in it.

export default function InfoRequestModal({ job, process, onUploadPhoto, onSubmit, onClose }) {
  const [kind, setKind] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSend = kind && note.trim() && !uploading && !busy;

  async function pickPhoto(file) {
    if (!file) return;
    setUploading(true);
    const path = await onUploadPhoto(file);
    setUploading(false);
    if (path) setPhoto({ path, name: file.name });
  }

  async function send() {
    if (!canSend) return;
    setBusy(true);
    const ok = await onSubmit({ kind, note: note.trim(), photoPath: photo?.path || "", photoName: photo?.name || "" });
    if (!ok) setBusy(false);
  }

  return (
    <div style={{ ...S.modalOverlay, zIndex: 30 }}>
      <div style={{ ...S.modal, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Info Request</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={S.roleHint}>
          {job.job_number} — {job.customer || "No customer"} · {process.process_name}. The job shows as standing until the
          office answers.
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={S.label}>What's needed</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {INFO_REQUEST_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="stk-btn"
                style={kind === k ? S.reqActionBtn : S.reqActionBtnMuted}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={S.label}>What exactly</label>
          <textarea
            style={{ ...S.input, minHeight: 70, resize: "vertical" }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. drawing shows 2 holes, the part has 3 — which is right?"
            autoFocus
          />
        </div>

        {/* accept="image/*" with no capture attribute, as on a shortage: a
            phone offers the camera and the gallery both. */}
        <label
          className="stk-btn"
          style={{ ...S.reqActionBtnMuted, display: "inline-flex", marginTop: 10, cursor: "pointer", width: "fit-content" }}
        >
          {photo ? <ImageIcon size={13} /> : <Paperclip size={13} />}
          {uploading ? "Uploading…" : photo ? `Photo: ${photo.name} — change` : "Add a photo (optional)"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files[0];
              e.target.value = "";
              pickPhoto(file);
            }}
          />
        </label>

        <button
          type="button"
          className="stk-btn"
          style={{ ...S.submitBtn, ...(canSend ? {} : { opacity: 0.5 }) }}
          disabled={!canSend}
          onClick={send}
        >
          {busy ? "Sending…" : "Send Info Request"}
        </button>
        {!kind && <div style={{ ...S.roleHint, marginTop: 6, color: C.muted }}>Pick what's needed, then say what exactly.</div>}
      </div>
    </div>
  );
}
