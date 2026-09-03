import { useState, useMemo } from "react";
import { Plus, X, Ban } from "lucide-react";
import { C, S } from "../theme.js";

// Prince's screen. Jobs waiting to be nested, and the SigmaNest programs
// he builds out of them.
//
// This replaces a Microsoft To Do list where he typed a program number and
// a material and nothing else was tracked. The reason it cannot just be a
// field on a job is that he combines several jobs onto one nest to use the
// sheet properly: one program carries many jobs, and a job with two
// materials lands on two programs.
//
// No database calls in here. The parent owns all of that, the same way
// UserManagement works -- this renders and collects, and calls back.

// What can go on a program: a job, or a shortage waiting to be re-cut.
// Both are searched together because on the floor they are the same
// decision -- a re-cut gets nested in with everything else of that
// material rather than being handled on its own.
//
// Either way it is attached by identity, never by the SigmaNest number
// typed to find it, so correcting that number later cannot break the
// link. Searching covers both, because Prince reads a SigmaNest number
// off his screen while the rest of the shop talks in job numbers.
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

// One row in the picker, and the same wording on a chip once picked.
function candidateLabel(c) {
  const bits = [c.sigmanest || "no SigmaNest #"];
  if (c.customer) bits.push(c.customer);
  if (c.detail) bits.push(c.detail);
  return bits.join(" · ");
}

export default function NestingView({
  machine,
  jobsToNest,
  programs,
  candidates,
  materials,
  canManage,
  onCreateProgram,
  onCancelProgram,
  onAddJobToProgram,
  onRemoveJobFromProgram,
  onMarkJobNested,
  onUpdateProgram,
  SavedCheck,
}) {
  const [building, setBuilding] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newMaterial, setNewMaterial] = useState("");
  const [picked, setPicked] = useState([]);
  const [jobQuery, setJobQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Which program's "add another job" box is open, and what is typed in it.
  const [addingTo, setAddingTo] = useState(null);
  const [addQuery, setAddQuery] = useState("");

  const suggestions = useMemo(
    () => matchCandidates(candidates.filter((c) => !picked.some((p) => p.key === c.key)), jobQuery),
    [candidates, jobQuery, picked]
  );

  const addSuggestions = useMemo(() => {
    if (!addingTo) return [];
    // A job already on this program should not be offered again, and
    // neither should a re-cut already on it.
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

  return (
    <div style={S.list}>
      {/* ---------- build a program ---------- */}

      {canManage && !building && (
        <button type="button" className="stk-btn" style={{ ...S.addBtn, width: "100%" }} onClick={() => setBuilding(true)}>
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
                <div style={S.roleHint}>
                  No laser materials set up yet. Add them under Stock Manager → Laser Materials first.
                </div>
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
              <label style={S.label}>Jobs on this program</label>
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
                  placeholder="Type the SigmaNest number, or a job number…"
                />
                {suggestions.length > 0 && (
                  <div style={S.suggestDropdown}>
                    {suggestions.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className="stk-btn"
                        style={{
                          ...S.suggestItem,
                          width: "100%",
                          textAlign: "left",
                          ...(c.kind === "shortage" ? { color: C.danger } : {}),
                        }}
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
              {saving ? "Saving…" : `Create program${picked.length ? ` — ${picked.length} job${picked.length > 1 ? "s" : ""}` : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* ---------- waiting to be nested ---------- */}

      <div style={S.gradeBlock}>
        <div style={S.gradeHeader}>
          <span style={S.gradeTitle}>Waiting to be nested</span>
          <span style={S.gradeCount}>{jobsToNest.length}</span>
        </div>
        <div style={S.gradeItems}>
          {jobsToNest.length === 0 ? (
            <div style={S.empty}>Nothing waiting. Every job with a nesting stage has been nested off.</div>
          ) : (
            jobsToNest.map(({ job, process, onPrograms }) => (
              <div key={job.id} style={S.row}>
                <div style={S.rowMain}>
                  <span style={S.itemName}>{job.job_number}</span>
                  <div style={S.rowMeta}>
                    <span style={S.customerTag}>{job.customer || "No customer"}</span>
                    <span style={S.partTag}>{job.laser_job_reference || "No SigmaNest #"}</span>
                    {job.due_date && <span style={S.rowMeta}>Due {new Date(job.due_date).toLocaleDateString()}</span>}
                  </div>
                  {onPrograms.length > 0 ? (
                    <div style={{ ...S.chipRow, marginTop: 4 }}>
                      {onPrograms.map((p) => (
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
                  ) : (
                    <div style={S.roleHint}>Not on a program yet.</div>
                  )}
                </div>
                {canManage && (
                  <div style={S.rowControls}>
                    <label style={S.checkRow}>
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => onMarkJobNested(job, process)}
                      />
                      Fully nested
                    </label>
                    <SavedCheck fieldKey={`nesting-${process.id}`} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={S.roleHint}>
        Tick <b>Fully nested</b> when there are no more programs coming for that job. Until then the laser cannot know
        whether a job with parts still to nest is finished or only started.
      </div>

      {/* ---------- the programs ---------- */}

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

function ProgramList({
  title,
  programs,
  emptyText,
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
    <div style={S.gradeBlock}>
      <div style={S.gradeHeader}>
        <span style={S.gradeTitle}>{title}</span>
        <span style={S.gradeCount}>{programs.length}</span>
      </div>
      <div style={S.gradeItems}>
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
                      <select
                        style={{ ...S.input, width: 150 }}
                        value={p.material}
                        onChange={(e) => onUpdateProgram(p, { material: e.target.value })}
                      >
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
                                style={{
                                  ...S.suggestItem,
                                  width: "100%",
                                  textAlign: "left",
                                  ...(c.kind === "shortage" ? { color: C.danger } : {}),
                                }}
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
                        <div style={{ ...S.roleHint, marginTop: 6 }}>
                          Nothing matches that, or it is already on this program.
                        </div>
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
                    <button
                      type="button"
                      className="stk-btn"
                      style={S.managerDelete}
                      onClick={() => onCancelProgram(p)}
                      title="Cancel this program"
                    >
                      <Ban size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
