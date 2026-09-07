import { useState, useMemo, useEffect } from "react";
import { Check, Undo2, OctagonAlert, MessageSquare, X } from "lucide-react";
import { C, S } from "../theme.js";
import Section from "../Section.jsx";

// The laser operator's screen. A to-do list of programs to cut.
//
// He works off the program number -- that is what he loads at the machine
// -- so that is what this leads with. The jobs on each program are shown
// because the rest of the shop talks in job numbers, and someone
// inevitably phones asking where a job is.
//
// Grouped by material in the order set under Stock Manager, not
// alphabetically: 10mm would otherwise sort next to 1.2mm, and the point
// of grouping is to cut everything of one thickness together.
//
// No database calls in here. The parent owns those.

export default function CutList({ programs, thicknesses, events, canCut, onToggleCut, onSetCutCount, onReport, onAddNote, busyId }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter(
      (p) =>
        (p.program_number || "").toLowerCase().includes(q) ||
        (p.material || "").toLowerCase().includes(q) ||
        (p.sheet_name || "").toLowerCase().includes(q) ||
        (p.jobs || []).some(
          (l) =>
            (l.job_number || "").toLowerCase().includes(q) ||
            (l.sigmanest_number || "").toLowerCase().includes(q)
        )
    );
  }, [programs, query]);

  const toCut = filtered.filter((p) => !p.is_complete);
  const cut = filtered.filter((p) => p.is_complete);

  // Grouped by material, in the shop's own thickness order. A material
  // reads "1.2mm MS", so its group sorts by where that thickness sits in
  // the list -- alphabetically 10mm would land next to 1.2mm, and the
  // point of grouping is to cut a thickness together. Anything whose
  // thickness is not on the list falls in at the end rather than
  // vanishing.
  const groups = useMemo(() => {
    const rank = (material) => {
      const i = (thicknesses || []).findIndex((t) => (material || "").startsWith(t));
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const names = [...new Set(toCut.map((p) => p.material))];
    names.sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
    return names
      .map((m) => ({ material: m, items: toCut.filter((p) => p.material === m) }))
      .filter((g) => g.items.length > 0);
  }, [toCut, thicknesses]);

  return (
    <div style={S.list}>
      <input
        style={S.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search program, job number, or SigmaNest number…"
      />

      {toCut.length === 0 ? (
        <div style={S.empty}>
          {query.trim() ? "Nothing waiting matches that." : "Nothing waiting to be cut."}
        </div>
      ) : (
        groups.map((g) => (
          <Section key={g.material} title={g.material} count={g.items.length}>
            {g.items.map((p) => (
              <ProgramRow
              key={p.id}
              program={p}
              notes={(events || []).filter((e) => e.program_id === p.id && (e.action === "note" || e.action === "stopped"))}
              canCut={canCut}
              onToggleCut={onToggleCut}
              onSetCutCount={onSetCutCount}
              onReport={onReport}
              onAddNote={onAddNote}
              busy={busyId === p.id}
            />
            ))}
          </Section>
        ))
      )}

      {cut.length > 0 && (
        <Section title="Already cut" count={cut.length} collapsible defaultOpen={false}>
          {cut.map((p) => (
            <ProgramRow
              key={p.id}
              program={p}
              notes={(events || []).filter((e) => e.program_id === p.id && (e.action === "note" || e.action === "stopped"))}
              canCut={canCut}
              onToggleCut={onToggleCut}
              onSetCutCount={onSetCutCount}
              onReport={onReport}
              onAddNote={onAddNote}
              busy={busyId === p.id}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function ProgramRow({ program, notes, canCut, onToggleCut, onSetCutCount, onReport, onAddNote, busy }) {
  const p = program;
  const repeats = Math.max(1, Number(p.sheets_required) || 1);
  const done = Math.min(Math.max(0, Number(p.sheets_cut) || 0), repeats);
  const [countDraft, setCountDraft] = useState(String(done));
  useEffect(() => setCountDraft(String(done)), [done]);
  const [showReport, setShowReport] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [reason, setReason] = useState("");
  const [offcutL, setOffcutL] = useState("");
  const [offcutW, setOffcutW] = useState("");
  const [plate, setPlate] = useState("");
  const [noteText, setNoteText] = useState("");
  const reported = !!p.reported_at;
  return (
    <div style={S.row}>
      <div style={S.rowMain}>
        <span style={{ ...S.itemName, fontSize: 18, letterSpacing: "0.02em" }}>{p.program_number}</span>
        <div style={S.rowMeta}>
          <span style={S.partTag}>{p.material}</span>
          {p.sheet_name && <span style={S.partTag}>{p.sheet_name}</span>}
          {p.machine && <span style={S.partTag}>{p.machine}</span>}
        </div>
        <div style={{ ...S.chipRow, marginTop: 4 }}>
          {(p.jobs || []).length === 0 ? (
            <span style={S.roleHint}>No jobs on this program.</span>
          ) : (
            (p.jobs || []).map((l) => (
              <span
                key={l.id}
                style={{ ...S.chip, ...(l.shortage_id ? { borderColor: C.danger, color: C.danger } : {}) }}
              >
                {l.job_number || "unknown job"}
                {l.shortage_id ? " · re-cut" : l.sigmanest_number ? ` · ${l.sigmanest_number}` : ""}
              </span>
            ))
          )}
        </div>
        {reported && (
          <div
            style={{
              marginTop: 6,
              padding: "6px 9px",
              borderRadius: 6,
              border: `1px solid ${C.danger}`,
              background: C.dangerTint,
              color: C.danger,
              fontSize: 14,
            }}
          >
            <b>Stopped</b> — {p.reported_reason}
            {p.reported_offcut_length && p.reported_offcut_width ? (
              <> · offcut {p.reported_offcut_length} × {p.reported_offcut_width}</>
            ) : null}
            {p.reported_plate ? <> · plate {p.reported_plate}</> : null}
            <div style={{ ...S.roleHint, color: C.danger }}>
              {p.reported_by}
              {p.reported_at ? ` — ${new Date(p.reported_at).toLocaleString()}` : ""}
            </div>
          </div>
        )}

        {showNotes && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            {(notes || []).length === 0 ? (
              <div style={S.roleHint}>Nothing written about this program yet.</div>
            ) : (
              (notes || []).map((n) => (
                <div key={n.id} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: n.action === "stopped" ? C.danger : C.text }}>
                    {n.action === "stopped" ? "Stopped: " : ""}
                    {n.detail}
                  </div>
                  <div style={S.roleHint}>
                    {n.acted_by}
                    {n.acted_at ? ` — ${new Date(n.acted_at).toLocaleString()}` : ""}
                  </div>
                </div>
              ))
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input
                style={{ ...S.input, flex: "1 1 200px" }}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this program…"
              />
              <button
                type="button"
                className="stk-btn"
                style={S.reqActionBtn}
                disabled={!noteText.trim()}
                onClick={async () => {
                  if (await onAddNote(p, noteText)) setNoteText("");
                }}
              >
                Add note
              </button>
            </div>
          </div>
        )}

        {p.is_complete && p.completed_by && (
          <div style={S.roleHint}>
            Cut by {p.completed_by}
            {p.completed_at ? ` — ${new Date(p.completed_at).toLocaleString()}` : ""}
          </div>
        )}
      </div>

      {/* A program run more than once off the same material. How many are
          left is the thing the operator needs at a glance, so it is said
          in words and drawn as a bar -- he is reading this across a
          workshop, not studying it. */}
      {repeats > 1 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: done >= repeats ? C.accentFinished : C.text }}>
              {done} of {repeats} cut
            </span>
            {done < repeats && (
              <span style={{ ...S.roleHint, color: C.accentRaw }}>{repeats - done} still to cut</span>
            )}
          </div>
          <div
            style={{
              marginTop: 4,
              height: 8,
              borderRadius: 4,
              background: C.border,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round((Math.min(done, repeats) / repeats) * 100)}%`,
                height: "100%",
                background: done >= repeats ? C.accentFinished : C.accentRaw,
              }}
            />
          </div>
        </div>
      )}

      {canCut && (
        <div style={S.rowControls}>
          {repeats > 1 ? (
            <>
              {done < repeats && (
                <button
                  type="button"
                  className="stk-btn"
                  style={{ ...S.reqActionBtn, background: C.accentRaw }}
                  disabled={busy}
                  onClick={() => onSetCutCount(p, done + 1)}
                  title="One more sheet of this program is cut"
                >
                  <Check size={14} strokeWidth={2.5} /> {busy ? "Saving…" : "Cut one"}
                </button>
              )}

              {/* For a program that repeats twenty times, pressing a button
                  twenty times is silly. Type the number instead. */}
              <input
                type="number"
                min="0"
                max={repeats}
                inputMode="numeric"
                style={{ ...S.input, width: 74, textAlign: "center" }}
                value={countDraft}
                onChange={(e) => setCountDraft(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={() => {
                  const n = Math.round(Number(countDraft));
                  if (Number.isFinite(n) && n !== done) onSetCutCount(p, n);
                  else setCountDraft(String(done));
                }}
                title={`How many of the ${repeats} are cut`}
              />

              {done > 0 && (
                <button
                  type="button"
                  className="stk-btn"
                  style={S.reqActionBtnMuted}
                  disabled={busy}
                  onClick={() => onSetCutCount(p, done - 1)}
                  title="Take one back off"
                >
                  <Undo2 size={13} /> Undo one
                </button>
              )}
            </>
          ) : p.is_complete ? (
            <button
              type="button"
              className="stk-btn"
              style={S.reqActionBtnMuted}
              disabled={busy}
              onClick={() => onToggleCut(p)}
              title="Put this program back on the cut list"
            >
              <Undo2 size={13} /> {busy ? "Saving…" : "Not cut"}
            </button>
          ) : (
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.reqActionBtn, background: C.accentRaw }}
              disabled={busy}
              onClick={() => onToggleCut(p)}
            >
              <Check size={14} strokeWidth={2.5} /> {busy ? "Saving…" : "Mark cut"}
            </button>
          )}

          {/* Deliberately still able to mark it cut while stopped -- the
              material may turn up five minutes later, and the man at the
              machine is the one who knows. */}
          {!p.is_complete && !reported && (
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.reqActionBtnMuted, color: C.danger, border: `1px solid ${C.danger}` }}
              onClick={() => setShowReport(true)}
              title="Something is stopping you cutting this"
            >
              <OctagonAlert size={13} /> Stop / Report
            </button>
          )}

          <button
            type="button"
            className="stk-btn"
            style={S.reqActionBtnMuted}
            onClick={() => setShowNotes((v) => !v)}
          >
            <MessageSquare size={13} /> Notes{(notes || []).length ? ` (${notes.length})` : ""}
          </button>
        </div>
      )}

      {showReport && (
        <div style={{ ...S.modalOverlay, zIndex: 30 }}>
          <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Stop {p.program_number}</span>
              <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setShowReport(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={S.roleHint}>
              This stays on your cut list. Whoever nests gets told straight away.
            </div>

            <label style={{ ...S.label, marginTop: 10, display: "block" }}>What is stopping you?</label>
            <input
              style={S.input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Short and plain — e.g. plate is short"
              autoFocus
            />

            <label style={{ ...S.label, marginTop: 10, display: "block" }}>
              Offcut to nest on instead (optional)
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                style={{ ...S.input, flex: 1 }}
                type="number"
                inputMode="numeric"
                value={offcutL}
                onChange={(e) => setOffcutL(e.target.value)}
                placeholder="Length"
              />
              <span style={{ color: C.muted }}>×</span>
              <input
                style={{ ...S.input, flex: 1 }}
                type="number"
                inputMode="numeric"
                value={offcutW}
                onChange={(e) => setOffcutW(e.target.value)}
                placeholder="Width"
              />
            </div>

            <label style={{ ...S.label, marginTop: 10, display: "block" }}>Or a plate name (optional)</label>
            <input
              style={S.input}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="Which plate to use instead"
            />

            <button
              type="button"
              className="stk-btn"
              style={{ ...S.submitBtn, background: C.danger, color: "#fff" }}
              disabled={!reason.trim() || busy}
              onClick={async () => {
                const ok = await onReport(p, {
                  reason,
                  offcutLength: offcutL,
                  offcutWidth: offcutW,
                  plate,
                });
                if (ok) {
                  setShowReport(false);
                  setReason("");
                  setOffcutL("");
                  setOffcutW("");
                  setPlate("");
                }
              }}
            >
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
