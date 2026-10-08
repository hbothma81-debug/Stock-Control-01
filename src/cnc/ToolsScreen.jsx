// The CNC tab's Tools (build step 5; Heinrich, 8 Oct 2026): one tool list
// per machine, tools not owned listed too ("Not owned", they never stop a
// program from being posted), HSS drills listed by size, admins only
// change. On top, the machine's default turret T1 to T8, where the
// automatic pick starts; each program's own layout is on its Tool crib.
// + New tool: the insert and holder ISO codes read by the engine, then the
// fields the engine needs for the kind (toolKinds.js).

import { Fragment, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Section from "../Section.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { C, S } from "../theme.js";
import { readIsoCode } from "./cncData.js";
import { addTool, loadTools, removeTool, saveMachine, saveTool } from "./cncTables.js";
import { formFromTool, kindOf, suggestKey, TOOL_KINDS, toolFromForm, toolLine } from "./toolKinds.js";
import EngineSource from "./EngineSource.jsx";

export default function ToolsScreen({ machine, isAdmin, userName, onMachine }) {
  const [tools, setTools] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // a tool's id, or "new"
  const [search, setSearch] = useState("");

  async function reload() {
    try {
      setTools(await loadTools(machine.id));
    } catch (err) {
      setError(`The tools could not be loaded: ${err.message || err}`);
    }
  }
  useEffect(() => {
    setTools(null);
    reload();
  }, [machine.id]);

  if (error && !tools) return <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>;
  if (!tools) return <div style={S.empty}>Loading tools…</div>;

  const turret = machine.data?.turret_default || {};
  const options = [{ value: "", label: "empty" }, ...tools.map((t) => ({ value: t.tool_key, label: t.data?.name || t.tool_key, hint: `${t.tool_key}${t.owned ? "" : " · not owned"}` }))];
  const q = search.trim().toLowerCase();
  const shown = tools.filter((t) => !q || [t.tool_key, t.data?.name, t.data?.holder, t.data?.insert].some((x) => String(x ?? "").toLowerCase().includes(q)));

  async function setStation(station, toolKey) {
    setError("");
    try {
      const saved = await saveMachine({ id: machine.id, data: { ...machine.data, turret_default: { ...turret, [station]: toolKey || null } }, userName });
      onMachine(saved);
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <EngineSource what="tool list" needs={/tool/i} />
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Default turret · {machine.name}</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Where the automatic pick starts. Each program's own layout is on its Tool crib tab.</div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 10px", alignItems: "center" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((st) => {
            const key = turret[String(st)] ?? null;
            const tool = tools.find((t) => t.tool_key === key);
            return (
              <Fragment key={st}>
                <div style={{ fontWeight: 700 }}>T{st}</div>
                {isAdmin ? (
                  <TypeToFind options={options} value={key || ""} onChange={(v) => setStation(String(st), v)} placeholder="empty" />
                ) : (
                  <div style={{ fontSize: 14 }}>{tool ? tool.data?.name : key || "empty"}</div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input style={{ ...S.input, flex: 1 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools (name, holder, insert)…" />
        {isAdmin && (
          <button type="button" className="stk-btn" style={S.addBtn} onClick={() => setOpen("new")}>
            <Plus size={15} strokeWidth={2.5} /> New tool
          </button>
        )}
      </div>
      {open === "new" && (
        <ToolForm
          key="new"
          machine={machine}
          tools={tools}
          userName={userName}
          onDone={(saved) => {
            setOpen(null);
            if (saved) setTools((list) => [...list, saved]);
          }}
        />
      )}

      {TOOL_KINDS.map((k) => {
        const mine = shown.filter((t) => t.data?.kind === k.kind);
        if (!mine.length) return null;
        return (
          <Section key={`${k.kind}-${!!q}`} title={k.label} count={mine.length} defaultOpen={!!q || k.kind !== "hss"}>
            {mine.map((t) => (
              <div key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <button
                  type="button"
                  className="stk-btn"
                  onClick={() => setOpen((o) => (o === t.id ? null : t.id))}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.text, padding: "8px 4px", cursor: "pointer", fontSize: 14 }}
                >
                  <b>{t.data?.name || t.tool_key}</b>
                  <span style={{ color: C.muted }}> · {toolLine(t)}</span>
                  {!t.owned && <span style={{ color: C.accentRaw, fontWeight: 600 }}> · Not owned</span>}
                </button>
                {open === t.id &&
                  (isAdmin ? (
                    <ToolForm
                      key={t.id}
                      machine={machine}
                      tools={tools}
                      tool={t}
                      userName={userName}
                      onDone={(saved, removed) => {
                        setOpen(null);
                        if (removed) setTools((list) => list.filter((x) => x.id !== t.id));
                        else if (saved) setTools((list) => list.map((x) => (x.id === saved.id ? saved : x)));
                      }}
                    />
                  ) : (
                    <ToolDetails tool={t} />
                  ))}
              </div>
            ))}
          </Section>
        );
      })}
    </div>
  );
}

function ToolDetails({ tool }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", fontSize: 13, padding: "0 4px 8px" }}>
      {Object.entries(tool.data || {}).map(([k, v]) => (
        <Fragment key={k}>
          <div style={{ color: C.muted }}>{k.replace(/_/g, " ")}</div>
          <div>{Array.isArray(v) ? v.join(", ") : String(v)}</div>
        </Fragment>
      ))}
    </div>
  );
}

// New tool, or a tool opened to change it.
function ToolForm({ machine, tools, tool = null, userName, onDone }) {
  const [kind, setKind] = useState(tool?.data?.kind || "");
  const [form, setForm] = useState(() => (tool ? formFromTool(tool) : { name: "", extra: {} }));
  const [toolKey, setToolKey] = useState(tool?.tool_key || "");
  const [owned, setOwned] = useState(tool ? !!tool.owned : true);
  const [codes, setCodes] = useState({ insert: "", holder: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const k = kindOf(kind);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function readCodes() {
    setError("");
    setNote("");
    setBusy("Reading the codes…");
    const [ins, hol] = await Promise.all([readIsoCode(codes.insert), readIsoCode(codes.holder)]);
    setBusy("");
    if (!ins && !hol) {
      setNote("The engine could not read those codes (or cannot read codes yet): fill the boxes in by hand.");
      return;
    }
    setForm((f) => {
      const extra = { ...(f.extra || {}) };
      const next = { ...f, extra };
      if (ins) {
        next.insert = f.insert || codes.insert.trim().toUpperCase();
        if (ins.nose_r != null && !f.nose) next.nose = String(ins.nose_r);
        for (const key of ["shape", "ic_mm", "thickness_mm", "clearance", "grade"]) if (ins[key] != null) extra[key] = ins[key];
      }
      if (hol) {
        next.holder = f.holder || codes.holder.trim().toUpperCase();
        for (const key of ["approach_deg", "hand", "shank_mm"]) if (hol[key] != null) extra[key] = hol[key];
      }
      return next;
    });
    setNote(`Read: ${[ins && "insert", hol && "holder"].filter(Boolean).join(" and ")}. Check the boxes, then Save.`);
  }

  async function save() {
    setError("");
    const { data, errors } = toolFromForm(kind, form);
    const key = (toolKey || suggestKey(form.name)).trim().toUpperCase();
    if (errors.length) {
      setError(`Fill in: ${errors.join(", ")}.`);
      return;
    }
    if (!tool && tools.some((t) => t.tool_key === key)) {
      setError(`A tool called ${key} is on this machine already: give it another short name.`);
      return;
    }
    setBusy("Saving…");
    try {
      const saved = tool ? await saveTool({ id: tool.id, owned, data, userName }) : await addTool({ machineId: machine.id, toolKey: key, owned, data, userName });
      onDone(saved, false);
    } catch (err) {
      setError(err.message || String(err));
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${tool.data?.name || tool.tool_key} from ${machine.name}'s tools? Programs that use it will be told it is missing.`)) return;
    setBusy("Removing…");
    try {
      await removeTool(tool.id);
      onDone(null, true);
    } catch (err) {
      setError(err.message || String(err));
      setBusy("");
    }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, margin: "4px 0 10px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{tool ? `Change ${tool.data?.name || tool.tool_key}` : "New tool"}</div>
      {!tool && (
        <div style={S.formGrid}>
          <div>
            <label style={S.label}>Insert ISO code</label>
            <input style={S.input} value={codes.insert} onChange={(e) => setCodes((c) => ({ ...c, insert: e.target.value }))} placeholder="e.g. WNMG 080408" />
          </div>
          <div>
            <label style={S.label}>Holder ISO code</label>
            <input style={S.input} value={codes.holder} onChange={(e) => setCodes((c) => ({ ...c, holder: e.target.value }))} placeholder="e.g. MWLNR 2525M08" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="stk-btn" style={S.chip} onClick={readCodes} disabled={!!busy || !(codes.insert.trim() || codes.holder.trim())}>
              {busy === "Reading the codes…" ? busy : "Read the codes"}
            </button>
          </div>
        </div>
      )}
      {note && <div style={{ fontSize: 13, color: C.muted }}>{note}</div>}
      <div style={S.formGrid}>
        <div>
          <label style={S.label}>Kind</label>
          <select style={S.input} value={kind} onChange={(e) => setKind(e.target.value)} disabled={!!tool}>
            <option value="">Pick…</option>
            {TOOL_KINDS.map((x) => (
              <option key={x.kind} value={x.kind}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Name (as the program header prints it)</label>
          <input style={S.input} value={form.name} onChange={set("name")} placeholder="e.g. 20MM BORING BAR" />
        </div>
        {!tool && (
          <div>
            <label style={S.label}>Short name (the engine's key)</label>
            <input style={S.input} value={toolKey} onChange={(e) => setToolKey(e.target.value)} placeholder={suggestKey(form.name) || "e.g. A20R"} />
          </div>
        )}
        {k?.fields.map((f) => (
          <div key={f.key}>
            <label style={S.label}>{f.label}</label>
            {f.type === "choice" ? (
              <select style={S.input} value={form[f.key] || ""} onChange={set(f.key)}>
                <option value="">Pick…</option>
                {f.choices.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input style={S.input} value={form[f.key] ?? ""} onChange={set(f.key)} inputMode={f.type === "text" ? "text" : "decimal"} />
            )}
          </div>
        ))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        <input type="checkbox" checked={owned} onChange={(e) => setOwned(e.target.checked)} /> Owned (on the shelf)
      </label>
      {Object.keys(form.extra || {}).length > 0 && (
        <div style={{ fontSize: 12.5, color: C.muted }}>
          Also kept: {Object.entries(form.extra).map(([key, v]) => `${key.replace(/_/g, " ")} ${Array.isArray(v) ? v.join("/") : v}`).join(" · ")}
        </div>
      )}
      {error && <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="stk-btn" style={{ ...S.submitBtn, marginTop: 0 }} onClick={save} disabled={!!busy || !kind}>
          {busy === "Saving…" ? busy : tool ? "Save" : "Add tool"}
        </button>
        <button type="button" className="stk-btn" style={S.chip} onClick={() => onDone(null, false)} disabled={!!busy}>
          Cancel
        </button>
        {tool && (
          <button type="button" className="stk-btn" style={{ ...S.chip, color: C.danger }} onClick={remove} disabled={!!busy}>
            <Trash2 size={13} /> Remove tool
          </button>
        )}
      </div>
    </div>
  );
}
