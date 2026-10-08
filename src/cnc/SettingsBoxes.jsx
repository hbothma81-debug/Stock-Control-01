// The questionnaire's boxes, one per field in cncFields.js. An empty box
// says what the engine chooses when it is left empty ("Engine's choice",
// Heinrich asked what "blank" meant, 8 Oct 2026). Used by New program and
// Update program.
//
// Pipe size and Schedule are pick lists from the engine's own pipe list
// (GET ?pipes=1), in the shop's words ("100NB (4")", then only that size's
// schedules with their bore), so a size the engine does not know cannot be
// typed. While the engine has no list they stay typed boxes.

import { S } from "../theme.js";
import { CNC_FIELDS } from "./cncFields.js";
import { pipeLabel } from "./cncRules.js";

export default function SettingsBoxes({ form, setForm, pipes = null }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const pipe = pipes ? pipes.find((p) => String(p.nps) === String(form.nps ?? "")) : null;

  function pipeBox(f) {
    if (f.key === "nps") {
      return (
        <select
          style={S.input}
          value={form.nps ?? ""}
          onChange={(e) => {
            const nps = e.target.value;
            const next = pipes.find((p) => String(p.nps) === nps);
            // A schedule the new size does not come in is cleared.
            setForm((x) => ({
              ...x,
              nps,
              schedule: next && (next.schedules || []).some((s) => String(s.sch) === String(x.schedule)) ? x.schedule : "",
            }));
          }}
        >
          <option value="">{`Engine's choice: ${f.blank}`}</option>
          {pipes.map((p) => (
            <option key={p.nps} value={String(p.nps)}>
              {pipeLabel(p)} OD {p.od}
            </option>
          ))}
        </select>
      );
    }
    return (
      <select style={S.input} value={form.schedule ?? ""} onChange={(e) => set("schedule", e.target.value)}>
        <option value="">{pipe ? `Engine's choice: ${f.blank}` : "Pick the pipe size first, or leave to the engine"}</option>
        {(pipe?.schedules || []).map((s) => (
          <option key={s.sch} value={String(s.sch)}>
            SCH{s.sch}
            {s.id != null ? ` (ID ${s.id}, wall ${s.wall})` : ""}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div style={S.formGrid}>
      {CNC_FIELDS.map((f) => (
        <div key={f.key}>
          <label style={S.label}>{f.label}</label>
          {pipes && (f.key === "nps" || f.key === "schedule") ? (
            pipeBox(f)
          ) : f.choices ? (
            <select
              style={S.input}
              value={form[f.key] === undefined || form[f.key] === "" ? "" : String(form[f.key])}
              onChange={(e) => {
                const v = e.target.value;
                set(f.key, f.kind === "yesno" ? (v === "" ? "" : v === "true") : v);
              }}
            >
              <option value="">{`Engine's choice: ${f.blank}`}</option>
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
              placeholder={`Engine's choice: ${f.blank}`}
              inputMode={f.kind === "text" ? "text" : "decimal"}
            />
          )}
        </div>
      ))}
    </div>
  );
}
