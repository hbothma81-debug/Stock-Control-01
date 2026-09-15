import { useState } from "react";
import { X } from "lucide-react";
import { C, S } from "../theme.js";

// "Cancel shortage", for one raised by mistake -- most often parts that
// were only waiting to be cut. Asks why, then hands the shortage and the
// words to onCancel (cancelShortage in App.jsx), which does the work and
// answers true when it is done.
//
// One button for every place that offers it -- the Nesting row, the
// Shortages screen and the Production nesting block -- so the question
// and the wording are the same wherever it is pressed.
export default function CancelShortage({ shortage, summary, programNumbers, onCancel }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="stk-btn"
        style={{ ...S.reqActionBtnMuted, marginTop: 6, alignSelf: "flex-start" }}
        title="Raised by mistake? Cancel it — it asks why"
        onClick={() => setOpen(true)}
      >
        <X size={13} /> Cancel shortage
      </button>
      {open && (
        <CancelShortageModal
          shortage={shortage}
          summary={summary}
          programNumbers={programNumbers}
          onConfirm={onCancel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Laid out like the Delete program popup on the Nesting screen: what it
// is, what happens, why, then the red button and a way out.
function CancelShortageModal({ shortage: s, summary, programNumbers, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const onPrograms = (programNumbers || []).filter(Boolean);
  return (
    <div style={{ ...S.modalOverlay, zIndex: 30 }} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Cancel this shortage?</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={S.roleHint}>
          {s.job_number} — {s.customer || "No customer"}
          {summary ? ` · ${summary}` : ""}
        </div>
        <div style={{ ...S.roleHint, marginTop: 6 }}>
          {onPrograms.length > 0
            ? `It comes off program ${onPrograms.join(", ")}, and the stages it was to catch up through are removed. `
            : s.status === "nested"
            ? "It comes off the program it is on, and the stages it was to catch up through are removed. "
            : ""}
          It stays on record as cancelled, with your name and the reason. If someone else flagged it, they are told.
        </div>

        <label style={{ ...S.label, marginTop: 10, display: "block" }}>Why?</label>
        <input
          style={S.input}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. the parts were still waiting to be cut"
          autoFocus
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="stk-btn"
            style={{ ...S.submitBtn, flex: 1, marginTop: 0, background: C.danger, color: "#fff" }}
            disabled={!reason.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try {
                if (await onConfirm(s, reason)) onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Cancelling…" : "Cancel shortage"}
          </button>
          <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, flex: 1 }} onClick={onClose}>
            Keep it
          </button>
        </div>
      </div>
    </div>
  );
}
