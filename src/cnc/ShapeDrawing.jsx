// A shape's big dimensioned drawing with its size boxes sitting on the
// dimension lines (layouts in shapeDrawings.js). The boxes scale with the
// drawing across the page; a size the engine needs stays amber-edged until
// it is typed. The full engine label shows on hover.
//
// Drawn as the part sits in the machine: chuck on the left, end 1 (the
// model's z=0 end) on the right where the first op is (Heinrich, 14 Oct
// 2026), so the layouts are mirrored here. Under the drawing a "Machine
// this side first" tick at each end sets side1 ('0' = end 1, 'L' = end 2).

import { C } from "../theme.js";
import { DRAWINGS } from "./shapeDrawings.js";

const W = 400;

export default function ShapeDrawing({ shape, sizes, setSizes, side1 = "", setSide1 = null }) {
  const d = DRAWINGS[shape.picture];
  if (!d) return null;
  const fields = Object.fromEntries(shape.fields.map((f) => [f.key, f]));
  const dims = d.dims.filter((x) => fields[x.key]);
  const dimLine = { stroke: C.muted, strokeWidth: 0.9 };
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 620, color: C.text }}>
      <svg viewBox={`0 0 ${W} ${d.h}`} width="100%" style={{ display: "block" }} fill="none" aria-hidden="true">
        <defs>
          <marker id="shape-dim-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 1.5 L10 5 L0 8.5 Z" style={{ fill: C.muted }} />
          </marker>
        </defs>
        <g transform={`matrix(-1 0 0 1 ${W} 0)`}>
        <line x1="12" y1={d.axis} x2={W - 12} y2={d.axis} stroke="currentColor" strokeWidth="0.7" strokeDasharray="14 3 2 3" opacity="0.5" />
        <path d={d.outline} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        {d.hidden && <path d={d.hidden} stroke="currentColor" strokeWidth="1.2" strokeDasharray="5 3" />}
        {d.thin && <path d={d.thin} stroke="currentColor" strokeWidth="0.8" />}
        {d.ext && <path d={d.ext} style={dimLine} />}
        {dims.map((x) => (
          <g key={x.key} style={dimLine}>
            {x.ext && <path d={x.ext} />}
            {x.lead && <path d={x.lead} />}
            {x.line && <path d={x.line} markerStart="url(#shape-dim-arrow)" markerEnd="url(#shape-dim-arrow)" />}
            {x.pointer && <path d={x.pointer} markerEnd="url(#shape-dim-arrow)" />}
          </g>
        ))}
        </g>
      </svg>
      {dims.map((x) => {
        const f = fields[x.key];
        const value = sizes[f.key] ?? "";
        const needed = f.default === undefined || f.default === null;
        const label = f.unit ? `${f.label} (${f.unit})` : f.label;
        return (
          <label
            key={x.key}
            title={label}
            style={{
              position: "absolute",
              left: `${((W - x.box[0]) / W) * 100}%`,
              top: `${(x.box[1] / d.h) * 100}%`,
              transform: "translate(-50%, -50%)",
              width: x.wide ? "max(22%, 84px)" : "max(16%, 62px)",
              height: 30,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              gap: 1,
              padding: "0 3px",
              background: C.surface,
              border: `1px solid ${needed && !String(value).trim() ? C.accentRaw : C.border}`,
              borderRadius: 6,
            }}
          >
            {x.prefix && <span style={{ color: C.muted, fontSize: 12 }}>{x.prefix}</span>}
            <input
              aria-label={label}
              value={value}
              onChange={(e) => {
                const v = e.target.value;
                setSizes((s) => ({ ...s, [f.key]: v }));
              }}
              placeholder={x.ph}
              inputMode="decimal"
              style={{ width: "100%", minWidth: 0, background: "transparent", border: "none", color: C.text, fontSize: 13.5, textAlign: "center", padding: 0 }}
            />
          </label>
        );
      })}
      {setSide1 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
          {[
            ["L", "end 2"],
            ["0", "end 1"],
          ].map(([v, end]) => (
            <label key={v} title={`Machine ${end} first (side 1)`} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={side1 === v} onChange={() => setSide1(side1 === v ? "" : v)} />
              Machine this side first
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
