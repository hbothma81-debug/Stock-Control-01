import { useState } from "react";
import { Plus, Trash2, AlertTriangle, FileText, Pencil, Check, X, PackagePlus, Lock } from "lucide-react";
import { C, S } from "../theme.js";
import TypeToFind from "../TypeToFind.jsx";
import { SECTION_SHAPES, shapeForType, buildSection, missingBoxes } from "../manager/sectionShapes.js";
import { sectionBoxInputs } from "../manager/SectionBoxes.jsx";
import {
  KERF_MM,
  TRIM_MM,
  MIN_OFFCUT_MM,
  planBars,
  barsOnShelf,
  barsSetAside,
  barsOnOrder,
  materialName,
  lineMetres,
  offcutIsKeepable,
  fmtMm,
  fmtM,
  fmtKg,
} from "./cutToSize.js";
import {
  cutHasStarted,
  blankDraft,
  draftOfLine,
  sectionOnList,
  sectionChoices,
  gradesOfSection,
  draftWithSection,
  checkCutDraft,
  cutLineChanges,
  materialAsListed,
} from "./cutLineEdit.js";

// The Cut to size tab on a job: the parts to be cut from structural
// stock, what that comes to in bars, and what is left over.
//
// Read two ways. The saw operator reads it as instructions: this section,
// this length, this many. The sales person reads the top of it as a
// shopping list: this many bars, this many on the shelf.
//
// Lives in its own file so the quoting module can show the same screen
// on a quote. It owns nothing but what is being typed; everything saved
// comes in as `lines` and goes out through onAdd / onSave / onRemove.
//
// Changing a line (Heinrich, 29 Sep 2026; rules in cutLineEdit.js): a
// line reads as words with a pencil; the pencil opens it in the boxes a
// new line is typed in, with Save and Cancel. A line with a piece cut is
// locked. The section and its material are picked from Stock Manager's
// Sections list; a size that is not there is made from its type's boxes,
// the same boxes Stock Manager has (`newSize` holds the materials and what
// to do with the size, for the people who can open Stock Manager), and bars are
// booked into stock from the Bars needed row (`onAddStock`, for the
// people who can add stock).

const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

const cell = (width) => ({ ...S.input, width, fontSize: 14, padding: "4px 6px" });
// A type-to-find box in a row of small boxes, with room for its cross.
// The box is as wide as its wrapper, padding and edge included: left to
// itself it is that much wider and runs over the box beside it.
const findCell = { fontSize: 14, padding: "4px 26px 4px 6px", boxSizing: "border-box" };
const linkBtn = { marginTop: 6, padding: 0, border: "none", background: "transparent", color: C.muted, fontSize: 13, textDecoration: "underline", cursor: "pointer" };

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
  materials,
  customerItems,
  items,
  findSectionFactor,
  findSectionPrice,
  onAdd,
  onSave,
  onRemove,
  onPrint,
  allocations,
  requisitions,
  findSectionType,
  onSetAside,
  onRequisition,
  onAddStock,
  newSize,
  onCount,
  onBookOut,
  SavedCheck,
}) {
  const [draft, setDraft] = useState(blankDraft);
  const [adding, setAdding] = useState(false);
  // The line open in the boxes: { id, draft }. One at a time.
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  // The New size boxes, under whichever form asked for them:
  // { where: "add" or a line's id, type, boxes, grade }.
  const [sizing, setSizing] = useState(null);

  const partNumbers = [...new Set((customerItems || []).map((i) => i.partNumber || i.name).filter(Boolean))].sort();
  const linkedItemFor = (drawingNo) =>
    (customerItems || []).find((i) => sameText(i.partNumber || i.name, drawingNo) && String(drawingNo || "").trim())?.id || null;

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

  async function submitDraft() {
    const read = checkCutDraft(draft, sections);
    if (!read.ok) return alert(read.why);
    setAdding(true);
    const ok = await onAdd({ ...read.values, linked_item_id: linkedItemFor(read.values.drawing_no) });
    setAdding(false);
    // Keep the section and stock length: the next line is usually more of
    // the same bar.
    if (ok) {
      setDraft((d) => ({ ...blankDraft(), section: d.section, grade: d.grade, stockLengthM: d.stockLengthM, trimFront: d.trimFront }));
      setSizing(null);
    }
  }

  function startEdit(line) {
    const d = draftOfLine(line);
    // As the list spells them, so the boxes show what is chosen: the
    // section by its listed name, the material by the name the list holds
    // it under ("Mild Steel" on an old line is the list's "MS").
    const listed = sectionOnList(sections, d.section);
    if (listed) {
      d.section = listed;
      d.grade = materialAsListed(materials, sections, listed, d.grade);
    }
    setEdit({ id: line.id, draft: d });
    setSizing(null);
  }

  function stopEdit() {
    setEdit(null);
    setSizing(null);
  }

  async function saveEdit(line) {
    const read = checkCutDraft(edit.draft, sections, line);
    if (!read.ok) return alert(read.why);
    const { patch, words } = cutLineChanges(line, read.values);
    if (words.length === 0) return stopEdit();
    if ("drawing_no" in patch) patch.linked_item_id = linkedItemFor(patch.drawing_no);
    setSaving(true);
    const ok = await onSave(line, patch, words);
    setSaving(false);
    if (ok) stopEdit();
  }

  const setEditDraft = (fn) => setEdit((e) => (e ? { ...e, draft: typeof fn === "function" ? fn(e.draft) : fn } : e));

  // The boxes of one line, a new one or one being changed (`was`). A plain
  // function, not a component: declared in here a component would be made
  // afresh on every keystroke and throw the cursor out of the box.
  function lineBoxes(d, setD, was, onEnter) {
    const choices = sectionChoices(sections);
    const offList = d.section && !sectionOnList(sections, d.section);
    const sectionOptions = offList ? [...choices, { value: d.section, label: d.section, hint: "not on the Sections list" }] : choices;
    const grades = gradesOfSection(sections, d.section);
    const oddGrade = d.grade && !grades.some((g) => sameText(g, d.grade));
    const gradeOptions = oddGrade ? [...grades, { value: d.grade, label: d.grade, hint: offList ? "as the line was saved" : "not a material of this size" }] : grades;
    return (
      <>
        <input
          value={d.drawingNo}
          list="cut-drawing-options"
          placeholder="Drawing no"
          onChange={(e) => setD((p) => ({ ...p, drawingNo: e.target.value }))}
          style={cell(110)}
        />
        <TypeToFind
          options={sectionOptions}
          value={d.section}
          onChange={(v) => setD((p) => draftWithSection(p, sections, v))}
          emptyLabel="Section"
          title={d.section || "The size, from Stock Manager's Sections list"}
          // As wide as its name needs: a pipe's is forty letters long.
          style={{ width: Math.min(360, Math.max(170, String(d.section || "").length * 8.5 + 36)), maxWidth: "100%" }}
          inputStyle={findCell}
        />
        {gradeOptions.length > 0 ? (
          <TypeToFind
            options={gradeOptions}
            value={d.grade}
            onChange={(v) => setD((p) => ({ ...p, grade: v }))}
            emptyLabel="Material"
            title="The materials this size is held in"
            style={{ width: 120 }}
            inputStyle={findCell}
          />
        ) : (
          d.section && <span style={{ fontSize: 12, color: C.muted }}>no material</span>
        )}
        <UnitInput
          unit="mm"
          min="1"
          step="1"
          value={d.cutLengthMm}
          placeholder="Length"
          onChange={(e) => setD((p) => ({ ...p, cutLengthMm: e.target.value }))}
          style={cell(80)}
          title="Cut length"
        />
        <span style={{ color: C.muted }}>×</span>
        <UnitInput
          unit="off"
          min="1"
          step="1"
          value={d.qty}
          placeholder="Qty"
          onChange={(e) => setD((p) => ({ ...p, qty: e.target.value }))}
          style={cell(58)}
          title="Quantity"
        />
        <span style={{ color: C.muted }}>from</span>
        <UnitInput
          unit="m"
          min="0.1"
          step="0.1"
          value={d.stockLengthM}
          onChange={(e) => setD((p) => ({ ...p, stockLengthM: e.target.value }))}
          style={cell(58)}
          title="Stock length"
        />
        <label
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.muted }}
          title={`Take ${TRIM_MM} mm off the front of each bar to square it up`}
        >
          <input type="checkbox" checked={!!d.trimFront} onChange={(e) => setD((p) => ({ ...p, trimFront: e.target.checked }))} />
          trim
        </label>
        <input
          value={d.note}
          placeholder={was ? "Note" : "Note (optional)"}
          onChange={(e) => setD((p) => ({ ...p, note: e.target.value }))}
          style={{ ...cell(120), flex: 1, minWidth: 80 }}
          onKeyDown={(e) => e.key === "Enter" && onEnter()}
        />
      </>
    );
  }

  // A size that is not on the list, made from its type's fixed boxes as
  // Stock Manager makes it, then picked for the line being typed.
  function sizeBlock(where, d, setD) {
    if (!newSize) return null;
    if (!sizing || sizing.where !== where) {
      return (
        <button
          type="button"
          className="stk-btn"
          style={linkBtn}
          onClick={() =>
            setSizing({ where, type: shapeForType(findSectionType ? findSectionType(d.section) : "")?.label || "", boxes: {}, grade: d.grade || "" })
          }
        >
          Size not on the list? New size
        </button>
      );
    }
    const shape = shapeForType(sizing.type);
    const grade = String(sizing.grade || "").trim();
    const built = shape && grade ? buildSection(shape, sizing.boxes) : null;
    const missing = shape ? missingBoxes(shape, sizing.boxes) : [];
    const onList = built && gradesOfSection(sections, built.name).some((g) => sameText(g, grade));
    const take = async () => {
      if (!built) return;
      const ok = await newSize.onTake({ shape, built, grade });
      if (ok === false) return;
      setD((p) => ({ ...p, section: built.name, grade }));
      setSizing(null);
    };
    return (
      <div style={{ marginTop: 8, padding: 8, border: `1px dashed ${C.border}`, borderRadius: 6 }}>
        <label style={S.label}>New size</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          <TypeToFind
            options={SECTION_SHAPES.map((s) => ({ value: s.label, label: s.label, hint: s.key }))}
            value={sizing.type}
            onChange={(v) => setSizing((s) => ({ ...s, type: v, boxes: {} }))}
            emptyLabel="Section type"
            // Every type, not the first twelve: the list is fixed and short.
            maxShown={SECTION_SHAPES.length}
            style={{ flex: 1, minWidth: 170 }}
          />
          <TypeToFind
            options={newSize.grades || []}
            value={sizing.grade}
            onChange={(v) => setSizing((s) => ({ ...s, grade: v }))}
            emptyLabel="Material"
            style={{ flex: 1, minWidth: 140 }}
          />
        </div>
        {/* Stock Manager's own boxes for the type, pipe's Standard,
            Schedule and NB included: one copy (SectionBoxes.jsx). */}
        {shape && (
          <div style={{ ...S.managerAddRow, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6 }}>
            {sectionBoxInputs(shape, sizing.boxes || {}, (fn) => setSizing((s) => ({ ...s, boxes: fn(s.boxes || {}) })))}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 13, color: C.muted, marginTop: 6 }}>
          <span style={{ flex: 1, minWidth: 160 }}>
            {built ? (
              <>
                {onList ? "Already on the list: " : "Adds "}
                <b>
                  {built.name} {grade}
                </b>
                {onList ? "" : " to Stock Manager → Sections"}.
              </>
            ) : !shape ? (
              "Pick the section type first."
            ) : !grade ? (
              "Pick the material, from the list."
            ) : (
              `Still needed: ${missing.join(", ")}.`
            )}
          </span>
          <button type="button" className="stk-btn" style={{ ...S.addBtn, opacity: built ? 1 : 0.5 }} disabled={!built} onClick={take}>
            <Check size={15} strokeWidth={2.5} />
            Use this size
          </button>
          <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => setSizing(null)} title="Cancel the new size">
            <X size={15} />
          </button>
        </div>
      </div>
    );
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
              const setAside = barsSetAside(g, allocations, items);
              const onOrder = barsOnOrder(g, requisitions, items);
              // On the floor covers it, or on order covers the rest, or
              // somebody still has to order some.
              const short = Math.max(0, g.bars.length - shelf - onOrder);
              const keepable = g.bars.filter((b) => offcutIsKeepable(b.offcutMm)).length;
              return (
                <div key={g.key} style={{ ...S.managerRow, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {g.bars.length} × {fmtM(g.stockLengthM)} {materialName(g, findSectionType)}
                  </span>
                  <span style={S.roleHint}>
                    {g.pieceCount} piece{g.pieceCount === 1 ? "" : "s"}, {fmtM(g.metres)}
                  </span>
                  <span
                    style={{ ...S.chip, ...(short > 0 ? { color: C.danger, borderColor: C.danger, fontWeight: 700 } : {}) }}
                    title={`${shelf} on the floor at ${fmtM(g.stockLengthM)} or longer${short > 0 ? ` — ${short} still to order` : ""}`}
                  >
                    {short > 0 ? `${short} to order` : `${shelf} on the floor`}
                  </span>
                  {short > 0 && shelf > 0 && (
                    <span style={S.chip} title="Physically on the floor now">
                      {shelf} on the floor
                    </span>
                  )}
                  {onOrder > 0 && (
                    <span style={S.chip} title="Requisitioned or on a purchase order, not on the floor yet">
                      {onOrder} on order
                    </span>
                  )}
                  {setAside > 0 && (
                    <span style={S.chip} title="Already set aside for this job">
                      {setAside} set aside
                    </span>
                  )}
                  {/* The two things a sales person does with this row:
                      claim what is on the floor, and ask for the rest. */}
                  {canEdit &&
                    onSetAside &&
                    (() => {
                      const canClaim = Math.min(g.bars.length - setAside, shelf - setAside);
                      if (!(canClaim > 0)) return null;
                      return (
                        <button
                          type="button"
                          className="stk-btn"
                          style={S.reqActionBtnMuted}
                          onClick={() => onSetAside(g, canClaim)}
                          title="Reserve these bars for this job, against the Cut To Size stage"
                        >
                          Set aside {canClaim}
                        </button>
                      );
                    })()}
                  {canEdit && onRequisition && short > 0 && (
                    <button
                      type="button"
                      className="stk-btn"
                      style={S.reqActionBtnMuted}
                      onClick={() => onRequisition(g, short)}
                      title="Raise a requisition for the bars not on the floor or on order"
                    >
                      Requisition {short}
                    </button>
                  )}
                  {/* Bars that are on the floor and not in the app yet:
                      booked in from here, the form ready filled. */}
                  {onAddStock && (
                    <button
                      type="button"
                      className="stk-btn"
                      style={S.reqActionBtnMuted}
                      onClick={() => onAddStock(g)}
                      title={`Book ${fmtM(g.stockLengthM)} bars of ${materialName(g, findSectionType)} into stock, without leaving the job`}
                    >
                      <PackagePlus size={13} /> Add stock
                    </button>
                  )}
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

      {/* Bar by bar: what the saw operator actually works from. Each bar
          lists its pieces in cutting order, longest first, so the offcut
          is the last thing off the saw. This is the layout the printed
          cutting list will carry. */}
      {groups.some((g) => g.bars.length > 0) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <label style={S.label}>Cutting order</label>
            {onPrint && (
              <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={onPrint} title="Print the cutting list for the saw operator">
                <FileText size={13} /> Print cutting list
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {groups
              .filter((g) => g.bars.length > 0)
              .map((g) => (
                <div key={g.key}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                    {materialName(g, findSectionType)} — {g.bars.length} × {fmtM(g.stockLengthM)}
                    <span style={{ ...S.roleHint, fontWeight: 400 }}>
                      {" "}
                      ({g.trimFront ? `${TRIM_MM} mm trim, ` : ""}
                      {fmtMm(g.usableMm)} usable)
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {g.bars.map((bar, i) => (
                      <div key={i} style={{ ...S.managerRow, flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 44 }}>Bar {i + 1}</span>
                        <span style={{ fontSize: 13, flex: 1, minWidth: 120 }}>
                          {bar.pieces.map((p, j) => (
                            <span key={j}>
                              {j > 0 && <span style={{ color: C.muted }}> + </span>}
                              {Math.round(p.lengthMm).toLocaleString()}
                              {p.drawingNo && <span style={S.roleHint}> {p.drawingNo}</span>}
                            </span>
                          ))}
                          <span style={S.roleHint}> mm</span>
                        </span>
                        <span
                          style={{
                            ...S.chip,
                            flexShrink: 0,
                            ...(offcutIsKeepable(bar.offcutMm) ? { color: C.accentFinished, fontWeight: 700 } : { color: C.muted }),
                          }}
                          title={offcutIsKeepable(bar.offcutMm) ? "Long enough to go back to stock" : `Under ${MIN_OFFCUT_MM.toLocaleString()} mm — scrap`}
                        >
                          {fmtMm(bar.offcutMm)} {offcutIsKeepable(bar.offcutMm) ? "keep" : "scrap"}
                        </span>
                        {/* The operator's way off the shelf: one bar, its
                            offcut already filled in on the Use stock form. */}
                        {onBookOut && (
                          <button
                            type="button"
                            className="stk-btn"
                            style={S.reqActionBtnMuted}
                            onClick={() => onBookOut(g, bar, i + 1)}
                            title={
                              offcutIsKeepable(bar.offcutMm)
                                ? `Book one ${fmtM(g.stockLengthM)} bar out for this job, with the ${fmtMm(bar.offcutMm)} offcut going back to stock`
                                : `Book one ${fmtM(g.stockLengthM)} bar out for this job — the ${fmtMm(bar.offcutMm)} left over is scrap`
                            }
                          >
                            Book out
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
          const locked = cutHasStarted(it);
          const editing = canEdit && edit && edit.id === it.id && !locked;
          const offList = !!String(it.section || "").trim() && !sectionOnList(sections, it.section);

          if (editing) {
            return (
              <div key={it.id} style={{ ...S.managerRow, display: "block", border: `1px solid ${C.accentRaw}` }}>
                <label style={S.label}>
                  Change {it.qty} × {fmtMm(Number(it.cut_length_mm))} {it.section}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {lineBoxes(edit.draft, setEditDraft, it, () => saveEdit(it))}
                  <button type="button" className="stk-btn" style={{ ...S.addBtn, opacity: saving ? 0.5 : 1 }} onClick={() => saveEdit(it)} disabled={saving}>
                    <Check size={15} strokeWidth={2.5} />
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={stopEdit} disabled={saving}>
                    Cancel
                  </button>
                </div>
                {sizeBlock(it.id, edit.draft, setEditDraft)}
              </div>
            );
          }

          return (
            <div key={it.id} style={S.managerRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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
                  {canEdit && offList && (
                    <span
                      style={{ ...S.chip, color: C.danger, borderColor: C.danger }}
                      title="This section is not on Stock Manager's Sections list, so it has no weight, no price and matches no stock. Change the line and pick it from the list."
                    >
                      <AlertTriangle size={12} /> not on the Sections list
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                  <span style={S.roleHint}>= {fmtM(lineMetres(it))}</span>
                  {kg != null && <span style={S.roleHint}>· {fmtKg(kg)}</span>}
                  {canSeeValue && cost != null && <span style={S.roleHint}>· R {cost.toFixed(2)}</span>}
                  {Number(it.qty) > 0 && !onCount && (
                    <span style={{ ...S.roleHint, ...(cut >= Number(it.qty) ? { color: C.accentFinished, fontWeight: 600 } : {}) }}>
                      · {cut} of {it.qty} cut
                    </span>
                  )}
                  {/* The operator's counter. Big enough for a thumb, one
                      press per piece, and a Done for when the line is
                      finished in one go. */}
                  {Number(it.qty) > 0 && onCount && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                      <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, padding: "4px 10px" }} onClick={() => onCount(it, cut - 1)} disabled={cut <= 0} title="One fewer">
                        −
                      </button>
                      <span style={{ fontWeight: 700, color: cut >= Number(it.qty) ? C.accentFinished : C.text, minWidth: 64, textAlign: "center" }}>
                        {cut} of {it.qty} cut
                      </span>
                      <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, padding: "4px 10px" }} onClick={() => onCount(it, cut + 1)} disabled={cut >= Number(it.qty)} title="One more cut">
                        +
                      </button>
                      {cut < Number(it.qty) && (
                        <button type="button" className="stk-btn" style={{ ...S.reqActionBtnMuted, padding: "4px 10px" }} onClick={() => onCount(it, Number(it.qty))} title="All of this line is cut">
                          Done
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </div>
              {canEdit &&
                (locked ? (
                  <span
                    style={{ ...S.roleHint, display: "inline-flex", alignItems: "center", gap: 4 }}
                    title="Cutting has started on this line, so it cannot be changed or removed. To cut more of the same, add a new line."
                  >
                    <Lock size={12} /> Cutting started
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {SavedCheck && <SavedCheck fieldKey={`cutitem-${it.id}`} />}
                    {onSave && (
                      <button
                        type="button"
                        className="stk-btn"
                        style={{ ...S.reqActionBtnMuted, ...(edit ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                        onClick={() => startEdit(it)}
                        disabled={!!edit}
                        title={edit ? "Save or cancel the line that is open first" : "Change this line"}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                    )}
                    {onRemove && (
                      <button type="button" className="stk-btn" style={S.iconBtn} onClick={() => onRemove(it)} disabled={!!edit} title="Remove this line">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </span>
                ))}
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
            {lineBoxes(draft, setDraft, null, submitDraft)}
            <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={submitDraft} disabled={adding}>
              <Plus size={12} /> Add
            </button>
          </div>
          {sizeBlock("add", draft, setDraft)}
        </div>
      )}

      {/* The suggestions behind the drawing number box: the customer's own
          parts. Typed freely, because a drawing need not be a stock part. */}
      <datalist id="cut-drawing-options">
        {partNumbers.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}
