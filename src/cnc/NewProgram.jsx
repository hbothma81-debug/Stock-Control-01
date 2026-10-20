// New program: pick the STEP file, the customer, the material, the Stock
// and the Process, press Generate. Stock and Process must be picked
// (Heinrich, 11 Oct 2026); everything else sits under a shut "More
// settings" on the same form (Heinrich, 8 Oct 2026); empty means the
// engine decides.
// Clicks: CNC, New program, pick STEP, customer, material, Stock, Process,
// Generate.
//
// Opened from the Shapes list it takes the shape's sizes instead of a STEP
// and is saved the same way, as an ordinary program (Heinrich, 8 Oct 2026).
// Clicks: CNC, Shapes, the shape, the sizes, customer, material, Stock,
// Process, Generate.
//
// Opened from a program's "+ Sub / 2nd op" (subOf = that program) it makes
// a program in the same block of ten: the database gives the lowest free
// number after the main (setup-cnc-15-program-blocks.sql; Heinrich, 14 Oct
// 2026). Customer and material come from the main. Clicks: the program,
// + Sub / 2nd op, pick STEP, Stock, Process, Generate.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, S } from "../theme.js";
import { createProgram, previewProgram } from "./cncData.js";
import { cleanSettings, cleanSizes, newNumberProblem, oNumber, partNameFromFile, readNumber } from "./cncRules.js";
import { keepShown, stockAndProcessPicked } from "./settingsBatches.js";
import ProgramFields from "./ProgramFields.jsx";
import ShapeSizes, { ShapeChamfers } from "./ShapeSizes.jsx";
import NewProgramReview from "./NewProgramReview.jsx";

// Review before saving: a toggle on New program, on unless switched off,
// remembered on this computer (Heinrich, 14 Oct 2026).
const REVIEW_KEY = "cnc.reviewNewProgram";
function reviewWanted() {
  try {
    return localStorage.getItem(REVIEW_KEY) !== "off";
  } catch {
    return true;
  }
}

export default function NewProgram({ customers, materials, pipes, shape = null, subOf = null, hasRefs = false, userName, onCancel, onSaved }) {
  const [stepFile, setStepFile] = useState(null);
  const [sizes, setSizes] = useState({});
  // A shape starts with end 1 machined first (its tick on the drawing).
  const [fields, setFields] = useState({
    partName: shape ? shape.name : subOf ? `${subOf.part_name} 2ND OP` : "",
    customer: subOf?.customer || "",
    materialName: subOf?.material || "",
    form: shape ? { side1: "0" } : {},
  });
  const setSide1 = (v) => setFields((f) => ({ ...f, form: { ...f.form, side1: v } }));
  const [programNo, setProgramNo] = useState("");
  // Quote reference and project name, for finding the program later
  // (setup-cnc-12-program-refs.sql; the boxes show where it has been run).
  const [refs, setRefs] = useState({ quoteRef: "", projectName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewOn, setReviewOn] = useState(reviewWanted);
  // The Review's engine answer and what Accept saves, or null.
  const [review, setReview] = useState(null);

  const material = (materials || []).find((m) => m.name === fields.materialName) || null;
  const picked = stockAndProcessPicked(fields.form);
  const ready = (shape || !!stepFile) && !!fields.partName.trim() && !!material && picked && !busy;

  async function generate() {
    setError("");
    const { settings, errors } = cleanSettings(keepShown(fields.form));
    if (errors.length) {
      setError(`Check ${errors.join(", ")}: the engine can't use what is typed there.`);
      return;
    }
    let quick = null;
    if (shape) {
      const s = cleanSizes(shape, sizes);
      if (s.missing.length || s.bad.length) {
        setError(
          [s.missing.length ? `Type ${s.missing.join(", ")}.` : "", s.bad.length ? `Check ${s.bad.join(", ")}: not a size.` : ""].filter(Boolean).join(" ")
        );
        return;
      }
      quick = { shape: shape.key, sizes: s.sizes };
    }
    let typedNo = null;
    if (!subOf && programNo.trim()) {
      typedNo = readNumber(programNo);
      const problem = newNumberProblem(typedNo);
      if (problem) {
        setError(problem);
        return;
      }
    }
    const args = {
      partName: fields.partName.trim(),
      customer: fields.customer,
      material,
      settings,
      programNo: typedNo,
      subOf,
      stepFile: shape ? null : stepFile,
      quick,
      ...(hasRefs ? refs : {}),
      userName,
    };
    setBusy(true);
    try {
      if (reviewOn) {
        const answer = await previewProgram({ ...args, programNo: typedNo || (subOf ? subOf.program_no + 1 : null) });
        setReview({ answer, args });
        setBusy(false);
        return;
      }
      onSaved(await createProgram(args));
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  }

  async function accept() {
    setError("");
    setBusy(true);
    try {
      onSaved(await createProgram(review.args));
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  }

  if (review) {
    return (
      <NewProgramReview
        answer={review.answer}
        partName={review.args.partName}
        busy={busy}
        error={error}
        onAccept={accept}
        onBack={() => {
          setReview(null);
          setError("");
        }}
      />
    );
  }

  return (
    <div style={S.list}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="stk-btn" style={S.chip} onClick={onCancel} disabled={busy}>
          <ArrowLeft size={14} /> {shape ? "Shapes" : subOf ? oNumber(subOf.program_no) : "Programs"}
        </button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>
          {shape ? `New program: ${shape.name}` : subOf ? `Sub / 2nd op of ${oNumber(subOf.program_no)} ${subOf.part_name}` : "New program"}
        </div>
      </div>

      {shape ? (
        <ShapeSizes shape={shape} sizes={sizes} setSizes={setSizes} side1={fields.form.side1 ?? ""} setSide1={setSide1} />
      ) : (
        <div>
          <label style={S.label}>STEP model</label>
          <input
            type="file"
            accept=".step,.stp,.STEP,.STP"
            style={S.input}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setStepFile(f);
              if (f) setFields((x) => (x.partName.trim() ? x : { ...x, partName: partNameFromFile(f.name) }));
            }}
          />
        </div>
      )}
      {hasRefs && (
        <div style={S.formGrid}>
          <div>
            <label style={S.label}>Quote reference</label>
            <input style={S.input} value={refs.quoteRef} maxLength={100} onChange={(e) => setRefs((r) => ({ ...r, quoteRef: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label style={S.label}>Project name</label>
            <input style={S.input} value={refs.projectName} maxLength={200} onChange={(e) => setRefs((r) => ({ ...r, projectName: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
      )}
      <ProgramFields
        fields={fields}
        setFields={setFields}
        customers={customers}
        materials={materials}
        pipes={pipes}
        shape={!!shape}
        moreAbove={
          <>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Program number</label>
                {subOf ? (
                  <div style={{ fontSize: 14, padding: "6px 0" }}>The next free number after {oNumber(subOf.program_no)}</div>
                ) : (
                  <input style={S.input} value={programNo} onChange={(e) => setProgramNo(e.target.value)} placeholder="Empty: the next free number (ends in 0)" inputMode="numeric" />
                )}
              </div>
            </div>
            {shape && <ShapeChamfers shape={shape} sizes={sizes} setSizes={setSizes} />}
          </>
        }
      />

      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      {!picked && <div style={{ color: C.muted, fontSize: 13 }}>Pick the Stock and the Process to generate.</div>}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 6, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={reviewOn}
          onChange={(e) => {
            const on = e.target.checked;
            setReviewOn(on);
            try {
              localStorage.setItem(REVIEW_KEY, on ? "on" : "off");
            } catch {
              // Not remembered on this computer; the tick still works now.
            }
          }}
        />
        Review before saving (turret, step by step, toolpath)
      </label>
      <button
        type="button"
        className="stk-btn"
        style={{ ...S.submitBtn, ...(ready ? {} : S.submitBtnDisabled) }}
        disabled={!ready}
        onClick={generate}
      >
        {busy ? "Generating…" : "Generate"}
      </button>
    </div>
  );
}
