import { useMemo } from "react";
import { C, S } from "../theme.js";
import Section from "../Section.jsx";
import { shiftDayWindow, fmtTime } from "../lib/shiftWindow.js";
import { plannedMinutes, fmtMinutes, laserShifts } from "../lib/cuttingTime.js";

// What each shift cut, shift by shift, going back two weeks.
//
// A program belongs to the shift its last sheet was marked cut in. The
// planned time is what was typed in at nesting, off SigmaNest, and that
// is what the efficiency figure is worked out from: planned cutting
// minutes against the length of the shift. The operator's own time is
// shown beside it for the record and changes nothing.
//
// The shifts and their hours come from Time Manager. Without any set up
// there is nothing to report against, and the screen says so rather than
// guessing at a day.
//
// No database calls in here. The parent owns those.

const DAYS_BACK = 14;

export default function ShiftReport({ programs, shifts }) {
  // Only the shifts ticked "the laser cuts on this shift" under Time
  // Manager. The factory keeps other hours, and a factory shift that
  // overlaps the laser's would otherwise list the same programs again.
  const { shifts: mine, fallback } = useMemo(() => laserShifts(shifts), [shifts]);
  const days = useMemo(() => buildDays(programs || [], mine), [programs, mine]);

  if (!(shifts || []).length) {
    return (
      <div style={S.empty}>
        No shifts set up yet. Add them under Stock Manager → Time Manager and this fills in by shift.
      </div>
    );
  }

  return (
    <div style={S.list}>
      <div style={S.roleHint}>
        A program counts for the shift its last sheet was marked cut in. Efficiency is the planned cutting
        time, as nested, against the length of the shift. The operator's own time is for the record only.
      </div>
      {fallback && (
        <div style={{ ...S.roleHint, color: C.danger }}>
          No shift is ticked "the laser cuts on this shift" under Time Manager yet, so every shift is
          shown — and two shifts with overlapping hours will both list the same programs. Tick the laser's
          shifts and only those will show.
        </div>
      )}
      {days.length === 0 ? (
        <div style={S.empty}>Nothing cut in the last {DAYS_BACK} days.</div>
      ) : (
        days.map((d, i) => (
          <Section key={d.key} title={d.title} count={d.rows.reduce((n, r) => n + r.count, 0)} defaultOpen={i === 0}>
            {d.rows.map((r) => (
              <ShiftRow key={r.key} row={r} />
            ))}
          </Section>
        ))
      )}
    </div>
  );
}

function buildDays(programs, shifts) {
  const now = new Date();
  const finished = programs.filter((p) => p.is_complete && p.completed_at).map((p) => ({ ...p, at: new Date(p.completed_at) }));
  const days = [];
  for (let i = 0; i < DAYS_BACK; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    day.setHours(12, 0, 0, 0);
    const rows = [];
    for (const sh of shifts) {
      const w = shiftDayWindow(sh, day);
      if (!w || w.start > now) continue;
      const running = now >= w.start && now < w.end;
      const onShift = finished.filter((p) => p.at >= w.start && p.at < w.end);
      if (onShift.length === 0 && !running) continue;
      const planned = onShift.reduce((n, p) => n + (plannedMinutes(p) || 0), 0);
      const untimed = onShift.filter((p) => plannedMinutes(p) == null).length;
      const withActual = onShift.filter((p) => p.actual_minutes != null);
      const actual = withActual.reduce((n, p) => n + Number(p.actual_minutes), 0);
      // Against the time gone so far while the shift is still on, so a
      // shift half-way through does not read as half as good.
      const elapsed = ((running ? now : w.end) - w.start) / 60000;
      rows.push({
        key: sh.id,
        name: sh.name,
        hours: `${fmtTime(w.start)}–${fmtTime(w.end)}`,
        running,
        count: onShift.length,
        sheets: onShift.reduce((n, p) => n + Math.max(1, Number(p.sheets_required) || 1), 0),
        planned,
        untimed,
        actual: withActual.length ? actual : null,
        actualCount: withActual.length,
        efficiency: elapsed > 0 ? Math.round((planned / elapsed) * 100) : null,
        shiftMinutes: Math.round(elapsed),
        operators: [...new Set(onShift.map((p) => p.completed_by).filter(Boolean))],
        programs: onShift
          .slice()
          .sort((a, b) => a.at - b.at)
          .map((p) => p.program_number),
      });
    }
    if (rows.length) {
      days.push({
        key: day.toDateString(),
        title: day.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
        rows,
      });
    }
  }
  return days;
}

function ShiftRow({ row: r }) {
  const stat = (label, value, hint) => (
    <div style={{ minWidth: 90 }} title={hint}>
      <div style={{ ...S.roleHint, marginTop: 0 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{value}</div>
    </div>
  );
  return (
    <div style={S.row}>
      <div style={S.rowMain}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...S.itemName, fontSize: 16 }}>{r.name}</span>
          <span style={S.partTag}>{r.hours}</span>
          {r.running && <span style={{ ...S.partTag, color: C.accentFinished, borderColor: C.accentFinished }}>on now</span>}
          {r.operators.length > 0 && <span style={S.roleHint}>{r.operators.join(", ")}</span>}
        </div>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 8 }}>
          {stat("Programs", r.count)}
          {stat("Sheets", r.sheets)}
          {stat("Planned", r.planned > 0 ? fmtMinutes(r.planned) : "—", "Cutting time as nested, all programs finished this shift")}
          {stat(
            "Efficiency",
            r.efficiency == null || r.planned === 0 ? "—" : `${r.efficiency}%`,
            `Planned cutting time against ${fmtMinutes(r.shiftMinutes)} of shift${r.running ? " so far" : ""}`
          )}
          {stat(
            "Operator's time",
            r.actual == null ? "—" : fmtMinutes(r.actual),
            r.actualCount ? `Given for ${r.actualCount} of ${r.count}` : "Not given"
          )}
        </div>
        {r.untimed > 0 && (
          <div style={{ ...S.roleHint, color: C.danger }}>
            {r.untimed} of these had no planned time, so the planned figure is short.
          </div>
        )}
        {r.programs.length > 0 && (
          <div style={{ ...S.chipRow, marginTop: 6, marginBottom: 0 }}>
            {r.programs.map((n, i) => (
              <span key={i} style={{ ...S.chip, cursor: "default" }}>
                {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
