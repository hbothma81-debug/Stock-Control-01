import { useState, useMemo } from "react";
import { Plus, X, Ban, AlertTriangle, PackagePlus, FileText, Upload, ChevronDown } from "lucide-react";
import { C, S } from "../theme.js";
import Section from "./Section.jsx";

// Prince's screen, and very nearly the only one he uses.
//
// Everything waiting to be nested is one list. What cannot wait -- a
// re-cut somebody is short of, or a job marked urgent -- sits at the top
// of it, outlined, saying Nest now. Same list rather than a separate box,
// because he works down one thing at a time and a second list is a second
// place to forget to look.
//
// The tools that used to live on the Production card came with the
// screen: the SigmaNest number, pulling stock, flagging a shortage,
// notes, the nesting document. They sit behind a toggle on each row --
// they are needed one job at a time, and putting them on every row turns
// a list you can scan into a page you have to read.
//
// No database calls in here. The parent owns all of that.

function matchCandidates(candidates, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return candidates
    .filter(
      (c) =>
        (c.sigmanest || "").toLowerCase().includes(q) ||
        (c.job_number || "").toLowerCase().includes(q) ||
        (c.customer || "").toLowerCase().includes(q) ||
        (c.detail || "").toLowerCase().includes(q)
    )
    .slice(0, 8);
}

function candidateLabel(c) {
  const bits = [c.sigmanest || "no SigmaNest #"];
  if (c.customer) bits.push(c.customer);
  if (c.detail) bits.push(c.detail);
  return bits.join(" · ");
}

export default function NestingView({
  machine,
  rows,
  programs,
  candidates,
  materials,
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
  const [building, setBuilding] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newMaterial, setNewMaterial] = useState("");
  const [picked, setPicked] = useState([]);
  const [jobQuery, setJobQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [openRow, setOpenRow] = useState(null);

  const [addingTo, setAddingTo] = useState(null);
  const [addQuery, setAddQuery] = useState("");

  const suggestions = useMemo(
    () => matchCandidates(candidates.filter((c) => !picked.some((p) => p.key === c.key)), jobQuery),
    [candidates, jobQuery, picked]
  );

  const addSuggestions = useMemo(() => {
    if (!addingTo) return [];
    const already = (addingTo.jobs || []).map((l) => (l.shortage_id ? "short:" + l.shortage_id : "job:" + l.job_id));
    return matchCandidates(candidates.filter((c) => !already.includes(c.key)), addQuery);
  }, [candidates, addQuery, addingTo]);

  const openPrograms = programs.filter((p) => !p.is_complete);
  const cutPrograms = programs.filter((p) => p.is_complete);

  function resetBuilder() {
    setBuilding(false);
    setNewNumber("");
    setNewMaterial("");
    setPicked([]);
    setJobQuery("");
  }

  // Straight from seeing a thing to acting on it: the builder opens with
  // that item already on the program, so nothing is searched for twice.
  function startProgramWith(candidate) {
    setPicked(candidate ? [candidate] : []);
    setNewNumber("");
    setNewMaterial("");
    setJobQuery("");
    setBuilding(true);
  }

  async function submitProgram() {
    if (!newNumber.trim() || !newMaterial || picked.length === 0 || saving) return;
    setSaving(true);
    try {
      const ok = await onCreateProgram({
        program_number: newNumber.trim(),
        material: newMaterial,
        machine,
        jobs: picked.map((c) => ({
          job_id: c.job_id,
          shortage_id: c.shortage_id || null,
          sigmanest_number: c.sigmanest || "",
        })),
      });
      if (ok) resetBuilder();
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = !!newNumber.trim() && !!newMaterial && picked.length > 0 && !saving;
  const nestNowCount = rows.filter((r) => r.nestNow).length;

  return (
    <div style={S.list}>
      {canManage && !building && (
        <button type="button" className="stk-btn" style={{ ...S.addBtn, width: "100%" }} onClick={() => startProgramWith(null)}>
          <Plus size={15} strokeWidth={2.5} />
          New program
        </button>
      )}

      {canManage && building && (
        <div style={{ ...S.deptCard, borderColor: C.accentRaw }}>
          <div style={S.deptCardHead}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>New program on {machine}</span>
            <button type="button" className="stk-btn" style={S.iconBtn} onClick={resetBuilder} title="Discard">
              <X size={16} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <div>
              <label style={S.label}>Program number</label>
              <input
                style={S.input}
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="What the operator loads at the machine"
                autoFocus
              />
            </div>

            <div>
              <label style={S.label}>Material</label>
              {materials.length === 0 ? (
                <div style={S.roleHint}>No laser materials set up yet. Add them under Stock Manager → Laser Materials first.</div>
              ) : (
                <select style={S.input} value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)}>
                  <option value="">Pick the material…</option>
                  {materials.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label style={S.label}>On this program</label>
              {picked.length > 0 && (
                <div style={{ ...S.chipRow, marginBottom: 6 }}>
                  {picked.map((c) => (
                    <span
                      key={c.key}
                      style={{
                        ...S.chip,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        ...(c.kind === "shortage" ? { borderColor: C.danger, color: C.danger } : {}),
                      }}
                    >
                      {c.job_number}
                      {c.kind === "shortage" ? " · re-cut" : c.sigmanest ? ` · ${c.sigmanest}` : ""}
                      <button
                        type="button"
                        className="stk-btn"
                        style={{ ...S.iconBtn, padding: 0, minWidth: 0 }}
                        onClick={() => setPicked((prev) => prev.filter((p) => p.key !== c.key))}
                        title="Take off this program"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ position: "relative" }}>
                <input
                  style={S.input}
                  value={jobQuery}
                  onChange={(e) => setJobQuery(e.target.value)}
                  placeholder="Add another — SigmaNest number, job number or customer…"
                />
                {suggestions.length > 0 && (
                  <div style={S.suggestDropdown}>
                    {suggestions.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className="stk-btn"
                        style={{ ...S.suggestItem, width: "100%", textAlign: "left", ...(c.kind === "shortage" ? { color: C.danger } : {}) }}
                        onClick={() => {
                          setPicked((prev) => [...prev, c]);
                          setJobQuery("");
                        }}
                      >
                        <b>{c.job_number}</b> {candidateLabel(c)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {jobQuery.trim() && suggestions.length === 0 && (
                <div style={{ ...S.roleHint, marginTop: 6 }}>
                  Nothing matches that. The job has to be in the app already — check the SigmaNest number is on it.
                </div>
              )}
            </div>

            <button
              type="button"
              className="stk-btn"
              style={canSubmit ? S.submitBtn : S.submitBtnDisabled}
              disabled={!canSubmit}
              onClick={submitProgram}
            >
              {saving ? "Saving…" : `Create program${picked.length ? ` — ${picked.length} item${picked.length > 1 ? "s" : ""}` : ""}`}
            </button>
          </div>
        </div>
      )}

      <Section title="To nest" count={rows.length}>
        {rows.length === 0 ? (
          <div style={S.empty}>Nothing waiting. Everything with a nesting stage has been nested off.</div>
        ) : (
          <>
            {nestNowCount > 0 && (
              <div style={{ ...S.roleHint, color: C.danger, marginBottom: 4 }}>
                {nestNowCount} {nestNowCount === 1 ? "item needs" : "items need"} nesting now — someone is waiting on
                {nestNowCount === 1 ? " it" : " them"}.
              </div>
            )}
            {rows.map((r) => (
              <NestRow
                key={r.key}
                row={r}
                canManage={canManage}
                expanded={openRow === r.key}
                onToggleExpand={() => setOpenRow((k) => (k === r.key ? null : r.key))}
                onNestNow={() => startProgramWith(r.candidate)}
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
        emptyText="No programs waiting. Build one above."
        canManage={canManage}
        materials={materials}
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
          materials={materials}
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

// One labelled number. The label is what stops a program number being
// read as a job number at a glance.
function HeaderField({ label, value, strong, muted }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={S.label}>{label}</div>
      <div
        style={{
          fontSize: strong ? 16 : 14.5,
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

function NestRow({ row: r, canManage, expanded, onToggleExpand, onNestNow, onMarkJobNested, actions, SavedCheck, Notes }) {
  const isShortage = r.kind === "shortage";
  return (
    <div
      style={{
        ...S.row,
        flexDirection: "column",
        alignItems: "stretch",
        gap: 6,
        ...(r.nestNow ? { border: `2px solid ${C.danger}`, borderRadius: 6, padding: 10 } : {}),
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}>
          {r.nestNow && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ ...S.chip, borderColor: C.danger, color: C.danger, fontWeight: 700 }}>Nest now</span>
              {/* Why, not just that. A red box with no reason gets ignored
                  after the third one. */}
              <span style={{ color: C.danger, fontSize: 13, fontWeight: 600 }}>{r.nestNowReason}</span>
            </div>
          )}

          {/* The three numbers that matter, each said out loud. Job number,
              SigmaNest number and program get confused for one another
              constantly -- they are all just numbers until they are
              labelled. */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <HeaderField label="Job no" value={r.job?.job_number || "Unknown"} strong />
            <HeaderField
              label="SigmaNest job no"
              value={r.job?.laser_job_reference || r.shortage?.board_number || "Not filled in"}
              muted={!(r.job?.laser_job_reference || r.shortage?.board_number)}
            />
            <HeaderField
              label={r.onPrograms && r.onPrograms.length > 1 ? "Program nos" : "Program no"}
              value={r.onPrograms && r.onPrograms.length > 0 ? r.onPrograms.map((p) => p.program_number).join(", ") : "Not nested yet"}
              muted={!(r.onPrograms && r.onPrograms.length > 0)}
            />
          </div>

          <div style={S.rowMeta}>
            <span style={S.customerTag}>{r.job?.customer || "No customer"}</span>
            {r.job?.due_date && <span>Due {new Date(r.job.due_date).toLocaleDateString()}</span>}
          </div>
          {isShortage && r.detail && <div style={{ ...S.itemComment, color: C.danger }}>{r.detail}</div>}
          {r.onPrograms && r.onPrograms.length > 0 && (
            <div style={{ ...S.chipRow, marginTop: 4 }}>
              {r.onPrograms.map((p) => (
                <span
                  key={p.id}
                  style={{
                    ...S.chip,
                    borderColor: p.is_complete ? C.accentFinished : C.border,
                    color: p.is_complete ? C.accentFinished : C.text,
                  }}
                >
                  {p.program_number} · {p.material}
                  {p.is_complete ? " · cut" : ""}
                </span>
              ))}
            </div>
          )}
        </div>

        {canManage && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
            <button
              type="button"
              className="stk-btn"
              style={r.nestNow ? { ...S.reqActionBtn, background: C.danger } : S.reqActionBtn}
              onClick={onNestNow}
            >
              <Plus size={13} /> Nest it
            </button>
            {r.process && (
              <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={onToggleExpand} title="Job tools">
                <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* The tools that came over from the Production card. One job at a
          time, so they stay out of the way until asked for. */}
      {expanded && r.process && canManage && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 8,
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
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
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {r.allocations.map((a) => (
                  <span key={a.id} style={S.roleHint}>
                    {a.item_name} — {Number(a.qty_allocated) - Number(a.qty_used)} reserved
                  </span>
                ))}
              </div>
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
  );
}

function ProgramList({
  title,
  programs,
  emptyText,
  collapsible = false,
  canManage,
  materials,
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
  return (
    <Section title={title} count={programs.length} collapsible={collapsible} defaultOpen={!collapsible}>
      <>
        {programs.length === 0 ? (
          emptyText ? <div style={S.empty}>{emptyText}</div> : null
        ) : (
          programs.map((p) => {
            const isAdding = addingTo && addingTo.id === p.id;
            return (
              <div key={p.id} style={S.row}>
                <div style={S.rowMain}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {canManage ? (
                      <input
                        style={{ ...S.input, width: 150, fontWeight: 600 }}
                        defaultValue={p.program_number}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== p.program_number) onUpdateProgram(p, { program_number: v });
                        }}
                        title="Fix a typo in the program number"
                      />
                    ) : (
                      <span style={S.itemName}>{p.program_number}</span>
                    )}
                    {canManage && materials.length > 0 ? (
                      <select style={{ ...S.input, width: 150 }} value={p.material} onChange={(e) => onUpdateProgram(p, { material: e.target.value })}>
                        {!materials.includes(p.material) && <option value={p.material}>{p.material}</option>}
                        {materials.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={S.partTag}>{p.material}</span>
                    )}
                    {p.is_complete && (
                      <span style={{ ...S.chip, color: C.accentFinished, borderColor: C.accentFinished }}>
                        Cut{p.completed_by ? ` by ${p.completed_by}` : ""}
                      </span>
                    )}
                    <SavedCheck fieldKey={`program-${p.id}`} />
                  </div>

                  <div style={{ ...S.chipRow, marginTop: 6 }}>
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

                  {isAdding && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ position: "relative" }}>
                        <input
                          style={S.input}
                          value={addQuery}
                          onChange={(e) => setAddQuery(e.target.value)}
                          placeholder="Type the SigmaNest number, or a job number…"
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
                                <b>{c.job_number}</b> {candidateLabel(c)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {addQuery.trim() && addSuggestions.length === 0 && (
                        <div style={{ ...S.roleHint, marginTop: 6 }}>Nothing matches that, or it is already on this program.</div>
                      )}
                    </div>
                  )}
                </div>

                {canManage && (
                  <div style={S.rowControls}>
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
                      <Ban size={13} />
                    </button>
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
