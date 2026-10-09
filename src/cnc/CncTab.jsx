// The CNC tab (lathe programs from STEP models; brief in
// docs/CNC-MODULE-PLAN.md). App.jsx draws it inside a crash net and hands
// it only what it cannot read for itself: the customer list, the CNC Bar
// Grades, the person's ticks and name. Everything else is in src/cnc.
//
// Screens: the Programs list, the Shapes list (Heinrich, 8 Oct 2026: a
// shape to type sizes, beside Programs), New program (from a STEP or a
// shape), one program. The engine's shape and pipe lists are read once per
// page load (cncData loadEngineList). The list loads
// when the tab opens, after a save and on its own Refresh, never on a
// timer; a program's settings, text and STEP file load when it is opened.

import { useEffect, useState } from "react";
import { FileSpreadsheet, Plus, RefreshCw, X } from "lucide-react";
import ErrorBoundary from "../ErrorBoundary.jsx";
import TypeToFind from "../TypeToFind.jsx";
import { C, F, S } from "../theme.js";
import { exportPrograms, loadBarPrices, loadEngineList, loadPrograms } from "./cncData.js";
import { filterChoices, listPrograms, oNumber, salesRepOf } from "./cncRules.js";
import NewProgram from "./NewProgram.jsx";
import ProgramView from "./ProgramView.jsx";
import ShapeIcon from "./ShapeIcon.jsx";
import MaterialsList from "./MaterialsList.jsx";
import CuttingDataScreen from "./CuttingDataScreen.jsx";
import MachinesScreen from "./MachinesScreen.jsx";
import ToolsScreen from "./ToolsScreen.jsx";
import { loadMachines } from "./cncTables.js";

// S.chipActive sets borderColor, which React will not mix with S.chip's
// border shorthand once a chip switches on; the whole border is given.
const { borderColor: _unused, ...chipActiveRest } = S.chipActive;
const CHIP_ON = { ...chipActiveRest, border: `1px solid ${C.accentFinished}` };

export default function CncTab({ customers, materials, canEdit, canDelete, canSeeValue, isAdmin, onSaveMaterialPrice, onAddMaterial, userName }) {
  const [programs, setPrograms] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  // The Customer and Sales rep filters ("" = every one).
  const [customer, setCustomer] = useState("");
  const [rep, setRep] = useState("");
  // Whether the database keeps a quote reference and project name
  // (setup-cnc-12-program-refs.sql).
  const [hasRefs, setHasRefs] = useState(false);
  // "list", "shapes", "new", or a program's id
  const [screen, setScreen] = useState("list");
  // The shape New program was opened with (from the Shapes list), or null.
  const [newShape, setNewShape] = useState(null);
  // The engine's lists: undefined while asked, null when the engine has none.
  const [shapes, setShapes] = useState(undefined);
  const [pipes, setPipes] = useState(undefined);
  // Each bar size's price (cnc_bar_prices), read once when the tab opens
  // and handed back by every save.
  const [barPrices, setBarPrices] = useState([]);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const { rows, hasRefs: refs } = await loadPrograms();
      setPrograms(rows);
      setHasRefs(refs);
    } catch (err) {
      setLoadError(`The programs could not be loaded: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (programs === null) refresh();
    loadEngineList("shapes").then(setShapes);
    loadEngineList("pipes").then(setPipes);
    loadBarPrices().then(setBarPrices);
  }, []);

  const subTabs = (
    <div style={{ display: "flex", gap: 6 }}>
      {[
        ["list", "Programs"],
        ["shapes", "Shapes"],
        ["materials", "Materials"],
        ["tools", "Tools"],
        ["cutting", "Cutting data"],
        ["machines", "Machines"],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          className="stk-btn"
          style={{ ...S.chip, ...(screen === key ? CHIP_ON : {}) }}
          onClick={() => {
            if (key === "list") refresh();
            setScreen(key);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (screen === "cutting") {
    return (
      <div style={S.list}>
        {subTabs}
        <ErrorBoundary box what="the Cutting data">
          <MachineHost render={(machine) => <CuttingDataScreen machine={machine} isAdmin={isAdmin} userName={userName} />} />
        </ErrorBoundary>
      </div>
    );
  }

  if (screen === "tools") {
    return (
      <div style={S.list}>
        {subTabs}
        <ErrorBoundary box what="the Tools">
          <MachineHost
            render={(machine, setMachine) => <ToolsScreen machine={machine} isAdmin={isAdmin} userName={userName} onMachine={setMachine} />}
          />
        </ErrorBoundary>
      </div>
    );
  }

  if (screen === "machines") {
    return (
      <div style={S.list}>
        {subTabs}
        <ErrorBoundary box what="the Machines">
          <MachinesScreen isAdmin={isAdmin} userName={userName} />
        </ErrorBoundary>
      </div>
    );
  }

  if (screen === "materials") {
    return (
      <div style={S.list}>
        {subTabs}
        <ErrorBoundary box what="the Materials list">
          <MaterialsList
            materials={materials}
            barPrices={barPrices}
            pipes={pipes || null}
            canEdit={canEdit}
            canSeeValue={canSeeValue}
            userName={userName}
            onSavePrice={onSaveMaterialPrice}
            onAdd={onAddMaterial}
            onBarPrices={setBarPrices}
          />
        </ErrorBoundary>
      </div>
    );
  }

  if (screen === "shapes") {
    return (
      <div style={S.list}>
        {subTabs}
        {shapes === undefined && <div style={S.empty}>Asking the engine for its shapes…</div>}
        {shapes === null && (
          <div style={S.empty}>The engine does not offer shapes yet. They come with its next update; try again after that.</div>
        )}
        {shapes && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {shapes.map((s) => (
              <button
                key={s.key}
                type="button"
                className="stk-btn"
                disabled={!canEdit}
                title={canEdit ? `New program from a ${s.name}` : "Making a program needs the CNC Edit tick"}
                onClick={() => {
                  setNewShape(s);
                  setScreen("new");
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 8px",
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.text,
                  cursor: canEdit ? "pointer" : "default",
                  fontSize: 14,
                }}
              >
                <ShapeIcon picture={s.picture} size={72} />
                <span style={{ fontWeight: 600, textAlign: "center" }}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (screen === "new") {
    return (
      <ErrorBoundary box what="the New program form">
        <NewProgram
          customers={customers}
          materials={materials}
          pipes={pipes || null}
          shape={newShape}
          hasRefs={hasRefs}
          userName={userName}
          onCancel={() => {
            // A Generate that failed part way may have saved the program
            // without its revision; the list has to show it.
            refresh();
            setScreen(newShape ? "shapes" : "list");
          }}
          onSaved={(id) => {
            refresh();
            setScreen(id);
          }}
        />
      </ErrorBoundary>
    );
  }
  if (screen !== "list") {
    return (
      <ErrorBoundary key={screen} box what="the program">
        <ProgramView
          id={screen}
          canEdit={canEdit}
          canDelete={canDelete}
          customers={customers}
          materials={materials}
          pipes={pipes || null}
          shapes={shapes || null}
          canSeeValue={canSeeValue}
          isAdmin={isAdmin}
          barPrices={barPrices}
          onBarPrices={setBarPrices}
          userName={userName}
          onBack={() => {
            refresh();
            setScreen("list");
          }}
          onDeleted={() => {
            refresh();
            setScreen("list");
          }}
        />
      </ErrorBoundary>
    );
  }

  const shown = listPrograms(programs, { search, customer, rep });
  const searching = !!search.trim() || !!customer || !!rep;
  const choices = filterChoices(programs);

  // The programs the search shows (all of them with nothing typed).
  async function exportShown() {
    setExporting(true);
    setLoadError("");
    try {
      await exportPrograms(shown, searching ? "CNC-programs-search" : "CNC-programs");
    } catch (err) {
      setLoadError(`The Excel file could not be made: ${err.message || err}`);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div style={S.list}>
      {subTabs}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          style={{ ...S.input, flex: 1 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={hasRefs ? "Search part, customer, O number, quote ref, project…" : "Search part, customer, O number…"}
        />
        {canEdit && (
          <button type="button" className="stk-btn" style={S.addBtn} onClick={() => {
              setNewShape(null);
              setScreen("new");
            }}>
            <Plus size={15} strokeWidth={2.5} /> New program
          </button>
        )}
        <button
          type="button"
          className="stk-btn"
          style={S.chip}
          onClick={exportShown}
          disabled={exporting || !programs?.length}
          title={searching ? "The programs this search shows, as an Excel file" : "Every program, as an Excel file"}
        >
          <FileSpreadsheet size={14} /> {exporting ? "…" : "Excel"}
        </button>
        <button type="button" className="stk-btn" style={S.chip} onClick={refresh} disabled={loading} title="Load the programs again">
          <RefreshCw size={13} />
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <TypeToFind options={choices.customers} value={customer} onChange={(v) => setCustomer(v || "")} placeholder="Customer: all" />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <TypeToFind options={choices.reps} value={rep} onChange={(v) => setRep(v || "")} placeholder="Sales rep: all" />
        </div>
        {searching && (
          <button
            type="button"
            className="stk-btn"
            style={S.chip}
            onClick={() => {
              setSearch("");
              setCustomer("");
              setRep("");
            }}
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>
      {loadError && <div style={{ color: C.danger, fontSize: 14 }}>{loadError}</div>}
      {programs === null && !loadError && <div style={S.empty}>Loading programs…</div>}
      {programs !== null && (
        <>
          <div style={{ fontSize: 13, color: C.muted }}>
            {searching ? `${shown.length} of ${programs.length} programs` : `${programs.length} program${programs.length === 1 ? "" : "s"}`}
          </div>
          <div>
            {shown.map((p) => renderLine(p, () => setScreen(p.id)))}
            {shown.length === 0 && <div style={S.empty}>{programs.length ? "No program matches." : "No programs yet."}</div>}
          </div>
        </>
      )}
    </div>
  );
}

// One line per program: O number · part · customer · project · quote
// reference · material and bar · rev · sales rep, and on a program that is
// not for the machine, "Not for machine" and its fault in red.
function renderLine(p, open) {
  const bits = [
    p.part_name,
    p.customer,
    p.project_name,
    p.quote_ref && `quote ${p.quote_ref}`,
    [p.material, p.stock].filter(Boolean).join(" "),
    p.current_rev ? `rev ${p.current_rev}` : "no revision",
    salesRepOf(p),
  ];
  return (
    <button
      key={p.id}
      type="button"
      className="stk-btn"
      onClick={open}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${C.border}`,
        padding: "10px 4px",
        color: C.text,
        fontSize: 14.5,
        cursor: "pointer",
      }}
    >
      <span style={{ fontFamily: F.mono }}>{oNumber(p.program_no)}</span>
      {" · "}
      {bits.filter(Boolean).join(" · ")}
      {p.status !== "ready" && <span style={{ color: C.danger }}>{" · Not for machine"}{p.fault && p.fault !== "Not for machine" ? `: ${p.fault}` : ""}</span>}
    </button>
  );
}

// Cutting data and tools are held per machine: the machines are read when
// the screen opens, and with more than one a button per machine picks
// whose. render(machine, setMachine) draws the screen; setMachine takes a
// machine saved by it (the default turret is part of the machine).
function MachineHost({ render }) {
  const [machines, setMachines] = useState(null);
  const [pick, setPick] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    loadMachines()
      .then((list) => {
        setMachines(list);
        setPick(list[0]?.id || null);
      })
      .catch((err) => setError(`The machines could not be loaded: ${err.message || err}`));
  }, []);
  if (error) return <div style={{ color: C.danger, fontSize: 14 }}>{error}</div>;
  if (!machines) return <div style={S.empty}>Loading…</div>;
  if (!machines.length) return <div style={S.empty}>No machine yet: the CNC database files are not all on this database.</div>;
  const machine = machines.find((m) => m.id === pick) || machines[0];
  return (
    <>
      {machines.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {machines.map((m) => (
            <button key={m.id} type="button" className="stk-btn" style={{ ...S.chip, ...(m.id === machine.id ? CHIP_ON : {}) }} onClick={() => setPick(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
      )}
      {render(machine, (saved) => setMachines((list) => list.map((m) => (m.id === saved.id ? saved : m))))}
    </>
  );
}
