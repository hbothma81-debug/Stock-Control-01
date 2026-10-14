// The process breakdown (Heinrich, 14 Oct 2026: "a process breakdown of
// what each tool is doing ... steps noted one by one, and what tool used"),
// from the engine's answer: per side, each block's step, station, tool,
// what it does (setup.sides[].blocks[].does, engine 92b786b; the tool name
// when an engine does not send it), speed, feed and time. And the turret
// it uses (setup.tools). Shown on New program's Review; no sums here.

import { C, F } from "../theme.js";
import { oNumber } from "./cncRules.js";

const time = (s) => (s == null || s === "" ? "-" : Number(s) < 90 ? `${Math.round(Number(s))} s` : `${(Number(s) / 60).toFixed(1)} min`);
const cell = { padding: "5px 8px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top", fontSize: 13.5 };
const head = { ...cell, color: C.muted, fontWeight: 600, textAlign: "left" };

export function TurretList({ answer }) {
  const tools = (answer?.setup?.tools || []).filter((t) => !t.empty);
  if (!tools.length) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={head}>T</th>
            <th style={head}>Tool</th>
            <th style={head}>Insert / holder</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.station} style={{ opacity: t.used === false ? 0.5 : 1 }}>
              <td style={{ ...cell, fontFamily: F.mono }}>T{t.station}</td>
              <td style={cell}>
                {t.name}
                {t.used === false ? " (not used)" : ""}
                {t.owned === false && <span style={{ color: C.danger }}> · not owned</span>}
              </td>
              <td style={{ ...cell, color: C.muted }}>{[t.insert, t.holder].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProcessBreakdown({ answer }) {
  const sides = answer?.setup?.sides || [];
  if (!sides.length) return <div style={{ color: C.muted, fontSize: 14 }}>The engine sent no steps for this program.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {sides.map((sd, i) => (
        <div key={i}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Side {sd.side ?? i + 1}
            {sd.offset ? ` · ${sd.offset}` : ""}
            {sd.program_no ? ` · ${oNumber(sd.program_no)}` : ""}
            {sd.z0_note ? <span style={{ fontWeight: 400, color: C.muted }}> · {sd.z0_note}</span> : null}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={head}>Step</th>
                  <th style={head}>Tool</th>
                  <th style={head}>What it does</th>
                  <th style={head}>Speed</th>
                  <th style={head}>Feed</th>
                  <th style={head}>Time</th>
                </tr>
              </thead>
              <tbody>
                {(sd.blocks || []).map((b, j) => (
                  <tr key={j}>
                    <td style={{ ...cell, fontFamily: F.mono }}>N{b.n}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: F.mono }}>T{b.station}</span> {b.tool}
                    </td>
                    <td style={cell}>{b.does || b.tool}</td>
                    <td style={{ ...cell, color: C.muted }}>{b.speed || "-"}</td>
                    <td style={{ ...cell, color: C.muted }}>{b.feeds || "-"}</td>
                    <td style={{ ...cell, color: C.muted, whiteSpace: "nowrap" }}>{time(b.time_s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
