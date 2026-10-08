// New program: pick the STEP file, the customer and the material, press
// Generate. Everything else sits under a shut "More settings" on the same
// form (Heinrich, 8 Oct 2026); empty means the engine decides.
// Clicks: CNC, New program, pick STEP, customer, material, Generate.
//
// Opened from the Shapes list it takes the shape's sizes instead of a STEP
// and is saved the same way, as an ordinary program (Heinrich, 8 Oct 2026).
// Clicks: CNC, Shapes, the shape, the sizes, customer, material, Generate.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, S } from "../theme.js";
import { createProgram } from "./cncData.js";
import { cleanSettings, cleanSizes, partNameFromFile, readNumber } from "./cncRules.js";
import ProgramFields from "./ProgramFields.jsx";
import ShapeSizes from "./ShapeSizes.jsx";

export default function NewProgram({ customers, materials, pipes, shape = null, hasRefs = false, userName, onCancel, onSaved }) {
  const [stepFile, setStepFile] = useState(null);
  const [sizes, setSizes] = useState({});
  const [fields, setFields] = useState({ partName: shape ? shape.name : "", customer: "", materialName: "", form: {} });
  const [programNo, setProgramNo] = useState("");
  // Quote reference and project name, for finding the program later
  // (setup-cnc-12-program-refs.sql; the boxes show where it has been run).
  const [refs, setRefs] = useState({ quoteRef: "", projectName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const material = (materials || []).find((m) => m.name === fields.materialName) || null;
  const ready = (shape || !!stepFile) && !!fields.partName.trim() && !!material && !busy;

  async function generate() {
    setError("");
    const { settings, errors } = cleanSettings(fields.form);
    if (errors.length) {
      setError(`Check ${errors.join(", ")}: not a number the engine can use.`);
      return;
    }
    let quick = null;
    if (shape) {
      const s = cleanSizes(shape, sizes);
      if (s.missing.length || s.bad.length) {
        setError(
          [s.missing.length ? `Type ${s.missing.join(", ")}.` : "", s.bad.length ? `Check ${s.bad.join(", ")}: not a size.` : ""].filter(Boolean).join(" ")
        );
        return;
      }
      quick = { shape: shape.key, sizes: s.sizes };
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
        stepFile: shape ? null : stepFile,
        quick,
        ...(hasRefs ? refs : {}),
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
          <ArrowLeft size={14} /> {shape ? "Shapes" : "Programs"}
        </button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{shape ? `New program: ${shape.name}` : "New program"}</div>
      </div>

      {shape ? (
        <ShapeSizes shape={shape} sizes={sizes} setSizes={setSizes} />
      ) : (
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
      )}
      {hasRefs && (
        <div style={S.formGrid}>
          <div>
            <label style={S.label}>Quote reference</label>
            <input style={S.input} value={refs.quoteRef} maxLength={100} onChange={(e) => setRefs((r) => ({ ...r, quoteRef: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label style={S.label}>Project name</label>
            <input style={S.input} value={refs.projectName} maxLength={200} onChange={(e) => setRefs((r) => ({ ...r, projectName: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
      )}
      <ProgramFields
        fields={fields}
        setFields={setFields}
        customers={customers}
        materials={materials}
        pipes={pipes}
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
