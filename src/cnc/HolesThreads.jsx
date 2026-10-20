// "Holes and threads" on New program and Update program (Heinrich 20 Oct
// 2026: "yes your recommendation on holes and threads"): what a model
// can't show - a tapped or threaded hole, an H7 hole to ream, a thread's
// starts, an inch thread's form. One line each; a button per kind adds one
// (a click, then its size and end). Rules and the engine's settings:
// holesThreads.js. The lines live in the form as `holes`.

import { Plus, Trash2 } from "lucide-react";
import Section from "../Section.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { ENDS, FORMS, HOLE_SIZES, HOLE_TYPES, newLine } from "./holesThreads.js";

export default function HolesThreads({ form, setForm }) {
  const lines = form.holes || [];
  const setLines = (fn) => setForm((f) => ({ ...f, holes: fn(f.holes || []) }));
  const change = (i, key, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: v } : l)));

  return (
    <Section title="Holes and threads" count={lines.length || undefined} defaultOpen={lines.length > 0} quiet>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>
        What the model can't show. Threads, pipe threads and grooves drawn on the model are found by the engine.
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
          <div style={{ minWidth: 150, fontSize: 14, paddingBottom: 8 }}>{HOLE_TYPES.find((t) => t.value === l.type)?.label}</div>
          {l.type === "tap" && (
            <div style={{ width: 170 }}>
              <label style={S.label}>Size</label>
              <TypeToFind options={HOLE_SIZES} value={l.size} onChange={(v) => change(i, "size", v ?? "")} allowNew placeholder="M8, 1/2-13 UNC, G1/2" />
            </div>
          )}
          {l.type === "ream" && (
            <div style={{ width: 110 }}>
              <label style={S.label}>Diameter (mm)</label>
              <input style={S.input} value={l.dia} inputMode="decimal" onChange={(e) => change(i, "dia", e.target.value)} placeholder="12" />
            </div>
          )}
          {l.type === "starts" && (
            <div style={{ width: 90 }}>
              <label style={S.label}>Starts</label>
              <input style={S.input} value={l.starts} inputMode="numeric" onChange={(e) => change(i, "starts", e.target.value)} />
            </div>
          )}
          {l.type === "form" && (
            <div style={{ width: 190 }}>
              <label style={S.label}>Form</label>
              <select style={S.input} value={l.form} onChange={(e) => change(i, "form", e.target.value)}>
                {FORMS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ width: 100 }}>
            <label style={S.label}>{l.type === "tap" || l.type === "ream" ? "Opens at" : "Thread at"}</label>
            <select style={S.input} value={l.end} onChange={(e) => change(i, "end", e.target.value)}>
              {ENDS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          {(l.type === "tap" || l.type === "ream") && (
            <div style={{ width: 120 }}>
              <label style={S.label}>Length (mm)</label>
              <input style={S.input} value={l.length} inputMode="decimal" onChange={(e) => change(i, "length", e.target.value)} placeholder="whole hole" />
            </div>
          )}
          <button type="button" className="stk-btn" style={{ ...S.chip, padding: "6px 8px", color: C.danger }} title="Remove this line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {HOLE_TYPES.map((t) => (
          <button key={t.value} type="button" className="stk-btn" style={S.chip} onClick={() => setLines((ls) => [...ls, newLine(t.value)])}>
            <Plus size={14} /> {t.label}
          </button>
        ))}
      </div>
    </Section>
  );
}
