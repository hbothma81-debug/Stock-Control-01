// New program: pick the STEP file, the customer and the material, press
// Generate. Everything else sits under a shut "More settings" on the same
// form (Heinrich, 8 Oct 2026); blank means the engine decides.
// Clicks: CNC, New program, pick STEP, customer, material, Generate.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Section from "../Section.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { createProgram } from "./cncData.js";
import { cleanSettings, partNameFromFile, readNumber } from "./cncRules.js";
import SettingsBoxes from "./SettingsBoxes.jsx";

export default function NewProgram({ customers, materials, userName, onCancel, onSaved }) {
  const [stepFile, setStepFile] = useState(null);
  const [partName, setPartName] = useState("");
  const [customer, setCustomer] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [programNo, setProgramNo] = useState("");
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const material = (materials || []).find((m) => m.name === materialName) || null;
  const ready = !!stepFile && !!partName.trim() && !!material && !busy;

  async function generate() {
    setError("");
    const { settings, errors } = cleanSettings(form);
    if (errors.length) {
      setError(`Check ${errors.join(", ")}: not a number the engine can use.`);
      return;
    }
    let typedNo = null;
    if (programNo.trim()) {
      typedNo = readNumber(programNo);
      if (!Number.isInteger(typedNo) || typedNo <= 0) {
        setError("The program number must be a whole number, or blank for the next free one.");
        return;
      }
    }
    setBusy(true);
    try {
      const id = await createProgram({
        partName: partName.trim(),
        customer,
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
            if (f && !partName.trim()) setPartName(partNameFromFile(f.name));
          }}
        />
      </div>
      <div style={S.formGrid}>
        <div>
          <label style={S.label}>Part name</label>
          <input style={S.input} value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="From the STEP file's name" />
        </div>
        <div>
          <label style={S.label}>Customer</label>
          <TypeToFind options={customers || []} value={customer} onChange={(v) => setCustomer(v || "")} placeholder="Type to find…" />
        </div>
        <div>
          <label style={S.label}>Material (Stock Manager → CNC Bar Grades)</label>
          <TypeToFind
            options={(materials || []).map((m) => m.name)}
            value={materialName}
            onChange={(v) => setMaterialName(v || "")}
            placeholder="Type to find…"
          />
          {(materials || []).length === 0 && (
            <div style={{ fontSize: 12.5, color: C.danger, marginTop: 4 }}>
              No CNC Bar Grades yet: add them under Stock Manager → CNC Bar Grades.
            </div>
          )}
        </div>
      </div>

      <Section title="More settings" defaultOpen={false} quiet>
        <div style={S.formGrid}>
          <div>
            <label style={S.label}>Program number</label>
            <input style={S.input} value={programNo} onChange={(e) => setProgramNo(e.target.value)} placeholder="blank = next free number" inputMode="numeric" />
          </div>
        </div>
        <SettingsBoxes form={form} setForm={setForm} />
      </Section>

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
