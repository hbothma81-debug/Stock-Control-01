// Force complete, and the warning when Invoicing is closed with other
// stages still open. Tested in forceComplete.test.js.
//
// Heinrich, 21 Sep 2026, for JOB-0055: its own stages were all ticked and
// Invoicing with them, but a re-cut's Welding and Grinding/Polishing never
// were, so the job sat on Active with every chip green and accounts never
// saw it. "Need a force complete button ... this will mark all other stages
// complete. When we select invoice anywhere it should give a warning and
// then be able to proceed."
//
// One thing behind both: every open stage on the job, re-cut runs included,
// is closed in one go, and the job then completes by the rule it always had
// (every stage ticked, settleFinishedJobs in App.jsx). His answers:
//   - admins and sales people may do it (Gawie and Mark are sales); who did
//     it is written in the job's History;
//   - a stage is closed even while the laser still has work for the job
//     ("someone could have found the lost parts"): the warning says so and
//     the program stays on the laser's screens;
//   - the button sits on the job page's Overview, under Status.
// A forced stage reads "<name> (forced)" in completed_by, so nobody takes it
// for the welder's own tick.
//
// The same file holds the whole-job urgent button's rule, asked with it:
// "mark the whole job as urgent instead of stage by stage".

export function mayForceComplete({ isAdmin, isSalesPerson } = {}) {
  return !!isAdmin || !!isSalesPerson;
}

export function forcedBy(name) {
  return `${name || "Someone"} (forced)`;
}

// "Welding (re-cut)": a re-cut's run carries the same stage names as the
// job's own, and the Jobs list row does not show it at all.
export function stageLabel(stage) {
  return `${stage?.process_name || "Stage"}${stage?.shortage_id ? " (re-cut)" : ""}`;
}

// The stages a force would close, in the order handed in. `except` is the
// stage being ticked anyway (Invoicing, when the warning comes from its tick).
export function openStages(stages, except = null) {
  return (stages || []).filter((p) => !p.is_complete && p.id !== except?.id);
}

// The words of the warning. `uncutPrograms` are program numbers still to be
// cut for this job; `reserved` are lines such as "Flat bar: 3 still reserved".
export function forceWarningText({ jobNumber, open, actor, withInvoicing = false, uncutPrograms = [], reserved = [] }) {
  const n = open.length;
  const parts = [
    `${jobNumber || "This job"} still has ${n} stage${n === 1 ? "" : "s"} open:\n\n` +
      open.map((p) => `  • ${stageLabel(p)}`).join("\n"),
    `Carrying on marks ${n === 1 ? "it" : "them"} complete as "${forcedBy(actor)}"` +
      (withInvoicing ? ", sends the invoice request and ticks Invoicing" : "") +
      `. It is written in the job's History, and the job moves to To invoice.`,
  ];
  if (uncutPrograms.length > 0) {
    parts.push(
      `The laser still has program ${uncutPrograms.join(", ")} to cut for this job. ` +
        `It stays on the laser's screens until it is cut or the job is taken off it on the Nesting screen.`
    );
  }
  if (reserved.length > 0) {
    parts.push(
      `Material is still set aside for ${n === 1 ? "this stage" : "these stages"} and stays reserved until it is released:\n` +
        reserved.map((r) => `  • ${r}`).join("\n")
    );
  }
  parts.push(n === 1 ? "Mark it complete?" : "Mark them all complete?");
  return parts.join("\n\n");
}

// What somebody who may not force is told when they close Invoicing with
// stages open. The tick is refused: Invoicing ticked with a stage open is
// exactly how JOB-0055 got stuck.
export function forceRefusedText({ jobNumber, open, salesRep }) {
  return (
    `${jobNumber || "This job"} still has stages open:\n\n` +
    open.map((p) => `  • ${stageLabel(p)}`).join("\n") +
    `\n\nInvoicing is not ticked. Finish ${open.length === 1 ? "that stage" : "those stages"} first, or ask ` +
    `${salesRep ? `${salesRep} or an admin` : "the job's sales person or an admin"} to close the job with the invoice.`
  );
}

// One line for the job's History and the notice to the sales rep.
export function forceHistoryText(closed) {
  return `Closed by force: ${(closed || []).map(stageLabel).join(", ")}`;
}

// The whole-job urgent button. Urgent lives on each stage
// (job_processes.is_urgent), which is what the Production cards and the Jobs
// list read, so the button sets every open stage at once and no screen
// changes. `on` is what a press should set: urgent unless every open stage
// already is. Null when nothing is open: a finished job has no button.
export function wholeJobUrgent(stages) {
  const open = openStages(stages);
  if (open.length === 0) return null;
  const allUrgent = open.every((p) => p.is_urgent);
  return {
    on: !allUrgent,
    label: allUrgent ? "Unmark whole job urgent" : "Mark whole job urgent",
    ids: open.filter((p) => !!p.is_urgent === allUrgent).map((p) => p.id),
    urgentCount: open.filter((p) => p.is_urgent).length,
    openCount: open.length,
  };
}
