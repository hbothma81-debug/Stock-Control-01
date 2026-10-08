// A program's sales rep, quote reference and project name, under its
// heading (Heinrich, 8 Oct 2026: a quote reference and a project name to
// search later; the sales rep is whoever made the program, from the
// login). The two boxes save on leaving them or Enter, never per letter,
// and only where the database keeps them (setup-cnc-12-program-refs.sql:
// the row read with select * then carries quote_ref). Changing them needs
// the CNC Edit tick; everyone else reads them.

import { useState } from "react";
import { C, S } from "../theme.js";
import { saveProgramRefs } from "./cncData.js";
import { salesRepOf } from "./cncRules.js";

function RefBox({ label, stored, max, field, program, onSaved, setNote }) {
  async function commit(e) {
    const v = e.target.value.trim();
    if (v === (stored || "")) return;
    setNote({ ok: true, text: "Saving…" });
    try {
      onSaved(await saveProgramRefs(program.id, { [field]: v }));
      setNote({ ok: true, text: `${label} saved.` });
    } catch (err) {
      setNote({ ok: false, text: err.message || String(err) });
    }
  }
  return (
    <div>
      <label style={S.label}>{label}</label>
      <input
        key={stored || "blank"}
        style={S.input}
        defaultValue={stored || ""}
        maxLength={max}
        placeholder="None"
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </div>
  );
}

export default function ProgramRefs({ program, canEdit, onSaved }) {
  const [note, setNote] = useState(null);
  const rep = salesRepOf(program);
  const hasRefs = "quote_ref" in program;
  const line = [
    `Sales rep: ${rep || "not known"}`,
    !canEdit && hasRefs && program.project_name && `Project: ${program.project_name}`,
    !canEdit && hasRefs && program.quote_ref && `Quote: ${program.quote_ref}`,
  ].filter(Boolean);
  return (
    <>
      <div style={{ fontSize: 14, color: C.muted }}>{line.join(" · ")}</div>
      {canEdit && hasRefs && (
        <div style={S.formGrid}>
          <RefBox label="Quote reference" field="quoteRef" stored={program.quote_ref} max={100} program={program} onSaved={onSaved} setNote={setNote} />
          <RefBox label="Project name" field="projectName" stored={program.project_name} max={200} program={program} onSaved={onSaved} setNote={setNote} />
        </div>
      )}
      {note && <div style={{ fontSize: 13, color: note.ok ? C.muted : C.danger }}>{note.text}</div>}
    </>
  );
}
