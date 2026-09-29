import { C, S } from "../theme.js";
import { PIPE_STANDARDS, SCHEDULES, SANS62_CLASSES, pipeSizes } from "./sectionShapes.js";

// A section type's boxes, the ones its name is written from
// (sectionShapes.js): Size and Wall for a square tube; Standard, then
// Schedule or Class, then NB for a pipe.
//
// One copy, for every place a size is made or changed: Stock Manager →
// Sections (the Add row and changing a row), the New stock item form, and
// a job's cut list. It stood inside App.jsx until 29 Sep 2026, where a
// screen in a file of its own could not reach it; the cut list's demo
// page was given a stand-in with no pipe boxes, and Heinrich met it.
//
// `d` holds what the boxes read; `setD` takes an updater, like a state
// setter. A plain function that gives back the boxes, not a component:
// called from inside a screen, a component would be made afresh on every
// keystroke and throw the cursor out of the box.
export function sectionBoxInputs(shape, d, setD) {
  const set = (k, v) => setD((prev) => ({ ...prev, [k]: v }));
  const boxStyle = { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 90 };
  const caption = (text) => <span style={{ fontSize: 12, color: C.muted }}>{text}</span>;
  const numBox = (k, label) => (
    <label key={k} style={boxStyle}>
      {caption(label)}
      <input style={S.input} inputMode="decimal" value={d[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
    </label>
  );
  // A fixed handful of choices, so a plain select.
  const pick = (k, label, options, onPick) => (
    <label key={k} style={boxStyle}>
      {caption(label)}
      <select style={S.input} value={d[k] ?? ""} onChange={(e) => (onPick ? onPick(e.target.value) : set(k, e.target.value))}>
        <option value="">Choose…</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  if (shape.key !== "PIPE") return shape.boxes.map(([k, label]) => numBox(k, label));
  const fromTable = d.std === "SCH" || d.std === "SANS62";
  return [
    pick("std", "Standard", PIPE_STANDARDS.map((s) => [s.key, s.label]), (v) => setD(() => ({ std: v }))),
    d.std === "SCH" &&
      pick("sch", "Schedule", SCHEDULES.map((s) => [s, /^\d+$/.test(s) ? `SCH${s}` : s]), (v) => setD((p) => ({ ...p, sch: v, nb: "" }))),
    d.std === "SANS62" && pick("cls", "Class", SANS62_CLASSES.map((c) => [c, c]), (v) => setD((p) => ({ ...p, cls: v, nb: "" }))),
    fromTable && pick("nb", "NB", pipeSizes(d.std, d.std === "SCH" ? d.sch : d.cls).map((n) => [String(n), `NB${n}`])),
    d.std === "SABS719" && numBox("nb", "NB"),
    d.std === "SABS719" && numBox("od", "Outside dia"),
    d.std === "SABS719" && numBox("t", "Wall"),
  ];
}
