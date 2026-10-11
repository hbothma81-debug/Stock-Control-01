// A shape's sizes, from the engine's own field list (GET ?shapes=1): the
// big drawing with its boxes on the dimension lines (ShapeDrawing.jsx,
// Heinrich 11 Oct 2026), then a box for any size the drawing has no place
// for, so a shape or size added on the engine still shows with no change.
// A box the engine must have is marked "needed"; one with a default shows
// it. The chamfers are ShapeChamfers, under More settings.

import { S } from "../theme.js";
import ShapeDrawing from "./ShapeDrawing.jsx";
import { isChamfer, sizesOffDrawing } from "./shapeDrawings.js";

function SizeBoxes({ fields, sizes, setSizes }) {
  return (
    <div style={S.formGrid}>
      {fields.map((f) => {
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
  );
}

export default function ShapeSizes({ shape, sizes, setSizes }) {
  const rest = sizesOffDrawing(shape);
  return (
    <div>
      <ShapeDrawing shape={shape} sizes={sizes} setSizes={setSizes} />
      {rest.length > 0 && <SizeBoxes fields={rest} sizes={sizes} setSizes={setSizes} />}
    </div>
  );
}

// The shape's chamfer boxes, for More settings; nothing when it has none.
export function ShapeChamfers({ shape, sizes, setSizes }) {
  const chamfers = (shape?.fields || []).filter(isChamfer);
  return chamfers.length ? <SizeBoxes fields={chamfers} sizes={sizes} setSizes={setSizes} /> : null;
}
