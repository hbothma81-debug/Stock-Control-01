// Edit on the Program tab (Heinrich, 9 Oct 2026: "an edit button on the
// program display to edit the text in the app"). The revision on screen
// opens as text boxes, one per program; the changed lines show underneath
// as they are typed. Save has the engine check the text as it checks a
// machine copy (rapids, jaws, spindle, clearance, travel, cycle time,
// price) and keeps it as the next revision, marked Edited. Ready or Not
// for machine is the engine's check (his answer). An engine that cannot be
// reached saves nothing: the text stays in the boxes for another Save.
// CNC Edit tick only (ProgramView shows the button).
// Clicks: open the program, Edit, type, Save.

import { useDeferredValue, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, F, S } from "../theme.js";
import { checkMachineCopy, saveEdit } from "./cncData.js";
import { editProblems, oNumber, revisionLetter } from "./cncRules.js";
import ProgramChanges from "./ProgramChanges.jsx";

// A program's lines as lineDiff reads them: line endings (CR LF off the
// machine, LF from the engine) and a last empty line are not changes.
const sameText = (a, b) => {
  const norm = (t) => String(t ?? "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
  return norm(a) === norm(b);
};

export default function EditProgram({ program, revisions, current, base, userName, onCancel, onSaved }) {
  const [texts, setTexts] = useState(() => (base.programs || []).map((p) => String(p.text ?? "")));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const letter = revisionLetter(revisions.length);
  const programs = (base.programs || []).map((p, i) => ({ ...p, text: texts[i] }));
  // The change list follows the typing a beat behind, so a long program
  // never makes the boxes lag.
  const shownTexts = useDeferredValue(texts);
  const shownPrograms = (base.programs || []).map((p, i) => ({ ...p, text: shownTexts[i] }));
  const changed = programs.some((p, i) => !sameText(p.text, base.programs[i].text));
  const problems = editProblems(programs);
  const canSave = changed && !problems.length && !busy;

  async function save() {
    if (!canSave) return;
    setError("");
    const sent = programs.map(({ number, text }) => ({ number, text }));
    let check;
    try {
      setBusy("Checking with the engine…");
      check = await checkMachineCopy({ program, current: base, programs: sent });
    } catch (err) {
      setError(`The engine could not check it, so nothing was saved: ${err.message || err} Press Save to try again.`);
      setBusy("");
      return;
    }
    try {
      setBusy("Saving…");
      await saveEdit({ program, base, programs: sent, check, userName });
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
      setBusy("");
    }
  }

  return (
    <div style={S.list}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="stk-btn" style={S.chip} onClick={onCancel} disabled={!!busy}>
          <ArrowLeft size={14} /> {oNumber(program.program_no)}
        </button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>
          Edit rev {base.rev}
          {base.id !== current?.id ? ` (an older revision; now rev ${current?.rev})` : ""}
        </div>
      </div>
      <div style={{ fontSize: 13.5, color: C.muted }}>
        Saved as rev {letter} (edited). The engine checks it on Save: Ready or Not for machine is its answer. Rev {base.rev} is kept.
      </div>

      {programs.map((p, i) => (
        <div key={p.number}>
          {programs.length > 1 && (
            <div style={{ fontWeight: 700, margin: "6px 0" }}>
              Side {i + 1}: {oNumber(p.number)}
            </div>
          )}
          <textarea
            value={texts[i]}
            onChange={(e) => {
              const v = e.target.value;
              setTexts((t) => t.map((x, k) => (k === i ? v : x)));
            }}
            disabled={!!busy}
            spellCheck={false}
            autoCapitalize="characters"
            autoCorrect="off"
            wrap="off"
            rows={Math.min(30, Math.max(8, texts[i].split("\n").length + 1))}
            style={{
              ...S.input,
              fontFamily: F.mono,
              fontSize: 12.5,
              lineHeight: 1.45,
              background: C.surface,
              whiteSpace: "pre",
              overflow: "auto",
              resize: "vertical",
            }}
          />
        </div>
      ))}

      {problems.map((x) => (
        <div key={x} style={{ color: C.danger, fontSize: 14 }}>
          {x}
        </div>
      ))}
      {changed ? (
        <ProgramChanges before={base.programs || []} after={shownPrograms} />
      ) : (
        <div style={{ color: C.muted, fontSize: 14 }}>No change yet from rev {base.rev}.</div>
      )}
      {busy && <div style={S.empty}>{busy}</div>}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="stk-btn"
          style={{ ...S.submitBtn, marginTop: 0, flex: 1, ...(canSave ? {} : S.submitBtnDisabled) }}
          disabled={!canSave}
          onClick={save}
        >
          {busy || `Save as rev ${letter}`}
        </button>
        <button type="button" className="stk-btn" style={S.chip} onClick={onCancel} disabled={!!busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
