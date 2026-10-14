// A program's Steps tab (Heinrich, 14 Oct 2026: the breakdown "as a
// separate tab to view on any revision"): the revision on screen step by
// step and its turret, from the engine's check on its own program text, so
// a machine copy or a hand edit shows what it really does. Shares the
// answer the Toolpath tab loads (ProgramView keeps them); nothing is saved.

import { useEffect, useState } from "react";
import { C, S } from "../theme.js";
import { loadToolpath } from "./cncData.js";
import ProcessBreakdown, { TurretList } from "./ProcessBreakdown.jsx";

export default function StepsTab({ program, rev, answers, setAnswers }) {
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
  if (error) return <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>;
  if (!answer) return <div style={S.empty}>Asking the engine for rev {rev.rev}'s steps…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ProcessBreakdown answer={answer} />
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Turret</div>
        <TurretList answer={answer} />
      </div>
    </div>
  );
}
