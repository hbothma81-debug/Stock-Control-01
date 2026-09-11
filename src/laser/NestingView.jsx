import { useState, useMemo } from "react";
import { Plus, X, AlertTriangle, PackagePlus, FileText, Upload, ChevronDown, Check, Undo2, Trash2 } from "lucide-react";
import { C, S } from "../theme.js";
import { plannedMinutes, fmtMinutes } from "../lib/cuttingTime.js";
import Section from "../Section.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { programTitle } from "./programTitle.js";
import ImportReportModal from "./ImportReportModal.jsx";
import StockSectionPicker from "./StockSectionPicker.jsx";
import { stockOptions } from "./stockOptions.js";
import { parseTypedParts } from "./nestingReport.js";
import { parentChoices, NEW_PARENT } from "./ImportReportModal.jsx";

// The parts box on a hand-typed tube program: one part per line.
function TypedPartsBox({ value, onChange, parentPick, parent, setParent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div>
        <label style={S.label}>Parts on this program (one per line: name, qty, length mm)</label>
        <textarea
          style={{ ...S.input, minHeight: 64, fontFamily: "inherit" }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"SSD-5-HOLE-POST THRU, 100, 1000\nSSD-7-HOLE-POST THRU, 50, 1000"}
        />
      </div>
      {value.trim() && parentPick && (
        <div>
          <label style={S.label}>The parts go under</label>
          <TypeToFind options={parentPick.options} value={parent} onChange={setParent} emptyLabel="Pick the job's line…" />
        </div>
      )}
    </div>
  );
}

// Prince's screen, and very nearly the only one he uses.
//
// One screen for both lasers. `machine` is the profile from constants.js
// (LASER_MACHINES): on the plate laser the nester types the SigmaNest
// number, picks a thickness and a grade, names the sheet and gives the
// minutes; on the tube laser the app hands out the number, he types the
// nesting name, picks the section off the Structural Steel list, and
// there is no sheet and no time. The rows and lists are the same.
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

// Used by the New program form, which searches rather than lists --
// starting from a sheet means the jobs that fit it are not the ones on
// screen.
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

// What differs between the lasers on this screen, read off the profile.
// Missing profile means the plate laser, as it always was.
function machineWords(machine) {
  const m = machine || {};
  return {
    name: m.label || m.machine || "Laser 4kw",
    generated: m.numbering === "generated",
    bySections: m.materialFrom === "sections",
    hasSheet: m.hasSheetName !== false,
    hasTime: m.hasCutTime !== false,
    unit: m.unit || "sheet",
    units: m.units || "sheets",
    // What this laser calls the lines it nests, for the heading on the
    // per-part list. "Tube parts" on the tube laser.
    partsLabel: m.partsLabel || "Parts",
  };
}

export default function NestingView({
  machine,
  rows,
  nestedRows,
  programs,
  candidates,
  thicknesses,
  grades,
  sheetNames,
  sections,
  // The tube laser's section picker is real stock: the structural stock
  // rows, every allocation (to say what is set aside and for whom), and
  // the requisition form for a section with nothing on the shelf.
  stockItems,
  allocations,
  canRequisition,
  onRequisition,
  jobLines,
  aliases,
  canManage,
  onClearReport,
  actions,
  SavedCheck,
  Notes,
  onCreateProgram,
  onImportReport,
  onCancelProgram,
  onAddJobToProgram,
  onRemoveJobFromProgram,
  onSetNestingDone,
  onUpdateProgram,
  // Only on a laser that nests part by part (machine.nestPerItem): the
  // per-item control, and where a logged quantity goes. Null on the
  // plate laser, which nests whole sheets and counts nothing per part.
  ItemProgress,
  onLogNestedItem,
}) {
  const [openRow, setOpenRow] = useState(null);
  // The operator hunts for the sheet on the rack, so he needs its name,
  // not just a thickness and a program number.
  const [newSheet, setNewSheet] = useState("");
  // How many times this same nest gets run off the material. One unless
  // Prince says otherwise.
  const [newRepeats, setNewRepeats] = useState("1");
  // Planned cutting time for one sheet, off SigmaNest. Blank means not
  // given, which the cutting screen and shift report both say out loud.
  const [newMinutes, setNewMinutes] = useState("");
  const [search, setSearch] = useState("");
  const [addingTo, setAddingTo] = useState(null);
  const [addQuery, setAddQuery] = useState("");
  // The program a Delete button was pressed on. The reason is asked for
  // in one popup here rather than on each card, and the card may be
  // inside a shut section by the time the answer comes back.
  const [cancelling, setCancelling] = useState(null);
  // The tube software's spreadsheet, brought in instead of typed.
  const [importing, setImporting] = useState(false);

  // The other way in: start from the sheet rather than from a job. Prince
  // uses this when he has an offcut to fill and goes looking for what
  // fits, which is the opposite direction from working down the list.
  const [building, setBuilding] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  // The nesting name, on a laser whose numbers the app hands out.
  const [newName, setNewName] = useState("");
  const [newThickness, setNewThickness] = useState("");
  const [newGrade, setNewGrade] = useState("");
  // The stock line, on a laser whose section is picked off real stock.
  const [newStock, setNewStock] = useState(null);
  // The parts, typed, and which of the first job's lines they go under.
  const [newParts, setNewParts] = useState("");
  const [newParent, setNewParent] = useState("");
  const [picked, setPicked] = useState([]);
  const [jobQuery, setJobQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const w = machineWords(machine);

  const suggestions = useMemo(
    () => matchCandidates(candidates.filter((c) => !picked.some((x) => x.key === c.key)), jobQuery),
    [candidates, jobQuery, picked]
  );
  // What is set aside "for this job" follows the first job put on the
  // program, since that is the job the stock is reserved against.
  const stockChoices = useMemo(
    () => (w.bySections ? stockOptions(stockItems, allocations, picked[0]?.job_id) : []),
    [w.bySections, stockItems, allocations, picked]
  );
  const newParentPick = useMemo(
    () => (w.generated && picked[0] ? parentChoices(jobLines, picked[0].job_id) : null),
    [w.generated, jobLines, picked]
  );

  function resetBuilder() {
    setBuilding(false);
    setNewNumber("");
    setNewName("");
    setNewThickness("");
    setNewGrade("");
    setNewStock(null);
    setNewParts("");
    setNewParent("");
    setNewMinutes("");
    setPicked([]);
    setJobQuery("");
  }

  const identified = w.generated ? !!newName.trim() : !!newNumber.trim();
  const materialPicked = w.bySections ? !!newStock : !!newThickness && !!newGrade;
  const partsSettled = !newParts.trim() || !!newParent;
  const canSubmit = identified && materialPicked && picked.length > 0 && partsSettled && !saving;

  async function submitProgram() {
    if (!canSubmit) return;
    let parts = [];
    try {
      parts = w.generated ? parseTypedParts(newParts) : [];
    } catch (err) {
      alert(err.message);
      return;
    }
    setSaving(true);
    try {
      const ok = await onCreateProgram({
        program_number: newNumber.trim(),
        nesting_name: newName.trim(),
        material: w.bySections ? newStock.material : `${newThickness} ${newGrade}`,
        sheet_name: w.hasSheet ? newSheet.trim() : "",
        sheets_required: newRepeats,
        cut_minutes: w.hasTime ? newMinutes : "",
        // Picking the stock line is picking the stock: that many lengths
        // are set aside for the first job on the program.
        reserve: w.bySections && newStock ? { item: newStock.item, qty: newRepeats } : null,
        parts,
        parent_line_id: newParent && newParent !== NEW_PARENT ? newParent : null,
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

  // One box over the whole screen: a job number typed here should find
  // the job waiting, the program it went on, and the one already cut,
  // without having to know which list to look in.
  const q = search.trim().toLowerCase();
  const rowMatches = (r) =>
    !q ||
    (r.job?.job_number || "").toLowerCase().includes(q) ||
    (r.job?.customer || "").toLowerCase().includes(q) ||
    (r.job?.laser_job_reference || "").toLowerCase().includes(q) ||
    (r.shortage?.board_number || "").toLowerCase().includes(q) ||
    (r.onPrograms || []).some((pg) => programTitle(pg).toLowerCase().includes(q)) ||
    (r.program?.jobs || []).some((l) => (l.job_number || "").toLowerCase().includes(q));
  const programMatches = (pg) =>
    !q ||
    programTitle(pg).toLowerCase().includes(q) ||
    (pg.material || "").toLowerCase().includes(q) ||
    (pg.jobs || []).some(
      (l) =>
        (l.job_number || "").toLowerCase().includes(q) ||
        (l.sigmanest_number || "").toLowerCase().includes(q)
    );

  const shownRows = rows.filter(rowMatches);
  const shownNested = (nestedRows || []).filter(rowMatches);
  const openPrograms = programs.filter((p) => !p.is_complete).filter(programMatches);
  const cutPrograms = programs.filter((p) => p.is_complete).filter(programMatches);
  const nestNowCount = shownRows.filter((r) => r.nestNow).length;

  return (
    <div style={S.list}>
      <datalist id="stk-sheet-names">
        {(sheetNames || []).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <input
        style={S.input}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={
          w.generated
            ? "Search job, nesting name, customer, or program…"
            : "Search job, SigmaNest number, customer, or program…"
        }
      />

      {cancelling && (
        <DeleteProgramModal
          program={cancelling}
          onConfirm={onCancelProgram}
          onClose={() => setCancelling(null)}
        />
      )}

      {importing && (
        <ImportReportModal
          candidates={candidates}
          stockItems={stockItems || []}
          allocations={allocations || []}
          canRequisition={canRequisition}
          onRequisition={onRequisition}
          jobLines={jobLines || []}
          aliases={aliases || []}
          programs={programs}
          onImport={onImportReport}
          onClose={() => setImporting(false)}
        />
      )}

      {canManage && !building && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="stk-btn" style={{ ...S.addBtn, flex: "1 1 200px" }} onClick={() => setBuilding(true)}>
            <Plus size={15} strokeWidth={2.5} />
            New program
          </button>
          {/* The usual way in on the tube laser: the software's export
              makes the programs, and the nester types nothing. */}
          {machine?.importsReport && onImportReport && (
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.addBtn, flex: "1 1 200px" }}
              onClick={() => setImporting(true)}
              title="Bring in the tube software's spreadsheet: one program per section"
            >
              <Upload size={15} strokeWidth={2.5} />
              Import nesting report
            </button>
          )}
        </div>
      )}

      {canManage && building && (
        <div style={{ ...S.deptCard, borderColor: C.accentRaw }}>
          <div style={S.deptCardHead}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>New program on {w.name}</span>
            <button type="button" className="stk-btn" style={S.iconBtn} onClick={resetBuilder} title="Discard">
              <X size={16} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {w.generated ? (
                <div style={{ flex: "1 1 200px" }}>
                  <label style={S.label}>Nesting name</label>
                  <input
                    style={S.input}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="What you call this nest"
                    autoFocus
                  />
                </div>
              ) : (
                <div style={{ flex: "1 1 160px" }}>
                  <label style={S.label}>Program number</label>
                  <input
                    style={S.input}
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    placeholder="What the operator loads"
                    autoFocus
                  />
                </div>
              )}
              {w.bySections ? (
                <div style={{ flex: "2 1 320px" }}>
                  <label style={S.label}>Section, from stock</label>
                  <StockSectionPicker
                    options={stockChoices}
                    value={newStock?.value || ""}
                    onChange={setNewStock}
                    canRequisition={canRequisition}
                    onRequisition={onRequisition}
                  />
                </div>
              ) : (
                <>
                  <div style={{ flex: "1 1 120px" }}>
                    <label style={S.label}>Thickness</label>
                    <TypeToFind options={thicknesses} value={newThickness} onChange={setNewThickness} emptyLabel="Pick…" />
                  </div>
                  <div style={{ flex: "1 1 120px" }}>
                    <label style={S.label}>Grade</label>
                    <TypeToFind options={grades} value={newGrade} onChange={setNewGrade} emptyLabel="Pick…" />
                  </div>
                </>
              )}
              {w.hasSheet && (
                <div style={{ flex: "1 1 150px" }}>
                  <label style={S.label}>Sheet name</label>
                  <input
                    style={S.input}
                    list="stk-sheet-names"
                    value={newSheet}
                    onChange={(e) => setNewSheet(e.target.value)}
                    placeholder="Which sheet"
                  />
                </div>
              )}
              <div style={{ flex: "0 0 108px" }}>
                <label style={S.label}>{w.hasSheet ? "How many" : `How many ${w.units}`}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  style={S.input}
                  value={newRepeats}
                  onChange={(e) => setNewRepeats(e.target.value)}
                  title={`How many ${w.units} this nest is cut off`}
                />
              </div>
              {w.hasTime && (
                <div style={{ flex: "0 0 130px" }}>
                  <label style={S.label}>Minutes per sheet</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    style={S.input}
                    value={newMinutes}
                    onChange={(e) => setNewMinutes(e.target.value)}
                    placeholder="From SigmaNest"
                    title="Planned cutting time for one sheet, in minutes"
                  />
                </div>
              )}
            </div>

            {w.generated && (
              <div style={S.roleHint}>
                The program number is handed out when you press Create. Save the nest under that number in the
                machine's software. One section per program — do not mix sections. The lengths are set aside for
                the first job on the program.
              </div>
            )}
            {!w.bySections && thicknesses.length === 0 && (
              <div style={S.roleHint}>No thicknesses set up yet — add them under Stock Manager → Laser Thicknesses.</div>
            )}

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
                        onClick={() => setPicked((prev) => prev.filter((x) => x.key !== c.key))}
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
                  placeholder="SigmaNest number, job number or customer…"
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
                          setPicked((prev) => {
                            if (prev.length === 0 && w.generated) setNewParent(parentChoices(jobLines, c.job_id).initial);
                            return [...prev, c];
                          });
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

            {w.generated && (
              <TypedPartsBox value={newParts} onChange={setNewParts} parentPick={newParentPick} parent={newParent} setParent={setNewParent} />
            )}

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

      <Section title="To nest" count={shownRows.length}>
        {shownRows.length === 0 ? (
          <div style={S.empty}>
            {q ? "Nothing waiting matches that." : "Nothing waiting. Everything with a nesting stage has been nested off."}
          </div>
        ) : (
          <>
            {nestNowCount > 0 && (
              <div style={{ ...S.roleHint, color: C.danger, marginBottom: 2 }}>
                {nestNowCount} {nestNowCount === 1 ? "needs" : "need"} nesting now.
              </div>
            )}
            {shownRows.map((r) => r.kind === "stopped" ? (
              <StoppedRow
                key={r.key}
                row={r}
                machine={machine}
                canManage={canManage}
                onClearReport={onClearReport}
                onUpdateProgram={onUpdateProgram}
                onDelete={(p) => setCancelling(p)}
                SavedCheck={SavedCheck}
              />
            ) : (
              <NestRow
                key={r.key}
                row={r}
                candidates={candidates}
                sheetNames={sheetNames}
                machine={machine}
                thicknesses={thicknesses}
                grades={grades}
                stockItems={stockItems}
                allocations={allocations}
                canRequisition={canRequisition}
                onRequisition={onRequisition}
                jobLines={jobLines}
                canManage={canManage}
                expanded={openRow === r.key}
                onToggle={() => setOpenRow((k) => (k === r.key ? null : r.key))}
                onCreateProgram={onCreateProgram}
                onSetNestingDone={onSetNestingDone}
                onRemoveJobFromProgram={onRemoveJobFromProgram}
                ItemProgress={ItemProgress}
                onLogNestedItem={onLogNestedItem}
                actions={actions}
                SavedCheck={SavedCheck}
                Notes={Notes}
              />
            ))}
          </>
        )}
      </Section>

      {/* What Prince has finished. Shut by default and kept for good --
          it answers "what did I nest last week", which nothing else did. */}
      <Section title="Nested" count={shownNested.length} collapsible defaultOpen={false}>
        {shownNested.length === 0 ? (
          <div style={S.empty}>{q ? "Nothing nested matches that." : "Nothing finished yet."}</div>
        ) : (
          shownNested.map((r) => (
            <NestedRow key={r.key} row={r} canManage={canManage} onSetNestingDone={onSetNestingDone} />
          ))
        )}
      </Section>

      <ProgramList
        title="Programs waiting to be cut"
        programs={openPrograms}
        emptyText="Nothing waiting to be cut."
        canManage={canManage}
        onClearReport={onClearReport}
        machine={machine}
        thicknesses={thicknesses}
        grades={grades}
        addingTo={addingTo}
        setAddingTo={setAddingTo}
        addQuery={addQuery}
        setAddQuery={setAddQuery}
        addSuggestions={addSuggestions}
        onAddJobToProgram={onAddJobToProgram}
        onRemoveJobFromProgram={onRemoveJobFromProgram}
        onCancelProgram={(p) => setCancelling(p)}
        onUpdateProgram={onUpdateProgram}
        SavedCheck={SavedCheck}
      />

      {/* Cut programs are the operator's business, and the Cutting tab
          keeps that history in full -- so this screen is Prince's three
          lists and nothing else. It still comes back when he searches,
          because the box above promises to find a program wherever it is,
          and a cut one would otherwise be findable nowhere on his screen. */}
      {q && cutPrograms.length > 0 && (
        <ProgramList
          title="Already cut"
          programs={cutPrograms}
          emptyText=""
          collapsible
          canManage={canManage}
          onClearReport={onClearReport}
          machine={machine}
          thicknesses={thicknesses}
          grades={grades}
          addingTo={addingTo}
          setAddingTo={setAddingTo}
          addQuery={addQuery}
          setAddQuery={setAddQuery}
          addSuggestions={addSuggestions}
          onAddJobToProgram={onAddJobToProgram}
          onRemoveJobFromProgram={onRemoveJobFromProgram}
          onCancelProgram={(p) => setCancelling(p)}
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
  candidates,
  machine,
  thicknesses,
  grades,
  sheetNames,
  stockItems,
  allocations,
  canRequisition,
  onRequisition,
  jobLines,
  canManage,

  expanded,
  onToggle,
  onCreateProgram,
  onSetNestingDone,
  onRemoveJobFromProgram,
  ItemProgress,
  onLogNestedItem,
  actions,
  SavedCheck,
  Notes,
}) {
  const [programNumber, setProgramNumber] = useState("");
  const [nestingName, setNestingName] = useState("");
  const [thickness, setThickness] = useState("");
  const [grade, setGrade] = useState("");
  // The stock line picked, on the tube laser.
  const [stockPick, setStockPick] = useState(null);
  // The parts typed, and which of this job's lines they go under.
  const [typedParts, setTypedParts] = useState("");
  const [partsParent, setPartsParent] = useState(null);
  const [alsoOn, setAlsoOn] = useState([]);
  const [alsoQuery, setAlsoQuery] = useState("");
  const [sheet, setSheet] = useState("");
  const [repeats, setRepeats] = useState("1");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  // On a laser that nests part by part, the row opens on the parts and
  // the form for making a program waits behind a button. That is the
  // right way round there: the nester logs parts most visits and makes
  // a program now and then. On the plate laser it is the other way
  // about -- the form is why he opened the row -- so it stays open.
  const foldForm = !!ItemProgress;
  const [showForm, setShowForm] = useState(false);
  const formOpen = !foldForm || showForm;

  // How much of this job has been nested, added up across its parts, for
  // the line on the heading. Null when this laser does not nest per part.
  const nestedCount = useMemo(() => {
    if (!ItemProgress) return null;
    const lines = r.quoteItems || [];
    if (lines.length === 0) return null;
    const progress = r.itemProgress || [];
    return lines.reduce(
      (n, it) => {
        const got = progress.find((ip) => ip.job_quote_item_id === it.id);
        const want = Number(it.qty) || 0;
        return {
          done: n.done + Math.min(want, Math.max(0, Number(got?.qty_complete) || 0)),
          total: n.total + want,
        };
      },
      { done: 0, total: 0 }
    );
  }, [ItemProgress, r.quoteItems, r.itemProgress]);
  const w = machineWords(machine);
  const stockChoices = useMemo(
    () => (w.bySections ? stockOptions(stockItems, allocations, r.job?.id) : []),
    [w.bySections, stockItems, allocations, r.job?.id]
  );
  const parentPick = useMemo(() => (w.generated && r.job ? parentChoices(jobLines, r.job.id) : null), [w.generated, jobLines, r.job]);
  // Settled from the job's lines unless the nester picks otherwise.
  const parentValue = partsParent ?? parentPick?.initial ?? "";

  const sigmanest = r.job?.laser_job_reference || r.shortage?.board_number || "";
  const programText = r.onPrograms && r.onPrograms.length > 0 ? r.onPrograms.map((p) => programTitle(p)).join(", ") : "";
  const hasPrograms = (r.onPrograms || []).length > 0;

  // Anything else can ride on the same sheet -- that is the whole reason
  // programs exist. Typed rather than ticked: a list of every waiting job
  // against every row is a wall of boxes, and the ones that fit a sheet
  // are rarely the ones near it in the list.
  const alsoSuggestions = (() => {
    const aq = alsoQuery.trim().toLowerCase();
    if (!aq) return [];
    const taken = [r.candidate?.key, ...alsoOn.map((c) => c.key)].filter(Boolean);
    return (candidates || [])
      .filter((c) => !taken.includes(c.key))
      .filter(
        (c) =>
          (c.job_number || "").toLowerCase().includes(aq) ||
          (c.sigmanest || "").toLowerCase().includes(aq) ||
          (c.customer || "").toLowerCase().includes(aq)
      )
      .slice(0, 8);
  })();

  const identified = w.generated ? !!nestingName.trim() : !!programNumber.trim();
  const materialPicked = w.bySections ? !!stockPick : !!thickness && !!grade;
  const partsSettled = !typedParts.trim() || !!parentValue;
  const canCreate = identified && materialPicked && !!r.candidate && partsSettled && !saving;

  async function create() {
    if (!canCreate) return;
    let parts = [];
    try {
      parts = w.generated ? parseTypedParts(typedParts) : [];
    } catch (err) {
      alert(err.message);
      return;
    }
    setSaving(true);
    try {
      const chosen = [r.candidate, ...alsoOn];
      const ok = await onCreateProgram({
        program_number: programNumber.trim(),
        nesting_name: nestingName.trim(),
        sheet_name: w.hasSheet ? sheet.trim() : "",
        sheets_required: repeats,
        cut_minutes: w.hasTime ? minutes : "",
        // Stored as one line the way the machine reads it, built from the
        // two lists so nobody types "1.2mm MS" three different ways. On
        // the tube laser it is the stock line's section and grade.
        material: w.bySections ? stockPick.material : `${thickness} ${grade}`,
        // Picking the stock line is picking the stock: that many lengths
        // are set aside for this job.
        reserve: w.bySections && stockPick ? { item: stockPick.item, qty: repeats } : null,
        parts,
        parent_line_id: parentValue && parentValue !== NEW_PARENT ? parentValue : null,
        jobs: chosen.map((c) => ({
          job_id: c.job_id,
          shortage_id: c.shortage_id || null,
          sigmanest_number: c.sigmanest || "",
        })),
      });
      if (ok) {
        setProgramNumber("");
        setNestingName("");
        setThickness("");
        setGrade("");
        setStockPick(null);
        setTypedParts("");
        setPartsParent(null);
        setSheet("");
        setMinutes("");
        setAlsoOn([]);
        setAlsoQuery("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        padding: expanded ? "10px 12px" : "8px 10px",
        borderRadius: 6,
        // An open row is a page of its own, so it gets an edge you can
        // see. The plain border is a hair's breadth off the background
        // and the box ran into the ones above and below it.
        border: r.nestNow
          ? `2px solid ${C.danger}`
          : expanded
          ? `2px solid ${C.accentRaw}`
          : `1px solid ${C.border}`,
        background: expanded ? C.surface : undefined,
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
        <span style={{ color: C.muted, fontSize: 14 }}>{sigmanest || "no SigmaNest #"}</span>
        <span style={{ color: C.muted, fontSize: 14 }}>{r.job?.customer || "no customer"}</span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            color: programText ? C.accentFinished : C.muted,
            fontSize: programText ? 15 : 14,
            fontWeight: programText ? 700 : 400,
          }}
        >
          {programText || "not nested"}
        </span>
        <ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
      </button>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <Field label="Job no" value={r.job?.job_number || "Unknown"} strong />
            <Field label="SigmaNest job no" value={sigmanest || "Not filled in"} muted={!sigmanest} />
            {r.job?.due_date && <Field label="Due" value={new Date(r.job.due_date).toLocaleDateString()} />}
          </div>

          {/* Tube work is not nested all in one go: a job of 8000 parts
              may have 4000 nested now and the rest next week. So the
              parts are listed with a box each, and the job stays here
              with its progress on show. A part logged here carries on
              through the rest of the job without waiting for the
              others, and the stage ticks itself off once every part is
              accounted for.

              First in the box, and inside a border you can actually
              see. This is the thing the nester came to the row to do;
              everything below it is the program, which he only touches
              when he is making one. */}
          {ItemProgress && (
            <div
              style={{
                border: `2px solid ${C.accentRaw}`,
                borderRadius: 6,
                padding: "10px 12px",
                background: C.surface,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.accentRaw }}>{w.partsLabel} nested</span>
                {nestedCount != null && (
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                    {nestedCount.done} of {nestedCount.total}
                  </span>
                )}
              </div>
              <ItemProgress
                process={r.process}
                job={r.job}
                quoteItems={r.quoteItems || []}
                itemProgress={r.itemProgress || []}
                onSubmit={(process, job, item, qty, progress) => onLogNestedItem(r, item, qty, progress)}
              />
              <div style={{ ...S.roleHint, marginTop: 8 }}>
                Type how many were nested and press Log. What is logged moves on through the job on its own;
                the rest stays here.
              </div>
            </div>
          )}

          {/* What this job is nested on. It used to be a run of numbers on
              one line, which is unreadable by the third one and tells you
              nothing about the sheet -- and there was no way to take one
              off again without going down to the program itself. */}
          <div>
            <label style={S.label}>
              {hasPrograms
                ? `Nested on ${r.onPrograms.length} program${r.onPrograms.length > 1 ? "s" : ""}`
                : "Nested on"}
            </label>
            {!hasPrograms ? (
              <div style={S.empty}>Not nested yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {r.onPrograms.map((pg) => (
                  <div
                    key={pg.link?.id || pg.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${pg.is_complete ? C.accentFinished : C.border}`,
                    }}
                  >
                    <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.02em" }}>
                      {programTitle(pg)}
                    </span>
                    {pg.material && <span style={S.partTag}>{pg.material}</span>}
                    {pg.sheet_name && <span style={S.partTag}>{pg.sheet_name}</span>}
                    {plannedMinutes(pg) != null && (
                      <span style={S.partTag} title="Planned cutting time, all sheets">
                        {fmtMinutes(plannedMinutes(pg))}
                      </span>
                    )}
                    {pg.link?.shortage_id && (
                      <span style={{ ...S.chip, borderColor: C.danger, color: C.danger }}>re-cut</span>
                    )}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "right",
                        fontSize: 14,
                        fontWeight: 600,
                        color: pg.is_complete ? C.accentFinished : C.muted,
                      }}
                    >
                      {pg.reported_at
                        ? "Stopped"
                        : Number(pg.sheets_required) > 1
                          ? `${Math.min(Number(pg.sheets_cut) || 0, Number(pg.sheets_required))} of ${pg.sheets_required} cut`
                          : pg.is_complete
                            ? "Cut"
                            : "Waiting to be cut"}
                    </span>
                    {canManage && pg.link && (
                      <button
                        type="button"
                        className="stk-btn"
                        style={S.managerDelete}
                        title={`Take ${r.job?.job_number || "this job"} off ${pg.program_number}`}
                        onClick={() => {
                          // The number is the biggest thing on the row and
                          // the button sits right beside it, so this asks.
                          if (
                            window.confirm(
                              `Take ${r.job?.job_number || "this job"} off program ${pg.program_number}?` +
                                (pg.is_complete ? "\n\nThat program has already been cut." : "")
                            )
                          ) {
                            onRemoveJobFromProgram(pg, pg.link);
                          }
                        }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {r.kind === "shortage" && r.detail && <div style={{ ...S.itemComment, color: C.danger }}>{r.detail}</div>}

          {/* ---- nest it, right here ---- */}
          {canManage && foldForm && !showForm && (
            <button
              type="button"
              className="stk-btn"
              style={{ ...S.addBtn, width: "100%" }}
              onClick={() => setShowForm(true)}
            >
              <Plus size={15} strokeWidth={2.5} />
              {hasPrograms
                ? `Add another program — ${r.onPrograms.length} already on this job`
                : `Nest it on ${w.name}`}
            </button>
          )}

          {canManage && formOpen && (
            <div style={{ border: `1px solid ${C.accentRaw}`, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} />
                {hasPrograms
                  ? `Add another program — ${r.onPrograms.length} already on this job`
                  : `Nest it on ${w.name}`}
                {foldForm && (
                  <>
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="stk-btn"
                      style={S.iconBtn}
                      onClick={() => setShowForm(false)}
                      title="Put this away"
                    >
                      <X size={16} />
                    </button>
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {w.generated ? (
                  <div style={{ flex: "1 1 200px" }}>
                    <label style={S.label}>Nesting name</label>
                    <input
                      style={S.input}
                      value={nestingName}
                      onChange={(e) => setNestingName(e.target.value)}
                      placeholder="What you call this nest"
                    />
                  </div>
                ) : (
                  <div style={{ flex: "1 1 160px" }}>
                    <label style={S.label}>Program number</label>
                    <input
                      style={S.input}
                      value={programNumber}
                      onChange={(e) => setProgramNumber(e.target.value)}
                      placeholder="What the operator loads"
                    />
                  </div>
                )}
                {w.bySections ? (
                  <div style={{ flex: "2 1 320px" }}>
                    <label style={S.label}>Section, from stock</label>
                    <StockSectionPicker
                      options={stockChoices}
                      value={stockPick?.value || ""}
                      onChange={setStockPick}
                      canRequisition={canRequisition}
                      onRequisition={onRequisition}
                    />
                  </div>
                ) : (
                  <>
                    <div style={{ flex: "1 1 120px" }}>
                      <label style={S.label}>Thickness</label>
                      <TypeToFind options={thicknesses} value={thickness} onChange={setThickness} emptyLabel="Pick…" />
                    </div>
                    <div style={{ flex: "1 1 120px" }}>
                      <label style={S.label}>Grade</label>
                      <TypeToFind options={grades} value={grade} onChange={setGrade} emptyLabel="Pick…" />
                    </div>
                  </>
                )}
                {w.hasSheet && (
                  <div style={{ flex: "1 1 150px" }}>
                    <label style={S.label}>Sheet name</label>
                    <input
                      style={S.input}
                      list="stk-sheet-names"
                      value={sheet}
                      onChange={(e) => setSheet(e.target.value)}
                      placeholder="Which sheet"
                    />
                  </div>
                )}
                <div style={{ flex: "0 0 108px" }}>
                  <label style={S.label}>{w.hasSheet ? "How many" : `How many ${w.units}`}</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    style={S.input}
                    value={repeats}
                    onChange={(e) => setRepeats(e.target.value)}
                    title={`How many ${w.units} this nest is cut off`}
                  />
                </div>
                {w.hasTime && (
                  <div style={{ flex: "0 0 130px" }}>
                    <label style={S.label}>Minutes per sheet</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      style={S.input}
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                      placeholder="From SigmaNest"
                      title="Planned cutting time for one sheet, in minutes"
                    />
                  </div>
                )}
              </div>

              {w.generated && (
                <div style={S.roleHint}>
                  The program number is handed out when you press Nest it. Save the nest under that number in the
                  machine's software. One section per program — do not mix sections. The lengths are set aside for
                  this job.
                </div>
              )}
              {!w.bySections && thicknesses.length === 0 && (
                <div style={S.roleHint}>No thicknesses set up yet — add them under Stock Manager → Laser Thicknesses.</div>
              )}

              <div>
                <label style={S.label}>{w.hasSheet ? "Anything else on the same sheet" : "Anything else on the same program"}</label>
                {alsoOn.length > 0 && (
                  <div style={{ ...S.chipRow, marginBottom: 6 }}>
                    {alsoOn.map((c) => (
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
                          onClick={() => setAlsoOn((prev) => prev.filter((x) => x.key !== c.key))}
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
                    value={alsoQuery}
                    onChange={(e) => setAlsoQuery(e.target.value)}
                    placeholder="Start typing a job or SigmaNest number…"
                  />
                  {alsoSuggestions.length > 0 && (
                    <div style={S.suggestDropdown}>
                      {alsoSuggestions.map((c) => (
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
                            setAlsoOn((prev) => [...prev, c]);
                            setAlsoQuery("");
                          }}
                        >
                          <b>{c.job_number}</b> {c.sigmanest || "no SigmaNest #"}
                          {c.detail ? ` · ${c.detail}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {w.generated && (
                <TypedPartsBox
                  value={typedParts}
                  onChange={setTypedParts}
                  parentPick={parentPick}
                  parent={parentValue}
                  setParent={setPartsParent}
                />
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

              {/* Hidden on a laser that nests part by part: the parts
                  list at the top is what the nester works off, and the
                  drawings underneath made an already tall box taller.
                  The plate laser still shows them -- Prince uses them. */}
              {!ItemProgress && r.drawings && r.drawings.length > 0 && (
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

              {/* The only thing that moves a job off this list. It used to
                  be a checkbox below the drawings, which nobody found, so
                  jobs sat here with every program already cut. */}
              <div>
                <button
                  type="button"
                  className="stk-btn"
                  style={hasPrograms ? S.submitBtn : S.submitBtnDisabled}
                  disabled={!hasPrograms}
                  onClick={() => onSetNestingDone(r.job, r.process, true)}
                >
                  <Check size={14} /> Done nesting — nothing more coming for this job
                </button>
                {!hasPrograms && (
                  <div style={{ ...S.roleHint, marginTop: 4 }}>
                    Nothing nested on this job yet. Cut outside the app? Tick its nesting stage on the job itself.
                  </div>
                )}
              </div>
              <SavedCheck fieldKey={`nesting-${r.process.id}`} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One line per job Prince has finished, newest first. No chevron: there is
// nothing behind it he has to act on. The only control is Undo, because
// the button that put it here is easy to press by accident and putting a
// job back used to mean going into the job itself.
function NestedRow({ row: r, canManage, onSetNestingDone }) {
  const sigmanest = r.job?.laser_job_reference || "";
  const total = (r.onPrograms || []).length;
  const allCut = total > 0 && r.cutCount === total;
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        border: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 15 }}>{r.job?.job_number || "Unknown"}</span>
      <span style={{ color: C.muted, fontSize: 14 }}>{sigmanest || "no SigmaNest #"}</span>
      <span style={{ color: C.muted, fontSize: 14 }}>{r.job?.customer || "no customer"}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.accentFinished }}>
        {(r.onPrograms || []).map((p) => programTitle(p)).join(", ")}
      </span>
      <span style={{ ...S.chip, flexShrink: 0, ...(allCut ? { color: C.accentFinished, borderColor: C.accentFinished } : {}) }}>
        {total === 0 ? "no programs" : allCut ? "all cut" : `${r.cutCount} of ${total} cut`}
      </span>
      {r.process?.completed_at && (
        <span style={{ ...S.roleHint, flexShrink: 0 }}>
          {new Date(r.process.completed_at).toLocaleDateString()}
        </span>
      )}
      {canManage && (
        <button
          type="button"
          className="stk-btn"
          style={S.reqActionBtnMuted}
          onClick={() => onSetNestingDone(r.job, r.process, false)}
          title="Put this back on the To nest list"
        >
          <Undo2 size={12} /> Undo
        </button>
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
  onClearReport,
  machine,
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
  const w = machineWords(machine);

  return (
    <Section title={title} count={programs.length} collapsible defaultOpen={!collapsible}>
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
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{programTitle(p)}</span>
                  <span style={{ color: C.muted, fontSize: 14 }}>{p.material}</span>
                  {p.sheet_name && <span style={{ color: C.muted, fontSize: 14 }}>{p.sheet_name}</span>}
                  {Number(p.part_count) > 0 && (
                    <span style={{ color: C.muted, fontSize: 14 }}>{p.part_count} parts</span>
                  )}
                  <span style={{ flex: 1, minWidth: 0, color: C.muted, fontSize: 14 }}>{jobsText}</span>
                  {p.reported_at && (
                    <span style={{ ...S.chip, color: C.danger, border: `1px solid ${C.danger}`, fontWeight: 700 }}>
                      Stopped
                    </span>
                  )}
                  {p.is_complete && <span style={{ ...S.chip, color: C.accentFinished, borderColor: C.accentFinished }}>Cut</span>}
                  <ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
                </button>

                {expanded && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
                    {p.reported_at && (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: `1px solid ${C.danger}`,
                          background: C.dangerTint,
                          color: C.danger,
                          fontSize: 14,
                        }}
                      >
                        <b>Stopped at the machine</b> — {p.reported_reason}
                        {p.reported_offcut_length && p.reported_offcut_width ? (
                          <> · nest on offcut {p.reported_offcut_length} × {p.reported_offcut_width}</>
                        ) : null}
                        {p.reported_plate ? <> · use plate {p.reported_plate}</> : null}
                        <div style={{ ...S.roleHint, color: C.danger }}>
                          {p.reported_by}
                          {p.reported_at ? ` — ${new Date(p.reported_at).toLocaleString()}` : ""}
                        </div>
                        {canManage && onClearReport && (
                          <button
                            type="button"
                            className="stk-btn"
                            style={{ ...S.reqActionBtn, marginTop: 8 }}
                            onClick={() => onClearReport(p)}
                            title="Sorted — take the stop off"
                          >
                            Sorted
                          </button>
                        )}
                      </div>
                    )}
                    {canManage && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {/* A number the app handed out is not for changing:
                            the nest is saved under it in the machine's
                            software. The name is the nester's, and is. */}
                        {w.generated ? (
                          <div style={{ flex: "1 1 200px" }}>
                            <label style={S.label}>Nesting name</label>
                            <input
                              style={S.input}
                              defaultValue={p.nesting_name || ""}
                              placeholder="What you call this nest"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== (p.nesting_name || "")) onUpdateProgram(p, { nesting_name: v });
                              }}
                            />
                          </div>
                        ) : (
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
                        )}
                        <div style={{ flex: "1 1 150px" }}>
                          <label style={S.label}>{w.bySections ? "Section" : "Material"}</label>
                          <input
                            style={S.input}
                            defaultValue={p.material}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== p.material) onUpdateProgram(p, { material: v });
                            }}
                          />
                        </div>
                        {w.hasTime && (
                          <div style={{ flex: "0 0 130px" }}>
                            <label style={S.label}>Minutes per sheet</label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              inputMode="decimal"
                              style={S.input}
                              defaultValue={p.cut_minutes ?? ""}
                              placeholder="From SigmaNest"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                const was = p.cut_minutes == null ? "" : String(p.cut_minutes);
                                if (v !== was) onUpdateProgram(p, { cut_minutes: v === "" ? null : Number(v) });
                              }}
                            />
                          </div>
                        )}
                        <SavedCheck fieldKey={`program-${p.id}`} />
                      </div>
                    )}

                    {Array.isArray(p.parts) && p.parts.length > 0 && (
                      <div>
                        <label style={S.label}>Parts on this program · {p.part_count} off</label>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                          {p.parts.map((pt, i) => (
                            <div key={i} style={{ fontSize: 13, display: "flex", gap: 8 }}>
                              <span style={{ fontWeight: 600 }}>{pt.qty}×</span>
                              <span style={{ flex: 1 }}>{pt.name}</span>
                              {pt.length ? <span style={S.roleHint}>{pt.length} mm</span> : null}
                            </div>
                          ))}
                        </div>
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
                        <button type="button" className="stk-btn" style={S.managerDelete} onClick={() => onCancelProgram(p)} title="Delete this program — it asks why">
                          <Trash2 size={13} /> Delete program
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

// A program the operator has stopped at the machine. It sits at the top
// of To nest, outlined like anything else that needs nesting now, and
// says what stopped it and what he suggests instead. It opens to the
// program itself -- number, material, sheet, minutes -- because putting
// it right usually means re-nesting on the offcut he named and giving
// the new nest its own number. Sorted takes the stop off and puts the
// program back on his cut list.
function StoppedRow({ row: r, machine, canManage, onClearReport, onUpdateProgram, onDelete, SavedCheck }) {
  const p = r.program;
  const [open, setOpen] = useState(false);
  const jobs = (p.jobs || []).map((l) => l.job_number || "unknown job");
  const w = machineWords(machine);

  // Each box saves on its own when you leave it, the way the program
  // list below does. Blank minutes means not given, not zero.
  const field = (label, key, extra = {}) => (
    <div style={{ flex: extra.flex || "1 1 150px" }}>
      <label style={S.label}>{label}</label>
      <input
        style={S.input}
        type={extra.type || "text"}
        min={extra.type === "number" ? "0" : undefined}
        step={extra.type === "number" ? "0.1" : undefined}
        inputMode={extra.type === "number" ? "decimal" : undefined}
        list={extra.list}
        placeholder={extra.placeholder}
        defaultValue={p[key] ?? ""}
        onBlur={(e) => {
          const v = e.target.value.trim();
          const was = p[key] == null ? "" : String(p[key]);
          if (v === was) return;
          if (extra.type === "number") onUpdateProgram(p, { [key]: v === "" ? null : Number(v) });
          else if (extra.required && !v) e.target.value = was;
          else onUpdateProgram(p, { [key]: v || null });
        }}
      />
    </div>
  );

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        border: `2px solid ${C.danger}`,
        background: C.dangerTint,
      }}
    >
      <button
        type="button"
        className="stk-btn"
        onClick={() => setOpen((v) => !v)}
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
        <span style={{ ...S.chip, borderColor: C.danger, color: C.danger, fontWeight: 700, flexShrink: 0 }}>
          Stopped at the machine
        </span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{programTitle(p)}</span>
        <span style={{ color: C.muted, fontSize: 14 }}>{p.material}</span>
        {p.sheet_name && <span style={{ color: C.muted, fontSize: 14 }}>{p.sheet_name}</span>}
        <span style={{ flex: 1, minWidth: 0, color: C.muted, fontSize: 14 }}>
          {jobs.length ? jobs.join(", ") : "no jobs on it"}
        </span>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
      </button>

      <div style={{ marginTop: 6, color: C.danger, fontSize: 14 }}>
        <b>{p.reported_reason}</b>
        {p.reported_offcut_length && p.reported_offcut_width ? (
          <> · nest on offcut {p.reported_offcut_length} × {p.reported_offcut_width}</>
        ) : p.reported_offcut_length ? (
          <> · nest on offcut {p.reported_offcut_length} long</>
        ) : null}
        {p.reported_plate ? <> · use {w.bySections ? "section" : "plate"} {p.reported_plate}</> : null}
      </div>
      <div style={{ ...S.roleHint, color: C.danger }}>
        {p.reported_by}
        {p.reported_at ? ` — ${new Date(p.reported_at).toLocaleString()}` : ""}
      </div>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.danger}44`, display: "flex", flexDirection: "column", gap: 10 }}>
          {canManage ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              {w.generated
                ? field("Nesting name", "nesting_name", { required: true, placeholder: "What you call this nest" })
                : field("Program number", "program_number", { required: true })}
              {field(w.bySections ? "Section" : "Material", "material", { required: true })}
              {w.hasSheet && field("Sheet name", "sheet_name", { list: "stk-sheet-names", placeholder: "Which sheet" })}
              {w.hasTime && field("Minutes per sheet", "cut_minutes", { type: "number", flex: "0 0 130px", placeholder: "From SigmaNest" })}
              {SavedCheck && <SavedCheck fieldKey={`program-${p.id}`} />}
            </div>
          ) : (
            <div style={S.roleHint}>Only whoever nests can change the program.</div>
          )}
          {canManage && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="stk-btn"
                style={S.reqActionBtn}
                onClick={() => onClearReport && onClearReport(p)}
                title="Take the stop off and put it back on the cut list"
              >
                Sorted
              </button>
              <button
                type="button"
                className="stk-btn"
                style={S.managerDelete}
                onClick={() => onDelete && onDelete(p)}
                title="Delete this program — it asks why"
              >
                <Trash2 size={13} /> Delete program
              </button>
              <span style={S.roleHint}>
                Change what needs changing above — it saves as you leave each box — then press Sorted and it
                goes back on the cut list. Or delete it and nest the jobs afresh.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Delete a program, with a reason. Prince's and an admin's button.
//
// "Delete" is the word on the screen; underneath the program is
// cancelled and kept, with who, when, and the reason typed here in its
// history, so "what happened to 8821" stays answerable. It comes off the
// cut list and off this screen. The jobs on it go back to To nest if
// their nesting stage is still open.
function DeleteProgramModal({ program: p, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const jobs = (p.jobs || []).map((l) => l.job_number || "unknown job");
  return (
    <div style={{ ...S.modalOverlay, zIndex: 30 }} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Delete {programTitle(p)}?</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={S.roleHint}>
          {p.material}
          {p.sheet_name ? ` · ${p.sheet_name}` : ""}
          {jobs.length ? ` · ${jobs.join(", ")}` : " · no jobs on it"}
        </div>
        <div style={{ ...S.roleHint, marginTop: 6 }}>
          It comes off the cut list and off this screen. It stays on record with its history and the
          reason, so it can always be looked up.
        </div>

        <label style={{ ...S.label, marginTop: 10, display: "block" }}>Why?</label>
        <input
          style={S.input}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Short and plain — e.g. nested twice, wrong material"
          autoFocus
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="stk-btn"
            style={{ ...S.submitBtn, flex: 1, marginTop: 0, background: C.danger, color: "#fff" }}
            disabled={!reason.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try {
                if (await onConfirm(p, reason)) onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Deleting…" : "Delete program"}
          </button>
          <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, flex: 1 }} onClick={onClose}>
            Keep it
          </button>
        </div>
      </div>
    </div>
  );
}
