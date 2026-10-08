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
import { FileSpreadsheet, Plus, RefreshCw } from "lucide-react";
import Section from "../Section.jsx";
import ErrorBoundary from "../ErrorBoundary.jsx";
import { C, F, S } from "../theme.js";
import { exportPrograms, loadEngineList, loadPrograms } from "./cncData.js";
import { oNumber, splitPrograms } from "./cncRules.js";
import NewProgram from "./NewProgram.jsx";
import ProgramView from "./ProgramView.jsx";
import ShapeIcon from "./ShapeIcon.jsx";
import MaterialsList from "./MaterialsList.jsx";

// S.chipActive sets borderColor, which React will not mix with S.chip's
// border shorthand once a chip switches on; the whole border is given.
const { borderColor: _unused, ...chipActiveRest } = S.chipActive;
const CHIP_ON = { ...chipActiveRest, border: `1px solid ${C.accentFinished}` };

export default function CncTab({ customers, materials, canEdit, canDelete, canSeeValue, onSaveMaterialPrice, onAddMaterial, userName }) {
  const [programs, setPrograms] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  // "list", "shapes", "new", or a program's id
  const [screen, setScreen] = useState("list");
  // The shape New program was opened with (from the Shapes list), or null.
  const [newShape, setNewShape] = useState(null);
  // The engine's lists: undefined while asked, null when the engine has none.
  const [shapes, setShapes] = useState(undefined);
  const [pipes, setPipes] = useState(undefined);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      setPrograms(await loadPrograms());
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
  }, []);

  const subTabs = (
    <div style={{ display: "flex", gap: 6 }}>
      {[
        ["list", "Programs"],
        ["shapes", "Shapes"],
        ["materials", "Materials"],
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

  if (screen === "materials") {
    return (
      <div style={S.list}>
        {subTabs}
        <ErrorBoundary box what="the Materials list">
          <MaterialsList materials={materials} canEdit={canEdit} canSeeValue={canSeeValue} onSavePrice={onSaveMaterialPrice} onAdd={onAddMaterial} />
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
          onSaveMaterialPrice={onSaveMaterialPrice}
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

  const { notForMachine, ready } = splitPrograms(programs, search);
  const searching = !!search.trim();

  // The programs the search shows (all of them with nothing typed).
  async function exportShown() {
    setExporting(true);
    setLoadError("");
    try {
      await exportPrograms([...notForMachine, ...ready], searching ? "CNC-programs-search" : "CNC-programs");
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
          placeholder="Search part, customer, O number…"
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
      {loadError && <div style={{ color: C.danger, fontSize: 14 }}>{loadError}</div>}
      {programs === null && !loadError && <div style={S.empty}>Loading programs…</div>}
      {programs !== null && (
        <>
          {/* A key change remounts the pills so a search opens both. */}
          <Section key={`nfm-${searching}`} title="Not for machine" count={notForMachine.length} danger={notForMachine.length > 0} defaultOpen>
            {notForMachine.map((p) => renderLine(p, () => setScreen(p.id)))}
            {notForMachine.length === 0 && <div style={S.empty}>Nothing here.</div>}
          </Section>
          <Section key={`ready-${searching}`} title="Ready" count={ready.length} defaultOpen={searching}>
            {ready.map((p) => renderLine(p, () => setScreen(p.id)))}
            {ready.length === 0 && <div style={S.empty}>Nothing here.</div>}
          </Section>
        </>
      )}
    </div>
  );
}

// One line per program: O number · part · customer · material and bar ·
// rev, and on a program that is not for the machine, its fault in red.
function renderLine(p, open) {
  const bits = [p.part_name, p.customer, [p.material, p.stock].filter(Boolean).join(" "), p.current_rev ? `rev ${p.current_rev}` : "no revision"];
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
      {p.status !== "ready" && p.fault && <span style={{ color: C.danger }}>{" · "}{p.fault}</span>}
    </button>
  );
}
