import { useState, useMemo } from "react";
import { C, S } from "../theme.js";
import Section from "./Section.jsx";

// Every shortage across every job, in one place.
//
// Moved out of its own top-level tab and in here beside Nesting and
// Cutting, because that is where a shortage is now dealt with: it goes on
// a program like anything else, and the program being cut is what
// resolves it. Having the list somewhere else meant leaving this tab to
// look at it and coming back to act on it.
//
// This is a list to read, not to act on. The one action a shortage needs
// -- putting it on a program -- lives on the Nesting screen, so the two
// are now one tab apart rather than one tab away.

export default function ShortageCentre({ shortages, summarise, onGoToNesting }) {
  const [query, setQuery] = useState("");

  const { open, resolved } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (s) =>
      !q ||
      (s.job_number || "").toLowerCase().includes(q) ||
      (s.customer || "").toLowerCase().includes(q) ||
      (s.board_number || "").toLowerCase().includes(q);
    const all = shortages || [];
    return {
      open: all.filter((s) => s.status !== "cut").filter(matches),
      resolved: all.filter((s) => s.status === "cut").filter(matches),
    };
  }, [shortages, query]);

  const statusLabel = { flagged: "Needs nesting", nested: "On its way — needs cutting" };

  if (shortages === null) return <div style={S.empty}>Loading…</div>;

  return (
    <div style={S.list}>
      <input
        style={S.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by job number, customer or SigmaNest number…"
      />

      <Section title="Open shortages" count={open.length}>
        {open.length === 0 ? (
          <div style={S.empty}>
            {query.trim() ? "Nothing open matches that." : "Nothing outstanding — every shortage has been cut."}
          </div>
        ) : (
          open.map((s) => (
            <div key={s.id} style={{ ...S.reqCard, borderColor: C.danger, borderWidth: 2 }}>
              <div style={S.reqCardTop}>
                <span style={S.itemName}>
                  {s.job_number} — {s.customer || "No customer"}
                </span>
                <span style={{ ...S.reqStatusTag, ...S.reqStatus_ordered }}>{statusLabel[s.status] || s.status}</span>
              </div>
              <div style={{ ...S.itemComment, marginTop: 2 }}>
                {summarise(s)} {s.board_number && `— SigmaNest ${s.board_number}`}
              </div>
              <div className="stk-meta-row" style={S.rowMeta}>
                <span>Reason: {s.reason}</span>
                <span>
                  Flagged by {s.flagged_by} ({s.flagged_department})
                </span>
                <span>{new Date(s.created_at).toLocaleString()}</span>
                {s.status === "nested" && <span>Nested by {s.nested_by}</span>}
              </div>
              {s.status === "flagged" && (
                <div style={{ ...S.roleHint, marginTop: 4 }}>
                  Waiting to go on a program. Put it on one from the Nesting screen and it is nested; cutting that
                  program is what closes it.
                </div>
              )}
            </div>
          ))
        )}
      </Section>

      {resolved.length > 0 && (
        <Section title="Resolved" count={resolved.length} collapsible defaultOpen={false}>
          {resolved.map((s) => (
            <div key={s.id} style={S.reqCard}>
              <div style={S.reqCardTop}>
                <span style={S.itemName}>
                  {s.job_number} — {s.customer || "No customer"}
                </span>
                <span style={{ ...S.reqStatusTag, ...S.reqStatus_received }}>Cut</span>
              </div>
              <div style={{ ...S.itemComment, marginTop: 2 }}>
                {summarise(s)} {s.board_number && `— SigmaNest ${s.board_number}`}
              </div>
              <div className="stk-meta-row" style={S.rowMeta}>
                <span>Flagged by {s.flagged_by}</span>
                <span>Nested by {s.nested_by}</span>
                {s.cut_at && (
                  <span>
                    Cut by {s.cut_by} on {new Date(s.cut_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      {onGoToNesting && open.some((s) => s.status === "flagged") && (
        <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, marginTop: 12 }} onClick={onGoToNesting}>
          Go to Nesting to put these on a program
        </button>
      )}
    </div>
  );
}
