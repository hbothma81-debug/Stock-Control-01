// One program: its heading, its revisions, and the Program and Settings
// tabs. Read when opened (the program text and settings are not in the
// list). Update program opens in place of the tabs. Copy to USB and
// Download send out the revision on screen (anyone with the View tick).
// Import machine copy opens in place of the tabs too. The Toolpath, Setup
// sheet and Costing tabs come in the next pieces.

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Download, FileInput, RefreshCw, Trash2, Usb } from "lucide-react";
import { C, F, S } from "../theme.js";
import { deleteProgram, loadProgram } from "./cncData.js";
import { CNC_FIELDS } from "./cncFields.js";
import { oNumber, pipeLabel, programFiles, settingText } from "./cncRules.js";
import { canWriteToFolder, copyToFolder, downloadFiles } from "./programOut.js";
import UpdateProgram from "./UpdateProgram.jsx";
import ImportMachineCopy from "./ImportMachineCopy.jsx";
import CostingTab from "./CostingTab.jsx";
import TurnAround from "./TurnAround.jsx";
import ToolpathTab from "./ToolpathTab.jsx";
import OffcutWastageTab from "./OffcutWastage.jsx";
import SetupSheetTab from "./SetupSheetTab.jsx";

const TABS = [
  { key: "program", label: "Program" },
  { key: "toolpath", label: "Toolpath" },
  { key: "sheet", label: "Setup sheet" },
  { key: "settings", label: "Settings" },
  { key: "costing", label: "Costing" },
  { key: "waste", label: "Offcut & wastage" },
];

// S.chipActive sets borderColor, which React will not mix with S.chip's
// border shorthand once a chip switches on; the whole border is given.
const { borderColor: _unused, ...chipActiveRest } = S.chipActive;
const CHIP_ON = { ...chipActiveRest, border: `1px solid ${C.accentFinished}` };

const SOURCE = { generated: "Generated", machine_copy: "Machine copy" };

export default function ProgramView({ id, canEdit, canDelete, customers, materials, pipes, shapes, canSeeValue, barPrices, onBarPrices, userName, onBack, onDeleted }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("program");
  const [revId, setRevId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [turning, setTurning] = useState(false);
  // The engine's toolpath answers, per revision, while the program is open.
  const [toolpaths, setToolpaths] = useState({});
  // What the last Copy to USB or Download did, in words.
  const [outNote, setOutNote] = useState(null);
  // Bumped after a save, so the program and its revisions are read again.
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let gone = false;
    loadProgram(id)
      .then((d) => !gone && setData(d))
      .catch((err) => !gone && setError(`The program could not be loaded: ${err.message || err}`));
    return () => {
      gone = true;
    };
  }, [id, reads]);

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

  if (turning) {
    return (
      <TurnAround
        program={p}
        revisions={revisions}
        current={current}
        materials={materials}
        canSeeValue={canSeeValue}
        userName={userName}
        onCancel={() => setTurning(false)}
        onSaved={() => {
          setTurning(false);
          setRevId(null);
          setTab("program");
          setReads((n) => n + 1);
        }}
      />
    );
  }

  if (importing) {
    return (
      <ImportMachineCopy
        program={p}
        revisions={revisions}
        current={current}
        userName={userName}
        onCancel={() => setImporting(false)}
        onSaved={() => {
          setImporting(false);
          setRevId(null);
          setTab("program");
          setReads((n) => n + 1);
        }}
      />
    );
  }

  if (updating) {
    return (
      <UpdateProgram
        pipes={pipes}
        shapes={shapes}
        program={p}
        revisions={revisions}
        current={current}
        customers={customers}
        materials={materials}
        userName={userName}
        onCancel={() => setUpdating(false)}
        onSaved={() => {
          setUpdating(false);
          setRevId(null);
          setTab("program");
          setReads((n) => n + 1);
        }}
      />
    );
  }

  const files = shown ? programFiles(shown.programs, p.part_name) : [];
  const fileWords = files.map((f) => f.name).join(" and ");

  async function copyOut(pickNew) {
    setOutNote(null);
    if (!canWriteToFolder()) {
      downloadFiles(files);
      setOutNote({ ok: true, text: `This browser cannot write to a USB stick, so ${fileWords} went to Downloads: copy from there.` });
      return;
    }
    try {
      const where = await copyToFolder(files, { pickNew });
      if (where) setOutNote({ ok: true, text: `Copied ${fileWords} to ${where}.`, again: true });
    } catch (err) {
      setOutNote({ ok: false, text: `Not copied: ${err.message || err}` });
    }
  }

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
        {canEdit && (
          <button type="button" className="stk-btn" style={S.addBtn} onClick={() => setUpdating(true)}>
            <RefreshCw size={14} /> Update program
          </button>
        )}
        {canEdit && (
          <button type="button" className="stk-btn" style={S.chip} onClick={() => setImporting(true)}>
            <FileInput size={14} /> Import machine copy
          </button>
        )}
        {canEdit && current && (
          <button type="button" className="stk-btn" style={S.chip} onClick={() => setTurning(true)}>
            <ArrowLeftRight size={14} /> Turn around
          </button>
        )}
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
      {files.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="stk-btn" style={S.chip} onClick={() => copyOut(false)}>
            <Usb size={14} /> Copy to USB{shown.id !== current?.id ? ` (rev ${shown.rev})` : ""}
          </button>
          <button
            type="button"
            className="stk-btn"
            style={S.chip}
            onClick={() => {
              downloadFiles(files);
              setOutNote({ ok: true, text: `Downloaded ${fileWords}.` });
            }}
          >
            <Download size={14} /> Download
          </button>
          {outNote?.again && (
            <button type="button" className="stk-btn" style={{ ...S.chip, fontSize: 13 }} onClick={() => copyOut(true)}>
              Another stick or folder
            </button>
          )}
        </div>
      )}
      {outNote && <div style={{ fontSize: 13.5, color: outNote.ok ? C.accentFinished : C.danger }}>{outNote.text}</div>}
      {!current && (
        <div style={{ color: C.danger }}>No revision was saved for this program: press Update program to make one.</div>
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
      {tab === "sheet" && <SetupSheetTab program={p} rev={shown} answers={toolpaths} setAnswers={setToolpaths} />}
      {tab === "toolpath" && <ToolpathTab program={p} rev={shown} answers={toolpaths} setAnswers={setToolpaths} />}
      {tab === "waste" && <OffcutWastageTab costing={p.costing || current?.costing || null} canSeeValue={canSeeValue} />}
      {tab === "costing" && (
        <CostingTab
          program={p}
          current={current}
          shown={shown}
          materials={materials}
          barPrices={barPrices}
          pipes={pipes}
          canEdit={canEdit}
          canSeeValue={canSeeValue}
          userName={userName}
          onBarPrices={onBarPrices}
          onProgramSaved={(row) => setData((d) => ({ ...d, program: row }))}
        />
      )}
      {tab === "settings" && <SettingsList program={p} rev={shown} pipes={pipes} shapes={shapes} />}
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
          {rev.costing?.data_source && <span style={{ color: C.muted }}> · made from {rev.costing.data_source}</span>}
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
//
// A program made from a shape lists its shape and sizes first; a pipe size
// reads in the shop's words where the engine's pipe list is to hand.
function SettingsList({ program, rev, pipes, shapes }) {
  const s = rev?.settings || program.settings || {};
  const quick = rev?.quick || program.quick || null;
  const shape = quick ? (shapes || []).find((x) => x.key === quick.shape) : null;
  const sizeRows = quick
    ? [
        ["Shape", shape ? shape.name : quick.shape],
        ...Object.entries(quick.sizes || {}).map(([k, v]) => {
          const f = shape?.fields.find((x) => x.key === k);
          return [f ? `${f.label}${f.unit ? ` (${f.unit})` : ""}` : k, String(v)];
        }),
      ]
    : [["STEP model", rev?.step_name || "none"]];
  const pipe = s.nps ? (pipes || []).find((x) => String(x.nps) === String(s.nps)) : null;
  const rows = [
    ...sizeRows,
    ["Customer", program.customer || "none"],
    ["Material", program.material || "Engine's choice: EN8"],
    ["Program number", oNumber(s.program_no ?? program.program_no)],
    ...CNC_FIELDS.map((f) => [f.label, f.key === "nps" && pipe ? pipeLabel(pipe) : settingText(f, s[f.key])]),
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
