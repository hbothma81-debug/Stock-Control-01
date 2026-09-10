# Laser 4kw: how it works, and how to build the same for the tube laser

Written 2026-09-10 by the Laser production conversation as a handover. The
first half is everything built for the plate laser, as it stands live. The
second half is what a tube laser version has to decide, and the cheapest
way to get there. A new conversation should read this whole file, then the
memory notes it names, then plan and ask before building anything.

## The people and the words

- **Prince** nests. He makes programs in SigmaNest and types them into the
  app. He works the Nesting screen.
- **The operator** (Thabo Roy nights, jabu mahlangu days) cuts. He works
  the Cutting screen and nothing else, by design.
- **A program** is one SigmaNest nest: a program number the operator loads
  at the machine, a material such as "3mm MS", a sheet name, and the jobs
  whose parts are on it. Several jobs share one sheet. Programs are the
  unit of everything on the plate laser.
- **A re-cut** is a shortage put back on a program. It rides on programs
  like any other work.
- **Sheets** are repeats: a program cut three times off the same material
  has sheets_required 3, and the operator ticks them off one at a time.

## Where the code lives

All of it is in `src/laser/` and `src/lib/`. App.jsx keeps five names only
(`laserData`, `setLaserData`, `programBusyId`, `setProgramBusyId`,
`fetchLaserData`) because Laser Status under Production and a few job
changes use them.

| File | Lines | What it is |
| --- | --- | --- |
| `src/laser/useLaserPrograms.js` | 865 | The state and every function: load programs, create, edit, delete, add and remove jobs, mark sheets cut, stop reports, notes, the actual-time save, and the sync that closes a job's laser stage when nesting is ticked and every program carrying it is cut. Takes what it borrows from the app through one `deps` object. |
| `src/laser/LaserTab.jsx` | 183 | The tab: the Nesting / Cutting / Shortages / Shifts switch and the screen behind it. Which screens a person sees depends on what they may do (below). |
| `src/laser/NestingView.jsx` | 1477 | Prince's screen. To nest (jobs with an open nesting stage, re-cuts, and stopped programs at the top), Nested, Programs waiting to be cut, and Already cut when searched. Two ways to make a program: from a job's row, or from a sheet ("New program"). Edit-in-place on a program: number, material, sheet, minutes per sheet. Delete with a reason. |
| `src/laser/CutList.jsx` | 715 | The operator's screen. Cards side by side, grouped by material in the shop's thickness order. Mark cut / Cut one / Undo one, Stop / Report, Notes, the "how long did it take" popup, the shift counter at the top, and the shut sections Stopped and Already cut. |
| `src/laser/ShiftReport.jsx` | 167 | The Shifts screen: per day going back two weeks, one row per laser shift with programs, sheets, planned minutes, efficiency, the operator's minutes, operator names, and the program numbers. |
| `src/laser/ShortageCentre.jsx` | 133 | The Shortages screen. Owned by the shortage work, not part of this. |
| `src/laser/LaserStatus.jsx` | 331 | Under Production, not on the tab: a job appears once its first program is cut and leaves once its laser parts are packed. Stayed in App.jsx's care on purpose. |
| `src/lib/cuttingTime.js` | 47 | Sums: planned minutes (per sheet times sheets), outstanding minutes, minute formatting, and which shifts the laser counts against. |
| `src/lib/shiftWindow.js` | 100 | When a shift starts and ends on a given day, which shift is on the clock, which one ended most recently. Owned by the Planning conversation; mirrors the database function `shift_day_window`. Read it fresh before touching it. |
| `src/lib/*.test.js` | 240 | 30 checks on the two files above. `npm test` runs them in a second. |

## The database

Run in the Supabase SQL editor, practice first, then live. All are safe to
run twice. `CHECK-which-setup-files-are-run.sql` says which have been run
on a given database.

| File | Adds |
| --- | --- |
| `setup-laser-programs.sql` | Tables `laser_programs` (number, material, `machine` defaulting to "Laser 4kw", sheet name, is_complete, completed_by/at, is_cancelled, cancelled_by/at, reported_* for stop reports), `laser_program_jobs` (which jobs are on which program, with the SigmaNest number as typed and an optional shortage id for a re-cut), `laser_program_events` (append-only history: created, edited, cut, sheet cut, un-cut, stopped, note, time, cancelled with reason). |
| `setup-program-repeats.sql` | `sheets_required`, `sheets_cut` on programs. |
| `setup-laser-cutting-time.sql` | `cut_minutes` (planned, per sheet, typed by Prince from SigmaNest) and `actual_minutes` (the operator's, for the record only) on programs. |
| `setup-shift-laser-flag.sql` | `cuts_laser` on `shifts`: the tick under Time Manager saying the laser cuts on this shift. |
| `setup-laser-status.sql` | `worked_in_laser_status` on process types, `started_at/by` on job stages. |

Note the `machine` column on programs already exists and defaults to
"Laser 4kw". Nothing filters by it yet: every screen reads every program.

## Who may do what

There is no laser permission as such. Everything keys off the process
types a person is allowed under Stock Manager, User Management, plus the
admin flag. The two rules sit near the top of App.jsx:

- **Can nest:** admin, or an allowed stage with "nest" in the name that is
  not the tube laser. Sees Nesting, Cutting, Shortages, Shifts. Can make,
  edit and delete programs, and press Sorted on a stopped one.
- **Can cut:** admin, or an allowed stage with "laser" in the name that is
  not "Tube Laser" and not "Laser - External". Sees Cutting only, with no
  switch to the other screens. That is by design and must stay so.

## The rules the screens follow

- A program counts for the shift its **last sheet** was marked cut in.
  Taking it back to "not cut" clears its finished time and it drops off.
- **Planned time** is minutes per sheet times sheets required. Blank means
  "not given", never zero, and every total that leaves something out says
  how many were left out.
- **Efficiency** on the Shifts screen is planned cutting minutes divided by
  the length of the shift, or the time gone so far while the shift is on.
  The operator's own time never changes it.
- **The operator's time** is asked for in a popup the moment the last
  sheet is marked cut. Skippable for now; Heinrich said it will be
  enforced later. Add time / Change time on a cut card does the same.
- **The counter on Cutting** counts against whichever ticked laser shift
  is on the clock. Between shifts it shows the shift that just ended,
  labelled so, until the next starts. It also adds up what is still on
  the list in minutes, so whoever plans nights can see if there is enough.
- **Which shifts:** only those ticked "the laser cuts on this shift" under
  Time Manager. With nothing ticked, every shift, and both screens say so.
  The lockout ignores the tick.
- **A stop report** takes the program off the operator's list into a shut
  "Stopped" section, sends a notification to everyone who can nest, and
  puts a red row at the top of Prince's To nest with the reason and the
  offcut or plate the operator suggested. The row opens to the program
  itself so its number, material, sheet or minutes can be changed. Sorted
  puts it back on the cut list.
- **Delete** asks why and keeps the program on record as cancelled, with
  the reason in its history. Nothing is ever really deleted.
- **A job's laser stage** closes by itself when nesting is ticked and every
  program carrying it is cut, and reopens if a program is un-cut.
- **Two lanes.** The plate laser (Nesting, Laser) and the tube laser (Tube
  Laser Nesting, Tube Laser) never wait for each other; everything after
  them waits for both. `isTubeLaserProcess` in App.jsx is that rule.

## What the tube laser has today

Not a copy of any of this. "Tube Laser Nesting" is an ordinary stage on the
Production tab (`setup-tube-laser-nesting.sql`). A tube nest belongs to one
job, has a name rather than a program number (`job_processes.nesting_name`),
and is tracked by quantity like any other stage, whole-job or per item. Tube
parts are packed under the Tube Laser stage, not on Laser Status. Job items
carry a made-on tag with "tube_laser" as one of the choices, so a stage that
cuts tube takes only the lines tagged for it.

## Building the same for the tube laser

Heinrich wants the tube laser on its own tab, out of Production, working
the way the plate laser does. What has to be decided first, in order:

1. **Is a tube nest a program?** The plate system's unit is the program:
   one nest, several jobs, a number the operator loads. If tube nests are
   also one-per-machine-load with a number, the plate system fits as it
   is. If a tube nest really is one job, one name, then "a program" on the
   tube tab is a nest carrying one job, and the "several jobs per program"
   parts of the screens are simply unused. Either way the tables can carry
   it: `laser_programs.machine` = "Tube Laser". Ask Heinrich how the tube
   operator actually receives work from the tube nester.
2. **What is a sheet?** Sheets are repeats. For tube the repeat is
   probably bars or lengths. Same column, different word on screen.
3. **Cutting time per what?** Minutes per sheet becomes minutes per bar or
   per nest. Same column, different label. Efficiency follows.
4. **Which shifts.** `cuts_laser` is one tick for one machine. The tube
   laser needs its own tick: either a second column `cuts_tube_laser`, or
   replace the tick with a machine list on the shift. A second column is
   the smaller change and keeps the Planning conversation's work intact.
   Announce it to them either way.
5. **Who may do what.** The plate rules exclude "tube" by name. The tube
   tab needs the mirror image: can nest tube = an allowed stage with
   "tube" and "nest"; can cut tube = "tube" and "laser". `isTubeLaserProcess`
   already exists and is the right starting point.
6. **The stage sync.** The plate hook closes a job's "Laser" stage when its
   programs are cut. The tube version closes "Tube Laser". Same code, a
   different stage-name rule passed in.

The cheapest route, and the one to propose first: **make the plate code
take a machine rather than copying it.** `LaserTab` and `NestingView`
already take a `machine` prop. The hook would take the machine too, filter
programs by it, and take the two stage-name rules and the shift tick
column as inputs. One new tab "Tube Laser" in `src/constants.js` renders
the same `LaserTab` with the tube settings. Screens then differ only in
labels ("sheet" against "bar"), which can be a small word table passed in.
The plate laser would be regression-tested by Heinrich simply using it.

A full copy of the six files is the other route. It is a day of work, it
doubles every future fix, and it is only right if tube turns out to work
so differently that the screens diverge. Do not start there.

Things that will bite:

- Laser Status reads every program and assumes plate. If tube programs go
  into the same table, Laser Status must filter by machine or it will show
  tube jobs as "cut, all programs" the moment a tube nest is cut.
- The counter and Shifts screen read every program too. Filter by machine
  in the hook, once, and everything downstream follows.
- The made-on tag decides which items a cutting stage takes. A tube nest
  should offer only tube-tagged lines; the plate side ignores tags today
  because a sheet takes whatever Prince puts on it.
- The unique index on program numbers is per live program, not per
  machine. If tube and plate numbers can collide, the index needs the
  machine in it. Announce that as a database change.
- The Nesting screen's "To nest" list is built from jobs with an open
  plate nesting stage. The tube list is jobs with an open tube nesting
  stage. That is the stage-name rule again, passed in.

## Memory notes to read alongside this

`laser-4kw-system`, `laser-cutter-only-view-is-by-design`, `shift-lockout`,
`made-on-tag-plan`, `app-jsx-split-progress`, `app-jsx-traps`,
`feedback-plan-then-ask-then-build`, `stock-control-practice-database`.
