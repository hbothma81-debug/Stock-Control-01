import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { C, S } from "../theme.js";
import Section from "../Section.jsx";
import RecordRow from "../RecordRow.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { loadCrashes, splitByAge, crashMatchesSearch, crashWho, deviceInWords, KEEP_DAYS, RECENT_DAYS, LIST_LIMIT } from "../lib/appErrors.js";

// Stock Manager -> App errors: every crash the crash screen has caught
// (src/ErrorBoundary.jsx writes them down, src/lib/appErrors.js holds the
// rules). Admins only, by Heinrich's answer (27 Sep 2026); the database
// lets nobody else read a line either.
//
// Read when the screen is opened and when Refresh is pressed, never on a
// timer. Nothing here can be edited or deleted: the table clears lines
// older than 90 days by itself.

const when = (iso) =>
  new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const S2 = {
  words: { fontSize: 13, color: C.text, wordBreak: "break-word" },
  details: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: 8,
    margin: "6px 0 0",
    color: C.muted,
    fontSize: 11.5,
    fontFamily: "ui-monospace, Consolas, monospace",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 220,
    overflowY: "auto",
  },
};

function CrashLine({ row, who }) {
  return (
    <RecordRow title={row.heading} summary={`${who} · ${when(row.happened_at)}`}>
      <div style={S2.words}>{row.message || "No message was kept."}</div>
      <div className="stk-meta-row" style={{ ...S.rowMeta, marginTop: 6 }}>
        {row.device && <span>{deviceInWords(row.device)}</span>}
        {row.site && <span>{row.site}</span>}
        {row.app_build && <span>Build {row.app_build}</span>}
        {row.user_email && row.user_email !== who && <span>{row.user_email}</span>}
      </div>
      {row.details && <pre style={S2.details}>{row.details}</pre>}
    </RecordRow>
  );
}

export default function AppErrors({ people }) {
  // null while the first read is out.
  const [answer, setAnswer] = useState(null);
  const [typed, setTyped] = useState("");
  const [reading, setReading] = useState(false);

  async function read() {
    setReading(true);
    try {
      setAnswer(await loadCrashes(supabase));
    } catch (err) {
      setAnswer({ rows: [], failed: err?.message || String(err) });
    } finally {
      setReading(false);
    }
  }

  useEffect(() => {
    read();
  }, []);

  if (answer === null) return <div style={S.empty}>Loading…</div>;

  if (answer.notSetUp) {
    return (
      <div style={S.empty}>
        Not set up on this database yet. The crash screen still works; crashes are only not written down until
        setup-app-errors.sql has been run.
      </div>
    );
  }

  const now = Date.now();
  const shown = answer.rows.filter((r) => crashMatchesSearch(r, typed, crashWho(r, people)));
  const { recent, older } = splitByAge(shown, now);
  const searching = typed.trim() !== "";

  return (
    <>
      <div style={S.roleHint}>
        Every time a screen crashed and the red box or the crash page came up, newest first. Kept for {KEEP_DAYS} days.
        A line is written once in ten minutes for the same crash on the same device.
      </div>

      <div style={{ ...S.managerAddRow, marginTop: 10 }}>
        <input
          style={{ ...S.input, flex: 1 }}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Search job number, screen, person or the error's words…"
        />
        <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={read} disabled={reading}>
          <RefreshCw size={13} /> {reading ? "Reading…" : "Refresh"}
        </button>
      </div>

      {answer.failed && (
        <div style={{ ...S.empty, color: C.danger }}>
          Couldn't read the list — check your signal and press Refresh. Do not read this as no crashes. ({answer.failed})
        </div>
      )}

      {!answer.failed && answer.rows.length === 0 && <div style={S.empty}>No crashes in the last {KEEP_DAYS} days.</div>}

      {!answer.failed && answer.rows.length > 0 && (
        <>
          {/* While something is typed both pills open, so a match in the
              older one is not hidden behind a shut heading. The key makes
              a shut pill open when typing starts. */}
          <Section key={`recent-${searching}`} title={`Last ${RECENT_DAYS} days`} count={recent.length} danger={recent.length > 0 && !searching}>
            {recent.length === 0 ? (
              <div style={S.empty}>{searching ? "Nothing matches." : `Nothing in the last ${RECENT_DAYS} days.`}</div>
            ) : (
              recent.map((r) => <CrashLine key={r.id} row={r} who={crashWho(r, people)} />)
            )}
          </Section>
          <Section key={`older-${searching}`} title="Older" count={older.length} defaultOpen={searching && older.length > 0}>
            {older.length === 0 ? (
              <div style={S.empty}>{searching ? "Nothing matches." : "Nothing older."}</div>
            ) : (
              older.map((r) => <CrashLine key={r.id} row={r} who={crashWho(r, people)} />)
            )}
          </Section>
          {answer.full && (
            <div style={{ ...S.roleHint, marginTop: 8 }}>
              Showing the newest {LIST_LIMIT}. There are more: that many crashes is itself worth telling Claude about.
            </div>
          )}
        </>
      )}
    </>
  );
}
