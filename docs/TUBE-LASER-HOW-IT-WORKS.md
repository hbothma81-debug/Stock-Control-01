# Tube Laser: how it works

Built 2026-09-10 by the Tube Laser production conversation, from the
plan in `LASER-4KW-HOW-IT-WORKS.md` (second half) and Heinrich's answers
to it. Read that file first: the tube laser is the plate laser's screens
told which machine they are on, and everything there about programs,
stop reports, delete-with-reason, the counter and the Shifts report holds
here too. This file is only what differs.

## The decisions Heinrich made

Asked and answered on 2026-09-10, with the tube nesting report for the
COFFEE TABLE job as the example of what the operator receives.

- **A tube program is one nest, several jobs, one section.** The report
  showed parts for two jobs on one nesting. One section per program is
  an instruction to sales; the New program form says "do not mix
  sections". Programs are the unit, exactly as on plate.
- **The app hands out the program number.** The tube software has no
  numbers of its own, so when a program is made the app gives it the
  next number: a plain five-digit number, 00001, 00002 ... (the first
  few on practice carry a TL- prefix from before Heinrich asked for
  numbers only). The nester types that number into the tube software
  when he exports the section's cut file. The program also carries a
  **nesting name**, the job's reference, and both show everywhere:
  `00007 · COFFEE TABLE`.
- **Programs come from the software's spreadsheet, not typed.** The
  tube software exports a job breakdown (.xlsx, "simple" or "detailed";
  both carry the Nesting List sheet, which is all the app reads). The
  Import nesting report button on the tube Nesting screen reads it and
  makes one program per section: the section's tube count is the
  lengths, the file name is the nesting name, the nests are written into
  the program's notes for the operator ("Nest 1 × 8 tubes, Nest 2 × 1
  tube ..."). The nester picks the job(s) and, the first time a section
  wording appears, which Structural Steel entry it means; that answer
  is remembered in `tube_section_aliases`. The numbers handed out are
  shown at the end, to type into the software. New program by hand
  stays for the odd nest. Parser: `src/laser/nestingReport.js`, tested
  against the MARCH and BOOTH DOORS exports.
- **Material is the section**, picked off the Structural Steel list
  under Stock Manager. No thickness, no grade, no sheet name.
- **The repeat is a length.** A program is cut off N lengths of section
  (the report's "Tube Count"); the operator ticks them off one at a
  time, as sheets on plate.
- **No cutting time.** The tube software gives none (the report's
  machining time is blank), so nothing asks for minutes, there is no
  time popup on the last length, and the Shifts report has no
  efficiency column. The counter shows programs and lengths cut this
  shift, and lengths still on the list.
- **The tube operator packs, on the tab.** The Tube Laser tab has a
  fifth segment, Packing: the plate Laser Status screen fed with tube
  programs. The packing stage is the **Tube Laser stage itself**, which
  is why cutting never closes that stage on the tube laser (see below).
- **Tube Laser Status under Production** is the same rows, seen by
  everyone on Production. Take job there is for the next person along,
  welding or delivery: it records who took it and opens the stages
  after Tube Laser, so a two-week job can move on before the last length
  is packed. Packing stays with the tube operators.
- **Shortages** on the tube tab are the tube lane's only; the plate tab
  stops showing them. Nothing else in the shortage flow was touched.
- **The operator's switch.** On the plate laser a cut-only person sees
  Cutting alone, by design. On the tube laser he also packs, so he sees
  Cutting and Packing, and only those two. Whoever nests sees all five.

## How it is built: one set of code, told the machine

`src/constants.js` has `LASER_MACHINES`, one profile per laser, saying
everything that differs: the machine name stored on a program, the
shortage lane, the word for a repeat, whether there is a cutting time or
a sheet name, where the material list comes from, how programs are
numbered, which shift tick to read, and whether the cutting stage is the
packing stage. The comment above it explains each field.

App.jsx attaches the two stage-name rules to each profile
(`isNestingStage`, `isCutStage`) and calls `useLaserPrograms` twice, once
per laser. Each call loads only its machine's programs and its lane's
shortages, so Laser Status, the counter and the Shifts report follow
without knowing there are two lasers. The Laser 4kw tab runs on the
plate profile and behaves exactly as before.

| Where | What the profile changes |
| --- | --- |
| `useLaserPrograms.js` | filters programs by machine and shortages by lane; uses the profile's stage rules; hands out a number when the profile says "generated"; skips closing the cutting stage when it is the packing stage |
| `LaserTab.jsx` | segments (Packing when the profile has it), who sees which, section names for the material picker, and passes the profile down |
| `NestingView.jsx` | name box against number box, section picker against thickness and grade, sheet and minutes boxes only when the machine has them |
| `CutList.jsx` | sheet against length, lengths in the counter when there is no time, no time popup, tube wording on the stop report |
| `ShiftReport.jsx` | the shift tick, Sheets against Lengths, no time columns |
| `LaserStatus.jsx` | `words` for which machine's parts these are; `canTake` apart from `canPack` |
| `programTitle.js` | `TL-0007 · COFFEE TABLE`, or just the number on plate |
| `cuttingTime.js` | `laserShifts(shifts, flag)`, `outstandingUnits` |

Stage rules, in App.jsx beside the plate ones:

- **Nest tube:** an allowed stage with "tube" and "nest" in the name.
- **Cut tube:** "tube" and "laser" but not "nest", because "Tube Laser
  Nesting" has all three words.
- The Tube Laser tab shows for whoever matches either; admins get both.

## What is different underneath

- **Cutting never closes the Tube Laser stage.** On plate, the Laser
  stage closes by itself when a job's programs are cut and packing is a
  separate Packer stage. On tube the operator packs under the Tube Laser
  stage, so `syncLaserStagesFor` does nothing for the tube profile and
  the stage closes when he ticks "Tube parts packed & checked" (or, set
  to Each, when every tube line is packed in full). A re-cut's catch-up
  Tube Laser Nesting stage still closes on the cut; its catch-up Tube
  Laser stage is its packing and shows as a re-cut row on Packing.
- **Take job** sets started_at/by and assigned_to on the Tube Laser
  stage, as on Packer. For that to open the stages after it, the Tube
  Laser stage needs "releases on start" in process_type_settings, which
  `setup-tube-laser-stages.sql` sets. There is no tick box for it.
- **Program numbers are unique per machine**, not across both. The old
  index went; `laser_programs_machine_number_live_idx` replaces it.
- **Two data loads.** The tube hook loads the same job tables the plate
  hook does, but only when someone opens the Tube Laser tab or
  Production (for the status card). A job change re-reads the tube data
  only if it is loaded.

## The database

`setup-tube-laser.sql`, practice first, then live. Safe to run twice.
`CHECK-which-setup-files-are-run.sql` reports it.

| Adds | Why |
| --- | --- |
| `shifts.cuts_tube_laser` | the second tick under Time Manager |
| `laser_programs.nesting_name` | blank on every plate program |
| `laser_program_counters` and `next_laser_program_number(machine, prefix)` | the next number, bumped in the database so two nesters cannot get the same one; a number handed out to a program that then fails to save is skipped, which is harmless |
| the per-machine unique index | see above |

`setup-tube-laser-import.sql`, after it: the number function goes to five
digits with no prefix, and `tube_section_aliases` remembers what the
software's section wording means. Announce both: the function is shared
with whoever else touches `next_laser_program_number`.

## Switching it on

1. Run `setup-tube-laser.sql` on practice, check four rows say ready,
   then on live.
2. Push the build.
3. Run `setup-tube-laser-stages.sql`. It sets "releases on start" on
   the Tube Laser stage and hides both tube stages from Production. Those
   three stage settings have no tick box in the app; they have only ever
   been set by SQL (see `setup-hide-from-production.sql`). The
   nesting-name box on the Production card goes with the card; nothing
   was removed by code.
4. Under Time Manager, tick "the tube laser cuts on this shift" on the
   right shifts. Until then the tube screens read every shift and say so.
5. The tube nester and operator need the tube stages under User
   Management, the same way Prince and the plate operator have theirs.

## Not done, on purpose

- The shortage flow beyond the lane filter. The shortage conversation
  owns it.
- Enforcing the operator's time, which the tube laser does not ask for
  at all.
- Removing the nesting-name box from the Production card: it hides with
  the card when the stage is hidden from Production.
