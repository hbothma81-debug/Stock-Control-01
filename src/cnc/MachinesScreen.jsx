// The CNC tab's Machines (build step 5; Heinrich, 8 Oct 2026: only the LEO
// 1600 for now, with an Add machine button; admins only). A machine's
// figures are the engine's machine file as it holds it (cnc_machines.data,
// the same keys), grouped as the file groups them; an admin changes a
// figure in place, saved on leaving it and read back. A new machine starts
// as a copy of the one on screen, to be changed to the new machine's
// figures, so nothing the engine needs is missing; its cutting data is
// imported on Cutting data.

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { C, S } from "../theme.js";
import { addMachine, loadMachines, saveMachine } from "./cncTables.js";
import EngineSource from "./EngineSource.jsx";

const { borderColor: _unused, ...chipActiveRest } = S.chipActive;
const CHIP_ON = { ...chipActiveRest, border: `1px solid ${C.accentFinished}` };

// The database keeps a machine's figures in its own order, not the file's;
// shown in the machine file's order, anything else after it A to Z.
const ORDER = ["name", "maker", "control", "_source", "capacity", "travel", "spindle", "chuck", "turret", "tailstock", "coolant", "safe_position", "times"];
const ordered = (obj) =>
  Object.entries(obj || {}).sort(([a], [b]) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return a.localeCompare(b);
  });

const label = (k) => (k.startsWith("_") ? `Note (${k.slice(1)})` : k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));

// A typed figure back into the kind it was: a number stays a number, yes /
// no a boolean, a list a list (comma separated).
export function readFigure(text, was) {
  const t = String(text ?? "").trim();
  if (Array.isArray(was)) {
    return t === "" ? [] : t.split(",").map((x) => x.trim()).map((x) => (x !== "" && Number.isFinite(Number(x)) ? Number(x) : x));
  }
  if (typeof was === "boolean") return /^(true|yes|y|1|on)$/i.test(t);
  if (typeof was === "number") {
    const n = Number(t.replace(",", "."));
    return t !== "" && Number.isFinite(n) ? n : was;
  }
  return t;
}

const shown = (v) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "yes" : "no") : v == null ? "" : String(v));

export default function MachinesScreen({ isAdmin, userName, onMachines }) {
  const [machines, setMachines] = useState(null);
  const [pick, setPick] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(null);

  async function reload(selectId) {
    try {
      const list = await loadMachines();
      setMachines(list);
      onMachines?.(list);
      setPick((p) => selectId || (p && list.some((m) => m.id === p) ? p : list[0]?.id || null));
    } catch (err) {
      setError(`The machines could not be loaded: ${err.message || err}`);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  if (error && !machines) return <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>;
  if (!machines) return <div style={S.empty}>Loading machines…</div>;
  const m = machines.find((x) => x.id === pick) || null;

  async function setFigure(path, text) {
    const data = JSON.parse(JSON.stringify(m.data || {}));
    let at = data;
    for (const k of path.slice(0, -1)) at = at[k];
    const key = path[path.length - 1];
    const value = readFigure(text, at[key]);
    if (JSON.stringify(value) === JSON.stringify(at[key])) return;
    at[key] = value;
    setError("");
    try {
      const saved = await saveMachine({ id: m.id, data, userName });
      setMachines((list) => list.map((x) => (x.id === saved.id ? saved : x)));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function add() {
    const name = (adding || "").trim();
    if (!name) return;
    setError("");
    try {
      const made = await addMachine({ name, copyOf: m, userName });
      setAdding(null);
      await reload(made.id);
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  const figure = (path, value) =>
    isAdmin ? (
      <input
        key={`${m.id}-${path.join(".")}-${shown(value)}`}
        defaultValue={shown(value)}
        style={{ ...S.input, padding: "4px 8px", fontSize: 13.5 }}
        onBlur={(e) => setFigure(path, e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    ) : (
      <span>{shown(value)}</span>
    );

  const data = m?.data || {};
  const top = ordered(data).filter(([, v]) => v === null || typeof v !== "object" || Array.isArray(v));
  const groups = ordered(data).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v));
  const grid = { display: "grid", gridTemplateColumns: "minmax(140px, auto) 1fr", gap: "4px 12px", alignItems: "center", fontSize: 13.5 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <EngineSource what="machine file" />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {machines.map((x) => (
          <button key={x.id} type="button" className="stk-btn" style={{ ...S.chip, ...(x.id === pick ? CHIP_ON : {}) }} onClick={() => setPick(x.id)}>
            {x.name}
          </button>
        ))}
        {isAdmin &&
          (adding == null ? (
            <button type="button" className="stk-btn" style={S.chip} onClick={() => setAdding("")}>
              <Plus size={13} /> Add machine
            </button>
          ) : (
            <span style={{ display: "inline-flex", gap: 6 }}>
              <input autoFocus style={{ ...S.input, width: 180 }} value={adding} placeholder="Machine name" onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
              <button type="button" className="stk-btn" style={S.addBtn} onClick={add} disabled={!adding.trim()}>
                Add
              </button>
              <button type="button" className="stk-btn" style={S.chip} onClick={() => setAdding(null)}>
                Cancel
              </button>
            </span>
          ))}
      </div>
      {adding != null && m && <div style={{ fontSize: 13, color: C.muted }}>The new machine starts with a copy of {m.name}'s figures; change them to its own.</div>}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      {!m && <div style={S.empty}>No machines yet.</div>}
      {m && (
        <>
          <div style={grid}>
            {top.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <div style={{ color: C.muted }}>{label(k)}</div>
                <div>{figure([k], v)}</div>
              </div>
            ))}
          </div>
          {groups.map(([g, obj]) => (
            <div key={g} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{label(g)}</div>
              <div style={grid}>
                {Object.entries(obj).map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <div style={{ color: C.muted }}>{label(k)}</div>
                    <div>{v && typeof v === "object" && !Array.isArray(v) ? <code style={{ fontSize: 12 }}>{JSON.stringify(v)}</code> : figure([g, k], v)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: C.muted }}>
            Last changed {new Date(m.updated_at).toLocaleString()} by {m.updated_by || "-"}.
          </div>
        </>
      )}
    </div>
  );
}
