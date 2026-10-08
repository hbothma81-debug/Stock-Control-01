// The CNC tab (lathe programs from STEP models; brief in
// docs/CNC-MODULE-PLAN.md). App.jsx draws it inside a crash net and hands
// it only what it cannot read for itself: the customer list, the CNC Bar
// Grades, the person's ticks and name. Everything else is in src/cnc.
//
// Screens: the Programs list, New program, one program. The list loads
// when the tab opens, after a save and on its own Refresh, never on a
// timer; a program's settings, text and STEP file load when it is opened.

import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import Section from "../Section.jsx";
import ErrorBoundary from "../ErrorBoundary.jsx";
import { C, F, S } from "../theme.js";
import { loadPrograms } from "./cncData.js";
import { oNumber, splitPrograms } from "./cncRules.js";
import NewProgram from "./NewProgram.jsx";
import ProgramView from "./ProgramView.jsx";

export default function CncTab({ customers, materials, canEdit, canDelete, userName }) {
  const [programs, setPrograms] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  // "list", "new", or a program's id
  const [screen, setScreen] = useState("list");

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
  }, []);

  if (screen === "new") {
    return (
      <ErrorBoundary box what="the New program form">
        <NewProgram
          customers={customers}
          materials={materials}
          userName={userName}
          onCancel={() => {
            // A Generate that failed part way may have saved the program
            // without its revision; the list has to show it.
            refresh();
            setScreen("list");
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
  return (
    <div style={S.list}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          style={{ ...S.input, flex: 1 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search part, customer, O number…"
        />
        {canEdit && (
          <button type="button" className="stk-btn" style={S.addBtn} onClick={() => setScreen("new")}>
            <Plus size={15} strokeWidth={2.5} /> New program
          </button>
        )}
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
