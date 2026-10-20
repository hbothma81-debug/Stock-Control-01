// + Add operation, from the Steps tab (Heinrich 20 Oct 2026: "under steps
// lets say I want to add knurling between N4 and N5, or I want to add a
// thread" - 1 the Steps tab, 2 the engine decides, 3 both). The same lines
// as New program's "Holes, threads and knurls".
//
// On the engine's own revision the engine makes the program again with the
// new lines and places them by its standard order (as Update program). On a
// machine copy or an edit the text is kept - it ran on the machine: the
// engine makes only the new tool block, it goes in after the block picked,
// and the joined program is checked as an edit (turnpath insert_op.py).
// What else the engine would change for it (a knurl's pre-turn, a reamer's
// pre-size drill) is listed; that program does not get it.
// Clicks: Steps, + Add operation, the kind, its size, Make it, Save (one more
// on a kept revision: Put it after).

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, S } from "../theme.js";
import { insertOperation, runUpdate, saveEdit, saveUpdate } from "./cncData.js";
import { faultText, oNumber, saveLetter } from "./cncRules.js";
import { INSERT_KIND, withLines } from "./holesThreads.js";
import HolesThreads from "./HolesThreads.jsx";
import ProgramChanges from "./ProgramChanges.jsx";

const HEADER = /^\s*N(\d+)\s*\((?!\s*WS )([^)]*)\)/;

// The tool blocks of a revision's programs, with the work offset in force.
function blocksOf(programs) {
  const out = [];
  for (const p of programs || []) {
    let off = "";
    for (const line of String(p.text || "").split(/\r?\n/)) {
      const o = line.match(/G5[45]/);
      const m = line.match(HEADER);
      if (m) out.push({ number: p.number, n: Number(m[1]), name: m[2].trim(), off });
      if (o) {
        off = o[0];
        if (out.length && out[out.length - 1].number === p.number) out[out.length - 1].off = off;
      }
    }
  }
  return out;
}

export default function AddOperation({ program, revisions, current, base, materials, userName, onCancel, onSaved }) {
  const [form, setForm] = useState({ holes: [] });
  const [after, setAfter] = useState("");
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const kept = base.source && base.source !== "generated";
  const letter = saveLetter(revisions, current);
  const material = (materials || []).find((m) => m.name === program.material) || null;
  const lines = form.holes || [];
  const blocks = blocksOf(base.programs);
  const one = lines.length === 1 ? lines[0] : null;
  const kind = one ? INSERT_KIND[one.type] : null;
  const canMake = lines.length > 0 && !busy && (!kept || (kind && after)) && (kept || material);

  async function make() {
    setError("");
    setRun(null);
    const { settings, errors } = withLines(base.settings || program.settings || {}, lines);
    if (errors.length) {
      setError(`Check ${errors.join(", ")}.`);
      return;
    }
    try {
      setBusy("The engine is making it…");
      if (kept) {
        const [number, n] = after.split(":");
        setRun({ kept: true, ...(await insertOperation({ program, base, newSettings: settings, kind, after: { number: Number(number), n: Number(n) } })) });
      } else {
        const quick = base.quick || program.quick || null;
        setRun({ kept: false, ...(await runUpdate({ program, partName: program.part_name, current: base, material, settings, stepFile: null, quick })) });
      }
    } catch (err) {
      setError(err.message || String(err));
    }
    setBusy("");
  }

  async function save() {
    if (!run) return;
    setError("");
    try {
      setBusy("Saving…");
      if (run.kept) {
        const programs = run.result.programs.map(({ number, text }) => ({ number, text }));
        await saveEdit({ program, base, programs, check: run, userName });
      } else {
        await saveUpdate({ program, run, letter, partName: program.part_name, customer: program.customer, material, userName });
      }
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
      setBusy("");
    }
  }

  const r = run?.result || null;
  return (
    <div style={S.list}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="stk-btn" style={S.chip} onClick={onCancel} disabled={!!busy}>
          <ArrowLeft size={14} /> {oNumber(program.program_no)}
        </button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Add an operation to rev {base.rev}</div>
      </div>
      <div style={{ fontSize: 13.5, color: C.muted }}>
        {kept
          ? `Rev ${base.rev} is a ${base.source === "machine_copy" ? "machine copy" : "program edited in the app"}: its text is kept. The engine makes only the new tool block and it goes in after the block you pick. One operation at a time.`
          : `The engine makes the program again with it and puts it where the standard order says. Saved as rev ${letter}; rev ${base.rev} is kept.`}
      </div>
      <HolesThreads form={form} setForm={(fn) => { setRun(null); setForm(fn); }} />
      {kept && (
        <div style={{ maxWidth: 420 }}>
          <label style={S.label}>Put it after</label>
          <select style={S.input} value={after} onChange={(e) => { setRun(null); setAfter(e.target.value); }}>
            <option value="">Pick a tool block…</option>
            {blocks.map((b) => (
              <option key={`${b.number}:${b.n}`} value={`${b.number}:${b.n}`}>
                {blocks.some((x) => x.number !== b.number) ? `${oNumber(b.number)} ` : ""}N{b.n} {b.name}{b.off ? ` (${b.off})` : ""}
              </option>
            ))}
          </select>
          {lines.length > 1 && <div style={{ color: C.danger, fontSize: 13 }}>One operation at a time on a kept program.</div>}
          {one && !kind && (
            <div style={{ color: C.danger, fontSize: 13 }}>
              Thread starts and form change a thread already in the program: make the program again (Update program) or edit it.
            </div>
          )}
        </div>
      )}
      {!kept && !material && <div style={{ color: C.danger, fontSize: 13 }}>The program's material is not on CNC → Materials.</div>}
      <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 0, ...(canMake ? {} : S.submitBtnDisabled) }} disabled={!canMake} onClick={make}>
        {busy && !run ? busy : "Make it"}
      </button>

      {r && (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, color: r.ready ? C.text : C.danger }}>
            {r.ready ? "Ready for the machine" : `Not for machine: ${faultText(r)}`}
          </div>
          {(r.inserted || []).map((x) => (
            <div key={`${x.tool}${x.station}`} style={{ fontSize: 14 }}>
              Added {x.tool} at T{String(x.station).padStart(2, "0")} after {x.after}.
            </div>
          ))}
          {(r.engine_also || []).length > 0 && (
            <div style={{ fontSize: 13.5, color: C.danger }}>
              The engine would also change, for it (not in this program - change it here, or make the program again):
              <ul style={{ margin: "4px 0 0 18px" }}>
                {r.engine_also.map((o, i) => (
                  <li key={i}>
                    {o.tool}: {o.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ProgramChanges before={base.programs || []} after={r.programs || []} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 0, flex: 1 }} disabled={!!busy} onClick={save}>
              {busy || `Save as rev ${letter}`}
            </button>
            <button type="button" className="stk-btn" style={S.chip} onClick={onCancel} disabled={!!busy}>
              Cancel
            </button>
          </div>
        </>
      )}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
    </div>
  );
}
