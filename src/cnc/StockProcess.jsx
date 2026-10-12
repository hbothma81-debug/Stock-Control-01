// Stock and Process, picked before anything else (Heinrich, 11 Oct 2026:
// both must be pressed before Generate). Each pick opens only its own
// boxes (settingsBatches.js). Chips, not dropdowns: one click each.

import { C, S } from "../theme.js";
import { STOCK_TYPES } from "./cncFields.js";
import SettingsBoxes from "./SettingsBoxes.jsx";
import { HOLDING_OF, PROCESSES, PROCESS_BOXES, PULLERS, STOCK_BOXES, morePerPull, processOf } from "./settingsBatches.js";

// S.chipActive sets borderColor, which React will not mix with S.chip's
// border shorthand once a chip switches on; the whole border is given.
const { borderColor: _unused, ...chipActiveRest } = S.chipActive;
const CHIP_ON = { ...chipActiveRest, border: `1px solid ${C.accentFinished}` };

// The OD box says which OD it is.
const OD_LABEL = { bar: "Bar OD (mm)", tube: "Tube OD (mm)" };

function Chips({ choices, value, onPick }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {choices.map((c) => (
        <button
          key={c.value}
          type="button"
          className="stk-btn"
          style={{ ...S.chip, ...(c.value === value ? CHIP_ON : {}) }}
          onClick={() => onPick(c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export default function StockProcess({ form, setForm, pipes = null }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const process = processOf(form.holding);
  const stockBoxes = STOCK_BOXES[form.stock_type];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={S.label}>Stock</label>
        <Chips choices={STOCK_TYPES} value={form.stock_type} onPick={(v) => set("stock_type", v)} />
        {stockBoxes && (
          <SettingsBoxes keys={stockBoxes} labels={{ bar_dia: OD_LABEL[form.stock_type] }} pipes={pipes} form={form} setForm={setForm} />
        )}
      </div>
      <div>
        <label style={S.label}>Process</label>
        {/* A second press on the Process already picked keeps its puller. */}
        <Chips choices={PROCESSES} value={process} onPick={(v) => v !== process && set("holding", HOLDING_OF[v])} />
        {process === "puller" && (
          <div style={{ marginTop: 10 }}>
            <label style={S.label}>Puller</label>
            <Chips choices={PULLERS} value={form.holding} onPick={(v) => set("holding", v)} />
          </div>
        )}
        {process && <SettingsBoxes keys={PROCESS_BOXES[process]} pipes={pipes} form={form} setForm={setForm} />}
        {process === "puller" && morePerPull(form) && (
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>
            {form.back_op === "part only"
              ? "Each part is parted off, so the back end is Part only; one sub-program makes each part."
              : "Part and turn makes one part per pull: set the back end to Part only for more."}
          </div>
        )}
      </div>
    </div>
  );
}
