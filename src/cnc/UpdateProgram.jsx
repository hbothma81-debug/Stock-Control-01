// Update program: change the answers (or choose a new STEP), Generate, see
// what changed, Save as the next revision. The old revision is kept.
// Clicks: open the program, Update program, the change, Generate, Save.
// Nothing is saved until Save; Back to the answers keeps what was typed.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, S } from "../theme.js";
import { runUpdate, saveUpdate } from "./cncData.js";
import { cleanSettings, faultText, oNumber, revisionLetter, settingsToForm } from "./cncRules.js";
import ProgramFields from "./ProgramFields.jsx";
import ProgramChanges from "./ProgramChanges.jsx";

const minSec = (s) => (s == null ? "–" : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

export default function UpdateProgram({ program, revisions, current, customers, materials, userName, onCancel, onSaved }) {
  const [fields, setFields] = useState(() => ({
    partName: program.part_name || "",
    customer: program.customer || "",
    materialName: program.material || "",
    form: settingsToForm(current?.settings || program.settings || {}),
  }));
  const [stepFile, setStepFile] = useState(null);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const letter = revisionLetter(revisions.length);
  const material = (materials || []).find((m) => m.name === fields.materialName) || null;
  const canGenerate = !!fields.partName.trim() && !!material && !busy;

  async function generate() {
    setError("");
    const { settings, errors } = cleanSettings(fields.form);
    if (errors.length) {
      setError(`Check ${errors.join(", ")}: not a number the engine can use.`);
      return;
    }
    setBusy("Generating…");
    try {
      setRun(await runUpdate({ program, partName: fields.partName.trim(), current, material, settings, stepFile }));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setError("");
    setBusy("Saving…");
    try {
      await saveUpdate({ program, run, letter, partName: fields.partName.trim(), customer: fields.customer, material, userName });
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
      setBusy("");
    }
  }

  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="stk-btn" style={S.chip} onClick={onCancel} disabled={!!busy}>
        <ArrowLeft size={14} /> {oNumber(program.program_no)}
      </button>
      <div style={{ fontSize: 17, fontWeight: 700 }}>
        Update program{current ? ` (now rev ${current.rev})` : ""}
      </div>
    </div>
  );

  if (run) {
    const r = run.result;
    const nowReady = !!r.ready;
    const wasReady = program.status === "ready";
    return (
      <div style={S.list}>
        {head}
        <div style={{ fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ color: nowReady ? C.accentFinished : C.danger, fontWeight: 600 }}>
            {nowReady ? "Ready for the machine" : `Not for machine: ${faultText(r)}`}
            {current && nowReady !== wasReady ? ` (was ${wasReady ? "Ready" : "Not for machine"})` : ""}
          </div>
          <div>
            Cycle time {minSec(r.cycle_s)}
            {current?.cycle_s != null ? ` (was ${minSec(current.cycle_s)})` : ""}
          </div>
          {run.step.file && <div>New STEP model: {run.step.name}</div>}
          {(r.warnings || []).length > 0 && (
            <div style={{ color: C.accentRaw }}>{(r.warnings || []).length} warning(s): see the Program tab after saving.</div>
          )}
        </div>
        <ProgramChanges before={current?.programs || []} after={r.programs || []} />
        {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 0, flex: 1 }} onClick={save} disabled={!!busy}>
            {busy || `Save as rev ${letter}`}
          </button>
          <button type="button" className="stk-btn" style={S.chip} onClick={() => setRun(null)} disabled={!!busy}>
            Back to the answers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.list}>
      {head}
      <div>
        <label style={S.label}>STEP model</label>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>
          {stepFile ? `New: ${stepFile.name}` : current?.step_name ? `Keeps ${current.step_name} (rev ${current.rev}) unless you choose another` : "Choose the STEP file"}
        </div>
        <input type="file" accept=".step,.stp,.STEP,.STP" style={S.input} onChange={(e) => setStepFile(e.target.files?.[0] || null)} />
      </div>
      <ProgramFields fields={fields} setFields={setFields} customers={customers} materials={materials} settingsOpen />
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      <button
        type="button"
        className="stk-btn"
        style={{ ...S.submitBtn, ...(canGenerate ? {} : S.submitBtnDisabled) }}
        disabled={!canGenerate}
        onClick={generate}
      >
        {busy || "Generate"}
      </button>
    </div>
  );
}
