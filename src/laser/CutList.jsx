import { useState, useMemo } from "react";
import { Check, Undo2 } from "lucide-react";
import { C, S } from "../theme.js";

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

export default function CutList({ programs, materials, canCut, onToggleCut, busyId }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter(
      (p) =>
        (p.program_number || "").toLowerCase().includes(q) ||
        (p.material || "").toLowerCase().includes(q) ||
        (p.jobs || []).some(
          (l) =>
            (l.job_number || "").toLowerCase().includes(q) ||
            (l.sigmanest_number || "").toLowerCase().includes(q)
        )
    );
  }, [programs, query]);

  const toCut = filtered.filter((p) => !p.is_complete);
  const cut = filtered.filter((p) => p.is_complete);

  // Material groups in the shop's own order. Anything on a program whose
  // material has since been taken off the list still has to appear, so
  // those fall in at the end rather than vanishing.
  const groups = useMemo(() => {
    const order = [...materials];
    for (const p of toCut) if (!order.includes(p.material)) order.push(p.material);
    return order
      .map((m) => ({ material: m, items: toCut.filter((p) => p.material === m) }))
      .filter((g) => g.items.length > 0);
  }, [toCut, materials]);

  return (
    <div style={S.list}>
      <input
        style={S.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a program, job number or SigmaNest number — to pull a rush job out of the queue…"
      />

      {toCut.length === 0 ? (
        <div style={S.empty}>
          {query.trim() ? "Nothing waiting matches that." : "Nothing waiting to be cut."}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.material} style={S.gradeBlock}>
            <div style={S.gradeHeader}>
              <span style={S.gradeTitle}>{g.material}</span>
              <span style={S.gradeCount}>{g.items.length}</span>
            </div>
            <div style={S.gradeItems}>
              {g.items.map((p) => (
                <ProgramRow key={p.id} program={p} canCut={canCut} onToggleCut={onToggleCut} busy={busyId === p.id} />
              ))}
            </div>
          </div>
        ))
      )}

      {cut.length > 0 && (
        <div style={S.gradeBlock}>
          <div style={S.gradeHeader}>
            <span style={S.gradeTitle}>Already cut</span>
            <span style={S.gradeCount}>{cut.length}</span>
          </div>
          <div style={S.gradeItems}>
            {cut.map((p) => (
              <ProgramRow key={p.id} program={p} canCut={canCut} onToggleCut={onToggleCut} busy={busyId === p.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProgramRow({ program, canCut, onToggleCut, busy }) {
  const p = program;
  return (
    <div style={S.row}>
      <div style={S.rowMain}>
        <span style={{ ...S.itemName, fontSize: 17, letterSpacing: "0.02em" }}>{p.program_number}</span>
        <div style={S.rowMeta}>
          <span style={S.partTag}>{p.material}</span>
          {p.machine && <span style={S.partTag}>{p.machine}</span>}
        </div>
        <div style={{ ...S.chipRow, marginTop: 4 }}>
          {(p.jobs || []).length === 0 ? (
            <span style={S.roleHint}>No jobs on this program.</span>
          ) : (
            (p.jobs || []).map((l) => (
              <span key={l.id} style={S.chip}>
                {l.job_number || "unknown job"}
                {l.sigmanest_number ? ` · ${l.sigmanest_number}` : ""}
              </span>
            ))
          )}
        </div>
        {p.is_complete && p.completed_by && (
          <div style={S.roleHint}>
            Cut by {p.completed_by}
            {p.completed_at ? ` — ${new Date(p.completed_at).toLocaleString()}` : ""}
          </div>
        )}
      </div>

      {canCut && (
        <div style={S.rowControls}>
          {p.is_complete ? (
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
        </div>
      )}
    </div>
  );
}
