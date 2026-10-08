// The Toolpath tab's drawing, worked out from the engine's answer (its
// 'check' on a revision's own program text): one frame per side, the way
// the engine's setup sheet draws it (ERS TURNING APP setup_sheet.py
// toolpath_png): Z across with Z0 (the face being cut) on the right and
// the chuck on the left, X up as a radius, the upper half only.
//
// The engine's moves are in each side's program frame, pts [Z, X diameter],
// and say which end of the part is that side's Z0 ('0' or 'L'). The
// material left after each side (stock, by offset G54 / G55) is in the
// part's own z, slices of [z, [[r_in, r_out], ...]], turned into the
// side's frame here as the setup sheet does: Z = z - length for an L-end
// side, Z = -z for a 0-end side. No React; tested in toolpathGeom.test.js.

export const TOOL_COLOURS = ["#2f6fdb", "#2f9e6e", "#c47a00", "#8e44ad", "#d6336c", "#1098ad", "#5c940d", "#e8590c"];

// One frame per side, in program order. Each move keeps its place in the
// whole program (n, from 0) so one slider can step through both sides.
export function toolpathFrames(answer) {
  const setup = answer?.setup || {};
  const sides = setup.sides || [];
  const L = Number(setup.part?.length) || 0;
  const bar = setup.bar || {};
  const moves = (answer?.moves || []).map((m, n) => ({ ...m, n }));

  return sides.map((sd) => {
    const end = Number(sd.z0_end) > 0 && Math.abs(Number(sd.z0_end) - L) < 0.01 ? "L" : "0";
    const tz = end === "L" ? (z) => z - L : (z) => -z;
    const mine = moves.filter((m) => String(m.side) === end).map((m) => ({ ...m, sideNo: Number(sd.side) || 1 }));

    // Material left after this side, as rectangles (one per 0.1 mm slice
    // and run), merged where neighbouring slices carry the same run.
    const slices = (answer?.stock?.[sd.offset] || []).filter((s) => (s[1] || []).length);
    const blocks = [];
    let open = new Map();
    let lastZ = null;
    for (const [z, runs] of slices) {
      const Z = tz(z);
      const next = new Map();
      const step = lastZ == null ? 0.1 : Math.abs(Z - lastZ);
      for (const [r0, r1] of runs) {
        const key = `${r0}|${r1}`;
        const b = open.get(key);
        if (b && step < 0.15) {
          b.z0 = Math.min(b.z0, Z);
          b.z1 = Math.max(b.z1, Z);
          next.set(key, b);
        } else {
          const nb = { z0: Z, z1: Z, r0: Number(r0), r1: Number(r1) };
          blocks.push(nb);
          next.set(key, nb);
        }
      }
      open = next;
      lastZ = Z;
    }
    for (const b of blocks) {
      b.z0 -= 0.05;
      b.z1 += 0.05;
    }

    const stockZs = slices.map((s) => tz(s[0]));
    const farZ = stockZs.length ? Math.min(...stockZs) : -L;
    const nearZ = stockZs.length ? Math.max(...stockZs) : 0;
    const barR = (Number(bar.dia) || Number(setup.part?.max_dia) || 0) / 2;
    const barIn = (Number(bar.id) || 0) / 2;
    // The raw bar this side starts from: as long as the stock the engine
    // cuts it to, from the chuck end of what is left.
    const rawLen = Number(bar.stock_len_mm) || nearZ - farZ;
    const raw = { z0: Math.min(farZ, nearZ - rawLen), z1: Math.max(nearZ, farZ + rawLen), r0: barIn, r1: barR };
    // Jaws: the grip length on the clamped diameter, at the chuck end.
    const grip = Number(sd.grip_mm) || 0;
    const clampR = (Number(sd.clamp_dia_mm) || barR * 2) / 2;
    const jaws = grip > 0 ? { z0: raw.z0, z1: raw.z0 + grip, r0: clampR, r1: clampR + 18 } : null;

    const span = Math.max(raw.z1 - raw.z0, L, 1);
    const view = {
      zMin: raw.z0 - Math.max(8, 0.08 * span),
      zMax: Math.max(raw.z1, 0) + Math.max(10, 0.08 * span),
      rMax: barR + Math.max(22, 0.15 * barR * 2),
    };
    return { side: Number(sd.side) || 1, end, offset: sd.offset, programNo: sd.program_no, moves: mine, blocks, raw, jaws, view, note: sd.z0_note || "" };
  });
}

// Every tool that cuts, in the order it first cuts: the colour key.
export function toolList(answer) {
  const tools = [];
  for (const m of answer?.moves || []) if (m.kind !== "G0" && m.tool && !tools.includes(m.tool)) tools.push(m.tool);
  return tools;
}

export function toolColour(tools, tool) {
  const i = tools.indexOf(tool);
  return i < 0 ? "#555" : TOOL_COLOURS[i % TOOL_COLOURS.length];
}

// A move's points in the drawing (Z across, radius up), each kept inside
// the frame, as the setup sheet clips the home positions off.
export function movePoints(m, view) {
  return (m.pts || []).map(([Z, X]) => [Math.min(Math.max(Number(Z), view.zMin), view.zMax), Math.min(Math.max(Number(X) / 2, -2), view.rMax)]);
}

// What a move is, in words, for the line under the player.
export function moveWords(m, total) {
  const kind = m.kind === "G0" ? "rapid" : m.kind === "cycle" ? "canned cycle" : "cut";
  return `Move ${m.n + 1} of ${total}: side ${m.sideNo ?? ""} ${m.tool || ""} ${kind}`.replace(/\s+/g, " ").trim();
}
