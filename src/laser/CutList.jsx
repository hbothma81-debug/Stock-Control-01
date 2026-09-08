import { useState, useMemo, useEffect } from "react";
import { Check, Undo2, OctagonAlert, MessageSquare, X, Clock } from "lucide-react";
import { C, S } from "../theme.js";
import Section from "../Section.jsx";
import { pickShift, currentAndPreviousWindow, fmtTime } from "../lib/shiftWindow.js";
import { plannedMinutes, outstandingMinutes, fmtMinutes } from "../lib/cuttingTime.js";

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

// Cards sit side by side on a wide screen rather than one under the
// other. Each one is short, and a full-width card left most of a monitor
// empty while the operator scrolled past it to reach the next one.
const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: 8,
  alignItems: "start",
};

export default function CutList({
  programs,
  thicknesses,
  events,
  shifts,
  myShiftId,
  canCut,
  onToggleCut,
  onSetCutCount,
  onSetActualMinutes,
  onReport,
  onAddNote,
  busyId,
}) {
  const [query, setQuery] = useState("");
  // Which program the "how long did it take" popup is open for. Held
  // here, not on the card: marking the last sheet cut moves the card
  // from the to-cut list into Already cut, and a card that moves is torn
  // down and rebuilt, taking anything it was holding with it. The list
  // stays put, so the popup lives on the list.
  const [askTimeFor, setAskTimeFor] = useState(null);
  const askProgram = askTimeFor ? (programs || []).find((p) => p.id === askTimeFor) : null;

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

      <ShiftCounter programs={programs} shifts={shifts} myShiftId={myShiftId} />

      {toCut.length === 0 ? (
        <div style={S.empty}>
          {query.trim() ? "Nothing waiting matches that." : "Nothing waiting to be cut."}
        </div>
      ) : (
        groups.map((g) => (
          <Section key={g.material} title={g.material} count={g.items.length}>
            <div style={grid}>
              {g.items.map((p) => (
                <ProgramRow
                  key={p.id}
                  program={p}
                  notes={(events || []).filter(
                    (e) => e.program_id === p.id && (e.action === "note" || e.action === "stopped")
                  )}
                  canCut={canCut}
                  onToggleCut={onToggleCut}
                  onSetCutCount={onSetCutCount}
                  onAskTime={(pr) => setAskTimeFor(pr.id)}
                  onReport={onReport}
                  onAddNote={onAddNote}
                  busy={busyId === p.id}
                />
              ))}
            </div>
          </Section>
        ))
      )}

      {cut.length > 0 && (
        <Section title="Already cut" count={cut.length} collapsible defaultOpen={false}>
          <div style={grid}>
            {cut.map((p) => (
              <ProgramRow
                key={p.id}
                program={p}
                notes={(events || []).filter(
                  (e) => e.program_id === p.id && (e.action === "note" || e.action === "stopped")
                )}
                canCut={canCut}
                onToggleCut={onToggleCut}
                onSetCutCount={onSetCutCount}
                onAskTime={(pr) => setAskTimeFor(pr.id)}
                onReport={onReport}
                onAddNote={onAddNote}
                busy={busyId === p.id}
              />
            ))}
          </div>
        </Section>
      )}

      {askProgram && (
        <TimeModal
          program={askProgram}
          onSave={onSetActualMinutes}
          onClose={() => setAskTimeFor(null)}
        />
      )}
    </div>
  );
}

// How many programs this shift has cut so far, and what the shift before
// managed. The figure the operator is asked for at the end of every
// shift, so it sits where he can read it off rather than count cards.
//
// A program counts for the shift it was finished in: the moment its last
// sheet was marked cut. One taken back to "not cut" drops off again,
// because it no longer has a finished time.
//
// Which shift: whichever is on the clock right now, as set up under Time
// Manager. Nothing on the clock -- a Sunday, or no shifts set up yet --
// counts today since midnight instead, and says so.
function ShiftCounter({ programs, shifts, myShiftId }) {
  // The clock has to move while the screen sits open on the machine all
  // day, or the count would never roll over when the shift changes.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const view = useMemo(() => {
    const shift = pickShift(shifts, myShiftId, now);
    const win = shift ? currentAndPreviousWindow(shift, now) : { current: null, previous: null };
    let current = win.current;
    let label;
    if (current) {
      label = `${shift.name} · ${fmtTime(current.start)}–${fmtTime(current.end)}`;
    } else {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      current = { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
      label = (shifts || []).length ? "no shift on the clock · today" : "today";
    }
    const within = (w) => (p) => {
      if (!p.is_complete || !p.completed_at) return false;
      const t = new Date(p.completed_at);
      return t >= w.start && t < w.end;
    };
    const sum = (list, f) => list.reduce((acc, p) => acc + (f(p) || 0), 0);
    const cutNow = (programs || []).filter(within(current));

    // What is still on the list, in minutes, so whoever plans the night
    // shift can see whether there is enough nested to fill it. A program
    // with no time given cannot be added up, so say how many are missing
    // rather than let the total read as the whole picture.
    const open = (programs || []).filter((p) => !p.is_complete);
    const untimed = open.filter((p) => outstandingMinutes(p) == null).length;

    return {
      label,
      count: cutNow.length,
      minutes: sum(cutNow, plannedMinutes),
      previous: win.previous ? (programs || []).filter(within(win.previous)).length : null,
      openCount: open.length,
      openMinutes: sum(open, outstandingMinutes),
      untimed,
    };
  }, [programs, shifts, myShiftId, now]);

  const line = { display: "flex", flexWrap: "wrap", gap: "4px 18px", justifyContent: "center" };
  return (
    <div style={{ ...S.summaryBanner, marginBottom: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={line}>
        <span>
          <b style={{ fontSize: 18 }}>{view.count}</b> {view.count === 1 ? "program" : "programs"} cut this shift
          {view.minutes > 0 ? ` · ${fmtMinutes(view.minutes)} planned` : ""}
        </span>
        <span style={{ color: C.muted }}>{view.label}</span>
        {view.previous != null && <span style={{ color: C.muted }}>last shift {view.previous}</span>}
      </div>
      <div style={{ ...line, color: C.muted }}>
        <span>
          Still on the list: <b style={{ color: C.text }}>{view.openCount}</b>{" "}
          {view.openCount === 1 ? "program" : "programs"}
          {view.openCount > 0 ? (
            <>
              {" "}
              · <b style={{ color: C.text }}>{fmtMinutes(view.openMinutes)}</b> of cutting
            </>
          ) : null}
        </span>
        {view.untimed > 0 && (
          <span style={{ color: C.danger }}>
            {view.untimed} with no time given — not in that total
          </span>
        )}
      </div>
    </div>
  );
}

function ProgramRow({ program, notes, canCut, onToggleCut, onSetCutCount, onAskTime, onReport, onAddNote, busy }) {
  const p = program;
  const repeats = Math.max(1, Number(p.sheets_required) || 1);
  const done = Math.min(Math.max(0, Number(p.sheets_cut) || 0), repeats);
  const [countDraft, setCountDraft] = useState(String(done));
  useEffect(() => setCountDraft(String(done)), [done]);
  // Asked once the last sheet is marked cut: how long did it really take.
  // The popup itself belongs to the list (see CutList), because this card
  // moves into Already cut at that very moment and is rebuilt on the way.
  const planned = plannedMinutes(p);
  const openTime = () => onAskTime(p);
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
          {planned != null && (
            <span style={S.partTag} title="Planned cutting time, all sheets">
              {fmtMinutes(planned)}
              {repeats > 1 ? ` (${fmtMinutes(p.cut_minutes)} × ${repeats})` : ""}
            </span>
          )}
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
            {p.actual_minutes != null ? ` · took ${fmtMinutes(p.actual_minutes)}` : " · time not given"}
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
                  onClick={async () => {
                    if ((await onSetCutCount(p, done + 1)) && done + 1 >= repeats) openTime();
                  }}
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
                onBlur={async () => {
                  const n = Math.round(Number(countDraft));
                  if (Number.isFinite(n) && n !== done) {
                    if ((await onSetCutCount(p, n)) && n >= repeats) openTime();
                  } else setCountDraft(String(done));
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
              onClick={async () => {
                if (await onToggleCut(p)) openTime();
              }}
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

          {/* Skipped at the time, or got wrong: the time can be put in
              or changed afterwards from the card. */}
          {p.is_complete && (
            <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={openTime}>
              <Clock size={13} /> {p.actual_minutes != null ? "Change time" : "Add time"}
            </button>
          )}
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

// "How long did it take?" -- asked once the last sheet of a program is
// marked cut, and again from the card's Add time button for anything
// skipped. He can skip it for now; whether it becomes compulsory is a
// later decision, so the skip is one plain button rather than buried.
//
// The answer is for the record. The planned time stays as it was nested.
function TimeModal({ program: p, onSave, onClose }) {
  const planned = plannedMinutes(p);
  const [draft, setDraft] = useState(p.actual_minutes == null ? "" : String(p.actual_minutes));
  const [saving, setSaving] = useState(false);
  return (
    <div style={{ ...S.modalOverlay, zIndex: 30 }}>
      <div style={{ ...S.modal, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>How long did {p.program_number} take?</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={S.roleHint}>
          Minutes the machine actually ran, for the record. The planned time stays as it was nested
          {planned != null ? `: ${fmtMinutes(planned)}` : ""}.
        </div>

        <label style={{ ...S.label, marginTop: 10, display: "block" }}>Minutes</label>
        <input
          style={S.input}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={planned != null ? `Planned ${Math.round(planned)}` : "e.g. 45"}
          autoFocus
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="stk-btn"
            style={{ ...S.submitBtn, flex: 1, marginTop: 0 }}
            disabled={draft.trim() === "" || saving}
            onClick={async () => {
              setSaving(true);
              try {
                if (await onSave(p, draft)) onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save time"}
          </button>
          <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, flex: 1 }} onClick={onClose}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
