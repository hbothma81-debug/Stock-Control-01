import { C, S } from "../theme.js";
import { LASER_MACHINE } from "../constants.js";
import NestingView from "./NestingView.jsx";
import CutList from "./CutList.jsx";
import ShiftReport from "./ShiftReport.jsx";
import ShortageCentre from "./ShortageCentre.jsx";

// The Laser 4kw tab: the switch between Nesting, Cutting, Shortages and
// Shifts, and the screen behind whichever is chosen. Lifted out of
// App.jsx exactly as it was; `laser` is what useLaserPrograms returns,
// and the rest is what the screens still reach back into the app for.

export default function LaserTab({
  laser,
  isAdmin,
  profile,
  jobsList,
  master,
  isPlateNestingProcess,
  isProgramLaserProcess,
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
    updateLaserProgram,
    cancelLaserProgram,
    addJobToLaserProgram,
    removeJobFromLaserProgram,
    setProgramCutCount,
    toggleProgramCut,
    setProgramActualMinutes,
    setJobNestingDone,
  } = laser;

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
            const canNest = isAdmin || !!profile?.allowedProcessTypes?.some(isPlateNestingProcess);
            const canCut = isAdmin || !!profile?.allowedProcessTypes?.some(isProgramLaserProcess);
            // Someone who only nests, or only cuts, still lands on their own
            // screen; Shortages is there for everyone, so the switch always
            // has at least two things on it now.
            const view =
              laserView === "shortages" || laserView === "shifts"
                ? laserView
                : !canNest
                ? laserView === "nesting"
                  ? "cutting"
                  : laserView
                : !canCut
                ? laserView === "cutting"
                  ? "nesting"
                  : laserView
                : laserView;
            return (
              <>
                {canNest && (
                  <div style={{ ...S.segRow, marginBottom: 10 }}>
                    {[
                      { key: "nesting", label: "Nesting" },
                      ...(canCut ? [{ key: "cutting", label: "Cutting" }] : []),
                      { key: "shortages", label: "Shortages" },
                      { key: "shifts", label: "Shifts" },
                    ].map((v) => (
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
                    machine={LASER_MACHINE}
                    rows={rows}
                    nestedRows={nestedRows}
                    programs={programs}
                    candidates={candidates}
                    thicknesses={master.laserThicknesses || []}
                    grades={(master.grades || []).map((g) => g.shortName || g.name)}
                    sheetNames={master.sheetNames || []}
                    canManage={canNest}
                    onClearReport={clearProgramReport}
                    onCreateProgram={createLaserProgram}
                    onCancelProgram={cancelLaserProgram}
                    onAddJobToProgram={addJobToLaserProgram}
                    onRemoveJobFromProgram={removeJobFromLaserProgram}
                    onSetNestingDone={setJobNestingDone}
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
                    programs={programs}
                    thicknesses={master.laserThicknesses || []}
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
                  <ShiftReport programs={programs} shifts={laserData ? laserData.shifts : []} />
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
