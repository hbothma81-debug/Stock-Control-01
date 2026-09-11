import { C, S } from "../theme.js";
import NestingView from "./NestingView.jsx";
import CutList from "./CutList.jsx";
import ShiftReport from "./ShiftReport.jsx";
import ShortageCentre from "./ShortageCentre.jsx";
import LaserStatus from "./LaserStatus.jsx";

// A laser tab: the switch between Nesting, Cutting, Shortages, Shifts
// (and Packing, on a laser that packs on its own tab) and the screen
// behind whichever is chosen. Rendered once per laser -- Laser 4kw and
// Tube Laser -- with `machine` saying which (LASER_MACHINES in
// constants.js, with the stage rules attached by App.jsx) and `laser`
// being what useLaserPrograms returned for it. The rest is what the
// screens still reach back into the app for.
//
// Who sees what: someone who may nest (or an admin) gets the switch and
// every screen. Someone who may only cut lands on Cutting with no switch
// -- that is by design, the operator's screen is the cut list and nothing
// else. The one exception is a laser whose operator also packs: he gets
// Cutting and Packing, and only those two.

// The material picker's list for a laser that picks a section rather
// than a thickness: the section names under Structural Steel, once each,
// in the order every other list in the app uses.
function sectionNames(master) {
  const names = [...new Set((master?.sections || []).map((s) => (s.name || "").trim()).filter(Boolean))];
  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export default function LaserTab({
  laser,
  machine,
  isAdmin,
  profile,
  jobsList,
  master,
  shortageSummary,
  SavedCheck,
  ExpandableProcessNotes,
  saveJobSigmaNestNumber,
  toggleProcessUrgent,
  saveProcessNote,
  uploadJobDocument,
  openShortageFlagModal,
  setPullStockModal,
  viewJobDocument,
  openDrawingPreview,
  // Only on a laser that packs on its own tab: everything the Packing
  // screen needs, built by App.jsx from this laser's data.
  packing,
  // For a laser whose section picker is real stock: the stock rows, and
  // the requisition form for a section with nothing on the shelf.
  items,
  canRequisition,
  openRequisition,
  // Only on a laser that nests part by part: the per-item control, and
  // where a logged quantity goes. See machine.nestPerItem.
  ItemProgress,
  onLogNestedItem,
}) {
  const {
    laserData,
    laserLoadFailed,
    laserView,
    setLaserView,
    programBusyId,
    alsoRefreshLaser,
    laserNestingData,
    addProgramNote,
    reportProgram,
    clearProgramReport,
    createLaserProgram,
    importNestingReport,
    updateLaserProgram,
    cancelLaserProgram,
    addJobToLaserProgram,
    removeJobFromLaserProgram,
    setProgramCutCount,
    toggleProgramCut,
    setProgramActualMinutes,
    setJobNestingDone,
  } = laser;

  const hasPacking = !!machine.hasPacking && !!packing;

  return (
        laserData === null || jobsList === null ? (
          <div style={S.empty}>Loading programs…</div>
        ) : laserLoadFailed ? (
          // Empty means "nothing to nest", which is a very different
          // instruction from "we could not reach the database" -- and
          // Prince would act on the first one.
          <div style={{ ...S.empty, color: C.danger }}>
            Couldn't load the programs — check your signal and press Refresh. Do not read this as nothing to
            nest.
          </div>
        ) : (
          (() => {
            const { rows, nestedRows, programs, candidates } = laserNestingData();
            const canNest = isAdmin || !!profile?.allowedProcessTypes?.some(machine.isNestingStage);
            const canCut = isAdmin || !!profile?.allowedProcessTypes?.some(machine.isCutStage);
            // Someone who only nests, or only cuts, still lands on their own
            // screen; Shortages is there for everyone, so the switch always
            // has at least two things on it now.
            const view =
              laserView === "packing" && !hasPacking
                ? "cutting"
                : laserView === "shortages" || laserView === "shifts" || laserView === "packing"
                ? !canNest && laserView !== "packing"
                  ? "cutting"
                  : laserView
                : !canNest
                ? laserView === "nesting"
                  ? "cutting"
                  : laserView
                : !canCut
                ? laserView === "cutting"
                  ? "nesting"
                  : laserView
                : laserView;
            // The operator's switch: none at all, unless his laser is one
            // he packs on, when it is Cutting and Packing and nothing else.
            const segments = canNest
              ? [
                  { key: "nesting", label: "Nesting" },
                  ...(canCut ? [{ key: "cutting", label: "Cutting" }] : []),
                  { key: "shortages", label: "Shortages" },
                  { key: "shifts", label: "Shifts" },
                  ...(hasPacking ? [{ key: "packing", label: "Packing" }] : []),
                ]
              : hasPacking && canCut
              ? [
                  { key: "cutting", label: "Cutting" },
                  { key: "packing", label: "Packing" },
                ]
              : [];
            return (
              <>
                {segments.length > 0 && (
                  <div style={{ ...S.segRow, marginBottom: 10 }}>
                    {segments.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        className="stk-btn"
                        onClick={() => setLaserView(v.key)}
                        style={{
                          ...S.segBtn,
                          ...(view === v.key
                            ? { background: C.accentTint, color: C.accentRaw, border: `1px solid ${C.accentRaw}` }
                            : {}),
                        }}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                )}
                {view === "nesting" ? (
                  <NestingView
                    machine={machine}
                    rows={rows}
                    nestedRows={nestedRows}
                    programs={programs}
                    candidates={candidates}
                    thicknesses={master.laserThicknesses || []}
                    grades={(master.grades || []).map((g) => g.shortName || g.name)}
                    sheetNames={master.sheetNames || []}
                    sections={sectionNames(master)}
                    stockItems={items || []}
                    allocations={laserData ? laserData.allocations || [] : []}
                    jobLines={laserData ? laserData.quoteItems || [] : []}
                    canRequisition={!!canRequisition}
                    onRequisition={openRequisition}
                    aliases={laserData ? laserData.aliases || [] : []}
                    canManage={canNest}
                    onClearReport={clearProgramReport}
                    onCreateProgram={createLaserProgram}
                    onImportReport={machine.importsReport ? importNestingReport : null}
                    onCancelProgram={cancelLaserProgram}
                    onAddJobToProgram={addJobToLaserProgram}
                    onRemoveJobFromProgram={removeJobFromLaserProgram}
                    onSetNestingDone={setJobNestingDone}
                    ItemProgress={machine.nestPerItem ? ItemProgress : null}
                    onLogNestedItem={onLogNestedItem}
                    onUpdateProgram={updateLaserProgram}
                    SavedCheck={SavedCheck}
                    Notes={ExpandableProcessNotes}
                    actions={{
                      onSaveSigmaNest: alsoRefreshLaser(saveJobSigmaNestNumber),
                      onToggleUrgent: alsoRefreshLaser(toggleProcessUrgent),
                      onSaveNote: alsoRefreshLaser(saveProcessNote),
                      onUploadDocument: alsoRefreshLaser(uploadJobDocument),
                      // These two open a modal; their own submit refreshes.
                      onFlagShortage: openShortageFlagModal,
                      onPullStock: (job, process) => setPullStockModal({ job, process, dept: null, search: "" }),
                      onViewDocument: viewJobDocument,
                      onViewDrawing: (d) => openDrawingPreview(d.drawing),
                    }}
                  />
                ) : view === "cutting" ? (
                  <CutList
                    machine={machine}
                    programs={programs}
                    // Grouped in the shop's thickness order on the plate
                    // laser; a tube program's section has no such order,
                    // so those group by name.
                    thicknesses={machine.materialFrom === "thicknesses" ? master.laserThicknesses || [] : []}
                    events={laserData ? laserData.events : []}
                    shifts={laserData ? laserData.shifts : []}
                    myShiftId={profile?.shiftId || null}
                    canCut={canCut}
                    onToggleCut={toggleProgramCut}
                    onSetCutCount={setProgramCutCount}
                    onSetActualMinutes={setProgramActualMinutes}
                    onReport={reportProgram}
                    onAddNote={addProgramNote}
                    busyId={programBusyId}
                  />
                ) : view === "shifts" ? (
                  <ShiftReport machine={machine} programs={programs} shifts={laserData ? laserData.shifts : []} />
                ) : view === "packing" ? (
                  <LaserStatus
                    rows={packing.rows}
                    canPack={packing.canPack}
                    canTake={packing.canTake}
                    words={machine}
                    meName={packing.meName}
                    onTakeJob={packing.onTakeJob}
                    onFinishPacking={packing.onFinishPacking}
                    onFlagShortage={packing.onFlagShortage}
                    onLogItem={packing.onLogItem}
                    ItemProgress={packing.ItemProgress}
                    isAdmin={packing.isAdmin}
                    busyId={programBusyId}
                  />
                ) : (
                  <ShortageCentre
                    shortages={
                      laserData
                        ? laserData.shortages.map((sh) => ({
                            ...sh,
                            waitingOn: laserData.processes
                              .filter((pr) => pr.shortage_id === sh.id && !pr.is_complete)
                              .map((pr) => pr.process_name),
                          }))
                        : null
                    }
                    summarise={shortageSummary}
                    onGoToNesting={canNest ? () => setLaserView("nesting") : null}
                  />
                )}
              </>
            );
          })()
        )
  );
}
