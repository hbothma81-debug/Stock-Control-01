// A program's History tab (Heinrich, 8 Oct 2026: "a program history tab
// for safety to see who changed what"): who did what and when, newest
// first, one line per save, opened for every change old → new. The lines
// are written by the database (setup-cnc-13-program-history.sql), so
// nothing here saves anything. Read when the tab opens and again after
// the program is saved (its updated_at moves). Money only with "Can see
// Rand values".

import { useEffect, useState } from "react";
import { C, S } from "../theme.js";
import { loadHistory } from "./cncData.js";
import { changeWords, entryHeadline, historyEntries } from "./historyRules.js";

const when = (iso) =>
  new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function HistoryTab({ program, canSeeValue }) {
  const [rows, setRows] = useState(undefined);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let gone = false;
    setError("");
    loadHistory(program.id)
      .then((r) => !gone && setRows(r))
      .catch((err) => !gone && setError(err.message || String(err)));
    return () => {
      gone = true;
    };
  }, [program.id, program.updated_at]);

  if (error) return <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>;
  if (rows === undefined) return <div style={S.empty}>Loading the history…</div>;
  if (rows === null) return <div style={{ color: C.muted, fontSize: 14 }}>The history is not set up on this database yet.</div>;
  const entries = historyEntries(rows);
  if (!entries.length) return <div style={S.empty}>Nothing recorded yet.</div>;

  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>
        {entries.length} {entries.length === 1 ? "entry" : "entries"}, newest first{rows.length >= 500 ? " (the latest 500 changes)" : ""}. Tap one for every change.
      </div>
      {entries.map((e, i) => {
        const lines = e.changes.map((c) => changeWords(c, { canSeeValue })).filter(Boolean);
        const isOpen = open === i;
        return (
          <div key={e.rows[0].id} style={{ borderBottom: `1px solid ${C.border}` }}>
            <button
              type="button"
              className="stk-btn"
              onClick={() => setOpen(isOpen ? null : i)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "9px 4px", color: C.text, fontSize: 14, cursor: "pointer" }}
            >
              <span style={{ color: C.muted }}>{when(e.at)}</span> · <b>{e.who || "unknown"}</b> · {entryHeadline(e, { canSeeValue })}
            </button>
            {isOpen && (
              <ul style={{ margin: "0 0 8px", paddingLeft: 22, fontSize: 13.5 }}>
                {lines.length ? lines.map((l, j) => <li key={j}>{l}</li>) : <li style={{ color: C.muted }}>Nothing more recorded.</li>}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
