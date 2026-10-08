// Import machine copy: pick the operator's edited program file(s) off the
// stick. Each is matched to this program by the O number inside; the
// engine checks the hand program against the model; the screen shows what
// the check found and what changed; Save keeps it as the next revision,
// marked Machine copy and Ready (Heinrich, 8 Oct 2026). The hand program
// wins: its text is saved exactly as it came off the machine.
// Clicks: open the program, Import machine copy, pick the files, Save.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, S } from "../theme.js";
import { checkMachineCopy, saveMachineCopy } from "./cncData.js";
import { matchMachineCopies, oNumber, revisionLetter } from "./cncRules.js";
import { changeCount, pairPrograms } from "./lineDiff.js";
import ProgramChanges from "./ProgramChanges.jsx";

const minSec = (s) => (s == null ? "–" : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const words = (x) => (typeof x === "string" ? x : x?.text || JSON.stringify(x));

export default function ImportMachineCopy({ program, revisions, current, userName, onCancel, onSaved }) {
  const [match, setMatch] = useState(null);
  const [check, setCheck] = useState(null);
  const [checkError, setCheckError] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const letter = revisionLetter(revisions.length);

  async function pick(fileList) {
    setError("");
    setCheck(null);
    setCheckError("");
    const files = await Promise.all([...(fileList || [])].map(async (f) => ({ name: f.name, text: await f.text() })));
    const m = matchMachineCopies(files, program.program_no, current?.programs || []);
    setMatch(m);
    if (!m.imported.length) return;
    setBusy("Checking with the engine…");
    try {
      setCheck(await checkMachineCopy({ program, current, programs: m.programs }));
    } catch (err) {
      setCheckError(err.message || String(err));
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setError("");
    setBusy("Saving…");
    try {
      await saveMachineCopy({
        program,
        current,
        programs: match.programs,
        check: check || { result: null, reason: checkError ? `The engine could not check it: ${checkError}` : "" },
        fileNames: match.imported.map((i) => i.fileName),
        userName,
      });
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
      setBusy("");
    }
  }

  const changed = match
    ? pairPrograms(current?.programs || [], match.programs).some((p) => {
        const c = changeCount(p.diff);
        return c.added + c.removed > 0;
      })
    : false;
  const r = check?.result || null;

  return (
    <div style={S.list}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="stk-btn" style={S.chip} onClick={onCancel} disabled={!!busy}>
          <ArrowLeft size={14} /> {oNumber(program.program_no)}
        </button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Import machine copy{current ? ` (now rev ${current.rev})` : ""}</div>
      </div>
      <div>
        <label style={S.label}>The program file(s) from the machine</label>
        <input type="file" multiple style={S.input} onChange={(e) => pick(e.target.files)} disabled={!!busy} />
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Matched by the O number inside each file. Pick both sides together if both were changed.
        </div>
      </div>

      {match && (
        <div style={{ fontSize: 14, display: "flex", flexDirection: "column", gap: 3 }}>
          {match.imported.map((i) => (
            <div key={i.number}>
              {oNumber(i.number)} from {i.fileName}
            </div>
          ))}
          {match.kept.map((n) => (
            <div key={n} style={{ color: C.muted }}>
              {oNumber(n)} not among the files: kept as rev {current?.rev}
            </div>
          ))}
          {match.refused.map((x) => (
            <div key={x.fileName} style={{ color: C.danger }}>
              {x.fileName} left out: {x.reason}
            </div>
          ))}
          {!match.imported.length && <div style={{ color: C.danger }}>None of these files is this program.</div>}
        </div>
      )}

      {busy === "Checking with the engine…" && <div style={S.empty}>{busy}</div>}
      {checkError && (
        <div style={{ color: C.danger, fontSize: 14 }}>The engine could not check it: {checkError} It can still be saved as text.</div>
      )}
      {check && !r && <div style={{ color: C.accentRaw, fontSize: 14 }}>{check.reason}</div>}
      {r && (
        <div style={{ fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {(r.fails || []).length ? (
            <div style={{ color: C.danger }}>
              <b>The engine's check found:</b> {(r.fails || []).map(words).join("; ")}. It is saved as Ready all the same, because it is what ran
              on the machine.
            </div>
          ) : (
            <div style={{ color: C.accentFinished, fontWeight: 600 }}>The engine's check found nothing wrong.</div>
          )}
          <div>
            Cycle time {minSec(r.cycle_s)}
            {current?.cycle_s != null ? ` (rev ${current.rev}: ${minSec(current.cycle_s)})` : ""}
          </div>
          {(r.changes || []).length > 0 && (
            <div>
              <b>Changes by tool</b>
              <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>
                {r.changes.map((c, i) => (
                  <li key={i}>
                    {c.tool ? `${c.tool}: ` : ""}
                    {c.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(r.differences || []).length > 0 && (
            <div>
              <b>Where the hand program and the model differ</b> (the program wins)
              <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>
                {r.differences.map((d, i) => (
                  <li key={i}>{words(d)}</li>
                ))}
              </ul>
            </div>
          )}
          {(r.warnings || []).length > 0 && <div style={{ color: C.accentRaw }}>{r.warnings.length} warning(s): see the Program tab after saving.</div>}
        </div>
      )}

      {match && match.imported.length > 0 && !busy.startsWith("Checking") && (
        <>
          <ProgramChanges before={current?.programs || []} after={match.programs} />
          {!changed && current && <div style={{ color: C.muted, fontSize: 14 }}>Exactly the same as rev {current.rev}: nothing to save.</div>}
          {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
          <button
            type="button"
            className="stk-btn"
            style={{ ...S.submitBtn, ...(changed || !current ? {} : S.submitBtnDisabled) }}
            disabled={!!busy || (!changed && !!current)}
            onClick={save}
          >
            {busy || `Save as rev ${letter} (machine copy)`}
          </button>
        </>
      )}
    </div>
  );
}
