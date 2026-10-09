// What the setup sheet says, worked out from the engine's answer (its
// check on the revision on screen, with its setup block) and the program.
// The sheet is the engine's own test sheet's layout (ERS TURNING APP
// setup_sheet.py) with the batch quantity added: Heinrich, 8 Oct 2026,
// "same, add batch qty, this will be used as a job card also".
//
// Where the engine sends a sheet's wording (machine_lines, stock_text,
// sides[].blocks, clamp_on, checks: built 8 Oct, live with its next push)
// it is printed as sent; until then the same lines are made from the setup
// block it already sends. No PDF here: setupSheetPdf.js draws this.
// Tested in setupSheetData.test.js.

import { faultText, oNumber } from "./cncRules.js";

const min1 = (s) => (s == null ? "-" : `${Math.round((Number(s) / 60) * 10) / 10} min`);
const fmt = (n) => (n == null || n === "" ? "-" : String(Math.round(Number(n) * 100) / 100));

export function speedText(t) {
  if (!t || t.s == null) return "-";
  const g50 = t.g50_max_rpm ? `\nG50 ${t.g50_max_rpm}` : "";
  if (t.s_mode === "G97") return `S ${t.s}${g50}`;
  return `Vc ${t.s}${t.s_finish ? `; Vc ${t.s_finish} finish` : ""}${g50}`;
}

export function feedText(t) {
  const feeds = (t?.feeds_mm_rev || []).filter((f) => f != null);
  return feeds.length ? `F ${feeds.join(", ")}` : "-";
}

export function setupSheetData({ program, rev, answer, when = new Date() }) {
  const setup = answer?.setup || {};
  const part = setup.part || {};
  const sides = setup.sides || [];
  const tools = setup.tools || [];
  const programs = setup.programs || (rev?.programs || []).map((p) => p.number);
  const qty = setup.batch_qty ?? program?.settings?.qty ?? 1;
  const nPrograms = programs.length || (rev?.programs || []).length || 1;

  const partText = part.max_dia
    ? `D${fmt(part.max_dia)} x ${fmt(part.length)} long${part.min_bore_dia ? `, bore D${fmt(part.min_bore_dia)}` : ""}`
    : "-";
  const materialText = [program?.material, setup.material?.cutting_name && setup.material.cutting_name !== program?.material ? `(cut as ${setup.material.cutting_name})` : ""]
    .filter(Boolean)
    .join(" ");
  // WS (Z0 from the jaw face) and the bar puller's Set pull, for the setter
  // (Heinrich, 9 Oct 2026; the engine's setup.sides[].ws_mm and
  // sides[0].set_pull_mm, the same as its "(WS ... SET PULL ...)" line).
  // Left out where the engine sends none (programs made before 9 Oct).
  const wsSides = sides.filter((sd) => sd.ws_mm != null);
  const setPull = sides[0]?.set_pull_mm;
  const wsText = [
    wsSides.length === 1 ? `WS ${fmt(wsSides[0].ws_mm)} mm` : wsSides.map((sd) => `WS ${sd.offset || `side ${sd.side}`} ${fmt(sd.ws_mm)} mm`).join(" · "),
    setPull != null ? `Set pull ${fmt(setPull)} mm` : "",
  ].filter(Boolean).join(" · ");
  const left = [
    ["Material", materialText || "-"],
    ["Stock", setup.stock_text || program?.stock || "-"],
    ["Holding", sides[0]?.holding || "-"],
    ...(wsText ? [["WS / Set pull", wsText]] : []),
    ["Part", partText],
    ["Cycle time (est.)", `${min1(answer?.cycle_s ?? setup.times?.cycle_s)} per part (${nPrograms} program${nPrograms === 1 ? "" : "s"})`],
    ["Batch quantity", String(qty)],
  ];
  const st = setup.settings || {};
  const right = Array.isArray(setup.machine_lines) && setup.machine_lines.length
    ? setup.machine_lines.map((l) => [l.label, l.text])
    : [
        ["Machine", typeof setup.machine === "string" ? setup.machine : "LEO 1600"],
        ["Settings", `edge break ${st.edge_break ?? 0.5}x45 · nose comp ${st.nose_comp ? "ON" : "OFF"} · finish ${st.finish_mode || "T1"}`],
      ];

  const turret = [];
  for (let station = 1; station <= 8; station++) {
    const t = tools.find((x) => Number(x.station) === station);
    if (!t || t.empty) {
      turret.push({ station, empty: true });
      continue;
    }
    turret.push({
      station,
      empty: false,
      used: !!t.used,
      tool: t.name || "-",
      holder: [t.holder, t.insert].filter(Boolean).join("\n") || "-",
      speed: t.used ? speedText(t) : "-",
      feed: t.used ? feedText(t) : "-",
      sidesText: t.used && (t.sides || []).length ? t.sides.map((s) => `side ${s}`).join(", ") : "not used",
      time: t.used ? min1(t.time_s) : "-",
    });
  }

  const perSide = setup.times?.per_side || [];
  const sideSheets = sides.map((sd, i) => {
    const sideNo = Number(sd.side) || i + 1;
    const blocks = Array.isArray(sd.blocks)
      ? sd.blocks.map((b) => ({ n: `N${b.n}`, t: `T${b.station}`, tool: b.tool, speed: b.speed || "-", feed: b.feeds || "-", time: b.time_s == null ? "-" : min1(b.time_s) }))
      : tools
          .filter((t) => t.used && (t.sides || []).includes(sideNo))
          .map((t) => ({ n: "-", t: `T${t.station}`, tool: t.name, speed: speedText(t).replace("\n", "  "), feed: feedText(t).replace(/^F /, ""), time: "-" }));
    return {
      side: sideNo,
      title: `Side ${sideNo} · ${sd.offset || ""} · ${oNumber(sd.program_no)} · ${sd.z0_note || ""}`.replace(/ · $/, ""),
      facts: [
        ["Clamp on", sd.clamp_on || (sd.clamp_dia_mm ? `D${fmt(sd.clamp_dia_mm)}` : "-")],
        ["Clamp depth", sd.clamp_depth_mm != null ? `${fmt(sd.clamp_depth_mm)} mm` : "bar puller"],
        ["Stick-out", sd.stick_out_mm != null ? `${fmt(sd.stick_out_mm)} mm` : "-"],
        ["Face stock", `${fmt(sd.face_stock_mm)} mm${sd.face_stock_note ? ` (${sd.face_stock_note})` : ""}`],
        ["Side time (est.)", min1(perSide.find((p) => Number(p.side) === sideNo)?.s)],
        ["Soft jaws", sd.soft_jaws ? "yes" : "no"],
        ...(sd.ws_mm != null ? [["WS (Z0 from jaws)", `${fmt(sd.ws_mm)} mm`]] : []),
        ...(i === 0 && sd.set_pull_mm != null ? [["Set pull", `${fmt(sd.set_pull_mm)} mm`]] : []),
      ],
      blocks,
    };
  });

  const checks = Array.isArray(setup.checks)
    ? setup.checks.map((c) => ({ pass: !!c.pass, name: c.name, detail: c.detail || "" }))
    : (answer?.fails || []).map((f) => ({ pass: false, name: typeof f === "string" ? f : JSON.stringify(f), detail: "" }));

  const ready = answer?.ready ?? setup.ready ?? false;
  return {
    title: program?.part_name || part.name || "",
    numbers: programs.map(oNumber).join(" / "),
    revision: rev ? `Rev ${rev.rev}${rev.source === "machine_copy" ? " (machine copy)" : ""}` : "",
    when: when.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    ready,
    status: ready ? "MACHINE READY - all checks pass" : `NOT FOR MACHINE - ${faultText(answer) || "see the checks"}`,
    left,
    right,
    turret,
    sides: sideSheets,
    checks,
    checksComplete: Array.isArray(setup.checks),
    warnings: (answer?.warnings || []).map((w) => (typeof w === "string" ? w : JSON.stringify(w))),
    notes: [...(setup.notes || []), ...(setup.hand_notes || [])].map(String),
    footnote: "Times are estimates from the programmed S and F (cutting, rapids, 1 s per tool change); loading and M0/M01 stops are not included.",
  };
}
