import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { extraStagesOf, moveInList } from "./extraStages.js";

// A job line's extra stages, in its own order, as numbered chips:
// "Then: 1. Machining - External  2. Bending". Type to add one, X to take
// one off, the arrows to swap it with its neighbour. Always shown on a line
// and a part (Heinrich, 17 Sep 2026: fewer clicks, never a feature hidden
// behind a setting on another screen). App.jsx decides what is offered
// (thenBoxStages) and switches a stage to "Extra stage" the first time a
// line names it (setJobLineExtraStages).
//
// "Not set" means nobody has looked yet: the line goes to every extra stage.
// "None" saves an empty list: nothing extra. The rules are in
// extraStages.js.
//
//   line      the job line; reads extra_stages
//   stages    the names on offer, in factory order
//   onJob     the stage names ticked on this job; a chip whose stage is
//             not among them is shown muted, since nothing lists it yet
//   onChange  called with the new list: an array, possibly empty
//   canEdit   false shows the chips and nothing to press
const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const iconBtn = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  color: "inherit",
  display: "inline-flex",
  alignItems: "center",
};

export default function ExtraStagesBox({ line, stages, onJob, onChange, canEdit }) {
  const list = extraStagesOf(line);
  const chosen = list || [];
  const offer = (stages || []).filter((s) => !chosen.some((c) => same(c, s)));
  if (!canEdit && chosen.length === 0) return null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <span style={S.roleHint}>Then:</span>
      {list === null && canEdit && (
        <span
          style={{ ...S.roleHint, color: C.accentRaw, fontWeight: 600 }}
          title="Nobody has said which extra stages this line goes to, so it goes to every one. Add the ones it needs, or press None."
        >
          not set
        </span>
      )}
      {list !== null && chosen.length === 0 && <span style={S.roleHint}>nothing extra</span>}
      {chosen.map((name, i) => {
        const notOnJob = onJob && !onJob.some((n) => same(n, name));
        return (
          <span
            key={name}
            style={{
              ...S.chip,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "1px 6px",
              fontSize: 12.5,
              color: notOnJob ? C.muted : C.text,
              ...(notOnJob ? { borderStyle: "dashed" } : {}),
            }}
            title={notOnJob ? `${name} is not ticked on this job yet, so nothing lists this line there.` : undefined}
          >
            {canEdit && i > 0 && (
              <button type="button" style={iconBtn} onClick={() => onChange(moveInList(chosen, i, -1))} title="One step earlier">
                <ChevronLeft size={12} />
              </button>
            )}
            {chosen.length > 1 ? `${i + 1}. ${name}` : name}
            {canEdit && i < chosen.length - 1 && (
              <button type="button" style={iconBtn} onClick={() => onChange(moveInList(chosen, i, 1))} title="One step later">
                <ChevronRight size={12} />
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                style={iconBtn}
                onClick={() => onChange(chosen.filter((_, j) => j !== i))}
                title={`Take ${name} off this line`}
              >
                <X size={12} />
              </button>
            )}
          </span>
        );
      })}
      {canEdit && offer.length > 0 && (
        <TypeToFind
          // A fresh box after every pick, so the chosen name does not sit in it.
          key={chosen.join("|")}
          style={{ width: 150 }}
          // border-box: without it the padding is added to the full width
          // and the box spills 32px over the None button beside it.
          inputStyle={{ fontSize: 12.5, padding: "2px 24px 2px 6px", boxSizing: "border-box" }}
          options={offer}
          value=""
          onChange={(v) => v && onChange([...chosen, v])}
          emptyLabel={chosen.length ? "Then…" : "Add a stage…"}
          title="Which stages this line goes through after it is cut, in order: the stages on this job that come after cutting."
        />
      )}
      {/* Always shown, so say why there is nothing to pick rather than
          leave an empty row (Heinrich, 17 Sep 2026). */}
      {canEdit && offer.length === 0 && chosen.length === 0 && (
        <span style={S.roleHint}>no later stage on this job to send it to</span>
      )}
      {canEdit && list === null && (
        <button
          type="button"
          className="stk-btn"
          style={{ ...S.reqActionBtnMuted, padding: "1px 7px", fontSize: 12 }}
          onClick={() => onChange([])}
          title="This line goes to no extra stage"
        >
          None
        </button>
      )}
    </span>
  );
}
