// New program's Review, the check sheet before anything is saved (Heinrich,
// 14 Oct 2026: "when generated before posting I want a process breakdown of
// what each tool is doing before I accept the outcome", the turret and the
// toolpath too; a toggle on New program, "to help update the engine and
// learn together"). Accept saves it as rev A with its real number; Back
// returns to the answers as they were. A tool is changed on the Tool crib
// tab after Accept: rev A stays open until it is posted (setup-cnc-16).

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C, S } from "../theme.js";
import { faultText } from "./cncRules.js";
import ProcessBreakdown, { TurretList } from "./ProcessBreakdown.jsx";
import ToolpathTab from "./ToolpathTab.jsx";

const REVIEW_REV = { id: "review" };

// The program text carries a stand-in number until Accept: not shown.
function withoutNumbers(answer) {
  const sides = (answer?.setup?.sides || []).map((sd) => ({ ...sd, program_no: null }));
  return answer?.setup ? { ...answer, setup: { ...answer.setup, sides } } : answer;
}

function Block({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}

function listOf(title, items, colour) {
  if (!items?.length) return null;
  return (
    <div style={{ fontSize: 13.5 }}>
      <div style={{ fontWeight: 600, color: colour }}>{title}</div>
      <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>
        {items.map((x, i) => (
          <li key={i}>{typeof x === "string" ? x : x?.text || JSON.stringify(x)}</li>
        ))}
      </ul>
    </div>
  );
}

export default function NewProgramReview({ answer: sent, partName, busy, error, onAccept, onBack }) {
  const [answer] = useState(() => withoutNumbers(sent));
  const [answers, setAnswers] = useState({ review: answer });
  const ready = !!answer?.ready;
  return (
    <div style={S.list}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="stk-btn" style={S.chip} onClick={onBack} disabled={busy}>
          <ArrowLeft size={14} /> Back to the answers
        </button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Review: {partName}</div>
      </div>
      <div style={{ fontSize: 13, color: C.muted }}>Nothing is saved yet. The program number is given on Accept.</div>
      <div style={{ color: ready ? C.accentFinished : C.danger, fontWeight: 600 }}>
        {ready ? "Ready for the machine" : `Not for machine: ${faultText(answer)}`}
        {answer?.cycle_s != null && (
          <span style={{ color: C.text, fontWeight: 400 }}>
            {" "}
            · cycle {Math.floor(answer.cycle_s / 60)} min {Math.round(answer.cycle_s % 60)} s
            {answer.parts_per_run > 1 ? ` per part · ${answer.parts_per_run} per pull` : ""}
          </span>
        )}
      </div>
      {listOf("Faults", answer?.fails, C.danger)}
      {listOf("Problems", answer?.problems, C.danger)}
      {listOf("Warnings", answer?.warnings, C.accentRaw)}

      <Block title="Turret">
        <TurretList answer={answer} />
        <div style={{ fontSize: 12.5, color: C.muted }}>To change a tool or insert: Accept, then the Tool crib tab. It stays rev A until it is posted.</div>
      </Block>
      <Block title="Step by step">
        <ProcessBreakdown answer={answer} />
      </Block>
      <Block title="Toolpath">
        <ToolpathTab program={null} rev={REVIEW_REV} answers={answers} setAnswers={setAnswers} />
      </Block>

      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="stk-btn" style={{ ...S.submitBtn, ...(busy ? S.submitBtnDisabled : {}) }} disabled={busy} onClick={onAccept}>
          {busy ? "Saving…" : "Accept and save as rev A"}
        </button>
      </div>
    </div>
  );
}
