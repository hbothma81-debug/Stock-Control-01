# "Made on" tag per item — plan

Written 8 September 2026. Planning only; nothing has been built.

Read this alongside the two rules already live on the Production tab:
the tube laser and the plate laser are separate lanes (neither waits for
the other), and a packing stage set to Each is packed item by item on
Laser Status.

---

## 1. The problem

A job's items carry no idea of which machine makes them. An Each stage
lists every item on the job. So on a mixed job like JOB-0021, the tube
parts show up under Laser Status and the plate parts show up under Tube
Laser, and each stage waits for parts that will never come to it.

## 2. Decisions already made

- Tube parts are packed by the tube operator, under the Tube Laser stage.
  Laser Status is the plate packer's screen and shows plate parts only.
- The tag is remembered on the stock part (option 2), because the shop
  does a lot of rework and the same part comes back on the next job.
- Nothing under the Laser 4kw tab changes. Nesting and Cutting work off
  programs, not items, and stay exactly as they are.
- Assemblies are coming later (section 6). This plan lays the ground for
  them without building them.

## 3. What gets built

**A tag on every job item: where it is made.** One of

| Tag | Meaning |
|---|---|
| Laser | plate, cut on the 4kw laser |
| Tube laser | tube, cut on the tube laser |
| CNC | machined on the CNC / drilled |
| Cut to size | sawn to length |
| Assembly | not cut here; put together from other things |
| *(blank)* | not tagged yet — behaves exactly as today |

**A link from each stage to a machine.** In Stock Manager → Job Process
Types, next to the existing tick boxes ("hide from production", "worked
in Laser Status"), one more setting: *this stage cuts items tagged …*.
Tube Laser Nesting and Tube Laser point at Tube laser. Nesting, Laser and
Packer point at Laser. Machine/Drilling/CNC points at CNC. Cut To Size
points at Cut to size. Bending, welding, delivery and invoicing are left
blank, which means "every item". Names stay free text; renaming a stage
does not break the link.

**The rule.** A stage that points at a machine lists only the items
tagged for that machine, plus items with no tag at all. A stage with no
machine lists everything. Assembly items never appear on a cutting stage.
The stage finishes itself when *its* items are done, not the whole job's.

**The tag is remembered.** Setting it on a job item also writes it to
the linked stock part. The next job that loads that part comes in tagged.

**The tag is guessed.** A job item linked to a stock part takes the
part's saved tag. Failing that, the part's section type decides: square,
rectangular and round tube mean Tube laser; plate means Laser. You
correct the odd one on the Items tab.

## 4. Steps, in order

Each step is one commit and one thing for you to test before the next.

1. **Database.** A `made_on` text column on `job_quote_items` and on
   `stock_items`, blank by default. A `cuts_made_on` text column on
   `process_type_settings`, blank by default. Blank everywhere means
   nothing changes on the floor until someone tags something.
2. **Stock Manager → Job Process Types.** The "cuts items tagged" setting
   on each stage.
3. **The job's Items tab.** A small dropdown per line. A count of how many
   lines are still untagged and a "guess the rest" button. Saving a tag
   also saves it to the linked stock part.
4. **The filter.** Every Each control lists only the stage's items: the
   Production card, Laser Status packing, the job's own checklist, the
   process sheet. The stage completes when its items are done. A cutting
   stage with *no* items for it shows a warning rather than finishing
   itself (see risk 3).
5. **Per-item flow cap.** The count an item may pass through a stage is
   capped by the stages before it. A stage that does not apply to the
   item (the other machine's stage) is skipped in that calculation.
6. **Edit processes.** Warns when a stage on the job has no items tagged
   for it, so a tube-only job does not carry Nesting and Laser the way
   JOB-0014 did.
7. **Customer catalogue import.** Carries `made_on` across by part number
   when it replaces a catalogue, and re-links job items to the new rows.
   Without this the tag is lost on the next import (risk 1).
8. **New Job.** Items loaded from a quote or a stock part come in tagged
   from the part. Items typed by hand start blank.

## 5. What each screen shows afterwards

- **Tube Laser Nesting / Tube Laser:** tube items only. Tube Laser is
  where the tube operator packs, so it is the last stop for those items.
- **Laser Status (Packer):** laser items only. The job leaves the screen
  when the laser items are packed, even if tube items are still on the
  tube laser. Bending and everything after still wait for both lanes.
- **Bending, welding, delivery, invoicing:** everything, assemblies
  included.
- **Cut To Size:** keeps its own cut list (sections and lengths) and its
  own running count. The Cut to size tag only keeps those items off the
  other cutting stages. One count, not two.

## 6. Assemblies, to keep in mind

Not built now. The tag is the seed for it.

**One-off assembly typed in on New Job.** One line on the job, tagged
Assembly. Skips every cutting stage. On the other stages it is a line
with a quantity: with a quantity of one it is a single tick per station;
with more than one it counts like any Each item. The job still shows
under Laser if Laser is one of its stages, same as now.

**Stock Manager assemblies, later.** A tab that splits parts from
assemblies. An assembly is a stock item made up of other stock items,
each with a quantity. Loading an assembly onto a job loads its parts as
job items, each carrying its own tag, plus the assembly line itself
tagged Assembly. The cutting stages see the parts; packing, bending and
delivery see the assembly. Needs one new table (assembly → part → qty).
Open question for then: whether the parts leave the job's item list once
the assembly is packed, or stay as a record.

## 7. Risks

1. **The catalogue import wipes tags.** When "replace the catalogue" is
   used, every zero-stock part is deleted and recreated with a new id.
   The saved tag goes with it, and job items already linked to those
   parts point at rows that no longer exist. That second part is true
   today already. Fix in step 7: match by part number and carry the tag
   and the links across.
2. **Half-tagged jobs read oddly.** Untagged items show everywhere, so a
   job with three tube items tagged and eight not will show the eight on
   Laser Status and the three only under Tube Laser. The untagged count
   and "guess the rest" on the Items tab are there to close that gap
   fast. Live jobs like JOB-0021 need tagging once by hand.
3. **A cutting stage with no items.** If it finished itself, a wrongly
   tagged job would sail through nesting without anyone noticing. So it
   never finishes itself: it says "no items tagged for this machine" and
   keeps the single Batch tick, and Edit processes flags it.
4. **"Packed" now means "plate packed".** With tube parts packed under
   Tube Laser, a job leaves Laser Status before its tube parts are done.
   Safe for the flow, because Bending waits for the Tube Laser stage too,
   but anyone reading Laser Status as "the job is packed" will be wrong
   for mixed jobs. The row should say "laser parts packed" rather than
   "packed & checked".
5. **Re-cuts.** A shortage's catch-up stages run their own sequence and
   carry the shortage's lines, not the job's items. They should be
   untouched, but every step needs a re-cut checked as well.
6. **Four conversations, one file.** Steps 3 and 8 are on the Jobs page,
   step 2 in Stock Manager, step 4 touches the Production card and
   LaserStatus.jsx. The three new columns get announced before they are
   run, so no other conversation adds the same thing under another name.
7. **A tag typed as words drifts.** The tag is stored as a fixed code
   (`laser`, `tube_laser`, `cnc`, `cut_to_size`, `assembly`) and shown as
   a label, so nobody can create "Tube Laser" and "tube laser" as two
   different things.

## 8. What does not change

- The Laser 4kw tab: Nesting, Cutting, Shortages, Shifts.
- Batch stages: one tick, as now.
- Jobs whose items are never tagged: identical to today.
