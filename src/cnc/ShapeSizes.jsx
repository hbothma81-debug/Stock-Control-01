// A shape's size boxes, from the engine's own field list (GET ?shapes=1),
// so a shape or size added on the engine shows here with no change. A box
// the engine must have is marked "needed"; one with a default shows it.

import { C, S } from "../theme.js";
import ShapeIcon from "./ShapeIcon.jsx";

export default function ShapeSizes({ shape, sizes, setSizes }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.text }}>
        <ShapeIcon picture={shape.picture} size={64} />
        <div style={{ fontWeight: 700, fontSize: 15 }}>{shape.name}</div>
      </div>
      <div style={S.formGrid}>
        {shape.fields.map((f) => {
          const needed = f.default === undefined || f.default === null;
          return (
            <div key={f.key}>
              <label style={S.label}>
                {f.label}
                {f.unit ? ` (${f.unit})` : ""}
              </label>
              <input
                style={S.input}
                value={sizes[f.key] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setSizes((s) => ({ ...s, [f.key]: v }));
                }}
                placeholder={needed ? "needed" : `Engine's choice: ${f.default}`}
                inputMode="decimal"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
