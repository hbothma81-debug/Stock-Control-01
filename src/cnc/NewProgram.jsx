// New program: pick the STEP file, the customer and the material, press
// Generate. Everything else sits under a shut "More settings" on the same
// form (Heinrich, 8 Oct 2026); blank means the engine decides.
// Clicks: CNC, New program, pick STEP, customer, material, Generate.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, S } from "../theme.js";
import { createProgram } from "./cncData.js";
import { cleanSettings, partNameFromFile, readNumber } from "./cncRules.js";
import ProgramFields from "./ProgramFields.jsx";

export default function NewProgram({ customers, materials, userName, onCancel, onSaved }) {
  const [stepFile, setStepFile] = useState(null);
  const [fields, setFields] = useState({ partName: "", customer: "", materialName: "", form: {} });
  const [programNo, setProgramNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const material = (materials || []).find((m) => m.name === fields.materialName) || null;
  const ready = !!stepFile && !!fields.partName.trim() && !!material && !busy;

  async function generate() {
    setError("");
    const { settings, errors } = cleanSettings(fields.form);
    if (errors.length) {
      setError(`Check ${errors.join(", ")}: not a number the engine can use.`);
      return;
    }
    let typedNo = null;
    if (programNo.trim()) {
      typedNo = readNumber(programNo);
      if (!Number.isInteger(typedNo) || typedNo <= 0) {
        setError("The program number must be a whole number, or left empty for the next free one.");
        return;
      }
    }
    setBusy(true);
    try {
      const id = await createProgram({
        partName: fields.partName.trim(),
        customer: fields.customer,
        material,
        settings,
        programNo: typedNo,
        stepFile,
        userName,
      });
      onSaved(id);
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  }

  return (
    <div style={S.list}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="stk-btn" style={S.chip} onClick={onCancel} disabled={busy}>
          <ArrowLeft size={14} /> Programs
        </button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>New program</div>
      </div>

      <div>
        <label style={S.label}>STEP model</label>
        <input
          type="file"
          accept=".step,.stp,.STEP,.STP"
          style={S.input}
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setStepFile(f);
            if (f) setFields((x) => (x.partName.trim() ? x : { ...x, partName: partNameFromFile(f.name) }));
          }}
        />
      </div>
      <ProgramFields
        fields={fields}
        setFields={setFields}
        customers={customers}
        materials={materials}
        moreAbove={
          <div style={S.formGrid}>
            <div>
              <label style={S.label}>Program number</label>
              <input style={S.input} value={programNo} onChange={(e) => setProgramNo(e.target.value)} placeholder="Empty: the next free number" inputMode="numeric" />
            </div>
          </div>
        }
      />

      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      <button
        type="button"
        className="stk-btn"
        style={{ ...S.submitBtn, ...(ready ? {} : S.submitBtnDisabled) }}
        disabled={!ready}
        onClick={generate}
      >
        {busy ? "Generating…" : "Generate"}
      </button>
    </div>
  );
}
