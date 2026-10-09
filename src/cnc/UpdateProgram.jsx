// Update program: change the answers (or choose a new STEP), Generate, see
// what changed, Save as the next revision. The old revision is kept.
// Clicks: open the program, Update program, the change, Generate, Save.
// Nothing is saved until Save; Back to the answers keeps what was typed.
// A program made from a shape shows its size boxes instead of the STEP.
// A run that comes out the same as the current revision offers no new
// revision (Heinrich, 9 Oct 2026): Close, or Save changes when only the
// customer changed. A new part name is a new revision (his answer, the
// same day): the engine writes it into the program's first line. A new
// material is too: it is sent to the engine and moves the price.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, S } from "../theme.js";
import { runUpdate, saveProgramDetails, saveUpdate, updateChanges } from "./cncData.js";
import { cleanSettings, cleanSizes, detailChanges, faultText, handEditsNote, oNumber, revisionLetter, settingsToForm } from "./cncRules.js";
import ShapeSizes from "./ShapeSizes.jsx";
import ProgramFields from "./ProgramFields.jsx";
import ProgramChanges from "./ProgramChanges.jsx";

const minSec = (s) => (s == null ? "–" : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

export default function UpdateProgram({ program, revisions, current, customers, materials, pipes, shapes, userName, onCancel, onSaved }) {
  const [fields, setFields] = useState(() => ({
    partName: program.part_name || "",
    customer: program.customer || "",
    materialName: program.material || "",
    form: settingsToForm(current?.settings || program.settings || {}),
  }));
  const [stepFile, setStepFile] = useState(null);
  const quickNow = current?.quick || program.quick || null;
  const shape = quickNow ? (shapes || []).find((s) => s.key === quickNow.shape) || null : null;
  const [sizes, setSizes] = useState(() =>
    Object.fromEntries(Object.entries(quickNow?.sizes || {}).map(([k, v]) => [k, String(v)]))
  );
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const letter = revisionLetter(revisions.length);
  const material = (materials || []).find((m) => m.name === fields.materialName) || null;
  const canGenerate = !!fields.partName.trim() && !!material && !busy && (!quickNow || !!shape);

  async function generate() {
    setError("");
    const { settings, errors } = cleanSettings(fields.form);
    if (errors.length) {
      setError(`Check ${errors.join(", ")}: not a number the engine can use.`);
      return;
    }
    let quick = null;
    if (quickNow) {
      const s = cleanSizes(shape, sizes);
      if (s.missing.length || s.bad.length) {
        setError([s.missing.length ? `Type ${s.missing.join(", ")}.` : "", s.bad.length ? `Check ${s.bad.join(", ")}: not a size.` : ""].filter(Boolean).join(" "));
        return;
      }
      quick = { shape: shape.key, sizes: s.sizes };
    }
    setBusy("Generating…");
    try {
      setRun(await runUpdate({ program, partName: fields.partName.trim(), current, material, settings, stepFile, quick }));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy("");
    }
  }

  async function save(newRevision) {
    setError("");
    setBusy("Saving…");
    try {
      if (newRevision) await saveUpdate({ program, run, letter, partName: fields.partName.trim(), customer: fields.customer, material, userName });
      else await saveProgramDetails({ program, partName: fields.partName.trim(), customer: fields.customer, material });
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
    const changed = updateChanges(current, run);
    const details = detailChanges(program, { partName: fields.partName.trim(), customer: fields.customer, materialName: fields.materialName });
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
          {run.step?.file && <div>New STEP model: {run.step.name}</div>}
          {(r.warnings || []).length > 0 && (
            <div style={{ color: C.accentRaw }}>{(r.warnings || []).length} warning(s): see the Program tab after saving.</div>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {changed.length > 0
            ? current
              ? `Changed: ${changed.join(", ")}.`
              : ""
            : details.length > 0
            ? `The program came out the same as rev ${current.rev}: only the ${details.join(" and ")} change${details.length === 1 ? "s" : ""}, and no new revision is made.`
            : `No change: rev ${current.rev} is already up to date with the engine and these settings.`}
        </div>
        {changed.length > 0 && <ProgramChanges before={current?.programs || []} after={r.programs || []} />}
        {changed.length > 0 && handEditsNote(current) && <div style={{ color: C.danger, fontSize: 14, fontWeight: 600 }}>{handEditsNote(current)}</div>}
        {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {changed.length > 0 || details.length > 0 ? (
            <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 0, flex: 1 }} onClick={() => save(changed.length > 0)} disabled={!!busy}>
              {busy || (changed.length > 0 ? `Save as rev ${letter}` : "Save changes")}
            </button>
          ) : (
            <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 0, flex: 1 }} onClick={onCancel}>
              Close
            </button>
          )}
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
      {quickNow ? (
        shape ? (
          <ShapeSizes shape={shape} sizes={sizes} setSizes={setSizes} />
        ) : (
          <div style={{ color: C.danger, fontSize: 14 }}>
            This program was made from the shape "{quickNow.shape}", which the engine's Shapes list does not offer right now, so it cannot be updated
            here yet.
          </div>
        )
      ) : (
      <div>
        <label style={S.label}>STEP model</label>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>
          {stepFile ? `New: ${stepFile.name}` : current?.step_name ? `Keeps ${current.step_name} (rev ${current.rev}) unless you choose another` : "Choose the STEP file"}
        </div>
        <input type="file" accept=".step,.stp,.STEP,.STP" style={S.input} onChange={(e) => setStepFile(e.target.files?.[0] || null)} />
      </div>
      )}
      <ProgramFields fields={fields} setFields={setFields} customers={customers} materials={materials} pipes={pipes} settingsOpen />
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
