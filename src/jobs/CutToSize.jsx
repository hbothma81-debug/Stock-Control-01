import { rand } from "../lib/money.js";
import { useState } from "react";
import { Plus, Trash2, AlertTriangle, FileText, Pencil, Check, X, PackagePlus, Lock } from "lucide-react";
import { C, S } from "../theme.js";
import TypeToFind from "../TypeToFind.jsx";
import { shapeForType, buildSection, missingBoxes } from "../manager/sectionShapes.js";
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
  typeChoices,
  sizeChoices,
  materialChoices,
  gradesOfSection,
  draftWithType,
  draftWithMaterial,
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
// Sections list, in three boxes in the order of the New stock item form:
// Section type, Material, Size. The type and the size are never one box
// (his word the same day): the first build had one box over every size of
// every type. A size that is not on the list is made from its type's
// boxes, the same boxes Stock Manager has, for the type and material the
// row already reads (`newSize`, for the people who can open Stock
// Manager), and bars are booked into stock from the Bars needed row
// (`onAddStock`, for the people who can add stock).

const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

const cell = (width) => ({ ...S.input, width, fontSize: 14, padding: "4px 6px" });
// A box as wide as what it holds, between a least and a most: a drawing
// number or a pipe's name is read whole, not through a slot. The least is
// wide on purpose (Heinrich, 29 Sep 2026: longer boxes, the drawing number
// most of all; the note can be the short one).
const wideEnough = (text, least, most = 380) => Math.min(most, Math.max(least, String(text || "").length * 8.5 + 36));
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
  onRequestAll,
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
  // { where: "add" or a line's id, boxes }. The type and the material are
  // the row's own.
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
      setDraft((d) => ({
        ...blankDraft(),
        sectionType: d.sectionType,
        section: d.section,
        grade: d.grade,
        stockLengthM: d.stockLengthM,
        trimFront: d.trimFront,
      }));
      setSizing(null);
    }
  }

  function startEdit(line) {
    const d = draftOfLine(line, sections);
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

  // The boxes of one line, a new one or one being changed (`was`), by
  // name, so the sheet can drop each into its own column. A plain
  // function, not a component: declared in here a component would be made
  // afresh on every keystroke and throw the cursor out of the box.
  function lineBoxes(d, setD, was, onEnter) {
    const types = typeChoices(sections);
    const allMaterials = materialChoices(materials, sections);
    // A material from before the rule that nobody lists is kept on show.
    const materialOptions =
      d.grade && !allMaterials.some((g) => sameText(g, d.grade))
        ? [...allMaterials, { value: d.grade, label: d.grade, hint: "not on the Material Types list" }]
        : allMaterials;
    const sizes = sizeChoices(sections, d.sectionType, d.grade);
    const offList = d.section && !sectionOnList(sections, d.section);
    // So is a size: one typed before the rule, or one not held in the
    // material the row now reads.
    const sizeOptions =
      d.section && !sizes.some((s) => sameText(s, d.section))
        ? [...sizes, { value: d.section, label: d.section, hint: offList ? "not on the Sections list" : "not held in this material" }]
        : sizes;
    return {
      drawing: (
        <input
          value={d.drawingNo}
          list="cut-drawing-options"
          placeholder="Drawing no"
          onChange={(e) => setD((p) => ({ ...p, drawingNo: e.target.value }))}
          title={d.drawingNo || "The customer's drawing or part number"}
          style={{ ...cell(wideEnough(d.drawingNo, 150)), maxWidth: "100%", boxSizing: "border-box" }}
        />
      ),
      // Three boxes, in the order of the New stock item form. The type
      // and the size are never one box.
      type: (
        <TypeToFind
          options={types}
          value={d.sectionType}
          onChange={(v) => {
            setD((p) => draftWithType(p, v));
            // Another type has other boxes: New size starts again.
            setSizing((s) => (s ? { ...s, boxes: {} } : s));
          }}
          emptyLabel="Section type"
          title="Square Tube, Pipe, Flat Bar: the type first, then a size of it"
          // Every type, not the first twelve: the list is short.
          maxShown={types.length}
          style={{ width: wideEnough(d.sectionType, 150), maxWidth: "100%" }}
          inputStyle={findCell}
        />
      ),
      material: (
        <TypeToFind
          options={materialOptions}
          value={d.grade}
          onChange={(v) => setD((p) => draftWithMaterial(p, sections, v))}
          emptyLabel="Material"
          title="The material. With one picked, the Size box lists the sizes held in it."
          maxShown={Math.max(12, materialOptions.length)}
          style={{ width: wideEnough(d.grade, 130), maxWidth: "100%" }}
          inputStyle={findCell}
        />
      ),
      size: (
        <TypeToFind
          options={sizeOptions}
          value={d.section}
          onChange={(v) => setD((p) => draftWithSection(p, sections, v))}
          emptyLabel={d.sectionType ? "Size" : "Size: type first"}
          title={d.section || (d.sectionType ? `The sizes of ${d.sectionType} on Stock Manager's Sections list` : "Pick the section type first")}
          // As wide as its name needs: a pipe's is forty letters long.
          style={{ width: wideEnough(d.section, 170), maxWidth: "100%" }}
          inputStyle={findCell}
        />
      ),
      length: (
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
      ),
      qty: (
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
      ),
      from: (
        <UnitInput
          unit="m"
          min="0.1"
          step="0.1"
          value={d.stockLengthM}
          onChange={(e) => setD((p) => ({ ...p, stockLengthM: e.target.value }))}
          style={cell(58)}
          title="Stock length"
        />
      ),
      trim: (
        <input
          type="checkbox"
          checked={!!d.trimFront}
          onChange={(e) => setD((p) => ({ ...p, trimFront: e.target.checked }))}
          title={`Take ${TRIM_MM} mm off the front of each bar to square it up`}
        />
      ),
      note: (
        <input
          value={d.note}
          placeholder={was ? "Note" : "Note (optional)"}
          onChange={(e) => setD((p) => ({ ...p, note: e.target.value }))}
          title={d.note || "A note for the saw operator"}
          style={{ ...cell(150), maxWidth: "100%", boxSizing: "border-box" }}
          onKeyDown={(e) => e.key === "Enter" && onEnter()}
        />
      ),
    };
  }
  // A size that is not on the list, made from its type's fixed boxes as
  // Stock Manager makes it, then picked for the line being typed. The
  // type and the material are the ones the row reads, as on the New stock
  // item form: there is nothing to pick twice.
  function sizeBlock(where, d, setD) {
    if (!newSize) return null;
    const shape = shapeForType(d.sectionType);
    // A type that has no boxes of its own (a word from before the fixed
    // types, or none) has no way to make a size here: Stock Manager does.
    if (!shape) return null;
    if (!sizing || sizing.where !== where) {
      return (
        <button type="button" className="stk-btn" style={linkBtn} onClick={() => setSizing({ where, boxes: {} })}>
          Size not on the list? New size
        </button>
      );
    }
    const grade = String(d.grade || "").trim();
    const gradeListed = materialChoices(materials, sections).some((g) => sameText(g, grade));
    const built = grade && gradeListed ? buildSection(shape, sizing.boxes) : null;
    const missing = missingBoxes(shape, sizing.boxes);
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
        <label style={S.label}>
          New size of {shape.label}
          {grade ? `, ${grade}` : ""}
        </label>
        {/* Stock Manager's own boxes for the type, pipe's Standard,
            Schedule and NB included: one copy (SectionBoxes.jsx). */}
        <div style={{ ...S.managerAddRow, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6 }}>
          {sectionBoxInputs(shape, sizing.boxes || {}, (fn) => setSizing((s) => ({ ...s, boxes: fn(s.boxes || {}) })))}
        </div>
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
            ) : !grade ? (
              "Pick the material in the row above first."
            ) : !gradeListed ? (
              `${grade} is not on the Material Types list. Pick the material in the row above.`
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

  // One cell of the sheets below. The sheet's lines come from .stk-sheet
  // in App.jsx's style block, the same as the Items tab's.
  const td = { padding: "3px 6px", verticalAlign: "middle", whiteSpace: "nowrap", fontSize: 13 };
  const th = { ...td, ...S.label, marginTop: 0, marginBottom: 0, textAlign: "left", fontWeight: 400 };
  const num = { ...td, textAlign: "right" };
  const rowLine = { borderTop: `1px solid ${C.border}` };

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
      {/* The shopping list as a sheet (Heinrich, 21 Oct 2026). One row per
          section, grade and bar length. */}
      {groups.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={S.label}>Bars needed</label>
            {/* One press asks for every bar not on the floor or on order
                (Heinrich, 7 Oct 2026): the Request stock basket opens with
                a line per section, to change, add to or create from. */}
            {canEdit &&
              onRequestAll &&
              (() => {
                const shorts = groups
                  .map((g) => ({ group: g, count: Math.max(0, g.bars.length - barsOnShelf(g, items) - barsOnOrder(g, requisitions, items)) }))
                  .filter((x) => x.count > 0);
                if (shorts.length === 0) return null;
                const bars = shorts.reduce((n, x) => n + x.count, 0);
                return (
                  <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={() => onRequestAll(shorts)} title="Open the Request stock basket with every bar still to order on it">
                    Request all outstanding ({bars} bar{bars === 1 ? "" : "s"})
                  </button>
                );
              })()}
          </div>
          <div style={{ overflowX: "auto", marginTop: 6 }}>
            <table className="stk-sheet" style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "right" }}>Bars</th>
                  <th style={th}>Bar</th>
                  <th style={th}>Section</th>
                  <th style={{ ...th, textAlign: "right" }}>Pieces</th>
                  <th style={{ ...th, textAlign: "right" }}>Metres</th>
                  <th style={{ ...th, textAlign: "right" }} title="Physically on the floor now, at this length or longer">On floor</th>
                  <th style={{ ...th, textAlign: "right" }} title="Requisitioned or on a purchase order, not on the floor yet">On order</th>
                  <th style={{ ...th, textAlign: "right" }} title="Already set aside for this job">Set aside</th>
                  <th style={{ ...th, textAlign: "right" }} title="Not on the floor and not on order: somebody still has to order these">To order</th>
                  <th style={th} title={`Offcuts of ${MIN_OFFCUT_MM.toLocaleString()} mm or more go back to stock`}>Offcuts</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const shelf = barsOnShelf(g, items);
                  const setAside = barsSetAside(g, allocations, items);
                  const onOrder = barsOnOrder(g, requisitions, items);
                  // On the floor covers it, or on order covers the rest, or
                  // somebody still has to order some.
                  const short = Math.max(0, g.bars.length - shelf - onOrder);
                  const keepable = g.bars.filter((b) => offcutIsKeepable(b.offcutMm)).length;
                  const canClaim = Math.min(g.bars.length - setAside, shelf - setAside);
                  return (
                    <tr key={g.key} style={rowLine}>
                      <td style={{ ...num, fontWeight: 700, fontSize: 14 }}>{g.bars.length}</td>
                      <td style={td}>{fmtM(g.stockLengthM)}</td>
                      <td style={{ ...td, fontWeight: 600, fontSize: 14 }}>
                        {materialName(g, findSectionType)}
                        {g.tooLong.length > 0 && (
                          <span style={{ ...S.chip, marginLeft: 6, color: C.danger, borderColor: C.danger }}>
                            <AlertTriangle size={12} /> {g.tooLong.length} piece{g.tooLong.length === 1 ? "" : "s"} longer than the bar
                          </span>
                        )}
                      </td>
                      <td style={num}>{g.pieceCount}</td>
                      <td style={num}>{fmtM(g.metres)}</td>
                      <td style={num}>{shelf}</td>
                      <td style={{ ...num, color: onOrder > 0 ? C.text : C.muted }}>{onOrder}</td>
                      <td style={{ ...num, color: setAside > 0 ? C.text : C.muted }}>{setAside}</td>
                      <td style={{ ...num, ...(short > 0 ? { color: C.danger, fontWeight: 700 } : { color: C.muted }) }}>{short}</td>
                      <td style={{ ...td, color: C.muted }}>
                        {g.bars.length > 0 && (
                          <>
                            {g.bars.map((b) => fmtMm(b.offcutMm)).join(", ")}
                            {keepable > 0 ? ` · ${keepable} back to stock` : " · all scrap"}
                          </>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          {/* The two things a sales person does with this row:
                              claim what is on the floor, and ask for the rest. */}
                          {canEdit && onSetAside && canClaim > 0 && (
                            <button
                              type="button"
                              className="stk-btn"
                              style={S.reqActionBtnMuted}
                              onClick={() => onSetAside(g, canClaim)}
                              title="Reserve these bars for this job, against the Cut To Size stage"
                            >
                              Set aside {canClaim}
                            </button>
                          )}
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
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {/* The parts as a sheet (Heinrich, 21 Oct 2026): headings once, one
          row per part, the pencil turns the row's cells into the boxes a
          new part is typed in, and Add a part is the bottom row. A size
          not on the list opens as a row under the one asking for it. */}
      <label style={S.label}>Parts to cut</label>
      {(lines || []).length === 0 && !canEdit && <div style={S.empty}>Nothing on the cut list yet.</div>}
      {((lines || []).length > 0 || canEdit) &&
        (() => {
          const showKg = anyWeight;
          const showCost = canSeeValue;
          const cols = 9 + 1 + (showKg ? 1 : 0) + (showCost ? 1 : 0) + 1 + (canEdit ? 1 : 0);
          // The boxes of a line being typed, in the sheet's columns.
          const boxRow = (key, boxes, actions, style) => (
            <tr key={key} style={{ ...rowLine, ...(style || {}) }}>
              <td style={td}>{boxes.drawing}</td>
              <td style={td}>{boxes.type}</td>
              <td style={td}>{boxes.material}</td>
              <td style={td}>{boxes.size}</td>
              <td style={td}>{boxes.length}</td>
              <td style={td}>{boxes.qty}</td>
              <td style={td}>{boxes.from}</td>
              <td style={{ ...td, textAlign: "center" }}>{boxes.trim}</td>
              <td style={td}>{boxes.note}</td>
              <td style={td}></td>
              {showKg && <td style={td}></td>}
              {showCost && <td style={td}></td>}
              <td style={td}></td>
              {canEdit && <td style={{ ...td, textAlign: "right" }}>{actions}</td>}
            </tr>
          );
          return (
            <div style={{ overflowX: "auto", marginTop: 6 }}>
              <table className="stk-sheet" style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={th}>Drawing</th>
                    <th style={th}>Type</th>
                    <th style={th}>Material</th>
                    <th style={th}>Size</th>
                    <th style={th}>Length</th>
                    <th style={{ ...th, textAlign: "right" }}>Qty</th>
                    <th style={th} title="The bar it is cut from">From</th>
                    <th style={{ ...th, textAlign: "center" }} title={`${TRIM_MM} mm off the front of each bar to square it up`}>Trim</th>
                    <th style={th}>Note</th>
                    <th style={{ ...th, textAlign: "right" }}>Metres</th>
                    {showKg && <th style={{ ...th, textAlign: "right" }}>kg</th>}
                    {showCost && <th style={{ ...th, textAlign: "right" }} title="Material, at the section's price per metre">R</th>}
                    <th style={th}>Cut</th>
                    {canEdit && <th style={th}></th>}
                  </tr>
                </thead>
                <tbody>
                  {(lines || []).map((it) => {
                    const kg = weightOf(it);
                    const cost = costOf(it);
                    const cut = Number(it.qty_cut || 0);
                    const locked = cutHasStarted(it);
                    const editing = canEdit && edit && edit.id === it.id && !locked;
                    const offList = !!String(it.section || "").trim() && !sectionOnList(sections, it.section);

                    if (editing) {
                      const boxes = lineBoxes(edit.draft, setEditDraft, it, () => saveEdit(it));
                      const extra = sizeBlock(it.id, edit.draft, setEditDraft);
                      return [
                        boxRow(
                          it.id,
                          boxes,
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <button type="button" className="stk-btn" style={{ ...S.addBtn, opacity: saving ? 0.5 : 1 }} onClick={() => saveEdit(it)} disabled={saving}>
                              <Check size={15} strokeWidth={2.5} />
                              {saving ? "Saving…" : "Save"}
                            </button>
                            <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={stopEdit} disabled={saving}>
                              Cancel
                            </button>
                          </span>,
                          { outline: `1px solid ${C.accentRaw}` }
                        ),
                        extra && (
                          <tr key={`${it.id}-size`}>
                            <td style={{ ...td, whiteSpace: "normal" }} colSpan={cols}>
                              {extra}
                            </td>
                          </tr>
                        ),
                      ];
                    }

                    return (
                      <tr key={it.id} style={rowLine}>
                        <td style={{ ...td, color: it.drawing_no ? C.text : C.muted }}>{it.drawing_no || ""}</td>
                        <td style={td}>{findSectionType ? findSectionType(it.section) : ""}</td>
                        <td style={td}>{it.grade || ""}</td>
                        <td style={{ ...td, fontWeight: 600, fontSize: 14 }}>
                          {it.section}
                          {canEdit && offList && (
                            <span
                              style={{ ...S.chip, marginLeft: 6, color: C.danger, borderColor: C.danger }}
                              title="This section is not on Stock Manager's Sections list, so it has no weight, no price and matches no stock. Change the line and pick it from the list."
                            >
                              <AlertTriangle size={12} /> not on the list
                            </span>
                          )}
                        </td>
                        <td style={{ ...td, fontSize: 14 }}>{fmtMm(Number(it.cut_length_mm))}</td>
                        <td style={{ ...num, fontWeight: 700, fontSize: 14 }}>{it.qty}</td>
                        <td style={td}>
                          {fmtM(Number(it.stock_length_m))}
                        </td>
                        <td style={{ ...td, textAlign: "center", color: C.muted }} title={it.trim_front === false ? "No trim" : `${TRIM_MM} mm trim`}>
                          {it.trim_front === false ? "" : "✓"}
                        </td>
                        <td style={{ ...td, color: C.muted, whiteSpace: "normal", minWidth: 120 }}>{it.note || ""}</td>
                        <td style={num}>{fmtM(lineMetres(it))}</td>
                        {showKg && <td style={num}>{kg != null ? fmtKg(kg) : ""}</td>}
                        {showCost && <td style={num}>{cost != null ? rand(cost) : ""}</td>}
                        <td style={td}>
                          {Number(it.qty) > 0 && !onCount && (
                            <span style={cut >= Number(it.qty) ? { color: C.accentFinished, fontWeight: 600 } : { color: C.muted }}>
                              {cut} of {it.qty}
                            </span>
                          )}
                          {/* The operator's counter. Big enough for a thumb, one
                              press per piece, and a Done for when the line is
                              finished in one go. */}
                          {Number(it.qty) > 0 && onCount && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
                        </td>
                        {canEdit && (
                          <td style={{ ...td, textAlign: "right" }}>
                            {locked ? (
                              <span
                                style={{ ...S.roleHint, display: "inline-flex", alignItems: "center", gap: 4 }}
                                title="Cutting has started on this line, so it cannot be changed or removed. To cut more of the same, add a new line."
                              >
                                <Lock size={12} /> Cutting started
                              </span>
                            ) : (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                {SavedCheck && <SavedCheck fieldKey={`cutitem-${it.id}`} />}
                                {onSave && (
                                  <button
                                    type="button"
                                    className="stk-btn"
                                    style={{ ...S.managerDelete, padding: "2px 3px", ...(edit ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
                                    onClick={() => startEdit(it)}
                                    disabled={!!edit}
                                    title={edit ? "Save or cancel the line that is open first" : "Change this line"}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                                {onRemove && (
                                  <button
                                    type="button"
                                    className="stk-btn"
                                    style={{ ...S.managerDelete, padding: "2px 3px", ...(edit ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
                                    onClick={() => onRemove(it)}
                                    disabled={!!edit}
                                    title="Remove this line"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {/* Add a part: the bottom row, the same columns. */}
                  {canEdit &&
                    (() => {
                      const boxes = lineBoxes(draft, setDraft, null, submitDraft);
                      const extra = sizeBlock("add", draft, setDraft);
                      return [
                        boxRow(
                          "add",
                          boxes,
                          <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={submitDraft} disabled={adding}>
                            <Plus size={12} /> Add
                          </button>,
                          { background: C.bg }
                        ),
                        extra && (
                          <tr key="add-size" style={{ background: C.bg }}>
                            <td style={{ ...td, whiteSpace: "normal" }} colSpan={cols}>
                              {extra}
                            </td>
                          </tr>
                        ),
                      ];
                    })()}
                </tbody>
              </table>
            </div>
          );
        })()}

      {(lines || []).length > 0 && (
        <div style={{ ...S.roleHint, marginTop: 8 }}>
          {totalPieces} piece{totalPieces === 1 ? "" : "s"} · {fmtM(totalMetres)}
          {anyWeight ? ` · ${fmtKg(totalKg)}` : ""}
          {canSeeValue && totalCost > 0 ? ` · ${rand(totalCost)} material` : ""}
          {` · ${KERF_MM} mm lost per cut`}
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
