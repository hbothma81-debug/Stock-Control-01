// A program's Steps tab (Heinrich, 14 Oct 2026: the breakdown "as a
// separate tab to view on any revision"): the revision on screen step by
// step and its turret, from the engine's check on its own program text, so
// a machine copy or a hand edit shows what it really does. Shares the
// answer the Toolpath tab loads (ProgramView keeps them); nothing is saved.

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { C, S } from "../theme.js";
import { loadToolpath } from "./cncData.js";
import ProcessBreakdown, { TurretList } from "./ProcessBreakdown.jsx";

// onAdd: + Add operation (Heinrich 20 Oct 2026: AddOperation.jsx), the CNC
// Edit tick only.
export default function StepsTab({ program, rev, answers, setAnswers, onAdd = null }) {
  const answer = rev ? answers[rev.id] : null;
  const [error, setError] = useState("");

  useEffect(() => {
    if (!rev || answers[rev.id]) return undefined;
    let gone = false;
    setError("");
    loadToolpath({ program, rev })
      .then((a) => !gone && setAnswers((x) => ({ ...x, [rev.id]: a })))
      .catch((err) => !gone && setError(err.message || String(err)));
    return () => {
      gone = true;
    };
  }, [rev?.id]);

  if (!rev) return <div style={S.empty}>No revision yet.</div>;
  const add = onAdd && (
    <div>
      <button type="button" className="stk-btn" style={S.chip} onClick={onAdd} title="A tapped hole, reamed hole, knurl or thread change">
        <Plus size={14} /> Add operation
      </button>
    </div>
  );
  if (error) return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{add}<div style={{ color: C.danger, fontSize: 14 }}>{error}</div></div>;
  if (!answer) return <div style={S.empty}>Asking the engine for rev {rev.rev}'s steps…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {add}
      <ProcessBreakdown answer={answer} />
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Turret</div>
        <TurretList answer={answer} />
      </div>
    </div>
  );
}
