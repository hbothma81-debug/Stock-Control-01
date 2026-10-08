// A program's Toolpath tab: both sides drawn one above the other, the way
// the engine's setup sheet draws them (toolpathGeom.js): chuck on the left,
// Z0 on the right, the raw bar outlined, the material left after the side
// shaded, the jaws, each tool its own colour, rapids dashed red.
//
// A player under the pictures, as SolidWorks has (Heinrich, 8 Oct 2026):
// to the start, a move back, play / pause, a move on, to the end, and a
// slider; one timeline through both sides in program order. Tapping a
// tool in the key shows that tool alone; tapping it again shows all.
//
// The engine is asked when the tab is opened, once per revision while the
// program stays open (ProgramView keeps the answers); nothing is saved.

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { C, F, S } from "../theme.js";
import { loadToolpath } from "./cncData.js";
import { oNumber } from "./cncRules.js";
import { movePoints, moveWords, toolColour, toolList, toolpathFrames } from "./toolpathGeom.js";

const RAPID = "#d63a3a";

export default function ToolpathTab({ program, rev, answers, setAnswers }) {
  const answer = rev ? answers[rev.id] : null;
  const [error, setError] = useState("");
  const total = answer?.moves?.length || 0;
  const [k, setK] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [onlyTool, setOnlyTool] = useState(null);
  const timer = useRef(null);
  const shownCount = k == null ? total : k;

  useEffect(() => {
    if (!rev || answers[rev.id]) return undefined;
    let gone = false;
    setError("");
    loadToolpath({ program, rev })
      .then((a) => !gone && setAnswers((x) => ({ ...x, [rev.id]: a })))
      .catch((err) => !gone && setError(err.message || String(err)));
    return () => {
      gone = true;
    };
  }, [rev?.id]);

  useEffect(() => {
    if (!playing) return undefined;
    timer.current = setInterval(() => {
      setK((n) => {
        const next = (n == null ? total : n) + 1;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
    }, 160);
    return () => clearInterval(timer.current);
  }, [playing, total]);

  if (!rev) return <div style={{ color: C.muted }}>No revision to draw.</div>;
  if (error) return <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>;
  if (!answer) return <div style={S.empty}>Asking the engine for the toolpath…</div>;

  const frames = toolpathFrames(answer);
  const tools = toolList(answer);
  const all = frames.flatMap((f) => f.moves).sort((a, b) => a.n - b.n);
  const current = shownCount > 0 ? all.find((m) => m.n === shownCount - 1) : null;
  if (!frames.length) return <div style={{ color: C.muted }}>The engine sent no toolpath for this revision.</div>;

  const go = (n) => {
    setPlaying(false);
    setK(Math.max(0, Math.min(total, n)));
  };
  // A step from wherever the player is now, so quick presses all count.
  const step = (d) => {
    setPlaying(false);
    setK((x) => Math.max(0, Math.min(total, (x == null ? total : x) + d)));
  };
  const btn = { ...S.chip, padding: "6px 10px", display: "inline-flex", alignItems: "center" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        {tools.map((t) => {
          const on = !onlyTool || onlyTool === t;
          return (
            <button
              key={t}
              type="button"
              className="stk-btn"
              onClick={() => setOnlyTool((x) => (x === t ? null : t))}
              title={onlyTool === t ? "Show every tool" : `Show ${t} only`}
              style={{ ...S.chip, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6, opacity: on ? 1 : 0.4, ...(onlyTool === t ? { border: `1px solid ${toolColour(tools, t)}` } : {}) }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 2, background: toolColour(tools, t), display: "inline-block" }} />
              {t}
            </button>
          );
        })}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted }}>
          <svg width="22" height="6">
            <line x1="0" y1="3" x2="22" y2="3" stroke={RAPID} strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          rapid G0
        </span>
      </div>

      {frames.map((f) => (
        <SideDrawing key={f.side} frame={f} tools={tools} shownCount={shownCount} currentN={current?.n} onlyTool={onlyTool} />
      ))}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input type="range" min={0} max={total} value={shownCount} onChange={(e) => go(Number(e.target.value))} style={{ width: "100%" }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="stk-btn" style={btn} onClick={() => go(0)} title="To the start">
            <SkipBack size={15} />
          </button>
          <button type="button" className="stk-btn" style={btn} onClick={() => step(-1)} title="One move back">
            <StepBack size={15} />
          </button>
          <button
            type="button"
            className="stk-btn"
            style={{ ...btn, padding: "6px 14px" }}
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                if (shownCount >= total) setK(0);
                setPlaying(true);
              }
            }}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button type="button" className="stk-btn" style={btn} onClick={() => step(1)} title="One move on">
            <StepForward size={15} />
          </button>
          <button type="button" className="stk-btn" style={btn} onClick={() => go(total)} title="To the end">
            <SkipForward size={15} />
          </button>
          <span style={{ fontSize: 13, color: C.muted }}>{current ? moveWords(current, total) : `Before the first move (of ${total})`}</span>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted }}>
        The shading is the material left once that side is finished. Drawn from rev {rev.rev}
        {rev.source === "machine_copy" ? " (the machine copy, as the operator edited it)" : ""}.
      </div>
    </div>
  );
}

function SideDrawing({ frame, tools, shownCount, currentN, onlyTool }) {
  const { view, raw, jaws, blocks, moves } = frame;
  const w = view.zMax - view.zMin;
  const h = view.rMax + 4;
  const font = Math.max(1.6, Math.max(w, h) * 0.028);
  // The picture is drawn with radius up: y = -r.
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>
        Side {frame.side} · <span style={{ fontFamily: F.mono }}>{oNumber(frame.programNo)}</span>
        <span style={{ fontWeight: 400, color: C.muted }}> · {frame.note}</span>
      </div>
      <svg viewBox={`${view.zMin} ${-view.rMax} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: 300, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, display: "block" }}>
        <line x1={view.zMin} y1={0} x2={view.zMax} y2={0} stroke={C.muted} strokeWidth="1" strokeDasharray="6 3" vectorEffect="non-scaling-stroke" opacity="0.6" />
        <line x1={0} y1={-view.rMax} x2={0} y2={2} stroke={C.muted} strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.5" />
        <rect x={raw.z0} y={-raw.r1} width={raw.z1 - raw.z0} height={raw.r1 - raw.r0} fill="none" stroke={C.muted} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {blocks.map((b, i) => (
          <rect key={i} x={b.z0} y={-b.r1} width={b.z1 - b.z0} height={b.r1 - b.r0} fill={C.muted} opacity="0.28" />
        ))}
        {jaws && (
          <g>
            <rect x={jaws.z0} y={-jaws.r1} width={jaws.z1 - jaws.z0} height={jaws.r1 - jaws.r0} fill="#555" opacity="0.75" stroke="#222" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={jaws.z0} y={-jaws.r1 - font * 0.4} fontSize={font} fill={C.text}>
              JAWS
            </text>
          </g>
        )}
        {moves
          .filter((m) => m.n < shownCount)
          .filter((m) => !onlyTool || m.tool === onlyTool)
          .map((m) => {
            const pts = movePoints(m, view)
              .map(([z, r]) => `${z},${-r}`)
              .join(" ");
            const isNow = m.n === currentN;
            if (m.kind === "G0") {
              return <polyline key={m.n} points={pts} fill="none" stroke={RAPID} strokeWidth={isNow ? 2.5 : 1.2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" opacity="0.8" />;
            }
            return <polyline key={m.n} points={pts} fill="none" stroke={toolColour(tools, m.tool)} strokeWidth={isNow ? 3.5 : 1.8} vectorEffect="non-scaling-stroke" />;
          })}
        <text x={view.zMin + 1} y={2.6 - font * 0.2} fontSize={font} fill={C.muted}>
          chuck side
        </text>
        <text x={0.8} y={2.6 - font * 0.2} fontSize={font} fill={C.muted}>
          Z0
        </text>
      </svg>
    </div>
  );
}
