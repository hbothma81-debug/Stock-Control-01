// A program's Setup sheet tab: the A4 setup sheet / job card for the
// revision on screen (setupSheetData.js + setupSheetPdf.js), made in the
// browser from the engine's answer (the same check as the Toolpath tab,
// shared through ProgramView so it is asked once) and shown in the app's
// own PDF viewer. Nothing is stored. Everyone with the CNC tick may open,
// print and download it (Heinrich, 8 Oct 2026: shop-floor paper).

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import PdfViewer from "../PdfViewer.jsx";
import { C, S } from "../theme.js";
import { loadToolpath } from "./cncData.js";
import { oNumber } from "./cncRules.js";
import { setupSheetData } from "./setupSheetData.js";
import { drawSetupSheet } from "./setupSheetPdf.js";
import { toolList, toolpathFrames } from "./toolpathGeom.js";

export default function SetupSheetTab({ program, rev, answers, setAnswers }) {
  const answer = rev ? answers[rev.id] : null;
  const [error, setError] = useState("");
  const [pdf, setPdf] = useState(null);

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

  useEffect(() => {
    if (!answer) return undefined;
    let gone = false;
    let url = null;
    (async () => {
      try {
        const [{ jsPDF }, table] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
        const doc = new jsPDF({ unit: "mm", format: "a4" });
        const data = setupSheetData({ program, rev, answer });
        drawSetupSheet({ doc, autoTable: table.default, data, frames: toolpathFrames(answer), tools: toolList(answer) });
        url = URL.createObjectURL(doc.output("blob"));
        if (!gone) setPdf({ url, name: `${oNumber(program.program_no)} ${program.part_name} SETUP SHEET rev ${rev.rev}.pdf`.replace(/[\\/:*?"<>|]+/g, " ") });
      } catch (err) {
        if (!gone) setError(`The setup sheet could not be made: ${err.message || err}. If the app was just updated, reload the page.`);
      }
    })();
    return () => {
      gone = true;
      if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
  }, [answer, program.settings?.qty]);

  if (!rev) return <div style={{ color: C.muted }}>No revision to print.</div>;
  if (error) return <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>;
  if (!answer) return <div style={S.empty}>Asking the engine for the setup…</div>;
  if (!pdf) return <div style={S.empty}>Making the setup sheet…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="stk-btn" style={S.chip} onClick={() => window.open(pdf.url, "_blank")}>
          <Printer size={14} /> Open / Print
        </button>
        <button
          type="button"
          className="stk-btn"
          style={S.chip}
          onClick={() => {
            const a = document.createElement("a");
            a.href = pdf.url;
            a.download = pdf.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
          }}
        >
          <Download size={14} /> Download PDF
        </button>
        <span style={{ fontSize: 13, color: C.muted, alignSelf: "center" }}>
          Rev {rev.rev}
          {rev.source === "machine_copy" ? " (machine copy)" : ""}, batch of {program.settings?.qty ?? 1}
        </span>
      </div>
      <PdfViewer url={pdf.url} title={pdf.name} />
    </div>
  );
}
