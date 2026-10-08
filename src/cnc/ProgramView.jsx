// One program: its heading, its revisions, and the Program and Settings
// tabs. Read when opened (the program text and settings are not in the
// list). Update program, Copy to USB, Download, Import machine copy and the
// Toolpath, Setup sheet and Costing tabs come in the next pieces.

import { useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { C, F, S } from "../theme.js";
import { deleteProgram, loadProgram } from "./cncData.js";
import { CNC_FIELDS } from "./cncFields.js";
import { oNumber, settingText } from "./cncRules.js";

const TABS = [
  { key: "program", label: "Program" },
  { key: "settings", label: "Settings" },
];

// S.chipActive sets borderColor, which React will not mix with S.chip's
// border shorthand once a chip switches on; the whole border is given.
const { borderColor: _unused, ...chipActiveRest } = S.chipActive;
const CHIP_ON = { ...chipActiveRest, border: `1px solid ${C.accentFinished}` };

const SOURCE = { generated: "Generated", machine_copy: "Machine copy" };

export default function ProgramView({ id, canDelete, onBack, onDeleted }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("program");
  const [revId, setRevId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let gone = false;
    loadProgram(id)
      .then((d) => !gone && setData(d))
      .catch((err) => !gone && setError(`The program could not be loaded: ${err.message || err}`));
    return () => {
      gone = true;
    };
  }, [id]);

  const back = (
    <button type="button" className="stk-btn" style={S.chip} onClick={onBack}>
      <ArrowLeft size={14} /> Programs
    </button>
  );
  if (error) return <div style={S.list}>{back}<div style={{ color: C.danger }}>{error}</div></div>;
  if (!data) return <div style={S.list}>{back}<div style={S.empty}>Loading…</div></div>;

  const { program: p, revisions } = data;
  const current = revisions.find((r) => r.rev === p.current_rev) || revisions[revisions.length - 1] || null;
  const shown = revisions.find((r) => r.id === revId) || current;

  async function remove() {
    if (!window.confirm(`Delete ${oNumber(p.program_no)} ${p.part_name} and all ${revisions.length} of its revisions? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteProgram(p);
      onDeleted();
    } catch (err) {
      setError(err.message || String(err));
      setDeleting(false);
    }
  }

  return (
    <div style={S.list}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {back}
        <div style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>
          <span style={{ fontFamily: F.mono }}>{oNumber(p.program_no)}</span> · {p.part_name}
          {p.current_rev ? ` · rev ${p.current_rev}` : ""}
        </div>
        {canDelete && (
          <button type="button" className="stk-btn" style={{ ...S.chip, color: C.danger }} onClick={remove} disabled={deleting}>
            <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete program"}
          </button>
        )}
      </div>
      <div style={{ fontSize: 14, color: C.muted }}>
        {[p.customer, [p.material, p.stock].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
      </div>
      {p.status === "ready" ? (
        <div style={{ color: C.accentFinished, fontWeight: 600 }}>Ready for the machine</div>
      ) : (
        <div style={{ color: C.danger, fontWeight: 600 }}>Not for machine{p.fault ? `: ${p.fault}` : ""}</div>
      )}
      {!current && (
        <div style={{ color: C.danger }}>No revision was saved for this program. Update program (next piece) will make one.</div>
      )}

      {revisions.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: C.muted }}>Revision</span>
          {revisions.map((r) => (
            <button
              key={r.id}
              type="button"
              className="stk-btn"
              style={{ ...S.chip, ...(shown?.id === r.id ? CHIP_ON : {}) }}
              onClick={() => setRevId(r.id)}
              title={`${SOURCE[r.source] || r.source}, ${new Date(r.created_at).toLocaleString()}${r.created_by ? `, ${r.created_by}` : ""}`}
            >
              {r.rev}
              {r.source === "machine_copy" ? " (machine copy)" : ""}
            </button>
          ))}
        </div>
      )}
      {shown && (
        <div style={{ fontSize: 13, color: C.muted }}>
          Rev {shown.rev}: {SOURCE[shown.source] || shown.source}, {new Date(shown.created_at).toLocaleString()}
          {shown.created_by ? `, by ${shown.created_by}` : ""}
          {shown.id !== current?.id ? " (an older revision)" : ""}
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className="stk-btn"
            style={{ ...S.chip, ...(tab === t.key ? CHIP_ON : {}) }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "program" && shown && <ProgramText rev={shown} />}
      {tab === "settings" && <SettingsList program={p} rev={shown} />}
    </div>
  );
}

function ProgramText({ rev }) {
  const progs = rev.programs || [];
  return (
    <>
      {listBlock("Faults", rev.fails, C.danger)}
      {listBlock("Problems", rev.problems, C.danger)}
      {listBlock("Warnings", rev.warnings, C.accentRaw)}
      {rev.cycle_s != null && (
        <div style={{ fontSize: 14 }}>
          Cycle time {Math.floor(rev.cycle_s / 60)} min {Math.round(rev.cycle_s % 60)} s
        </div>
      )}
      {progs.map((pr, i) => (
        <div key={i}>
          {progs.length > 1 && <div style={{ fontWeight: 700, margin: "6px 0" }}>Side {i + 1}: {oNumber(pr.number)}</div>}
          <pre
            style={{
              fontFamily: F.mono,
              fontSize: 12.5,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: 10,
              maxHeight: 480,
              overflow: "auto",
              whiteSpace: "pre",
              margin: 0,
            }}
          >
            {pr.text}
          </pre>
        </div>
      ))}
      {rev.report && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 14 }}>Plan report</summary>
          <pre style={{ fontFamily: F.mono, fontSize: 12, whiteSpace: "pre-wrap" }}>{rev.report}</pre>
        </details>
      )}
    </>
  );
}

function listBlock(title, items, colour) {
  const list = (items || []).map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  if (!list.length) return null;
  return (
    <div style={{ fontSize: 14 }}>
      <div style={{ fontWeight: 700, color: colour }}>{title}</div>
      <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
        {list.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

// The answers that made the shown revision (or the program's own, for a
// program with no revision), each blank one saying what the engine did.
function SettingsList({ program, rev }) {
  const s = rev?.settings || program.settings || {};
  const rows = [
    ["Customer", program.customer || "none"],
    ["Material", program.material || "blank (EN8)"],
    ["Program number", oNumber(s.program_no ?? program.program_no)],
    ...CNC_FIELDS.map((f) => [f.label, settingText(f, s[f.key])]),
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", fontSize: 14 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <div style={{ color: C.muted }}>{k}</div>
          <div>{v}</div>
        </div>
      ))}
    </div>
  );
}
