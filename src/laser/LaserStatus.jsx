import { useState, useMemo } from "react";
import { Check, Hand, AlertTriangle, ChevronDown } from "lucide-react";
import { C, S } from "../theme.js";

// Where a job goes after the laser, and where the packer works.
//
// Two things run side by side on every row, and they are not the same
// thing:
//
//   The laser side is worked out from the programs. It says "in process"
//   the moment the first program carrying this job is cut, and "complete"
//   once every one of them is.
//
//   The packing side is a person. A packer takes the job, which is what
//   releases bending and everything after it -- a big job is cut over
//   days and the rest of the shop should not wait for the last program.
//   He marks it packed and checked when he is genuinely done, and only
//   then does it leave this screen.
//
// A job appears here as soon as its first program is cut, so the packer
// can start looking for parts while the rest is still being cut.
//
// Re-cuts appear here too, on their own rows. A shortage is raised by the
// person who is short, usually the packer, and the replacement parts have
// to get back to them -- so this is where that is ticked off, and ticking
// it is what finally closes the shortage.
//
// One line per job, the same as the nesting screen. Both states are on
// that line, so the packer can read the whole list at a glance and only
// opens the one he is about to work on.
//
// No database calls in here. The parent owns those.

function laserState(programs) {
  if (programs.length === 0) return { label: "No programs", tone: C.muted, done: false };
  const cut = programs.filter((p) => p.is_complete).length;
  if (cut === programs.length) return { label: "Cut — all programs", tone: C.accentFinished, done: true };
  return { label: `Cutting — ${cut} of ${programs.length} programs`, tone: C.accentRaw, done: false };
}

export default function LaserStatus({
  rows,
  canPack,
  meName,
  onTakeJob,
  onFinishPacking,
  onFlagShortage,
  // A packing stage set to Each on the job: the packer logs items one at
  // a time instead of ticking the whole job. ItemProgress is the same
  // per-item control a Production card uses, handed in by the parent so
  // this screen and that card can never count differently.
  onLogItem,
  ItemProgress,
  busyId,
}) {
  const [query, setQuery] = useState("");
  const [openRow, setOpenRow] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.job.job_number || "").toLowerCase().includes(q) ||
        (r.job.customer || "").toLowerCase().includes(q) ||
        (r.job.laser_job_reference || "").toLowerCase().includes(q) ||
        (r.packerName || "").toLowerCase().includes(q) ||
        (r.detail || "").toLowerCase().includes(q) ||
        r.programs.some((p) => (p.program_number || "").toLowerCase().includes(q))
    );
  }, [rows, query]);

  return (
    <div style={S.list}>
      <input
        style={S.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search job, customer, program, or packer…"
      />

      {filtered.length === 0 ? (
        <div style={S.empty}>
          {query.trim()
            ? "Nothing matches that."
            : "Nothing off the laser yet. A job appears here as soon as its first program is cut."}
        </div>
      ) : (
        filtered.map((r) => (
          <StatusRow
            key={r.key}
            row={r}
            expanded={openRow === r.key}
            onToggle={() => setOpenRow((k) => (k === r.key ? null : r.key))}
            canPack={canPack}
            busyId={busyId}
            onTakeJob={onTakeJob}
            onFinishPacking={onFinishPacking}
            onFlagShortage={onFlagShortage}
            onLogItem={onLogItem}
            ItemProgress={ItemProgress}
          />
        ))
      )}

      <div style={S.roleHint}>
        A job leaves this screen once it is marked packed and checked. Taking a job is what opens the stages after
        packing — the job does not have to be finished first.
      </div>
    </div>
  );
}

function StatusRow({ row: r, expanded, onToggle, canPack, busyId, onTakeJob, onFinishPacking, onFlagShortage, onLogItem, ItemProgress }) {
  const laser = laserState(r.programs);
  // A job can reach here with no packing stage at all, when nobody ticked
  // Packer as the job was built.
  const taken = !!r.process?.started_at;
  const busy = !!r.process && busyId === r.process.id;
  // Packed item by item rather than as one tick. A re-cut is never: its
  // parts are the shortage's, not lines on the job.
  // With every line tagged for another machine there is nothing to count,
  // so the single tick stays and the row says why.
  const perItem = !r.isRecut && r.process?.tracking_mode === "each" && !!ItemProgress && !r.nothingToCut;

  const packLabel = !r.process
    ? "No packing stage"
    : taken
    ? `Packing — ${r.packerName || "someone"}`
    : "Waiting for a packer";
  const packTone = !r.process ? C.danger : taken ? C.accentRaw : C.muted;

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        // A missing packing stage is a fault, not a state, so it is the one
        // thing shouted at from the closed line.
        border: !r.process
          ? `2px solid ${C.danger}`
          : r.isRecut
            ? `2px solid ${C.danger}`
            : taken
              ? `1px solid ${C.accentRaw}`
              : `1px solid ${C.border}`,
      }}
    >
      {/* The line. Everything else waits behind the chevron. */}
      <button
        type="button"
        className="stk-btn"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "transparent",
          border: "none",
          color: C.text,
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
          flexWrap: "wrap",
        }}
      >
        {r.isRecut && (
          <span style={{ ...S.chip, borderColor: C.danger, color: C.danger, fontWeight: 700, flexShrink: 0 }}>
            Re-cut
          </span>
        )}
        <span style={{ fontWeight: 700, fontSize: 15 }}>{r.job.job_number}</span>
        <span style={{ color: C.muted, fontSize: 14 }}>{r.job.customer || "no customer"}</span>
        {!r.isRecut && (
          <span style={{ color: C.muted, fontSize: 14 }}>{r.job.laser_job_reference || "no SigmaNest #"}</span>
        )}
        <span style={{ flex: 1, minWidth: 0, color: laser.tone, fontSize: 14, fontWeight: 600 }}>{laser.label}</span>
        <span style={{ color: packTone, fontSize: 14, fontWeight: 600 }}>{packLabel}</span>
        <ChevronDown
          size={16}
          style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}
        />
      </button>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          {r.isRecut && (
            <div style={{ ...S.itemComment, color: C.danger, marginBottom: 6 }}>
              {r.detail} — back from the laser. Ticking this off is what closes the shortage.
            </div>
          )}
          {r.job.due_date && <div style={S.roleHint}>Due {new Date(r.job.due_date).toLocaleDateString()}</div>}

          {/* ---- laser side: worked out, never typed in ---- */}
          <div style={{ marginTop: 6 }}>
            <div style={S.label}>Laser</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: laser.tone }}>{laser.label}</div>
            <div style={{ ...S.chipRow, marginTop: 6 }}>
              {r.programs.length === 0 ? (
                <span style={S.roleHint}>Not on any program.</span>
              ) : (
                r.programs.map((p) => (
                  <span
                    key={p.id}
                    style={{
                      ...S.chip,
                      color: p.is_complete ? C.accentFinished : C.muted,
                      border: `1px solid ${p.is_complete ? C.accentFinished : C.border}`,
                    }}
                  >
                    {p.program_number} · {p.material}
                    {p.is_complete ? " · cut" : ""}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* ---- packing side: a person ---- */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={S.label}>Packing</div>
            {!r.process ? (
              <div style={{ fontSize: 14, fontWeight: 600, color: C.danger }}>This job has no packing stage</div>
            ) : (
              <div style={{ fontSize: 14, fontWeight: 600, color: taken ? C.accentRaw : C.muted }}>
                {taken ? `In process — ${r.packerName || "someone"}` : "Waiting for a packer"}
              </div>
            )}
            {!r.process && (
              <div style={S.roleHint}>
                Its parts are coming off the laser, but Packer was never added to this job — so nothing here can be
                taken, and nothing after packing will open. Open the job, press Edit processes, and add it.
              </div>
            )}
            {r.nothingToCut && (
              <div style={{ ...S.roleHint, color: C.accentRaw, fontWeight: 600 }}>{r.nothingToCut}</div>
            )}
            {taken && r.process?.started_at && (
              <div style={S.roleHint}>Taken {new Date(r.process.started_at).toLocaleString()}</div>
            )}
            {taken && (
              <div style={{ ...S.roleHint, color: C.accentRaw }}>The stages after packing are open for this job.</div>
            )}

            {canPack && r.process && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="stk-btn"
                  style={taken ? S.reqActionBtnMuted : { ...S.reqActionBtn, background: C.accentRaw }}
                  disabled={busy}
                  onClick={() => onTakeJob(r)}
                  title={
                    taken
                      ? "Take this job over from whoever has it"
                      : "Take this job — this also opens the stages after packing"
                  }
                >
                  <Hand size={13} />{" "}
                  {busy ? "Saving…" : taken ? (r.isMine ? "You have it" : "Take it over") : "Take job"}
                </button>

                {taken && !perItem && (
                  <button
                    type="button"
                    className="stk-btn"
                    style={S.reqActionBtn}
                    disabled={busy}
                    onClick={() => onFinishPacking(r)}
                  >
                    <Check size={14} strokeWidth={2.5} /> {busy ? "Saving…" : "Packed & checked"}
                  </button>
                )}

                {/* The packer is the one who finds parts missing off a
                    nest, so this is where a shortage gets raised. Not on a
                    re-cut though: a shortage on a shortage is not something
                    anything downstream knows how to follow. */}
                {!r.isRecut && (
                  <button
                    type="button"
                    className="stk-btn"
                    style={{ ...S.reqActionBtnMuted, color: C.danger, border: `1px solid ${C.danger}` }}
                    onClick={() => onFlagShortage(r)}
                  >
                    <AlertTriangle size={13} /> Flag shortage
                  </button>
                )}
              </div>
            )}

            {/* Each mode: one line per item, a running count against its
                quantity. The stage finishes itself once every item is
                packed in full, so there is no whole-job tick here. Not
                capped by the laser stage the way a Production card would
                be: this screen exists so packing starts while cutting is
                still going. */}
            {perItem && taken && canPack && (
              <div style={{ marginTop: 10 }}>
                <div style={S.label}>Packed so far</div>
                <div style={{ marginTop: 4 }}>
                  <ItemProgress
                    process={r.process}
                    job={r.job}
                    quoteItems={r.quoteItems || []}
                    itemProgress={r.itemProgress || []}
                    onSubmit={(process, job, item, qty, progress) => onLogItem(r, item, qty, progress)}
                  />
                </div>
                <div style={S.roleHint}>This job leaves the screen on its own once every item is packed in full.</div>
              </div>
            )}
            {perItem && !taken && canPack && (
              <div style={S.roleHint}>Packed item by item on this job. Take it to start logging.</div>
            )}

            {!canPack && !taken && r.process && <div style={S.roleHint}>Only packers can take a job.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
