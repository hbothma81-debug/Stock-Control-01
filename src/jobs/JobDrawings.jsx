import Section from "../Section.jsx";
import { FileText } from "lucide-react";
import { C, S } from "../theme.js";
import { noDrawingReason, revisionText } from "./jobDrawings.js";

// The Drawings tab on a job (Heinrich, 21 Oct 2026). Step 2 of the plan:
// shows the library's current drawing for each line, read only. Upload,
// Replace / New revision and choosing the stages come next.
//
// rows: drawingRows() from jobDrawings.js. loading: the drawings are
// still being read. onOpen(partNumber): opens the drawing.

const head = { textAlign: "left", padding: "4px 6px", fontSize: 12, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" };
const cell = { padding: "4px 6px", fontSize: 13, borderTop: `1px solid ${C.border}`, verticalAlign: "top" };

export default function JobDrawings({ rows, loading, onOpen }) {
  const { withDrawing, withoutDrawing } = rows;
  return (
    <div style={{ marginTop: 10 }}>
      <Section title="Drawings" count={withDrawing.length} defaultOpen>
        {loading && withDrawing.length === 0 ? (
          <div style={S.roleHint}>Loading…</div>
        ) : withDrawing.length === 0 ? (
          <div style={S.roleHint}>No line on this job has a drawing on file.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="stk-sheet" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={head}>Drawing</th>
                  <th style={head}>Part number</th>
                  <th style={head}>Revision</th>
                  <th style={head}>Loaded</th>
                  <th style={head}>Line</th>
                  <th style={head} title="The stages this line goes to on the floor">Goes to</th>
                </tr>
              </thead>
              <tbody>
                {withDrawing.map((r) => (
                  <tr key={r.line.id}>
                    <td style={cell}>
                      <button
                        type="button"
                        className="stk-btn"
                        style={{ ...S.reqActionBtnMuted, padding: "2px 8px", fontSize: 12, justifyContent: "flex-start" }}
                        onClick={() => onOpen(r.partNumber)}
                        title="Open the drawing"
                      >
                        <FileText size={12} /> {r.drawing.file_name || r.partNumber}
                      </button>
                    </td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{r.partNumber}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{revisionText(r.drawing)}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }} title={r.drawing.uploaded_by ? `by ${r.drawing.uploaded_by}` : undefined}>
                      {r.drawing.created_at ? new Date(r.drawing.created_at).toLocaleDateString() : ""}
                    </td>
                    <td style={cell}>{r.line.description}</td>
                    <td style={cell}>{r.stages.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title="Lines with no drawing" count={withoutDrawing.length} defaultOpen={false}>
        {withoutDrawing.length === 0 ? (
          <div style={S.roleHint}>Every line has a drawing.</div>
        ) : (
          withoutDrawing.map((r) => (
            <div key={r.line.id} style={{ ...S.roleHint, padding: "3px 0" }}>
              <span style={{ color: C.text }}>{r.line.description}</span> — {noDrawingReason(r)}
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
