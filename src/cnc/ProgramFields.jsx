// The boxes New program and Update program share: part name, customer,
// material, Stock and Process with only the boxes their picks open, and
// the rest of the questionnaire under a shut "More settings" (batches:
// settingsBatches.js, Heinrich 11 Oct 2026). The STEP box and the program
// number stay with each form, because they differ: a new program must have
// a STEP and may take a typed number; an update keeps its STEP unless
// another is chosen, and keeps its number.

import Section from "../Section.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import SettingsBoxes from "./SettingsBoxes.jsx";
import StockProcess from "./StockProcess.jsx";
import { FINISH_BOXES } from "./settingsBatches.js";

// `shape`: a shape program sets which end is machined first on its
// drawing, so More settings leaves out "Side 1 is the model's".
export default function ProgramFields({ fields, setFields, customers, materials, pipes = null, settingsOpen = false, moreAbove = null, shape = false }) {
  const set = (key) => (v) => setFields((f) => ({ ...f, [key]: v ?? "" }));
  const setForm = (fn) => setFields((f) => ({ ...f, form: typeof fn === "function" ? fn(f.form) : fn }));
  return (
    <>
      <div style={S.formGrid}>
        <div>
          <label style={S.label}>Part name</label>
          <input style={S.input} value={fields.partName} onChange={(e) => set("partName")(e.target.value)} placeholder="From the STEP file's name" />
        </div>
        <div>
          <label style={S.label}>Customer</label>
          <TypeToFind options={customers || []} value={fields.customer} onChange={set("customer")} placeholder="Type to find…" />
        </div>
        <div>
          <label style={S.label}>Material (Stock Manager → CNC Bar Grades)</label>
          <TypeToFind options={(materials || []).map((m) => m.name)} value={fields.materialName} onChange={set("materialName")} placeholder="Type to find…" />
          {(materials || []).length === 0 && (
            <div style={{ fontSize: 12.5, color: C.danger, marginTop: 4 }}>
              No CNC Bar Grades yet: add them under Stock Manager → CNC Bar Grades.
            </div>
          )}
          {fields.materialName && !(materials || []).some((m) => m.name === fields.materialName) && (
            <div style={{ fontSize: 12.5, color: C.danger, marginTop: 4 }}>
              "{fields.materialName}" is not on the CNC Bar Grades list any more: pick one that is.
            </div>
          )}
        </div>
      </div>
      <StockProcess form={fields.form} setForm={setForm} pipes={pipes} />
      <Section title="More settings" defaultOpen={settingsOpen} quiet>
        {moreAbove}
        <SettingsBoxes keys={shape ? FINISH_BOXES.filter((k) => k !== "side1") : FINISH_BOXES} pipes={pipes} form={fields.form} setForm={setForm} />
      </Section>
    </>
  );
}
