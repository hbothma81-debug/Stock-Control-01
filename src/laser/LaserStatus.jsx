import { useState, useMemo } from "react";
import { Check, Hand, AlertTriangle } from "lucide-react";
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
  busyId,
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.job.job_number || "").toLowerCase().includes(q) ||
        (r.job.customer || "").toLowerCase().includes(q) ||
        (r.job.laser_job_reference || "").toLowerCase().includes(q) ||
        (r.packerName || "").toLowerCase().includes(q) ||
        r.programs.some((p) => (p.program_number || "").toLowerCase().includes(q))
    );
  }, [rows, query]);

  return (
    <div style={S.list}>
      <input
        style={S.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a job, customer, program or packer…"
      />

      {filtered.length === 0 ? (
        <div style={S.empty}>
          {query.trim()
            ? "Nothing matches that."
            : "Nothing off the laser yet. A job appears here as soon as its first program is cut."}
        </div>
      ) : (
        filtered.map((r) => {
          const laser = laserState(r.programs);
          // A job can reach here with no packing stage at all, when nobody
          // ticked Packer as the job was built.
          const taken = !!r.process?.started_at;
          const busy = !!r.process && busyId === r.process.id;
          return (
            <div key={r.job.id} style={{ ...S.deptCard, borderColor: taken ? C.accentRaw : C.border }}>
              <div style={S.deptCardHead}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{r.job.job_number}</span>
                <span style={S.roleHint}>
                  {r.job.customer || "No customer"}
                  {r.job.laser_job_reference ? ` · ${r.job.laser_job_reference}` : ""}
                  {r.job.due_date ? ` · due ${new Date(r.job.due_date).toLocaleDateString()}` : ""}
                </span>
              </div>

              {/* ---- laser side: worked out, never typed in ---- */}
              <div style={{ marginTop: 10 }}>
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
                          borderColor: p.is_complete ? C.accentFinished : C.border,
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.danger }}>
                    This job has no packing stage
                  </div>
                ) : (
                  <div style={{ fontSize: 14, fontWeight: 600, color: taken ? C.accentRaw : C.muted }}>
                    {taken ? `In process — ${r.packerName || "someone"}` : "Waiting for a packer"}
                  </div>
                )}
                {!r.process && (
                  <div style={S.roleHint}>
                    Its parts are coming off the laser, but Packer was never added to this job — so nothing here can
                    be taken, and nothing after packing will open. Open the job, press Edit processes, and add it.
                  </div>
                )}
                {taken && r.process?.started_at && (
                  <div style={S.roleHint}>Taken {new Date(r.process.started_at).toLocaleString()}</div>
                )}
                {taken && (
                  <div style={{ ...S.roleHint, color: C.accentRaw }}>
                    The stages after packing are open for this job.
                  </div>
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

                    {taken && (
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
                        nest, so this is where a shortage gets raised. */}
                    <button
                      type="button"
                      className="stk-btn"
                      style={{ ...S.reqActionBtnMuted, color: C.danger, borderColor: C.danger }}
                      onClick={() => onFlagShortage(r)}
                    >
                      <AlertTriangle size={13} /> Flag shortage
                    </button>
                  </div>
                )}

                {!canPack && !taken && r.process && (
                  <div style={S.roleHint}>Only packers can take a job.</div>
                )}
              </div>
            </div>
          );
        })
      )}

      <div style={S.roleHint}>
        A job leaves this screen once it is marked packed and checked. Taking a job is what opens the stages after
        packing — the job does not have to be finished first.
      </div>
    </div>
  );
}
