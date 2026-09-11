import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

// Everything a laser tab knows and does: the programs, the job stages
// behind them, and every change the nesting and cutting screens can
// make. Lifted out of App.jsx as one piece, so the laser can be worked
// on without opening the file that wires the whole app together.
//
// One laser per call. `deps.machine` is the profile from constants.js
// (LASER_MACHINES) with the two stage-name rules attached: which stage
// is this laser's nesting, which is its cutting. Everything here reads
// only this machine's programs and this lane's shortages, so the plate
// laser and the tube laser never see each other's work -- Laser Status,
// the counter and the Shifts report all follow from what is loaded here.
// App.jsx calls this twice, once per laser.
//
// What it borrows from the app comes in through `deps`: who is signed
// in, the jobs and people lists, and the handful of app-wide helpers a
// program change has to reach (notifications, the production queue, the
// shortage lifecycle). Nothing in here reads app state any other way.

export default function useLaserPrograms(deps) {
  const {
    fetchAllRows,
    machine,
    sendNotifications,
    roleLabel,
    currentUser,
    jobsList,
    items,
    people,
    productionQueue,
    drawingLookup,
    fetchProductionQueue,
    flashSaved,
    markShortageNested,
    shortageSummary,
    refreshShortageStatus,
    // Sets stock aside for a job's stage (job, process, item, qty);
    // the tube nester picks a real stock line, and that reserves it.
    reserveStock,
    // Puts a nesting's parts on the job as lines under the job's own
    // line for that work (job, parentLineId, parts, reference).
    addParts,
    // Which of a job's lines a given stage handles. The one rule the
    // whole app uses, so the nesting row lists exactly the lines that
    // stage is responsible for and no others.
    itemsForStage,
    // Moves stock when a cut count changes (program, delta): a positive
    // delta takes that many lengths off the shelf and raises what the
    // job has used of its reservation, a negative one puts them back.
    // Owned by the Jobs conversation in App.jsx. It handles its own
    // errors, never throws and never blocks, so a cut is never lost
    // because the stock could not be moved.
    consumeStock,
  } = deps;
  // The stage-name rules, under the names the code below has always used.
  const isPlateNestingProcess = machine.isNestingStage;
  const isProgramLaserProcess = machine.isCutStage;

  // Everything the tab needs: the programs, which jobs are on them, and
  // the job stages so "waiting to be nested" can be worked out.
  const [laserData, setLaserData] = useState(null);
  const [laserLoadFailed, setLaserLoadFailed] = useState(false);
  const [laserView, setLaserView] = useState("nesting");
  // Which program is mid-save, so its button can say so and cannot be
  // pressed twice -- marking a program cut also rewrites job stages.
  const [programBusyId, setProgramBusyId] = useState(null);

  // ---------- Laser 4kw: SigmaNest programs ----------

  // Wraps an action carried over from a Production card so the laser
  // screens re-read after it. Only when they are actually loaded, so it
  // costs nothing for anyone who never opens the tab.
  function alsoRefreshLaser(fn) {
    return async (...args) => {
      const result = await fn(...args);
      if (laserData !== null) await fetchLaserData();
      return result;
    };
  }

  // Jobs come from jobsList, which is already loaded for everyone as soon
  // as they sign in, so this only fetches what is specific to the tab.
  // Returns the rows rather than storing them, so marking a program cut
  // can work out which job stages to change from fresh data before any of
  // it reaches the screen.
  async function loadLaserRaw() {
    const [programs, links, processes, shortages, documents, allocations, quoteItems, events, shifts, itemProgress] = await Promise.all([
      fetchAllRows("laser_programs", { orderBy: "created_at", ascending: false }),
      fetchAllRows("laser_program_jobs", { orderBy: "created_at" }),
      fetchAllRows("job_processes", {
        // tracking_mode: Laser Status packs per item when the stage is set
        // to Each, the same as a Production card does.
        select:
          "id, job_id, process_name, is_complete, shortage_id, started_at, started_by, operator, assigned_to, completed_at, is_urgent, notes, tracking_mode",
      }),
      fetchAllRows("shortages", { orderBy: "created_at", ascending: false }),
      fetchAllRows("job_documents", { orderBy: "created_at", ascending: false }),
      fetchAllRows("job_allocations", { orderBy: "created_at" }),
      // qty: the packer's per-item count runs against it.
      // Every column, not a named few: parent_quote_item_id, made_on and
      // length_mm arrived with the tube laser, and naming a column that a
      // database does not have yet fails the whole load -- for the plate
      // laser too. A job has a handful of lines; the cost is nothing.
      fetchAllRows("job_quote_items", { select: "*" }),
      // Notes and stop reports live in the event log, and both screens
      // show them, so it has to come back with everything else.
      fetchAllRows("laser_program_events", { orderBy: "acted_at" }),
      // The shift cut counter on the Cutting screen needs to know when
      // the shift started. Every signed-in person may read these.
      fetchAllRows("shifts", { orderBy: "name" }),
      // How many of each item a stage has already done. Laser Status
      // needs it for a packing stage set to Each.
      fetchAllRows("job_process_item_progress", { select: "id, job_process_id, job_quote_item_id, qty_complete" }),
    ]);
    // What the tube software's section wording means, for the import.
    // Only a laser that imports reports reads it, and a database where
    // setup-tube-laser-import.sql has not run yet must not blank the tab:
    // no aliases means asking every time, which is merely slower.
    let aliases = [];
    if (machine.importsReport) {
      try {
        aliases = (await fetchAllRows("tube_section_aliases", { orderBy: "report_section" })) || [];
      } catch (err) {
        console.error("Could not load the section aliases (run setup-tube-laser-import.sql):", err);
      }
    }
    // This machine's programs only. Every row carries its machine, so the
    // plate screens never see a tube program and the other way round.
    // Filtered here, once, and everything downstream follows.
    const mine = (programs || []).filter((p) => p.machine === machine.machine);
    // And this lane's shortages. A shortage with no lane yet is from
    // before lanes existed, when everything was plate.
    const inLane = (shortages || []).filter((sh) =>
      machine.lane === "tube" ? sh.lane === "tube" : sh.lane !== "tube"
    );
    return {
      programs: mine,
      links: links || [],
      processes: processes || [],
      shortages: inLane,
      documents: documents || [],
      allocations: allocations || [],
      quoteItems: quoteItems || [],
      events: events || [],
      shifts: shifts || [],
      itemProgress: itemProgress || [],
      aliases,
    };
  }

  // A note on a program. Either side can leave one -- the operator
  // saying what he found, Prince answering it -- and every one is kept,
  // so a program carries the whole conversation rather than the last
  // thing somebody typed.
  async function addProgramNote(program, text) {
    if (!supabase || !text.trim()) return false;
    try {
      await logProgramEvent(program.id, "note", text.trim());
      await fetchLaserData();
      return true;
    } catch (err) {
      console.error("Failed to add the note:", err);
      alert("That note didn't save — check your signal and try again.");
      return false;
    }
  }

  // The operator hit something he cannot get past. The program stays on
  // his list -- he may still cut it once somebody sorts the material out
  // -- but it is marked, and the people who nest are told.
  async function reportProgram(program, { reason, offcutLength, offcutWidth, plate }) {
    if (!supabase || !reason.trim()) return false;
    setProgramBusyId(program.id);
    try {
      const { error } = await supabase
        .from("laser_programs")
        .update({
          reported_reason: reason.trim(),
          reported_offcut_length: offcutLength ? Number(offcutLength) : null,
          reported_offcut_width: offcutWidth ? Number(offcutWidth) : null,
          reported_plate: plate || null,
          reported_by: roleLabel,
          reported_at: new Date().toISOString(),
        })
        .eq("id", program.id);
      if (error) throw error;

      const offcut = offcutLength && offcutWidth ? `${offcutLength} x ${offcutWidth}` : "";
      const extra = [offcut && `offcut ${offcut}`, plate && `plate ${plate}`].filter(Boolean).join(", ");
      await logProgramEvent(program.id, "stopped", reason.trim() + (extra ? ` (${extra})` : ""));

      // Sent to whoever nests, not to Prince by name -- it still has to
      // reach somebody when he is on leave.
      const nesters = (people || []).filter(
        (pn) => pn.isAdmin || (pn.allowedProcessTypes || []).some(isPlateNestingProcess)
      );
      const firstJob = (laserData?.links || []).find((l) => l.program_id === program.id);
      const job = firstJob ? (jobsList || []).find((j) => j.id === firstJob.job_id) : null;
      if (nesters.length && job) {
        // insert() hands back an error rather than throwing one, so an
        // unchecked call fails in complete silence -- which is exactly how
        // this went out the first time.
        const { error: noteError } = await sendNotifications(
          nesters.map((pn) => ({
            job_id: job.id,
            job_number: job.job_number,
            // Required by the table, and delivered on: notifications also
            // reach a job's own sales rep, and a stopped program is
            // squarely their problem too.
            sales_rep: job.sales_rep || roleLabel,
            recipient_id: pn.id,
            message:
              `Program ${program.program_number} stopped by ${roleLabel}: ${reason.trim()}` +
              (extra ? ` — ${extra}` : ""),
          }))
        );
        // Deliberately not fatal. By this point the report is saved and
        // showing on both screens -- telling the operator it failed would
        // be a lie, and he would send it again. Only the alert is missing,
        // and that is what the message says.
        if (noteError) {
          console.error("The stop report saved, but nobody could be told:", noteError);
          alert("Reported — but the notification didn't go out. Tell whoever nests directly.");
        }
      }
      await fetchLaserData();
      setProgramBusyId(null);
      return true;
    } catch (err) {
      console.error("Failed to report the program:", err);
      alert("That report didn't save — check your signal and try again.");
      setProgramBusyId(null);
      return false;
    }
  }

  async function clearProgramReport(program) {
    if (!supabase) return;
    setProgramBusyId(program.id);
    try {
      const { error } = await supabase
        .from("laser_programs")
        .update({
          reported_reason: null,
          reported_offcut_length: null,
          reported_offcut_width: null,
          reported_plate: null,
          reported_by: null,
          reported_at: null,
        })
        .eq("id", program.id);
      if (error) throw error;
      await logProgramEvent(program.id, "report cleared", program.program_number);
      await fetchLaserData();
    } catch (err) {
      console.error("Failed to clear the report:", err);
      alert("That didn't save — check your signal and try again.");
    }
    setProgramBusyId(null);
  }

  async function fetchLaserData() {
    if (!supabase) return;
    try {
      setLaserData(await loadLaserRaw());
      setLaserLoadFailed(false);
    } catch (err) {
      console.error("Failed to load laser programs:", err);
      // Prince works off this screen. Empty means "nothing to nest", which
      // is a very different instruction from "we could not reach the
      // database" -- and he would act on the first one.
      setLaserLoadFailed(true);
      setLaserData({
        programs: [],
        links: [],
        processes: [],
        shortages: [],
        documents: [],
        allocations: [],
        quoteItems: [],
        events: [],
        shifts: [],
      });
    }
  }

  // Shapes the raw rows into what the screen needs. Cancelled programs
  // drop out here rather than being deleted, so one that was already cut
  // still exists in the history.
  function laserNestingData() {
    const d = laserData || {
      programs: [],
      links: [],
      processes: [],
      shortages: [],
      documents: [],
      allocations: [],
      quoteItems: [],
    };
    const jobs = jobsList || [];
    const activeJobs = jobs.filter((j) => j.status === "in_progress");
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    const linksByProgram = {};
    for (const l of d.links) {
      if (!linksByProgram[l.program_id]) linksByProgram[l.program_id] = [];
      linksByProgram[l.program_id].push({
        ...l,
        job_number: jobById.get(l.job_id)?.job_number || "",
        is_recut: !!l.shortage_id,
      });
    }

    const programs = d.programs
      .filter((p) => !p.is_cancelled)
      .map((p) => ({ ...p, jobs: linksByProgram[p.id] || [] }));

    // Each entry carries the link that put this job on that program, so the
    // row can take it off again. A copy per job rather than the shared
    // program object: the same program carries several jobs, each with its
    // own link.
    const programsByJob = {};
    for (const p of programs) {
      for (const l of p.jobs) {
        (programsByJob[l.job_id] ||= []).push({ ...p, link: l });
      }
    }

    const shortagesOnAProgram = new Set(
      programs.flatMap((p) => (p.jobs || []).map((l) => l.shortage_id)).filter(Boolean)
    );

    // A job is waiting to be nested while its own nesting stage is still
    // open. Matched on the name the way shortages are routed, so a shop
    // calling it "Nesting" or "Plate Nesting" both work. Catch-up stages
    // belonging to a shortage are skipped -- the shortage itself is the
    // row, further down.
    const rows = [];
    for (const job of activeJobs) {
      const process = d.processes.find(
        (pr) =>
          pr.job_id === job.id &&
          !pr.shortage_id &&
          isPlateNestingProcess(pr.process_name) &&
          !pr.is_complete
      );
      if (!process) continue;
      rows.push({
        key: "job:" + job.id,
        kind: "job",
        // Urgent is the shop saying this one jumps the queue, so it earns
        // the same outline a re-cut gets. Saying which of the reasons it
        // is matters: "nest now" without a why is just a red box.
        nestNow: !!process.is_urgent,
        nestNowReason: process.is_urgent ? "Marked urgent" : "",
        job,
        process,
        onPrograms: programsByJob[job.id] || [],
        // The lines this nesting stage handles, and how many of each have
        // been nested so far. Only used by a laser that nests part by
        // part; the plate laser never reads them.
        quoteItems:
          typeof itemsForStage === "function"
            ? itemsForStage(process.process_name, (d.quoteItems || []).filter((it) => it.job_id === job.id))
            : [],
        itemProgress: (d.itemProgress || []).filter((ip) => ip.job_process_id === process.id),
        documents: d.documents.filter((doc) => doc.job_id === job.id && doc.process_name === process.process_name),
        allocations: d.allocations.filter((a) => a.process_id === process.id && a.status !== "released"),
        drawings: (d.quoteItems || [])
          .filter((it) => it.job_id === job.id)
          .map((it) => {
            const linked = it.linked_item_id ? (items || []).find((i) => i.id === it.linked_item_id) : null;
            const drawing = linked?.partNumber ? drawingLookup[linked.partNumber.trim()] : null;
            return drawing ? { description: it.description, partNumber: linked.partNumber, drawing } : null;
          })
          .filter(Boolean),
      });
    }

    // A re-cut is its own row rather than something to search for. It is
    // always nest-now: it exists because somebody is short of parts.
    //
    // It belongs here until it is actually on a program, not merely until
    // somebody says it is nested. The Shortage nested button on the
    // nesting department screen predates programs and sets the status
    // without putting the shortage on anything -- so a re-cut marked that
    // way left this list while going onto nothing, and became invisible to
    // the one person who could act on it. One on live sat like that for
    // days, showing as "on its way" with nothing on its way.
    for (const sh of d.shortages) {
      if (sh.status === "cut" || sh.status === "finishing") continue;
      if (shortagesOnAProgram.has(sh.id)) continue;
      const job = jobById.get(sh.job_id);
      rows.push({
        key: "short:" + sh.id,
        kind: "shortage",
        nestNow: true,
        nestNowReason:
          sh.status === "nested"
            ? "Marked nested, but not on any program"
            : "Short of parts — someone is waiting",
        job: job || { id: sh.job_id, job_number: sh.job_number, customer: sh.customer },
        process: null,
        shortage: sh,
        detail: shortageSummary(sh),
        onPrograms: [],
      });
    }

    // A program the operator has stopped at the machine comes back here,
    // to the top of the list, as the thing to deal with. It used to show
    // only as a chip on the programs list further down, which is not
    // where whoever nests is looking, so a stopped program sat unseen
    // until the operator came to ask.
    for (const p of programs) {
      if (p.is_complete || !p.reported_at) continue;
      const firstJob = p.jobs[0] ? jobById.get(p.jobs[0].job_id) : null;
      rows.push({
        key: "stopped:" + p.id,
        kind: "stopped",
        nestNow: true,
        nestNowReason: "Stopped at the machine",
        job: firstJob || null,
        process: null,
        program: p,
        onPrograms: [p],
      });
    }

    // Stopped programs first, then anything nest-now, then by when it is
    // due.
    const urgency = (r) => (r.kind === "stopped" ? 0 : r.nestNow ? 1 : 2);
    rows.sort((a, b) => {
      if (urgency(a) !== urgency(b)) return urgency(a) - urgency(b);
      return new Date(a.job?.due_date || "2999-01-01") - new Date(b.job?.due_date || "2999-01-01");
    });

    // What Prince can put on a program: the jobs themselves, and any
    // shortage still waiting to be re-cut. Both go through the same
    // picker, because on the floor they are the same decision -- a
    // re-cut gets nested in with everything else of that material.
    const candidates = [];
    for (const job of activeJobs) {
      candidates.push({
        key: "job:" + job.id,
        kind: "job",
        job_id: job.id,
        shortage_id: null,
        job_number: job.job_number || "",
        sigmanest: job.laser_job_reference || "",
        customer: job.customer || "",
        detail: "",
      });
    }
    const onAProgram = new Set(d.links.filter((l) => l.shortage_id).map((l) => l.shortage_id));
    for (const sh of d.shortages) {
      if (sh.status === "cut" || onAProgram.has(sh.id)) continue;
      candidates.push({
        key: "short:" + sh.id,
        kind: "shortage",
        job_id: sh.job_id,
        shortage_id: sh.id,
        job_number: sh.job_number || "",
        sigmanest: sh.board_number || "",
        customer: sh.customer || "",
        detail: "re-cut: " + shortageSummary(sh),
      });
    }

    // Each row carries the picker entry it corresponds to, so pressing
    // Nest it opens the builder with that item already on the program.
    const byKey = new Map(candidates.map((c) => [c.key, c]));
    for (const r of rows) r.candidate = byKey.get(r.key) || null;

    // What Prince has finished nesting. Kept rather than cleared, so the
    // screen answers "what did I nest, and when" as well as "what is
    // left". Every job, not just the active ones -- a job finished last
    // month was still nested, and that is the whole point of a history.
    // A job counts as nested only when nothing of it is still waiting.
    // Some jobs carry the nesting stage twice, and finding one completed
    // copy listed a job as finished while its other copy was still on the
    // To nest list -- the same job in both places, saying two things.
    const stillToNest = new Set(rows.filter((r) => r.kind === "job").map((r) => r.job.id));

    const nestedRows = [];
    for (const job of jobs) {
      if (stillToNest.has(job.id)) continue;
      const process = d.processes.find(
        (pr) =>
          pr.job_id === job.id &&
          !pr.shortage_id &&
          isPlateNestingProcess(pr.process_name) &&
          pr.is_complete
      );
      if (!process) continue;
      const onPrograms = programsByJob[job.id] || [];
      nestedRows.push({
        key: "nested:" + job.id,
        kind: "nested",
        job,
        process,
        onPrograms,
        cutCount: onPrograms.filter((pg) => pg.is_complete).length,
      });
    }
    nestedRows.sort(
      (a, b) => new Date(b.process.completed_at || 0) - new Date(a.process.completed_at || 0)
    );

    return { rows, nestedRows, programs, candidates };
  }


  // The history is worth having but never worth blocking a change for: a
  // missing line in the log beats a program that would not save.
  // Every notification goes through here.
  //
  // Three of them were failing silently in production: assignment,
  // shortage flagged, and shortage resolved. All three left out a column
  // the table requires, and because a Supabase write hands back an error
  // rather than throwing one, nothing anywhere said so. Staff were simply
  // never told.
  //
  // So there is now one door. It fills in what the table needs and reads
  // the result. A notification that cannot be sent is never fatal -- the
  // thing it was telling you about has already happened -- but it is no
  // longer invisible.

  async function logProgramEvent(programId, action, detail) {
    try {
      const { error } = await supabase.from("laser_program_events").insert({
        program_id: programId,
        action,
        detail: detail || "",
        acted_by: roleLabel,
        acted_by_id: currentUser?.id || null,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Failed to record program history:", err);
    }
  }

  // The next number for a laser that numbers its own programs. One row
  // per machine in laser_program_counters, bumped in the database so two
  // nesters pressing Create together cannot be handed the same number.
  // A number is used the moment it is handed out: if the program then
  // fails to save, that number is skipped, which is fine -- gaps are
  // harmless, duplicates are not.
  async function nextProgramNumber() {
    const { data, error } = await supabase.rpc("next_laser_program_number", {
      p_machine: machine.machine,
      p_prefix: machine.numberPrefix || "",
    });
    if (error) throw error;
    if (!data) throw new Error("The database handed back no program number.");
    return data;
  }

  // `reserve` ({ item, qty }) sets that many of a stock line aside for the
  // first job on the program, against its nesting stage -- the tube
  // laser's way: picking the section is picking the stock. Not fatal if
  // it cannot: the program is real either way, and Pull from stock is
  // still there.
  async function reserveForProgram(jobs, reserve) {
    if (!reserve || !reserve.item || !(Number(reserve.qty) > 0) || typeof reserveStock !== "function") return;
    const first = (jobs || [])[0];
    const job = first ? (jobsList || []).find((j) => j.id === first.job_id) : null;
    const stage = first
      ? (laserData?.processes || []).find(
          (pr) => pr.job_id === first.job_id && !pr.shortage_id && isPlateNestingProcess(pr.process_name)
        )
      : null;
    if (!job || !stage) {
      console.warn("No nesting stage to set the stock aside against; nothing reserved.");
      return;
    }
    const ok = await reserveStock(job, stage, reserve.item, Number(reserve.qty));
    if (!ok) alert("The program was made, but the stock could not be set aside for it. Use Pull from stock on the job.");
  }

  // The parts on the program, put on the first job as lines under its
  // parent line. `parentId` null makes the parent from the reference.
  async function partsOntoJob(jobs, parts, parentId, reference) {
    if (!(parts || []).length || typeof addParts !== "function") return;
    const first = (jobs || [])[0];
    const job = first ? (jobsList || []).find((j) => j.id === first.job_id) : null;
    if (!job) return;
    await addParts(job, parentId || null, parts, reference);
  }

  async function createLaserProgram({
    program_number,
    nesting_name,
    material,
    sheet_name,
    sheets_required,
    cut_minutes,
    jobs,
    reserve,
    // The parts cut on this program ({ name, qty, length }), and which
    // job line they sit under. Only a laser whose programs know their
    // parts sends these; a plate program sends nothing and the columns
    // are left alone.
    parts,
    parent_line_id,
  }) {
    if (!supabase) return false;
    try {
      // A typed number is the nester's; a generated one comes from the
      // database and is shown on the program the moment it exists, so the
      // nest can be saved under it in the machine's software.
      const number = machine.numbering === "generated" ? await nextProgramNumber() : program_number;
      const { data, error } = await supabase
        .from("laser_programs")
        .insert({
          program_number: number,
          // Only a laser that names its nests writes the column, so the
          // plate laser keeps working on a database where
          // setup-tube-laser.sql has not been run yet.
          ...(machine.numbering === "generated" ? { nesting_name: (nesting_name || "").trim() } : {}),
          ...(Array.isArray(parts) && parts.length
            ? { parts, part_count: parts.reduce((n, p) => n + (Number(p.qty) || 0), 0) }
            : {}),
          material,
          machine: machine.machine,
          sheet_name: sheet_name || null,
          // The same nest run several times off the same material. One
          // unless somebody says otherwise, so nothing changes for the
          // programs that are cut once and done.
          sheets_required: Math.max(1, Math.round(Number(sheets_required) || 1)),
          // Planned cutting time per sheet, off SigmaNest. Blank stays
          // null: "not given" must not read as "takes no time".
          cut_minutes: minutesOrNull(cut_minutes),
          // Which stock line the lengths were set aside from, so cutting
          // one can take one off that line. The material alone cannot
          // say: "50x50x3 MS" is the 6m line and the 13m line both.
          //
          // Written only when a section was actually picked off the
          // shelf, the same way nesting_name and parts are, so a laser
          // that picks no stock -- and a database where the column has
          // not been added yet -- carries on as before.
          ...(reserve?.item?.id ? { stock_item_id: reserve.item.id } : {}),
          created_by: roleLabel,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (jobs.length) {
        const { error: linkError } = await supabase.from("laser_program_jobs").insert(
          jobs.map((j) => ({
            program_id: data.id,
            job_id: j.job_id,
            shortage_id: j.shortage_id || null,
            sigmanest_number: j.sigmanest_number,
            created_by: roleLabel,
          }))
        );
        if (linkError) throw linkError;
      }
      await logProgramEvent(data.id, "created", material + " - " + jobs.length + " job(s)");
      // Putting a re-cut on a program is what nests it, so the catch-up
      // stages get built here rather than needing a second button.
      for (const j of jobs.filter((x) => x.shortage_id)) {
        const sh = (laserData?.shortages || []).find((x) => x.id === j.shortage_id);
        if (sh && sh.status === "flagged") await markShortageNested(sh);
      }
      await reserveForProgram(jobs, reserve);
      await partsOntoJob(jobs, parts, parent_line_id, nesting_name);
      await fetchLaserData();
      // Truthy for the screens that only ask "did it work"; the number
      // for the import, which shows what was handed out.
      return { id: data.id, program_number: number };
    } catch (err) {
      console.error("Failed to create laser program:", err);
      alert(
        err?.code === "23505"
          ? "Program " + program_number + " already exists and has not been cancelled. Use a different number, or cancel the old one first."
          : "That didn't save — check your connection and try again."
      );
      return false;
    }
  }

  // The tube software's spreadsheet export, turned into programs: one per
  // section in the file, each with the next number, the section's tube
  // count as its lengths, and the nests written into its notes for the
  // operator. The file name is the job's reference and is the nesting
  // name on every program made from it.
  //
  // Each section's wording is remembered against the list entry chosen
  // for it, so the next import of that section asks nothing.
  //
  // Returns the programs made, or false. Stops at the first failure and
  // says how far it got: the programs already made are real and on the
  // cut list, and must not be made twice.
  async function importNestingReport({ nesting_name, sections, jobs, parent_line_id }) {
    if (!supabase) return false;
    const made = [];
    for (const s of sections) {
      const result = await createLaserProgram({
        nesting_name,
        material: s.material,
        sheets_required: s.lengths,
        jobs,
        reserve: s.item ? { item: s.item, qty: s.lengths } : null,
        parts: s.parts || [],
        parent_line_id,
      });
      if (!result) {
        if (made.length) {
          alert(
            `Stopped after ${made.length} of ${sections.length}: ` +
              made.map((m) => m.program_number).join(", ") +
              " were made and are on the cut list. The rest were not — import again with only those sections."
          );
        }
        return false;
      }
      made.push({ ...result, material: s.material, lengths: s.lengths });
      if (s.note) await logProgramEvent(result.id, "note", s.note);
      if (s.reportSection && s.material) {
        const { error } = await supabase
          .from("tube_section_aliases")
          .upsert(
            { report_section: s.reportSection, section_name: s.material, updated_by: roleLabel, updated_at: new Date().toISOString() },
            { onConflict: "report_section" }
          );
        // Not fatal: the program exists; the memory is a convenience.
        if (error) console.error("Could not remember the section alias:", error);
      }
    }
    await fetchLaserData();
    return made;
  }

  async function updateLaserProgram(program, fields) {
    try {
      const { error } = await supabase.from("laser_programs").update(fields).eq("id", program.id);
      if (error) throw error;
      const what = Object.entries(fields).map(([k, v]) => k + " -> " + v).join(", ");
      await logProgramEvent(program.id, "edited", what);
      flashSaved("program-" + program.id);
      await fetchLaserData();
    } catch (err) {
      console.error("Failed to update laser program:", err);
      alert(err?.code === "23505" ? "Another live program already has that number." : "That didn't save — check your connection and try again.");
      await fetchLaserData();
    }
  }

  // "Delete" on the screen, cancelled underneath: the program stays on
  // record with its history and the reason given, so "who deleted 8821
  // and why" stays answerable. The nesting screen asks for the reason.
  async function cancelLaserProgram(program, reason) {
    if (!supabase || !(reason || "").trim()) return false;
    try {
      const { error } = await supabase
        .from("laser_programs")
        .update({ is_cancelled: true, cancelled_by: roleLabel, cancelled_at: new Date().toISOString() })
        .eq("id", program.id);
      if (error) throw error;
      await logProgramEvent(program.id, "cancelled", `${program.program_number} — ${reason.trim()}`);
      await fetchLaserData();
      return true;
    } catch (err) {
      console.error("Failed to cancel laser program:", err);
      alert("That didn't save — check your connection and try again.");
      return false;
    }
  }

  async function addJobToLaserProgram(program, candidate) {
    try {
      const { error } = await supabase.from("laser_program_jobs").insert({
        program_id: program.id,
        job_id: candidate.job_id,
        shortage_id: candidate.shortage_id || null,
        sigmanest_number: candidate.sigmanest || "",
        created_by: roleLabel,
      });
      if (error) throw error;
      await logProgramEvent(
        program.id,
        "job added",
        candidate.job_number + (candidate.detail ? " (" + candidate.detail + ")" : "")
      );
      if (candidate.shortage_id) {
        const sh = (laserData?.shortages || []).find((x) => x.id === candidate.shortage_id);
        if (sh && sh.status === "flagged") await markShortageNested(sh);
      }
      await fetchLaserData();
    } catch (err) {
      console.error("Failed to add job to laser program:", err);
      alert(
        err?.code === "23505" ? candidate.job_number + " is already on this program." : "That didn't save — check your connection and try again."
      );
    }
  }

  async function removeJobFromLaserProgram(program, link) {
    try {
      const { error } = await supabase.from("laser_program_jobs").delete().eq("id", link.id);
      if (error) throw error;
      await logProgramEvent(program.id, "job removed", link.job_number || link.sigmanest_number);
      await fetchLaserData();
    } catch (err) {
      console.error("Failed to remove job from laser program:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  // A job's laser stage is finished when its nesting has been ticked off
  // AND every program carrying it has been cut. One program cut does not
  // finish a job that is also sitting on another, and un-ticking a program
  // by mistake puts the affected jobs back.
  //
  // A job with no programs at all never completes here. That is a job
  // handled outside the app -- already cut before this existed, or sent
  // out -- and its laser stage is ticked by hand the way it is today.
  //
  // On the tube laser the cutting stage is also where the operator packs,
  // so cutting never closes it: he ticks it packed on the Packing screen.
  async function syncLaserStagesFor(jobIds, d) {
    if (machine.cutStageIsPacking) return 0;
    const live = d.programs.filter((p) => !p.is_cancelled);
    const changes = [];
    for (const jobId of new Set(jobIds)) {
      // filter, not find: a job carrying the same stage twice (which the
      // process-type check script reports) would otherwise have only one of
      // them completed and stall on the other.
      const laserStages = d.processes.filter(
        (pr) => pr.job_id === jobId && !pr.shortage_id && isProgramLaserProcess(pr.process_name)
      );
      if (laserStages.length === 0) continue;
      const nesting = d.processes.find(
        (pr) => pr.job_id === jobId && !pr.shortage_id && isPlateNestingProcess(pr.process_name)
      );
      const mine = live.filter((pg) =>
        d.links.some((l) => l.program_id === pg.id && l.job_id === jobId)
      );
      const done = !!nesting?.is_complete && mine.length > 0 && mine.every((pg) => pg.is_complete);
      for (const laser of laserStages) {
        if (done !== !!laser.is_complete) changes.push({ id: laser.id, done });
      }
    }
    for (const c of changes) {
      const { error } = await supabase
        .from("job_processes")
        .update({
          is_complete: c.done,
          completed_by: c.done ? roleLabel : null,
          completed_at: c.done ? new Date().toISOString() : null,
        })
        .eq("id", c.id);
      if (error) throw error;
    }
    return changes.length;
  }

  // A re-cut is off the laser when the program carrying it is cut. Its
  // catch-up nesting and laser stages close with it; the stages after
  // those are real work and stay for the floor.
  //
  // markShortageCut also tells whoever raised it, which is the whole
  // point -- they have been waiting. Un-cutting a program by mistake
  // puts the re-cut back to nested without sending anything.
  async function syncShortagesForProgram(program, nowCut, d) {
    const ids = d.links.filter((l) => l.program_id === program.id && l.shortage_id).map((l) => l.shortage_id);
    for (const id of new Set(ids)) {
      const sh = d.shortages.find((x) => x.id === id);
      if (!sh) continue;
      // The re-cut's own nesting and cutting stages close with the cut.
      // Not the cutting stage on the tube laser: that is its packing, and
      // the re-cut is ticked packed on the Packing screen like a job.
      const catchUp = d.processes.filter(
        (pr) =>
          pr.shortage_id === id &&
          (isPlateNestingProcess(pr.process_name) ||
            (!machine.cutStageIsPacking && isProgramLaserProcess(pr.process_name)))
      );
      for (const stage of catchUp) {
        if (!!stage.is_complete === nowCut) continue;
        const { error } = await supabase
          .from("job_processes")
          .update({
            is_complete: nowCut,
            completed_by: nowCut ? roleLabel : null,
            completed_at: nowCut ? new Date().toISOString() : null,
          })
          .eq("id", stage.id);
        if (error) throw error;
      }
      if (nowCut) {
        await refreshShortageStatus(sh, { offTheLaser: true });
      } else if (sh.status === "cut" || sh.status === "finishing") {
        // Un-cutting the program puts the parts back on the machine, so
        // the shortage is waiting to be cut again.
        const { error } = await supabase
          .from("shortages")
          .update({ status: "nested", cut_by: "", cut_at: "" })
          .eq("id", sh.id);
        if (error) throw error;
      }
    }
  }

  // How many sheets of a program have been cut. Everything else about a
  // program being finished hangs off this: it is complete when the count
  // reaches what was asked for, and a program needing one sheet behaves
  // exactly as it always did -- one press takes it from 0 to 1, which is
  // 1 of 1, which is cut.
  //
  // The count cannot go below nothing or above what was asked for. An
  // operator who has cut a sixth of five has either mis-pressed or been
  // told to cut more, and the second of those is Prince changing the
  // number rather than the count quietly disagreeing with it.
  async function setProgramCutCount(program, nextCount) {
    if (!supabase || programBusyId) return false;
    // Told to the cutting screen, which asks for the actual time once the
    // last sheet is marked cut and must not ask if the save failed.
    let ok = false;
    const required = Math.max(1, Number(program.sheets_required) || 1);
    const before = Math.max(0, Number(program.sheets_cut) || 0);
    const cut = Math.min(Math.max(0, Math.round(Number(nextCount) || 0)), required);
    if (cut === before) return;
    const nowCut = cut >= required;
    setProgramBusyId(program.id);
    try {
      const { error } = await supabase
        .from("laser_programs")
        .update({
          sheets_cut: cut,
          is_complete: nowCut,
          completed_by: nowCut ? roleLabel : "",
          completed_at: nowCut ? new Date().toISOString() : null,
        })
        .eq("id", program.id);
      if (error) throw error;
      await logProgramEvent(
        program.id,
        nowCut ? "cut" : cut > before ? "sheet cut" : "un-cut",
        required > 1
          ? `${program.program_number} — ${cut} of ${required}`
          : program.program_number
      );

      // Cutting a length uses one off the rack; taking a cut back puts
      // it there again. Only on a laser whose material is picked off
      // real stock -- the plate laser sets nothing aside and is left
      // alone. The change, not the new total: the count can be typed
      // straight in or undone, so it moves by more than one and both
      // ways.
      //
      // Deliberately after the count is saved and outside anything that
      // could undo it. The cut is the fact; the stock following it is a
      // consequence, and a rack that cannot be moved must never tell
      // the operator his cut failed.
      if (machine.materialFrom === "sections" && typeof consumeStock === "function") {
        await consumeStock({ ...program, sheets_cut: cut }, cut - before);
      }

      // Re-read before deciding anything: someone else may have cut the
      // other program this job is waiting on while this one was open.
      const fresh = await loadLaserRaw();
      const jobIds = fresh.links.filter((l) => l.program_id === program.id).map((l) => l.job_id);
      const changed = await syncLaserStagesFor(jobIds, fresh);
      await syncShortagesForProgram(program, nowCut, fresh);
      setLaserData(await loadLaserRaw());
      if (productionQueue !== null) fetchProductionQueue();
      void changed;
      ok = true;
    } catch (err) {
      console.error("Failed to mark program cut:", err);
      alert("That didn't save — check your connection and try again.");
      await fetchLaserData();
    } finally {
      setProgramBusyId(null);
    }
    return ok;
  }

  // Cut, or not cut, in one press -- what the button did before there was
  // a count, and still what it does for a program cut once.
  function toggleProgramCut(program) {
    const required = Math.max(1, Number(program.sheets_required) || 1);
    return setProgramCutCount(program, program.is_complete ? 0 : required);
  }

  // A number of minutes typed into a box, or null for anything that is
  // not one. Blank is null on purpose: "not given" is not "no time".
  function minutesOrNull(v) {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
  }

  // What the operator says the program really took. Information only:
  // the planned figure whoever nested typed in is never touched by this,
  // and nothing is worked out from it yet.
  async function setProgramActualMinutes(program, minutes) {
    if (!supabase) return false;
    const actual = minutesOrNull(minutes);
    try {
      const { error } = await supabase.from("laser_programs").update({ actual_minutes: actual }).eq("id", program.id);
      if (error) throw error;
      await logProgramEvent(
        program.id,
        "time",
        actual === null ? `${program.program_number} — time cleared` : `${program.program_number} — ${actual} min`
      );
      await fetchLaserData();
      return true;
    } catch (err) {
      console.error("Failed to save cutting time:", err);
      alert("That didn't save — check your connection and try again.");
      return false;
    }
  }

  // Pressed when there are no more programs coming for that job. Without
  // it the app cannot tell a job with parts still to nest apart from one
  // that is finished, so the laser stage would complete too early.
  //
  // It goes both ways. The button is the only thing that moves a job off
  // Prince's list, so pressing it by mistake used to mean going into the
  // job itself to put it back. Un-doing here re-opens the laser stage
  // too, through the same sync that closed it.
  async function setJobNestingDone(job, process, done = true) {
    try {
      const { error } = await supabase
        .from("job_processes")
        .update({
          is_complete: done,
          completed_by: done ? roleLabel : null,
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq("id", process.id);
      if (error) throw error;
      flashSaved("nesting-" + process.id);
      // Nesting was the only thing missing on a job whose programs are
      // already cut, so its laser stage may finish at the same moment.
      const fresh = await loadLaserRaw();
      const changed = await syncLaserStagesFor([job.id], fresh);
      setLaserData(changed > 0 ? await loadLaserRaw() : fresh);
      if (productionQueue !== null) fetchProductionQueue();
    } catch (err) {
      console.error("Failed to change the nesting stage:", err);
      alert("That didn't save — check your connection and try again.");
    }
  }

  return {
    machine,
    laserData,
    setLaserData,
    laserLoadFailed,
    laserView,
    setLaserView,
    programBusyId,
    // Laser Status's packing buttons share the busy marker, so the
    // setter goes back to the app too.
    setProgramBusyId,
    alsoRefreshLaser,
    loadLaserRaw,
    fetchLaserData,
    laserNestingData,
    addProgramNote,
    reportProgram,
    clearProgramReport,
    logProgramEvent,
    createLaserProgram,
    importNestingReport,
    updateLaserProgram,
    cancelLaserProgram,
    addJobToLaserProgram,
    removeJobFromLaserProgram,
    syncLaserStagesFor,
    syncShortagesForProgram,
    setProgramCutCount,
    toggleProgramCut,
    setProgramActualMinutes,
    setJobNestingDone,
  };
}
