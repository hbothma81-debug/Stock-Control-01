import { Package, PackagePlus, X } from "lucide-react";
import { C, S } from "../theme.js";
import Section from "../Section.jsx";
import TypeToFind from "../TypeToFind.jsx";

// The Materials tab on a job: everything from stores that is spoken for
// by this job, in one place.
//
// Two different things live here on purpose, because the shop does both:
//
//   Reserve  -- the stock stays on the shelf and the count does not move,
//               but nobody else can take it. What a tube or a length of
//               steel wants: claimed now, cut later.
//   Take now -- it leaves the shelf this minute. What a handful of
//               fasteners wants, at the moment somebody walks off with
//               them.
//
// Nothing here is new underneath. A reservation is a job_allocation, the
// same row the Production tab, the cut list and a received purchase order
// all make. This screen gathers them, which is the part that was missing:
// the only way in used to be a small button buried in the stage checklist.
//
// Reserved material is off limits to ordinary Use on the stock screens --
// the only way to consume it is through its own reservation, which books
// it out against this job. That is what keeps the shelf and the job
// agreeing with each other.

const num = (v) => Number(v) || 0;

export default function Materials({
  allocations,
  stages,
  items,
  canEdit,
  onReserve,
  onTakeNow,
  onUse,
  onRelease,
  onAssignStage,
}) {
  const live = (allocations || []).filter((a) => a.status !== "released");
  const released = (allocations || []).filter((a) => a.status === "released");
  const loose = live.filter((a) => !a.process_id);
  const stageOptions = (stages || []).map((p) => ({ value: p.id, label: p.process_name }));

  const outstandingOf = (a) => Math.max(0, num(a.qty_allocated) - num(a.qty_used));
  const totalOutstanding = live.reduce((sum, a) => sum + outstandingOf(a), 0);

  function row(a, { showStage } = {}) {
    const outstanding = outstandingOf(a);
    const stockItem = (items || []).find((i) => i.id === a.item_id);
    const done = outstanding === 0;
    return (
      <div key={a.id} style={S.managerRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Package size={13} style={{ color: done ? C.muted : C.accentRaw, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{a.item_name || "Item"}</span>
            <span style={{ ...S.chip, ...(done ? { color: C.muted } : { color: C.accentRaw, borderColor: C.accentRaw, fontWeight: 700 }) }}>
              {done ? `all ${a.qty_allocated} used` : `${outstanding} of ${a.qty_allocated} still to use`}
            </span>
            {showStage && a.process_name && <span style={S.roleHint}>for {a.process_name}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
            {stockItem?.loc && <span style={S.roleHint}>{stockItem.loc}</span>}
            {stockItem && <span style={S.roleHint}>· {stockItem.qty} on the shelf</span>}
            {stockItem?.trackLength && num(stockItem.length) > 0 && <span style={S.roleHint}>· {stockItem.length} m lengths</span>}
            {a.allocated_by && <span style={S.roleHint}>· set aside by {a.allocated_by}</span>}
            {a.note && <span style={S.roleHint}>· {a.note}</span>}
          </div>
          {/* A reservation with no stage yet -- how it arrives from a
              purchase order. Naming the stage moves it up the job. */}
          {canEdit && showStage && !a.process_id && stageOptions.length > 0 && (
            <div style={{ marginTop: 4, maxWidth: 240 }}>
              <TypeToFind
                options={stageOptions}
                value=""
                onChange={(v) => {
                  const stage = (stages || []).find((p) => p.id === v);
                  if (stage) onAssignStage(a, stage);
                }}
                emptyLabel="Put against a stage…"
                inputStyle={{ fontSize: 14, padding: "5px 26px 5px 8px" }}
              />
            </div>
          )}
        </div>
        {canEdit && outstanding > 0 && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="stk-btn"
              style={S.reqActionBtn}
              onClick={() => onUse(a)}
              title={
                stockItem?.trackLength
                  ? "Book this out against the job — long material offers the offcut back to stock"
                  : "Book this out against the job: it leaves the shelf now"
              }
            >
              Use stock
            </button>
            <button
              type="button"
              className="stk-btn"
              style={S.managerDelete}
              onClick={() => onRelease(a)}
              title="Hand it back — it was set aside by mistake, or the job changed"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
      {canEdit && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <button type="button" className="stk-btn" style={S.reqActionBtn} onClick={onReserve}>
            <Package size={13} /> Reserve stock for this job
          </button>
          <button type="button" className="stk-btn" style={S.reqActionBtnMuted} onClick={onTakeNow}>
            <PackagePlus size={13} /> Take from stock now
          </button>
        </div>
      )}
      <div style={{ ...S.roleHint, marginBottom: 8 }}>
        Reserving leaves the material on the shelf and marks it as this job's, so nobody else can take it. Taking books it
        out there and then. Either way it can be put against a particular stage, or left for the job as a whole.
      </div>

      {live.length === 0 && <div style={S.empty}>Nothing from stores is set aside for this job yet.</div>}

      {/* Not yet against a stage -- how material arrives from a purchase
          order, and how raw material is reserved before anyone knows which
          machine takes it. First, because it is the pile that needs a
          decision. */}
      {loose.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>For the job, no stage yet</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {loose.map((a) => row(a, { showStage: true }))}
          </div>
        </div>
      )}

      {/* Then stage by stage, in the shop's own order. */}
      {(stages || []).map((p) => {
        const mine = live.filter((a) => a.process_id === p.id);
        if (mine.length === 0) return null;
        const waiting = mine.reduce((sum, a) => sum + outstandingOf(a), 0);
        return (
          <div key={p.id} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
              {p.process_name}
              <span style={{ ...S.roleHint, fontWeight: 400 }}>
                {" "}
                · {mine.length} item{mine.length === 1 ? "" : "s"}
                {waiting > 0 ? ` · ${waiting} still to use` : " · all used"}
                {p.is_complete ? " · stage done" : ""}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{mine.map((a) => row(a))}</div>
          </div>
        );
      })}

      {/* A stage that has since been taken off the job still has its
          material against it. Listed rather than hidden, or the material
          would be reserved and invisible. */}
      {(() => {
        const orphans = live.filter((a) => a.process_id && !(stages || []).some((p) => p.id === a.process_id));
        if (orphans.length === 0) return null;
        return (
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Against a stage no longer on this job</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {orphans.map((a) => row(a, { showStage: true }))}
            </div>
          </div>
        );
      })()}

      {live.length > 0 && (
        <div style={{ ...S.roleHint, marginTop: 8, fontWeight: 600 }}>
          {live.length} item{live.length === 1 ? "" : "s"} set aside for this job
          {totalOutstanding > 0 ? `, ${totalOutstanding} still to use` : ", all used"}
        </div>
      )}

      {released.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Section title="Handed back" count={released.length} defaultOpen={false}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {released.map((a) => (
                <div key={a.id} style={{ ...S.managerRow, opacity: 0.7 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>
                      {a.item_name || "Item"} — {a.qty_allocated} released
                    </div>
                    <div style={S.roleHint}>
                      {a.process_name ? `was for ${a.process_name}` : "was for the job"}
                      {a.allocated_by ? ` · set aside by ${a.allocated_by}` : ""}
                      {a.note ? ` · ${a.note}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
