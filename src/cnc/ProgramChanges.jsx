// What changed between a program's current revision and the one about to
// be saved: per program (side 1, side 2), only the changed lines with two
// unchanged lines either side, old lines red, new lines green. Used by
// Update program; Import machine copy will use it too.

import { C, F } from "../theme.js";
import { changeCount, changeHunks, pairPrograms } from "./lineDiff.js";
import { oNumber } from "./cncRules.js";

export default function ProgramChanges({ before = [], after = [] }) {
  const pairs = pairPrograms(before, after);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {pairs.map((p) => {
        const { removed, added } = changeCount(p.diff);
        const hunks = changeHunks(p.diff);
        const heading = !p.before
          ? `${oNumber(p.number)}: new program, ${added} lines`
          : !p.after
          ? `${oNumber(p.number)}: no longer made (${removed} lines)`
          : removed + added === 0
          ? `${oNumber(p.number)}: no change`
          : `${oNumber(p.number)}: ${removed} line${removed === 1 ? "" : "s"} out, ${added} line${added === 1 ? "" : "s"} in`;
        return (
          <div key={p.number}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{heading}</div>
            {p.before && p.after && hunks.length > 0 && (
              <div
                style={{
                  fontFamily: F.mono,
                  fontSize: 12.5,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  background: C.surface,
                  maxHeight: 420,
                  overflow: "auto",
                }}
              >
                {hunks.map((h, i) => (
                  <div key={i}>
                    {h.skippedBefore > 0 && (
                      <div style={{ color: C.muted, padding: "2px 8px", borderBottom: `1px dashed ${C.border}` }}>
                        … {h.skippedBefore} unchanged line{h.skippedBefore === 1 ? "" : "s"}
                      </div>
                    )}
                    {h.lines.map((l, k) => (
                      <div
                        key={k}
                        style={{
                          whiteSpace: "pre",
                          padding: "0 8px",
                          background: l.kind === "del" ? C.dangerTint : l.kind === "add" ? "rgba(74,155,142,0.22)" : "transparent",
                          color: C.text,
                        }}
                      >
                        <span style={{ color: l.kind === "del" ? C.danger : C.accentFinished, fontWeight: 700 }}>
                          {l.kind === "del" ? "− " : l.kind === "add" ? "+ " : "  "}
                        </span>
                        {l.text}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
