import { useState, useMemo } from "react";
import { X, Ban, AlertTriangle, PackagePlus, FileText, Upload, ChevronDown } from "lucide-react";
import { C, S } from "../theme.js";
import Section from "./Section.jsx";

// Prince's screen, and very nearly the only one he uses.
//
// One line per thing to nest, and nothing else until he asks. Everything
// that used to be spread across a form at the top and a card at the
// bottom now happens inside the row he is already looking at: he opens
// it, types the program number, picks the thickness and grade, ticks
// anything else going on the same sheet, and it is nested. Nothing is
// shown twice and nothing has to be searched for that is already on
// screen.
//
// What cannot wait -- a re-cut somebody is short of, or a job marked
// urgent -- is outlined and says why. Same list rather than a separate
// box, because he works down one thing at a time.
//
// No database calls in here. The parent owns all of that.

export default function NestingView({
  machine,
  rows,
  programs,
  candidates,
  thicknesses,
  grades,
  canManage,
  actions,
  SavedCheck,
  Notes,
  onCreateProgram,
  onCancelProgram,
  onAddJobToProgram,
  onRemoveJobFromProgram,
  onMarkJobNested,
  onUpdateProgram,
}) {
  const [openRow, setOpenRow] = useState(null);
  const [addingTo, setAddingTo] = useState(null);
  const [addQuery, setAddQuery] = useState("");

  const addSuggestions = useMemo(() => {
    if (!addingTo) return [];
    const q = addQuery.trim().toLowerCase();
    if (!q) return [];
    const already = (addingTo.jobs || []).map((l) => (l.shortage_id ? "short:" + l.shortage_id : "job:" + l.job_id));
    return candidates
      .filter((c) => !already.includes(c.key))
      .filter(
        (c) =>
          (c.sigmanest || "").toLowerCase().includes(q) ||
          (c.job_number || "").toLowerCase().includes(q) ||
          (c.customer || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [candidates, addQuery, addingTo]);

  const openPrograms = programs.filter((p) => !p.is_complete);
  const cutPrograms = programs.filter((p) => p.is_complete);
  const nestNowCount = rows.filter((r) => r.nestNow).length;

  return (
    <div style={S.list}>
      <Section title="To nest" count={rows.length}>
        {rows.length === 0 ? (
          <div style={S.empty}>Nothing waiting. Everything with a nesting stage has been nested off.</div>
        ) : (
          <>
            {nestNowCount > 0 && (
              <div style={{ ...S.roleHint, color: C.danger, marginBottom: 2 }}>
                {nestNowCount} {nestNowCount === 1 ? "needs" : "need"} nesting now.
              </div>
            )}
            {rows.map((r) => (
              <NestRow
                key={r.key}
                row={r}
                rows={rows}
                machine={machine}
                thicknesses={thicknesses}
                grades={grades}
                canManage={canManage}
                expanded={openRow === r.key}
                onToggle={() => setOpenRow((k) => (k === r.key ? null : r.key))}
                onCreateProgram={onCreateProgram}
                onMarkJobNested={onMarkJobNested}
                actions={actions}
                SavedCheck={SavedCheck}
                Notes={Notes}
              />
            ))}
          </>
        )}
      </Section>

      <ProgramList
        title="Programs waiting to be cut"
        programs={openPrograms}
        emptyText="Nothing nested yet."
        canManage={canManage}
        thicknesses={thicknesses}
        grades={grades}
        addingTo={addingTo}
        setAddingTo={setAddingTo}
        addQuery={addQuery}
        setAddQuery={setAddQuery}
        addSuggestions={addSuggestions}
        onAddJobToProgram={onAddJobToProgram}
        onRemoveJobFromProgram={onRemoveJobFromProgram}
        onCancelProgram={onCancelProgram}
        onUpdateProgram={onUpdateProgram}
        SavedCheck={SavedCheck}
      />

      {cutPrograms.length > 0 && (
        <ProgramList
          title="Already cut"
          programs={cutPrograms}
          emptyText=""
          collapsible
          canManage={canManage}
          thicknesses={thicknesses}
          grades={grades}
          addingTo={addingTo}
          setAddingTo={setAddingTo}
          addQuery={addQuery}
          setAddQuery={setAddQuery}
          addSuggestions={addSuggestions}
          onAddJobToProgram={onAddJobToProgram}
          onRemoveJobFromProgram={onRemoveJobFromProgram}
          onCancelProgram={onCancelProgram}
          onUpdateProgram={onUpdateProgram}
          SavedCheck={SavedCheck}
        />
      )}
    </div>
  );
}

// One labelled value. The label is what stops a program number being read
// as a job number, and it only appears once a row is open -- collapsed,
// the line has to stay a line.
function Field({ label, value, strong, muted }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={S.label}>{label}</div>
      <div
        style={{
          fontSize: strong ? 15 : 14,
          fontWeight: strong ? 700 : 500,
          color: muted ? C.muted : C.text,
          fontStyle: muted ? "italic" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function NestRow({
  row: r,
  rows,
  machine,
  thicknesses,
  grades,
  canManage,
  expanded,
  onToggle,
  onCreateProgram,
  onMarkJobNested,
  actions,
  SavedCheck,
  Notes,
}) {
  const [programNumber, setProgramNumber] = useState("");
  const [thickness, setThickness] = useState("");
  const [grade, setGrade] = useState("");
  const [alsoOn, setAlsoOn] = useState([]);
  const [saving, setSaving] = useState(false);

  const sigmanest = r.job?.laser_job_reference || r.shortage?.board_number || "";
  const programText = r.onPrograms && r.onPrograms.length > 0 ? r.onPrograms.map((p) => p.program_number).join(", ") : "";

  // Anything else still waiting can ride on the same sheet. That is the
  // whole reason programs exist -- one nest, several jobs.
  const others = rows.filter((o) => o.key !== r.key && o.candidate);

  const canCreate = !!programNumber.trim() && !!thickness && !!grade && !!r.candidate && !saving;

  async function create() {
    if (!canCreate) return;
    setSaving(true);
    try {
      const chosen = [r.candidate, ...others.filter((o) => alsoOn.includes(o.key)).map((o) => o.candidate)];
      const ok = await onCreateProgram({
        program_number: programNumber.trim(),
        // Stored as one line the way the machine reads it, built from the
        // two lists so nobody types "1.2mm MS" three different ways.
        material: `${thickness} ${grade}`,
        machine,
        jobs: chosen.map((c) => ({
          job_id: c.job_id,
          shortage_id: c.shortage_id || null,
          sigmanest_number: c.sigmanest || "",
        })),
      });
      if (ok) {
        setProgramNumber("");
        setThickness("");
        setGrade("");
        setAlsoOn([]);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        border: r.nestNow ? `2px solid ${C.danger}` : `1px solid ${C.border}`,
      }}
    >
      {/* The line. Everything else waits behind the chevron. */}
      <button
        type="button"
        className="stk-btn"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "transparent",
          border: "none",
          color: C.text,
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
          flexWrap: "wrap",
        }}
      >
        {r.nestNow && (
          <span style={{ ...S.chip, borderColor: C.danger, color: C.danger, fontWeight: 700, flexShrink: 0 }}>
            {r.nestNowReason || "Nest now"}
          </span>
        )}
        <span style={{ fontWeight: 700, fontSize: 15 }}>{r.job?.job_number || "Unknown"}</span>
        <span style={{ color: C.muted, fontSize: 13.5 }}>{sigmanest || "no SigmaNest #"}</span>
        <span style={{ color: C.muted, fontSize: 13.5 }}>{r.job?.customer || "no customer"}</span>
        <span style={{ flex: 1, minWidth: 0, color: programText ? C.accentFinished : C.muted, fontSize: 13.5 }}>
          {programText || "not nested"}
        </span>
        <ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
      </button>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <Field label="Job no" value={r.job?.job_number || "Unknown"} strong />
            <Field label="SigmaNest job no" value={sigmanest || "Not filled in"} muted={!sigmanest} />
            <Field
              label={r.onPrograms && r.onPrograms.length > 1 ? "Program nos" : "Program no"}
              value={programText || "Not nested yet"}
              muted={!programText}
            />
            {r.job?.due_date && <Field label="Due" value={new Date(r.job.due_date).toLocaleDateString()} />}
          </div>

          {r.kind === "shortage" && r.detail && <div style={{ ...S.itemComment, color: C.danger }}>{r.detail}</div>}

          {/* ---- nest it, right here ---- */}
          {canManage && (
            <div style={{ border: `1px solid ${C.accentRaw}`, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Nest it on {machine}</div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <label style={S.label}>Program number</label>
                  <input
                    style={S.input}
                    value={programNumber}
                    onChange={(e) => setProgramNumber(e.target.value)}
                    placeholder="What the operator loads"
                  />
                </div>
                <div style={{ flex: "1 1 120px" }}>
                  <label style={S.label}>Thickness</label>
                  <select style={S.input} value={thickness} onChange={(e) => setThickness(e.target.value)}>
                    <option value="">Pick…</option>
                    {thicknesses.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: "1 1 120px" }}>
                  <label style={S.label}>Grade</label>
                  <select style={S.input} value={grade} onChange={(e) => setGrade(e.target.value)}>
                    <option value="">Pick…</option>
                    {grades.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {thicknesses.length === 0 && (
                <div style={S.roleHint}>No thicknesses set up yet — add them under Stock Manager → Laser Thicknesses.</div>
              )}

              {others.length > 0 && (
                <div>
                  <label style={S.label}>Anything else on the same sheet</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                    {others.map((o) => (
                      <label key={o.key} style={{ ...S.checkRow, fontSize: 13.5 }}>
                        <input
                          type="checkbox"
                          checked={alsoOn.includes(o.key)}
                          onChange={() =>
                            setAlsoOn((prev) => (prev.includes(o.key) ? prev.filter((k) => k !== o.key) : [...prev, o.key]))
                          }
                        />
                        {o.job_number || o.job?.job_number}
                        {o.kind === "shortage" ? " · re-cut" : o.job?.laser_job_reference ? ` · ${o.job.laser_job_reference}` : ""}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                className="stk-btn"
                style={canCreate ? { ...S.reqActionBtn, background: C.accentRaw } : S.submitBtnDisabled}
                disabled={!canCreate}
                onClick={create}
              >
                {saving
                  ? "Saving…"
                  : `Nest it${alsoOn.length ? ` — with ${alsoOn.length} more` : ""}`}
              </button>
            </div>
          )}

          {/* ---- the tools that came from the Production card ---- */}
          {canManage && r.process && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={S.label}>SigmaNest job number</label>
                <input
                  style={S.input}
                  defaultValue={r.job.laser_job_reference || ""}
                  placeholder="Not filled in yet"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (r.job.laser_job_reference || "")) actions.onSaveSigmaNest(r.job, v);
                  }}
                />
                <SavedCheck fieldKey={`job-${r.job.id}-laser_job_reference`} />
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="stk-btn"
                  style={r.process.is_urgent ? { ...S.reqActionBtnMuted, color: C.danger, borderColor: C.danger } : S.reqActionBtnMuted}
                  onClick={() => actions.onToggleUrgent(r.process)}
                >
                  {r.process.is_urgent ? "Unmark urgent" : "Mark urgent"}
                </button>
                <button
                  type="button"
                  className="stk-btn"
                  style={{ ...S.reqActionBtnMuted, color: C.danger, borderColor: C.danger }}
                  onClick={() => actions.onFlagShortage(r.job, r.process)}
                >
                  <AlertTriangle size={13} /> Flag shortage
                </button>
                <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => actions.onPullStock(r.job, r.process)}>
                  <PackagePlus size={13} /> Pull from stock
                </button>
              </div>

              {r.allocations && r.allocations.length > 0 && (
                <div>
                  <label style={S.label}>Material set aside</label>
                  {r.allocations.map((a) => (
                    <div key={a.id} style={S.roleHint}>
                      {a.item_name} — {Number(a.qty_allocated) - Number(a.qty_used)} reserved
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label style={S.label}>Notes</label>
                <Notes value={r.process.notes} onCommit={(notes) => actions.onSaveNote(r.process, notes)} />
              </div>

              <div>
                <label style={S.label}>Nesting document</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  {(r.documents || []).map((doc) => (
                    <button key={doc.id} type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => actions.onViewDocument(doc)}>
                      <FileText size={12} /> {doc.file_name}
                    </button>
                  ))}
                  <label style={{ ...S.reqActionBtnMuted, display: "inline-flex", cursor: "pointer", width: "fit-content" }}>
                    <Upload size={12} /> Upload document
                    <input
                      type="file"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) actions.onUploadDocument(r.job.id, file, r.process.process_name);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              {r.drawings && r.drawings.length > 0 && (
                <div>
                  <label style={S.label}>Drawings</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {r.drawings.map((d, i) => (
                      <button key={i} type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => actions.onViewDrawing(d)}>
                        <FileText size={12} /> {d.partNumber} — {d.description}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label style={S.checkRow}>
                <input type="checkbox" checked={false} onChange={() => onMarkJobNested(r.job, r.process)} />
                Fully nested — no more programs coming for this job
              </label>
              <SavedCheck fieldKey={`nesting-${r.process.id}`} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgramList({
  title,
  programs,
  emptyText,
  collapsible = false,
  canManage,
  thicknesses,
  grades,
  addingTo,
  setAddingTo,
  addQuery,
  setAddQuery,
  addSuggestions,
  onAddJobToProgram,
  onRemoveJobFromProgram,
  onCancelProgram,
  onUpdateProgram,
  SavedCheck,
}) {
  const [openId, setOpenId] = useState(null);

  return (
    <Section title={title} count={programs.length} collapsible={collapsible} defaultOpen={!collapsible}>
      <>
        {programs.length === 0 ? (
          emptyText ? <div style={S.empty}>{emptyText}</div> : null
        ) : (
          programs.map((p) => {
            const isAdding = addingTo && addingTo.id === p.id;
            const expanded = openId === p.id;
            const jobsText = (p.jobs || []).map((l) => l.job_number || "?").join(", ") || "no jobs";
            return (
              <div key={p.id} style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}` }}>
                <button
                  type="button"
                  className="stk-btn"
                  onClick={() => setOpenId((k) => (k === p.id ? null : p.id))}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    color: C.text,
                    cursor: "pointer",
                    padding: 0,
                    textAlign: "left",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{p.program_number}</span>
                  <span style={{ color: C.muted, fontSize: 13.5 }}>{p.material}</span>
                  <span style={{ flex: 1, minWidth: 0, color: C.muted, fontSize: 13.5 }}>{jobsText}</span>
                  {p.is_complete && <span style={{ ...S.chip, color: C.accentFinished, borderColor: C.accentFinished }}>Cut</span>}
                  <ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
                </button>

                {expanded && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
                    {canManage && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 150px" }}>
                          <label style={S.label}>Program number</label>
                          <input
                            style={S.input}
                            defaultValue={p.program_number}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== p.program_number) onUpdateProgram(p, { program_number: v });
                            }}
                          />
                        </div>
                        <div style={{ flex: "1 1 150px" }}>
                          <label style={S.label}>Material</label>
                          <input
                            style={S.input}
                            defaultValue={p.material}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== p.material) onUpdateProgram(p, { material: v });
                            }}
                          />
                        </div>
                        <SavedCheck fieldKey={`program-${p.id}`} />
                      </div>
                    )}

                    <div>
                      <label style={S.label}>On this program</label>
                      <div style={{ ...S.chipRow, marginTop: 4 }}>
                        {(p.jobs || []).length === 0 ? (
                          <span style={S.roleHint}>No jobs on this program.</span>
                        ) : (
                          (p.jobs || []).map((l) => (
                            <span
                              key={l.id}
                              style={{
                                ...S.chip,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                ...(l.is_recut ? { borderColor: C.danger, color: C.danger } : {}),
                              }}
                            >
                              {l.job_number || "unknown job"}
                              {l.is_recut ? " · re-cut" : l.sigmanest_number ? ` · ${l.sigmanest_number}` : ""}
                              {canManage && (
                                <button
                                  type="button"
                                  className="stk-btn"
                                  style={{ ...S.iconBtn, padding: 0, minWidth: 0 }}
                                  onClick={() => onRemoveJobFromProgram(p, l)}
                                  title="Take this job off the program"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {isAdding && (
                      <div style={{ position: "relative" }}>
                        <input
                          style={S.input}
                          value={addQuery}
                          onChange={(e) => setAddQuery(e.target.value)}
                          placeholder="SigmaNest number, job number or customer…"
                          autoFocus
                        />
                        {addSuggestions.length > 0 && (
                          <div style={S.suggestDropdown}>
                            {addSuggestions.map((c) => (
                              <button
                                key={c.key}
                                type="button"
                                className="stk-btn"
                                style={{ ...S.suggestItem, width: "100%", textAlign: "left", ...(c.kind === "shortage" ? { color: C.danger } : {}) }}
                                onClick={() => {
                                  onAddJobToProgram(p, c);
                                  setAddQuery("");
                                  setAddingTo(null);
                                }}
                              >
                                <b>{c.job_number}</b> {c.sigmanest || "no SigmaNest #"}
                                {c.detail ? ` · ${c.detail}` : ""}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {canManage && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="stk-btn"
                          style={S.reqActionBtnMuted}
                          onClick={() => {
                            setAddQuery("");
                            setAddingTo(isAdding ? null : p);
                          }}
                        >
                          {isAdding ? "Cancel" : "Add job"}
                        </button>
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => onCancelProgram(p)} title="Cancel this program">
                          <Ban size={13} /> Cancel program
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </>
    </Section>
  );
}
