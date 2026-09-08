import { useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { C, S } from "../theme.js";
import {
  DEFAULT_STOCK_M,
  KERF_MM,
  TRIM_MM,
  MIN_OFFCUT_MM,
  planBars,
  barsOnShelf,
  lineMetres,
  offcutIsKeepable,
  fmtMm,
  fmtM,
  fmtKg,
} from "./cutToSize.js";

// The Cut to size tab on a job: the parts to be cut from structural
// stock, what that comes to in bars, and what is left over.
//
// Read two ways. The saw operator reads it as instructions: this section,
// this length, this many. The sales person reads the top of it as a
// shopping list: this many bars, this many on the shelf.
//
// Lives in its own file so the quoting module can show the same screen
// on a quote. It owns nothing but the "new line" being typed; everything
// saved comes in as `lines` and goes out through onAdd / onUpdate /
// onRemove, the same way the quoted items work.

const blankLine = () => ({
  drawingNo: "",
  section: "",
  grade: "",
  cutLengthMm: "",
  qty: "",
  stockLengthM: String(DEFAULT_STOCK_M),
  trimFront: true,
  note: "",
});

const cell = (width) => ({ ...S.input, width, fontSize: 14, padding: "4px 6px" });

// A number box with its unit written after it, so nobody has to guess
// whether a length is millimetres or metres.
function UnitInput({ unit, style, ...props }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <input type="number" {...props} style={style} />
      <span style={{ fontSize: 12, color: C.muted }}>{unit}</span>
    </span>
  );
}

export default function CutToSize({
  lines,
  canEdit,
  canSeeValue,
  sections,
  customerItems,
  items,
  findSectionFactor,
  findSectionPrice,
  onAdd,
  onUpdate,
  onRemove,
  SavedCheck,
}) {
  const [draft, setDraft] = useState(blankLine);
  const [adding, setAdding] = useState(false);

  const sectionNames = [...new Set((sections || []).map((s) => s.name).filter(Boolean))].sort();
  const gradesFor = (name) =>
    [...new Set((sections || []).filter((s) => s.name.toLowerCase() === (name || "").toLowerCase()).map((s) => s.grade).filter(Boolean))];
  const partNumbers = [...new Set((customerItems || []).map((i) => i.partNumber || i.name).filter(Boolean))].sort();

  const groups = planBars(lines);
  const totalPieces = (lines || []).reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  const totalMetres = (lines || []).reduce((sum, l) => sum + lineMetres(l), 0);
  const weightOf = (l) => {
    const perM = findSectionFactor(l.section, l.grade);
    return perM ? perM * lineMetres(l) : null;
  };
  const costOf = (l) => {
    const perM = findSectionPrice(l.section, l.grade);
    return perM ? perM * lineMetres(l) : null;
  };
  const totalKg = (lines || []).reduce((sum, l) => sum + (weightOf(l) || 0), 0);
  const totalCost = (lines || []).reduce((sum, l) => sum + (costOf(l) || 0), 0);
  const anyWeight = (lines || []).some((l) => weightOf(l) != null);

  function setSection(name) {
    // Filling the grade in from the section saves a keystroke on the
    // common case and leaves it changeable for the rest.
    const grades = gradesFor(name);
    setDraft((d) => ({ ...d, section: name, grade: d.grade || (grades.length === 1 ? grades[0] : "") }));
  }

  async function submitDraft() {
    if (!draft.section.trim()) return alert("Pick a section first.");
    if (!(Number(draft.cutLengthMm) > 0)) return alert("Give the cut length, in millimetres.");
    if (!(Number(draft.qty) > 0)) return alert("How many?");
    if (!(Number(draft.stockLengthM) > 0)) return alert("Give the stock length, in metres.");
    setAdding(true);
    const ok = await onAdd({
      drawing_no: draft.drawingNo.trim(),
      section: draft.section.trim(),
      grade: draft.grade.trim(),
      cut_length_mm: Number(draft.cutLengthMm),
      qty: Number(draft.qty),
      stock_length_m: Number(draft.stockLengthM),
      trim_front: !!draft.trimFront,
      note: draft.note.trim(),
      linked_item_id:
        (customerItems || []).find((i) => (i.partNumber || i.name || "").trim().toLowerCase() === draft.drawingNo.trim().toLowerCase())?.id ||
        null,
    });
    setAdding(false);
    // Keep the section and stock length: the next line is usually more of
    // the same bar.
    if (ok) setDraft((d) => ({ ...blankLine(), section: d.section, grade: d.grade, stockLengthM: d.stockLengthM, trimFront: d.trimFront }));
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
      {/* The shopping list. One line per section, grade and bar length. */}
      {groups.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <label style={S.label}>Bars needed</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {groups.map((g) => {
              const shelf = barsOnShelf(g, items);
              const short = Math.max(0, g.bars.length - shelf);
              const keepable = g.bars.filter((b) => offcutIsKeepable(b.offcutMm)).length;
              return (
                <div key={g.key} style={{ ...S.managerRow, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {g.bars.length} × {fmtM(g.stockLengthM)} {g.section}
                    {g.grade ? ` ${g.grade}` : ""}
                  </span>
                  <span style={S.roleHint}>
                    {g.pieceCount} piece{g.pieceCount === 1 ? "" : "s"}, {fmtM(g.metres)}
                  </span>
                  <span
                    style={{ ...S.chip, ...(short > 0 ? { color: C.danger, borderColor: C.danger, fontWeight: 700 } : {}) }}
                    title={
                      short > 0
                        ? `${shelf} on the shelf at ${fmtM(g.stockLengthM)} or longer — ${short} still to order`
                        : `${shelf} on the shelf at ${fmtM(g.stockLengthM)} or longer`
                    }
                  >
                    {short > 0 ? `${short} short` : `${shelf} on the shelf`}
                  </span>
                  {g.bars.length > 0 && (
                    <span style={S.roleHint} title={`Offcuts of ${MIN_OFFCUT_MM.toLocaleString()} mm or more go back to stock`}>
                      offcuts: {g.bars.map((b) => fmtMm(b.offcutMm)).join(", ")}
                      {keepable > 0 ? ` · ${keepable} back to stock` : " · all scrap"}
                    </span>
                  )}
                  {g.tooLong.length > 0 && (
                    <span style={{ ...S.chip, color: C.danger, borderColor: C.danger }}>
                      <AlertTriangle size={12} /> {g.tooLong.length} piece{g.tooLong.length === 1 ? "" : "s"} longer than the bar
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <label style={S.label}>Parts to cut</label>
      {(lines || []).length === 0 && <div style={S.empty}>Nothing on the cut list yet.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
        {(lines || []).map((it) => {
          const kg = weightOf(it);
          const cost = costOf(it);
          const cut = Number(it.qty_cut || 0);
          return (
            <div key={it.id} style={S.managerRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {canEdit ? (
                    <>
                      <input
                        defaultValue={it.drawing_no}
                        list="cut-drawing-options"
                        placeholder="Drawing no"
                        onBlur={(e) => onUpdate(it, "drawing_no", e.target.value)}
                        style={cell(110)}
                      />
                      <input
                        defaultValue={it.section}
                        list="cut-section-options"
                        placeholder="Section"
                        onBlur={(e) => onUpdate(it, "section", e.target.value)}
                        style={cell(120)}
                      />
                      <input
                        defaultValue={it.grade}
                        list="cut-grade-options"
                        placeholder="Grade"
                        onBlur={(e) => onUpdate(it, "grade", e.target.value)}
                        style={cell(90)}
                      />
                      <UnitInput
                        unit="mm"
                        min="1"
                        step="1"
                        defaultValue={it.cut_length_mm}
                        onBlur={(e) => onUpdate(it, "cut_length_mm", e.target.value)}
                        style={cell(80)}
                        title="Cut length"
                      />
                      <span style={{ color: C.muted }}>×</span>
                      <UnitInput
                        unit="off"
                        min={cut || 0}
                        step="1"
                        defaultValue={it.qty}
                        onBlur={(e) => onUpdate(it, "qty", e.target.value)}
                        style={cell(58)}
                        title={cut > 0 ? `${cut} already cut — cannot go below that` : "Quantity"}
                      />
                      <span style={{ color: C.muted }}>from</span>
                      <UnitInput
                        unit="m"
                        min="0.1"
                        step="0.1"
                        defaultValue={it.stock_length_m}
                        onBlur={(e) => onUpdate(it, "stock_length_m", e.target.value)}
                        style={cell(58)}
                        title="Stock length"
                      />
                      <label
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.muted }}
                        title={`Take ${TRIM_MM} mm off the front of each bar to square it up`}
                      >
                        <input type="checkbox" checked={it.trim_front !== false} onChange={(e) => onUpdate(it, "trim_front", e.target.checked)} />
                        trim
                      </label>
                      <input
                        defaultValue={it.note}
                        placeholder="Note"
                        onBlur={(e) => onUpdate(it, "note", e.target.value)}
                        style={{ ...cell(120), flex: 1, minWidth: 80 }}
                      />
                      <SavedCheck fieldKey={`cutitem-${it.id}`} />
                      <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => onRemove(it)} title="Remove this line">
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600 }}>{it.qty} ×</span>
                      <span>{fmtMm(Number(it.cut_length_mm))}</span>
                      <span>
                        {it.section}
                        {it.grade ? ` ${it.grade}` : ""}
                      </span>
                      {it.drawing_no && <span style={S.roleHint}>{it.drawing_no}</span>}
                      <span style={S.roleHint}>
                        from {fmtM(Number(it.stock_length_m))}
                        {it.trim_front === false ? ", no trim" : ""}
                      </span>
                      {it.note && <span style={S.roleHint}>— {it.note}</span>}
                    </>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                  <span style={S.roleHint}>= {fmtM(lineMetres(it))}</span>
                  {kg != null && <span style={S.roleHint}>· {fmtKg(kg)}</span>}
                  {canSeeValue && cost != null && <span style={S.roleHint}>· R {cost.toFixed(2)}</span>}
                  {Number(it.qty) > 0 && (
                    <span style={{ ...S.roleHint, ...(cut >= Number(it.qty) ? { color: C.accentFinished, fontWeight: 600 } : {}) }}>
                      · {cut} of {it.qty} cut
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(lines || []).length > 0 && (
        <div style={{ ...S.roleHint, marginTop: 8 }}>
          {totalPieces} piece{totalPieces === 1 ? "" : "s"} · {fmtM(totalMetres)}
          {anyWeight ? ` · ${fmtKg(totalKg)}` : ""}
          {canSeeValue && totalCost > 0 ? ` · R ${totalCost.toFixed(2)} material` : ""}
          {` · ${KERF_MM} mm lost per cut`}
        </div>
      )}

      {canEdit && (
        <div style={{ marginTop: 10, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <label style={S.label}>Add a part</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <input
              value={draft.drawingNo}
              list="cut-drawing-options"
              placeholder="Drawing no"
              onChange={(e) => setDraft((d) => ({ ...d, drawingNo: e.target.value }))}
              style={cell(110)}
            />
            <input value={draft.section} list="cut-section-options" placeholder="Section" onChange={(e) => setSection(e.target.value)} style={cell(120)} />
            <input
              value={draft.grade}
              list="cut-grade-options"
              placeholder="Grade"
              onChange={(e) => setDraft((d) => ({ ...d, grade: e.target.value }))}
              style={cell(90)}
            />
            <UnitInput
              unit="mm"
              min="1"
              step="1"
              value={draft.cutLengthMm}
              placeholder="Length"
              onChange={(e) => setDraft((d) => ({ ...d, cutLengthMm: e.target.value }))}
              style={cell(80)}
            />
            <span style={{ color: C.muted }}>×</span>
            <UnitInput
              unit="off"
              min="1"
              step="1"
              value={draft.qty}
              placeholder="Qty"
              onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
              style={cell(58)}
            />
            <span style={{ color: C.muted }}>from</span>
            <UnitInput
              unit="m"
              min="0.1"
              step="0.1"
              value={draft.stockLengthM}
              onChange={(e) => setDraft((d) => ({ ...d, stockLengthM: e.target.value }))}
              style={cell(58)}
              title="Stock length"
            />
            <label
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.muted }}
              title={`Take ${TRIM_MM} mm off the front of each bar to square it up`}
            >
              <input type="checkbox" checked={draft.trimFront} onChange={(e) => setDraft((d) => ({ ...d, trimFront: e.target.checked }))} />
              trim
            </label>
            <input
              value={draft.note}
              placeholder="Note (optional)"
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              style={{ ...cell(120), flex: 1, minWidth: 80 }}
              onKeyDown={(e) => e.key === "Enter" && submitDraft()}
            />
            <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={submitDraft} disabled={adding}>
              <Plus size={12} /> Add
            </button>
          </div>
        </div>
      )}

      {/* The suggestion lists behind the type-to-find boxes. One copy each,
          shared by every row. */}
      <datalist id="cut-section-options">
        {sectionNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="cut-grade-options">
        {[...new Set((sections || []).map((s) => s.grade).filter(Boolean))].sort().map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <datalist id="cut-drawing-options">
        {partNumbers.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}
