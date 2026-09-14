import { useState } from "react";
import { Printer } from "lucide-react";
import { S } from "../theme.js";
import { printNestingSheet } from "./nestingPrint.js";

// Print, then which way up: portrait or landscape. Both are offered while
// the floor tries them on real paper (Heinrich, 14 Sep 2026).
export default function PrintNestsButton({ program, jobLines }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  async function print(orientation) {
    setBusy(true);
    try {
      await printNestingSheet(program, jobLines, { orientation });
      setAsking(false);
    } catch (err) {
      console.error("Could not make the printout:", err);
      alert("The printout could not be made — check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!asking) {
    return (
      <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={() => setAsking(true)} title="The floor sheet: parts, then a page per nest">
        <Printer size={13} /> Print
      </button>
    );
  }
  return (
    <>
      <button type="button" className="stk-btn" style={S.reqActionBtn} disabled={busy} onClick={() => print("portrait")}>
        <Printer size={13} /> {busy ? "Making…" : "Portrait"}
      </button>
      <button type="button" className="stk-btn" style={S.reqActionBtn} disabled={busy} onClick={() => print("landscape")}>
        Landscape
      </button>
      <button type="button" className="stk-btn" style={S.reqActionBtnMuted} disabled={busy} onClick={() => setAsking(false)}>
        Cancel
      </button>
    </>
  );
}
