// The questionnaire's boxes, one per field in cncFields.js. A blank box
// shows what the engine does when it is left blank. Used by New program,
// and by Update program next.

import { S } from "../theme.js";
import { CNC_FIELDS } from "./cncFields.js";

export default function SettingsBoxes({ form, setForm }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <div style={S.formGrid}>
      {CNC_FIELDS.map((f) => (
        <div key={f.key}>
          <label style={S.label}>{f.label}</label>
          {f.choices ? (
            <select
              style={S.input}
              value={form[f.key] === undefined || form[f.key] === "" ? "" : String(form[f.key])}
              onChange={(e) => {
                const v = e.target.value;
                set(f.key, f.kind === "yesno" ? (v === "" ? "" : v === "true") : v);
              }}
            >
              <option value="">{`Blank: ${f.blank}`}</option>
              {f.choices.map((c) => (
                <option key={String(c.value)} value={String(c.value)}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              style={S.input}
              value={form[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={`blank = ${f.blank}`}
              inputMode={f.kind === "text" ? "text" : "decimal"}
            />
          )}
        </div>
      ))}
    </div>
  );
}
