// A program's Tool crib tab (Heinrich, 8 Oct 2026): the turret T1 to T8 the
// program is made with. The engine picks it automatically; here it is
// reviewed and changed: a tool moved up or down a station, changed, added
// to an empty station, removed. "Make program with this crib" makes the
// program again with exactly that layout and shows what changed; Save
// keeps it as the next revision, and the layout stays with the program
// until it is changed again or handed back to the automatic pick.
// Tools not owned are marked, and the engine's warnings about the crib
// (a tool it had to place, a rule broken, a tool not owned) are listed.
// Changing needs the CNC Edit tick.

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { loadToolpath, runUpdate, saveUpdate } from "./cncData.js";
import { loadMachines, loadTools } from "./cncTables.js";
import { cribWarnings, layoutFrom, moveStation, putTool, removeTool, sameLayout, STATIONS, toTurret } from "./cribRules.js";
import { oNumber, revisionLetter } from "./cncRules.js";
import { toolLine } from "./toolKinds.js";
import ProgramChanges from "./ProgramChanges.jsx";

const minSec = (s) => (s == null ? "–" : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

export default function ToolCribTab({ program, revisions, current, materials, canEdit, userName, answers, setAnswers, onSaved }) {
  const answer = current ? answers[current.id] : null;
  const [tools, setTools] = useState(null);
  const [layout, setLayout] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [run, setRun] = useState(null);

  useEffect(() => {
    loadMachines()
      .then((ms) => (ms[0] ? loadTools(ms[0].id) : []))
      .then(setTools)
      .catch((err) => setError(`The tools could not be loaded: ${err.message || err}`));
  }, []);

  useEffect(() => {
    if (!current || answers[current.id]) return undefined;
    let gone = false;
    loadToolpath({ program, rev: current })
      .then((a) => !gone && setAnswers((x) => ({ ...x, [current.id]: a })))
      .catch((err) => !gone && setError(err.message || String(err)));
    return () => {
      gone = true;
    };
  }, [current?.id]);

  const saved = layoutFrom(program.settings?.turret, answer?.setup?.turret);
  useEffect(() => {
    if (answer && layout === null) setLayout(saved);
  }, [answer]);

  if (!current) return <div style={{ color: C.muted }}>No revision yet: press Update program first.</div>;
  if (error && !answer) return <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>;
  if (!answer || !tools || !layout) return <div style={S.empty}>Asking the engine for the tool crib…</div>;
  if (!answer.setup?.turret) {
    return <div style={{ color: C.muted, fontSize: 14 }}>The engine does not hand out its tool layout yet: the Tool crib works once its next update is live.</div>;
  }

  const byKey = Object.fromEntries(tools.map((t) => [t.tool_key, t]));
  const useOf = (key) => (answer.setup.tools || []).find((t) => t.tool_key === key);
  const options = tools.map((t) => ({ value: t.tool_key, label: t.data?.name || t.tool_key, hint: `${toolLine(t)}${t.owned ? "" : " · not owned"}` }));
  const changed = !sameLayout(layout, saved);
  const own = !!program.settings?.turret;
  const material = (materials || []).find((m) => m.name === program.material) || null;
  const warnings = cribWarnings(run ? run.result : answer);

  async function make(turret) {
    setError("");
    setBusy("Making the program…");
    try {
      const quick = current.quick || program.quick || null;
      setRun(await runUpdate({ program, partName: program.part_name, current, material, settings: { ...(current.settings || {}), turret }, stepFile: null, quick }));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("Saving…");
    try {
      await saveUpdate({ program, run, letter: revisionLetter(revisions.length), partName: program.part_name, customer: program.customer, material, userName });
      setRun(null);
      setLayout(null);
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
      setBusy("");
    }
  }

  if (run) {
    const r = run.result;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
        <div style={{ color: r.ready ? C.accentFinished : C.danger, fontWeight: 600 }}>{r.ready ? "Ready for the machine" : `Not for machine: ${(r.fails || []).join("; ")}`}</div>
        <div>
          Cycle time {minSec(r.cycle_s)} (rev {current.rev}: {minSec(current.cycle_s)})
        </div>
        {warnings.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, color: C.accentRaw }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        <ProgramChanges before={current.programs || []} after={r.programs || []} />
        {error && <div style={{ color: C.danger }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 0 }} onClick={save} disabled={!!busy}>
            {busy || `Save as rev ${revisionLetter(revisions.length)}`}
          </button>
          <button type="button" className="stk-btn" style={S.chip} onClick={() => setRun(null)} disabled={!!busy}>
            Back to the crib
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, color: C.muted }}>
        {own ? "This program's own layout (kept with it)." : "The engine's automatic pick."} {oNumber(program.program_no)}, rev {current.rev}.
      </div>
      {STATIONS.map((st, i) => {
        const key = layout[i];
        const t = key ? byKey[key] : null;
        const use = key ? useOf(key) : null;
        return (
          <div key={st} style={{ display: "flex", gap: 8, alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "6px 0", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, width: 26 }}>T{st}</div>
            <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: 14 }}>
              {key ? (
                <>
                  <b>{t?.data?.name || key}</b>
                  {t && !t.owned && <span style={{ color: C.accentRaw, fontWeight: 600 }}> · Not owned</span>}
                  <div style={{ fontSize: 12.5, color: C.muted }}>
                    {t ? toolLine(t) : "not on this machine's tool list"}
                    {use?.used ? ` · ${(use.ops || []).join(", ")}${use.sides?.length ? ` · side ${use.sides.join(", ")}` : ""}` : use ? " · not used by this program" : ""}
                  </div>
                </>
              ) : (
                <span style={{ color: C.muted }}>empty</span>
              )}
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button type="button" className="stk-btn" style={{ ...S.chip, padding: "4px 8px" }} title="Move up a station" disabled={i === 0} onClick={() => setLayout(moveStation(layout, i, -1))}>
                  <ArrowUp size={13} />
                </button>
                <button type="button" className="stk-btn" style={{ ...S.chip, padding: "4px 8px" }} title="Move down a station" disabled={i === 7} onClick={() => setLayout(moveStation(layout, i, 1))}>
                  <ArrowDown size={13} />
                </button>
                <div style={{ width: 180 }}>
                  <TypeToFind options={options} value={key || ""} onChange={(v) => setLayout(putTool(layout, i, v || null))} placeholder={key ? "Change…" : "Add…"} />
                </div>
                {key && (
                  <button type="button" className="stk-btn" style={{ ...S.chip, padding: "4px 8px", color: C.danger }} title="Take it off the turret" onClick={() => setLayout(removeTool(layout, i))}>
                    <X size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {warnings.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: C.accentRaw }}>
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      {canEdit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 0 }} disabled={!!busy || !changed} onClick={() => make(toTurret(layout))}>
            {busy || "Make program with this crib"}
          </button>
          {changed && (
            <button type="button" className="stk-btn" style={S.chip} onClick={() => setLayout(saved)}>
              Undo changes
            </button>
          )}
          {own && !changed && (
            <button type="button" className="stk-btn" style={S.chip} disabled={!!busy} onClick={() => make(null)} title="Hand the layout back to the engine's automatic pick">
              Automatic
            </button>
          )}
        </div>
      )}
    </div>
  );
}
