// Turn around (Heinrich, 8 Oct 2026: "a turn operation button to turn any
// operation around, also a good test to see what works better"). The
// engine makes the program both ways, side 1 from the model's 0 end and
// from its L end (setting side1), and the two are shown side by side:
// Ready, cycle time, price per part, warnings, each program's text behind
// a shut line (no line comparison: a turned program differs everywhere,
// his answer). Keep this one saves it as the next revision like Update
// program, and the end stays set on later updates (side1, his answer).
// Nothing is saved unless Keep is pressed.
// Clicks: open the program, Turn around, Keep.
// The other end that comes out the same as the current revision (a part
// the same both ways) offers no Keep (Heinrich, 9 Oct 2026).

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, F, S } from "../theme.js";
import { runUpdate, saveUpdate, updateChanges } from "./cncData.js";
import { faultText, handEditsNote, oNumber, rand, revisionLetter } from "./cncRules.js";

const minSec = (s) => (s == null ? "–" : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const words = (x) => (typeof x === "string" ? x : x?.text || JSON.stringify(x));
const sameText = (a = [], b = []) =>
  a.length === b.length && a.every((p, i) => String(p.text).replace(/\r\n?/g, "\n") === String(b[i]?.text ?? "").replace(/\r\n?/g, "\n"));

const ENDS = [
  { side1: "0", label: "Side 1 from the model's 0 end" },
  { side1: "L", label: "Side 1 from the model's L end" },
];

export default function TurnAround({ program, revisions, current, materials, canSeeValue, userName, onCancel, onSaved }) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(null);
  const letter = revisionLetter(revisions.length);
  const material = (materials || []).find((m) => m.name === program.material) || null;
  const base = current?.settings || program.settings || {};

  useEffect(() => {
    let gone = false;
    if (!material) {
      setError(`"${program.material}" is not on the CNC Bar Grades list any more: pick a grade with Update program first.`);
      return undefined;
    }
    const quick = current?.quick || program.quick || null;
    const run = (e, step) =>
      runUpdate({ program, partName: program.part_name, current, material, settings: { ...base, side1: e.side1 }, stepFile: null, quick, step });
    // One after the other, so the second run uses the STEP the first read.
    run(ENDS[0], null)
      .then(async (first) => [first, await run(ENDS[1], first.step)])
      .then((r) => !gone && setRuns(r))
      .catch((err) => !gone && setError(err.message || String(err)));
    return () => {
      gone = true;
    };
  }, []);

  // Which way it is made now: the end it was set to, or, left to the engine,
  // the one whose program comes out the same as the current revision's.
  const asNow = runs
    ? base.side1
      ? ENDS.findIndex((e) => e.side1 === String(base.side1))
      : runs.findIndex((r) => sameText(r.result.programs || [], current?.programs || []))
    : -1;

  async function keep(i) {
    setError("");
    setSaving(i);
    try {
      await saveUpdate({ program, run: runs[i], letter, partName: program.part_name, customer: program.customer, material, userName });
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
      setSaving(null);
    }
  }

  return (
    <div style={S.list}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="stk-btn" style={S.chip} onClick={onCancel} disabled={saving != null}>
          <ArrowLeft size={14} /> {oNumber(program.program_no)}
        </button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Turn around{current ? ` (now rev ${current.rev})` : ""}</div>
      </div>
      {!runs && !error && <div style={S.empty}>Making it both ways…</div>}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      {runs && handEditsNote(current) && <div style={{ color: C.danger, fontSize: 14, fontWeight: 600 }}>{handEditsNote(current)}</div>}
      {runs && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          {runs.map((run, i) => {
            const r = run.result;
            const cost = r.costing || null;
            return (
              <div key={ENDS[i].side1} style={{ border: `1px solid ${i === asNow ? C.accentFinished : C.border}`, borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
                <div style={{ fontWeight: 700 }}>
                  {ENDS[i].label}
                  {i === asNow ? <span style={{ color: C.accentFinished }}> (as now)</span> : null}
                </div>
                <div style={{ color: r.ready ? C.accentFinished : C.danger, fontWeight: 600 }}>
                  {r.ready ? "Ready for the machine" : `Not for machine: ${faultText(r)}`}
                </div>
                <div>Cycle time {minSec(r.cycle_s)}</div>
                {canSeeValue && cost && (
                  <div>
                    Per part {rand(cost.price_per_part)} (batch of {cost.qty ?? base.qty ?? 1}) · 1-off {rand(cost.one_off_price)}
                  </div>
                )}
                <div>{(r.programs || []).length === 2 ? "Two programs (side 1, side 2)" : "One program"}</div>
                {(r.warnings || []).length > 0 && (
                  <div>
                    <div style={{ color: C.accentRaw, fontWeight: 600 }}>Warnings</div>
                    <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>
                      {r.warnings.map((w, k) => (
                        <li key={k}>{words(w)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <details>
                  <summary style={{ cursor: "pointer" }}>Program text</summary>
                  {(r.programs || []).map((p) => (
                    <pre key={p.number} style={{ fontFamily: F.mono, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, maxHeight: 360, overflow: "auto", whiteSpace: "pre" }}>
                      {p.text}
                    </pre>
                  ))}
                </details>
                {i === asNow ? (
                  <div style={{ color: C.muted, fontSize: 13 }}>This is how it is made now.</div>
                ) : updateChanges(current, run, ["side1"]).length === 0 ? (
                  <div style={{ color: C.muted, fontSize: 13 }}>Comes out the same as rev {current?.rev}: nothing to keep.</div>
                ) : (
                  <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 4 }} disabled={saving != null} onClick={() => keep(i)}>
                    {saving === i ? "Saving…" : `Keep this one (rev ${letter})`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
