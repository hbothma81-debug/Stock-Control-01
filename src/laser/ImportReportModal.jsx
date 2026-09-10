import { useState, useMemo } from "react";
import { X, Upload, Check } from "lucide-react";
import { C, S } from "../theme.js";
import StockSectionPicker from "./StockSectionPicker.jsx";
import { stockOptions, optionForMaterial } from "./stockOptions.js";
import { parseNestingList, findNestingListSheet, nestsNote, referenceFromFileName } from "./nestingReport.js";

// Bringing in the tube software's spreadsheet export, so the nester does
// not type programs by hand.
//
// Pick the file; the app reads its Nesting List sheet and shows what it
// is about to make: one program per section, with the section's tube
// count as the lengths. The nester says which job (or jobs) it is for,
// and which entry on the Structural Steel list each of the software's
// sections means -- asked once, remembered after. Create makes the
// programs and shows the numbers handed out, which is what he types into
// the tube software when he exports each section's cut file.
//
// Nothing here writes to the database. The parent owns that.

// Three steps on one screen: pick, check, done.
export default function ImportReportModal({
  candidates,
  stockItems,
  allocations,
  canRequisition,
  onRequisition,
  aliases,
  programs,
  onImport,
  onClose,
}) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [reference, setReference] = useState("");
  // Each section's chosen stock line (its id), by the software's wording.
  const [chosen, setChosen] = useState({});
  const [picked, setPicked] = useState([]);
  const [jobQuery, setJobQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState(null);

  // The stock lines to pick from. What is "set aside for this job"
  // follows the first job picked; the ids stay the same whichever job
  // it is, so a choice made before the job is picked still stands.
  const options = useMemo(
    () => stockOptions(stockItems, allocations, picked[0]?.job_id),
    [stockItems, allocations, picked]
  );
  const optionOf = (reportSection) => options.find((o) => o.value === chosen[reportSection]) || null;

  const aliasFor = (reportSection) =>
    (aliases || []).find((a) => a.report_section === reportSection)?.section_name || "";
  // The stock line the remembered wording points at, if it still exists.
  const remembered = (reportSection) => optionForMaterial(options, aliasFor(reportSection));

  async function readFile(file) {
    if (!file) return;
    setReading(true);
    setError("");
    setParsed(null);
    try {
      // The spreadsheet library is big and only needed here, so it loads
      // when the file is picked, the same way the exports load it.
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = findNestingListSheet(wb.SheetNames);
      if (!sheetName) {
        throw new Error(
          `No "Nesting List" sheet in this file (it has: ${wb.SheetNames.join(", ")}). Export the report from the tube software, simple or detailed.`
        );
      }
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: "" });
      const result = parseNestingList(rows);
      setParsed(result);
      setFileName(file.name);
      setReference(referenceFromFileName(file.name));
      const first = {};
      for (const s of result.sections) first[s.reportSection] = remembered(s.reportSection)?.value || "";
      setChosen(first);
    } catch (err) {
      console.error("Could not read the nesting report:", err);
      setError(err?.message || "Could not read that file.");
    } finally {
      setReading(false);
    }
  }

  const suggestions = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    if (!q) return [];
    return (candidates || [])
      .filter((c) => c.kind === "job" && !picked.some((p) => p.key === c.key))
      .filter(
        (c) =>
          (c.job_number || "").toLowerCase().includes(q) ||
          (c.customer || "").toLowerCase().includes(q) ||
          (c.sigmanest || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [candidates, jobQuery, picked]);

  // A live program with this reference and section is already on the
  // cut list: the same file brought in twice. Said, not stopped -- a
  // second batch of the same section is a real thing too.
  const alreadyThere = (reportSection) => {
    const material = optionOf(reportSection)?.material;
    if (!material || !reference.trim()) return false;
    return (programs || []).some(
      (p) => !p.is_cancelled && (p.nesting_name || "").trim().toLowerCase() === reference.trim().toLowerCase() && p.material === material
    );
  };

  const allChosen = parsed ? parsed.sections.every((s) => !!optionOf(s.reportSection)) : false;
  const canCreate = !!parsed && allChosen && picked.length > 0 && !!reference.trim() && !saving;

  async function create() {
    if (!canCreate) return;
    setSaving(true);
    try {
      const result = await onImport({
        nesting_name: reference.trim(),
        sections: parsed.sections.map((s) => {
          const o = optionOf(s.reportSection);
          return {
            reportSection: s.reportSection,
            material: o.material,
            item: o.item,
            lengths: s.tubes,
            note: `From ${fileName}: ${nestsNote(s)}`,
          };
        }),
        jobs: picked.map((c) => ({ job_id: c.job_id, shortage_id: null, sigmanest_number: c.sigmanest || "" })),
      });
      if (result) setMade(result);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...S.modalOverlay, zIndex: 30 }} onClick={made ? onClose : undefined}>
      <div style={{ ...S.modal, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Import nesting report</span>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {made ? (
          // ---- done: the numbers to type into the tube software ----
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ ...S.roleHint, color: C.accentFinished, fontWeight: 600 }}>
              {made.length === 1 ? "1 program made" : `${made.length} programs made`} and on the cut list.
            </div>
            <div style={S.roleHint}>
              Export each section's cut file from the tube software and save it as its program number:
            </div>
            {made.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.04em" }}>{m.program_number}</span>
                <span style={{ fontSize: 14 }}>{m.material}</span>
                <span style={S.roleHint}>
                  {m.lengths} {m.lengths === 1 ? "length" : "lengths"}
                </span>
              </div>
            ))}
            <button type="button" className="stk-btn" style={S.submitBtn} onClick={onClose}>
              <Check size={14} /> Done
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* ---- pick the file ---- */}
            <div>
              <label style={{ ...S.reqActionBtnMuted, display: "inline-flex", cursor: "pointer", width: "fit-content" }}>
                <Upload size={13} /> {parsed ? "Pick a different file" : "Pick the spreadsheet"}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    readFile(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {fileName && parsed && <span style={{ ...S.roleHint, marginLeft: 10 }}>{fileName}</span>}
              {!parsed && !error && !reading && (
                <div style={{ ...S.roleHint, marginTop: 6 }}>
                  The export from the tube software, simple or detailed. The app reads its Nesting List: one program per
                  section, the section's tube count as the lengths.
                </div>
              )}
              {reading && <div style={{ ...S.roleHint, marginTop: 6 }}>Reading…</div>}
              {error && <div style={{ ...S.roleHint, marginTop: 6, color: C.danger }}>{error}</div>}
            </div>

            {parsed && (
              <>
                {/* ---- what it is for ---- */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 200px" }}>
                    <label style={S.label}>Reference</label>
                    <input
                      style={S.input}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="The file name, or what this job is called"
                    />
                  </div>
                </div>

                <div>
                  <label style={S.label}>Job{picked.length > 1 ? "s" : ""}</label>
                  {picked.length > 0 && (
                    <div style={{ ...S.chipRow, marginBottom: 6 }}>
                      {picked.map((c) => (
                        <span key={c.key} style={{ ...S.chip, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {c.job_number}
                          {c.customer ? ` · ${c.customer}` : ""}
                          <button
                            type="button"
                            className="stk-btn"
                            style={{ ...S.iconBtn, padding: 0, minWidth: 0 }}
                            onClick={() => setPicked((prev) => prev.filter((x) => x.key !== c.key))}
                            title="Take this job off"
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
                      placeholder="Job number or customer…"
                      autoFocus
                    />
                    {suggestions.length > 0 && (
                      <div style={S.suggestDropdown}>
                        {suggestions.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            className="stk-btn"
                            style={{ ...S.suggestItem, width: "100%", textAlign: "left" }}
                            onClick={() => {
                              setPicked((prev) => [...prev, c]);
                              setJobQuery("");
                            }}
                          >
                            <b>{c.job_number}</b> {c.customer || "no customer"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {jobQuery.trim() && suggestions.length === 0 && (
                    <div style={{ ...S.roleHint, marginTop: 6 }}>Nothing matches that. The job has to be in the app already.</div>
                  )}
                </div>

                {/* ---- the programs it will make ---- */}
                <div>
                  <label style={S.label}>
                    {parsed.sections.length === 1 ? "1 program" : `${parsed.sections.length} programs`} to make
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                    {parsed.sections.map((s) => (
                      <div
                        key={s.reportSection}
                        style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${alreadyThere(s.reportSection) ? C.danger : C.border}` }}
                      >
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                          <div style={{ flex: "1 1 220px" }}>
                            <div style={S.roleHint}>The software calls it</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{s.reportSection}</div>
                          </div>
                          <div style={{ flex: "2 1 300px" }}>
                            <label style={S.label}>In stock it is</label>
                            <StockSectionPicker
                              options={options}
                              value={chosen[s.reportSection] || ""}
                              onChange={(o) => setChosen((prev) => ({ ...prev, [s.reportSection]: o ? o.value : "" }))}
                              canRequisition={canRequisition}
                              onRequisition={onRequisition}
                            />
                          </div>
                          <div style={{ flex: "0 0 auto", textAlign: "right" }}>
                            <div style={S.roleHint}>Lengths</div>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>{s.tubes}</div>
                          </div>
                        </div>
                        <div style={{ ...S.roleHint, marginTop: 4 }}>{nestsNote(s)}</div>
                        {remembered(s.reportSection) && chosen[s.reportSection] === remembered(s.reportSection).value && (
                          <div style={S.roleHint}>Remembered from last time.</div>
                        )}
                        {alreadyThere(s.reportSection) && (
                          <div style={{ ...S.roleHint, color: C.danger }}>
                            A live program for {reference.trim()} on this section already exists. Carry on only if this is
                            a second batch.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ ...S.roleHint, marginTop: 6 }}>
                    Each section's lengths are set aside for the first job picked, against its nesting stage.
                  </div>
                </div>

                <button
                  type="button"
                  className="stk-btn"
                  style={canCreate ? S.submitBtn : S.submitBtnDisabled}
                  disabled={!canCreate}
                  onClick={create}
                >
                  {saving
                    ? "Making programs…"
                    : `Create ${parsed.sections.length === 1 ? "program" : `${parsed.sections.length} programs`}`}
                </button>
                {parsed && !allChosen && <div style={S.roleHint}>Pick a stock line for every section first.</div>}
                {parsed && allChosen && picked.length === 0 && <div style={S.roleHint}>Pick the job first.</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
