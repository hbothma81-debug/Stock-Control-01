# Handover

Newest entry at the bottom. Each entry is the state of play when a
session ended: what is done, what is half-done, what to pick up next.

---

## 14 Sep 2026 — Planning conversation

### Done and live

- **Supabase downloads (egress) cut.** Background refreshes ask only for
  what changed (stock, requisitions, purchase orders, usage log,
  notifications), pause after 10 minutes with nobody at the screen, and
  run every 5 minutes. The `updated_at` trigger SQL is on practice and
  live for all five tables. Measured on live: a stock refresh went from
  1,653 KB to 887 bytes. Commits 20405e9 and 1c6c149.
- **Shortages know their laser.** Plate or tube is chosen when flagging.
  Each shortage shows only on its own laser's nesting screen, with who
  flagged it and how long ago, turning red after a day.
  `setup-shortage-lane.sql` is on both databases.
- **Invoicing.** The request shows the customer PO, sales rep, SigmaNest
  number, description and delivery notes. Records → Invoicing cards show
  the submitted and invoiced dates, with an add-only notes thread. A job
  becomes Complete when its last stage is ticked. The Jobs page has
  Active, To invoice and Completed pills.
- **Buy-outs.** Import / Export on Buy-out Codes; the stock tab groups
  buy-outs by supplier.
- **Money visibility.** The header stock value is admins only. A new
  permission, "Can see spend totals", gates the Purchase Orders totals.
- **Checks.** `CHECK-live-table.cjs`, `CHECK-what-the-app-downloads.sql`,
  and a setup check that knows every new SQL file.

### Half-done or waiting on Heinrich

- **Egress.** Watch Usage → Egress. Weekdays should be about 100 MB or
  less, weekends near zero. Restriction from 14 Oct 2026 if the
  organisation is still over quota.
- **`BACKGROUND_REFRESH_MS` is 5 minutes temporarily.** Decide after the
  25 Sep reset whether to put it back to 1 minute (60000). A reminder for
  26 Sep was offered and not yet answered.
- **Tube line material.** Done since this entry was written:
  `setup-job-line-material-type.sql` has run on both databases (the
  column answers on practice and live, checked 14 Sep).
- **Old shortage on live** flagged before lanes existed: it has catch-up
  stages for both lasers. Delete the wrong-lane nesting stage on that
  job by hand.
- **Permission ticks to set in User Management:** "Can see spend totals"
  for non-admins who should see the PO totals; "Can manage invoicing"
  for accounts.

### Not started, by decision

- Shift lockout stage four (the database enforcing it). Waiting for a
  week of real use with the lockout switched on.
- `src/lib/shiftWindow.js` does not know about holidays; the database
  rule does.
- The multi-month PO report has only been run against one month of
  practice data.
- Forgotten-password handling. Parked by Heinrich.

### Pick up next

1. Look at the egress chart with Heinrich; decide on the 1-minute
   refresh after 25 Sep.
2. If egress is still high: take master lists off the timer entirely
   and fetch them only when they change.

---

## 14 Sep 2026 — Dropdowns and the Production tab (a fifth conversation)

### Done and live (9 to 14 Sep)

- **Every list picker is type-to-find.** `src/TypeToFind.jsx`, used on
  about 60 boxes: item form, stock filters, procurement, Manager, Jobs,
  Production, nesting, user management. Fixed short choices and the
  numeric size filters stay plain dropdowns on purpose. Fixes since:
  a tapped name sticks on fields that allow new names; the list is
  pinned to the screen so scrolling pop-ups cannot hide it; options can
  carry a hint (a description beside a part number).
- **Alphabetical everywhere.** Master lists and people are sorted once
  in memory. Job Process Types and Laser Thicknesses keep their hand
  order.
- **Production tab, ready work first.** Two pills per department, ready
  on top, waiting shut, "Waiting: <stage>" on each waiting row, partly
  ready per-item stages count as ready with "x of y", overview cards
  show the ready count. Plan: `docs/PRODUCTION-READY-FIRST-PLAN.md`.
- **Customer Stock, New stock item.** Part number and Description both
  find known parts (stock for that customer, then drawings) and fill
  each other in.

### SQL written by this conversation

None. No database change in any of it.

### Built but not yet tested by Heinrich

He has confirmed: New Job customer box (type, tap, sticks), Add Item on
Customer Stock (list now appears). Still untested by him:

1. Production tab: ready/waiting pills, the "Waiting: <stage>" label,
   a partly ready per-item job showing "x of y", card numbers matching
   the pills.
2. Type-to-find on: stock filters (material, fastener type/grade/finish,
   Drawings customer), procurement (requisition rows and form, PO filter,
   report and builder, delivery note recipient, buyouts, stores
   catalogue rows), Manager (Customer Stock rows, Sections rows and add
   row), Jobs and Production filters, assignee on a stage, "put against
   a stage", usage pop-up job picker, nesting thickness and grade, user
   management shift and department.
3. Part number and Description suggestions on the Customer Stock item
   form, including picking from Description filling the part number.
4. Manager screens now list everything alphabetically.

### Pick up next

- If anything above misbehaves, each is one commit to revert; the
  commits are named by screen.
- The single-stage detail header still says plain Ready or Waiting
  without the stage name. Small, if wanted.
- The customer and sales rep filters on Jobs and Production were the
  Jobs conversation's; they are type-to-find now, tell that conversation.

---

## 14 Sep 2026 — Stock Manager conversation

### Done and live

All three went live through other conversations' pushes, before
Heinrich had tested them.

- **Suppliers tab search.** Finds a supplier by its name or a contact
  person's name, and by its categories once those exist. Commit 911bf5d.
- **Supplier logos removed everywhere.** No upload button, no thumbnail,
  nothing on the Purchase Order PDF. `master_suppliers.logo` is left in
  place and nothing reads or writes it. Commit b8e6c20.
- **Structural stock is pick-only.** On the add-stock form, section
  type, section and material only take what is on Stock Manager's lists,
  and saving never adds to them. An older line with an unlisted value
  still opens, names it in red, and keeps it until something is picked.
  A new line cannot be saved with one. `LibraryField` gained `pickOnly`
  and `missingHint`. Commit 6539abf.

### SQL written by this conversation

- No `setup-*.sql`. Nothing in either database was changed.
- Two read-only checks, neither run yet: `CHECK-sections-and-materials.sql`
  and `CHECK-fasteners.sql`. Heinrich pastes each into the live SQL
  editor and sends the result.

### Built but not tested by Heinrich

- **Supplier search:** Stock Manager → Suppliers. Type part of a supplier
  name, then part of a contact person's name.
- **Logos gone:** open a supplier, there is no upload button. Raise a PO
  for a supplier that had a logo; the PDF shows none. The company logo
  in Company Details still works.
- **Pick-only structural stock:** Stock → Structural → add. Type a size
  that is not on the list, then pick one that is. Open an old, loosely
  typed line and look for the red note. Add a new size in Stock
  Manager → Sections and check it then appears on the form.

### Waiting on Heinrich

- Run the two checks on live.
- Sections: confirm the proposed table of 17 section types and their
  prefixes (pipe is the least certain); whether the stored material name
  is the short one, like MS (recommended); whether plate stock's material
  box also becomes pick-only.
- Fasteners, five questions: metric only or inch too; the type list; the
  name format "M10x25 Hex Bolt 8.8 ZP"; keep FST-0001 numbers; material
  folded into grade.
- Suppliers: blank the old stored logo pictures, which cannot be undone,
  or leave them.
- Pushing: committed work goes live at the next push by any
  conversation, untested. Two options were put to him: hold commits
  until tested, or every push asks about everything queued. Unanswered.

### Planned and decided, not built

- **Suppliers step 3:** a Tel number per contact person, one column on
  `master_supplier_contacts`. Not printed on the PO.
- **Suppliers step 4:** categories on a supplier, several allowed,
  type-to-find suggesting categories already used, no separate list to
  maintain. For finding and grouping in Stock Manager only. One column
  on `master_suppliers`. Steps 3 and 4 share one SQL file.
- **Sections steps 3 to 6:** merge materials, section types with fixed
  boxes and dimension columns, convert and merge existing sections,
  kg/m worked out later. The renames reach laser program materials,
  `job_quote_items.material_type` and the tube section aliases, so tell
  Laser production and Jobs before step 5 runs.
- **Fasteners:** a `fastener_types` rules table, pick-only form, fixed
  name, duplicate warning, convert existing lines. After sections by
  default. Tell Quoting first: its plan makes Stock Manager rows
  read-only, fasteners included.

### Pick up next

1. Read the two check results with Heinrich.
2. Get the sections answers, then build sections step 3, the material
   merge.
3. Supplier steps 3 and 4 when Heinrich asks for them.

---

## 14 Sep 2026 — Tube Laser production conversation

This conversation built the Tube Laser tab on 10 Sep 2026 and is being
cleared now. The Laser production and Jobs conversations have since
taken the tab and the parts-under-a-line pattern further (per-part
nesting, the picker's narrowers, add and move parts by hand); their own
entries and `docs/TUBE-LASER-HOW-IT-WORKS.md` describe those.

### Done and live (all pushed 10 Sep, commits c41e357 … cc8a677)

- **Tube Laser tab** on the plate laser's code with a machine profile
  (`LASER_MACHINES`): Nesting, Cutting, Shortages, Shifts, Packing. A
  cut-only tube operator sees Cutting and Packing. Tube Laser Status
  under Production, where the next department takes the job. Second
  shift tick "the tube laser cuts on this shift" under Time Manager.
- **Import nesting report**: the tube software's .xlsx (simple or
  detailed) makes one program per section, five-digit numbers from the
  database, nests into the program's notes, section wording remembered
  in `tube_section_aliases`. Parser tested against every sample report.
- **Section picker over real stock**, with grade, length and what is
  free. Note: it reserved the lengths when this conversation built it;
  the Jobs/Laser conversations changed that on 11 Sep — picking now only
  says which stock, and cutting a tube takes the length off the shelf
  (commits 3e493f4, ca63aed, 6ff703a).
- **Packing and Tube Laser Status list what is still coming** under
  "Waiting on earlier stages", with programs and lengths cut.
- **The parts on a nesting become child lines** under the job's own
  line, with quantity and length; one rule in App.jsx for who sees which
  line; money sees parents only.
- Write-ups: `docs/TUBE-LASER-HOW-IT-WORKS.md` (this conversation, then
  extended by the Laser conversation) and `docs/JOB-PARTS-WARNINGS.md`
  (Jobs conversation).

### Every setup file this conversation wrote, and where it has run

Checked on 14 Sep by selecting each column over the REST API (200 = it
exists) on practice and on live:

| File | Adds | Practice | Live |
| --- | --- | --- | --- |
| `setup-tube-laser.sql` | `shifts.cuts_tube_laser`, `laser_programs.nesting_name`, `laser_program_counters` + `next_laser_program_number()`, unique index per machine | yes | yes |
| `setup-tube-laser-import.sql` | five-digit numbers (function only — Heinrich confirmed run on both), `tube_section_aliases` | yes | yes |
| `setup-tube-laser-parts.sql` | `job_quote_items.length_mm`, `laser_programs.part_count`, `laser_programs.parts` | yes | yes |
| `setup-tube-laser-stages.sql` | settings only: hides the two tube stages from Production, releases-on-start on the cutting stage | ran on both (Heinrich) | ran on both |
| `UNDO-tube-laser-stages-hide.sql` | settings only: shows the tube stages on Production again | ran on live (Heinrich: "cards are back"); practice not confirmed | ran |

The function and the two settings files cannot be checked from here;
their state is as Heinrich reported. None of these are in
`build-test-database.sh`, on purpose: the laser and shift files are not
part of `setup-ALL.sql` either. All are in
`CHECK-which-setup-files-are-run.sql`.

### Built by this conversation but not yet tested by Heinrich

Each was tested by me on practice; Heinrich has tried the first import
and cut one length. Still for him to try:

- The typed parts box on Nest it and New program (one part per line,
  "name, qty, length").
- The import asking which line the parts go under, on a job with more
  than one line; and a job with no lines getting a new parent line.
- Importing the same report twice: quantities update, nothing doubles.
- "Request stock to order" on a section with 0 available.
- Take job on Tube Laser Status by somebody who is not a tube operator,
  and welding then opening.
- A stop report on a tube program (offcut is a length only), and the
  tube Shifts report after a shift is ticked for the tube laser.
- An import onto two jobs at once.

### Waiting on Heinrich

- Time Manager: tick "the tube laser cuts on this shift" on the tube
  shifts. Until then the tube counter and Shifts read every shift and
  say so.
- User Management: the tube nester gets the tube nesting stage, the
  operator the tube cutting stage.
- When the jobs started the old way are through: run
  `setup-tube-laser-stages.sql` again on live to take the tube stages
  off Production.
- The practice app kept reporting `tube_section_aliases` as not in its
  schema cache although the table answers on REST. If "Remembered from
  last time" never shows on the import, run `notify pgrst, 'reload
  schema';` on practice.

### Pick up next (whoever owns the tube tab now — the Laser conversation)

1. The import's parts should be optional (a tick, off when the job
   already has lines) — asked for on 11 Sep, not built.
2. Practice still holds test programs TL-0001, TL-0002, 00003, 00004,
   00005 and the parts under JOB-0004; delete when in the way.

---

## 14 Sep 2026 — Laser production / Production tab conversation

### Done and live

- **Two laser lanes.** Tube stages and plate stages no longer wait for
  each other on the Production tab; everything after them waits for
  both. JOB-0014 was stuck saying "Waiting on Nesting" with two tube
  items nested; that was the cause.
- **Per-item packing on Laser Status.** A Packer stage set to Each is
  packed line by line once the job is taken and finishes itself when
  every line is packed in full. Batch and re-cuts keep the single tick.
  Wording says "Laser parts packed" because tube parts are packed under
  Tube Laser.
- **The "made on" tag, steps one to seven.** Tag per job line, stage
  dropdown under Job Process Types, Items tab dropdown with Guess the
  rest, remembered on the stock part, cutting stages filtered, Edit
  processes warning, catalogue "replace" import keeps a part's row.
  Plan: `docs/MADE-ON-TAG-PLAN.md`.
- **Production tab filters**: search, All customers, All sales reps,
  driving pill counts, lists, the nesting shortage block and Laser
  Status together.
- **Job files by stage.** Files tab grouped as pills (Whole job, each
  stage, Made by the app), Upload on each pill, several files at once,
  "Move to..." on each file. Every stage's Production card shows its own
  documents. Heinrich confirmed Move works on live after the SQL below.

### SQL this conversation wrote

- `setup-made-on-tag.sql` — three columns. Practice: confirmed by
  Heinrich. Live: confirmed; all three columns answer 200 on the live
  REST API (checked 14 Sep).
- `setup-job-documents-move.sql` — an UPDATE rule on `job_documents`,
  rules only. Live: confirmed (Heinrich pasted the four-rule result from
  live). Practice: NOT confirmed; he only reported live. Run it on
  practice too, or Move on practice says "the database refused".
  Both files are registered in `build-test-database.sh`.

### Built but not yet tested by Heinrich

- The made-on tag on live is switched off: every stage under Job Process
  Types was still on "Every item" when checked on live on 9 Sep, and no
  live line is tagged. Switch-on order is at the top of
  `docs/MADE-ON-TAG-PLAN.md`: set the dropdowns, then Items tab, Guess
  the rest on JOB-0021, 0014, 0019, 0022, then untick the plate stages
  JOB-0014 no longer needs.
- Catalogue "replace" import keeping tags and job links: checked by
  reading only; needs one real import on practice.
- Several files at once, from the Files tab and from a Production card:
  not exercised from the practice browser (file picker); the single-file
  code runs in a loop.
- Production tab filters: tested on practice by me, not by Heinrich.

### Waiting on Heinrich

- `setup-job-documents-move.sql` on practice.
- The switch-on above.
- The BOM questions. The Quoting conversation merged that plan into
  `docs/QUOTING-AND-BOM-PLAN.md` (section 15 carries the decisions);
  `docs/BOM-PLAN.md` is a pointer. The copy-paste handoff brief Heinrich
  asked for was given in chat on 9 Sep and is not in the repo.

### Pick up next

1. Get the practice SQL run, then walk Heinrich through the switch-on.
2. Once tags are on, retire the name-based lane rule (`inOtherLaserLane`)
   in favour of `cuts_made_on`; two copies of one idea will drift. Not
   before, because the lane rule is what protects mixed jobs today. Note
   the Production readiness rule has since moved to `blockingStages`
   (another conversation); check the lane rule still sits inside it.
3. BOM work belongs to whoever owns `docs/QUOTING-AND-BOM-PLAN.md`.

---

## 14 Sep 2026 — Jobs page conversation

### Done and live (8 to 14 Sep)

- **Cut to size tab** on a job: cut lines, bars needed, cutting order,
  Set aside / Requisition, a printed cutting list with Materials used
  (floor, set aside, on order, to order). Production's Cut To Size
  stage has a per-line counter and Book out per bar.
- **Jobs list:** progress chips with stage names under each row; search
  also finds the SigmaNest number.
- **Job editor:** New Job is now a doorway (customer, description, due
  date) that opens the job; stages are ticked on the job. SigmaNest and
  Excel quote imports on the Items tab. Item prices behind "Can see
  Rand values".
- **Buy-outs tab:** one PO per supplier through the normal PO numbers,
  add a supplier from the tab, arrivals reserved to the job. The old
  Buy-out notes box is retired.
- **Materials tab:** reserve or take from stock, aimed at a stage or
  not. The stock picker shows free and reserved, has filters including
  "reserved for this customer", hides empties and assets. Cutting a
  tube program takes lengths off the job's reservation (`consumeProgramStock`;
  the Laser conversation calls it, ca63aed).
- **Stock code is its own field** (`job_quote_items.stock_code`). A line
  reads code, description, quantity, price; the code is matched first.
  Code column on the job sheet, delivery note and invoice request. An
  Add to Customer Stock button on every line. On live: 743 lines, 46
  given a code by the backfill, none still carrying it in the text.
- **Tube material type:** a Material type box on lines and parts made on
  the tube laser, saved in `materialText` words. Went live on 14 Sep in
  the Planning conversation's push, not mine, before Heinrich tried it.

### Every setup file this conversation wrote

Checked 14 Sep by selecting each table or column over the REST API
(200 = it exists) on practice and on live:

| File | Adds | Practice | Live |
| --- | --- | --- | --- |
| `setup-job-cut-items.sql` | table `job_cut_items` | yes | yes |
| `setup-job-buyout-items.sql` | table `job_buyout_items` | yes | yes |
| `setup-laser-program-stock-link.sql` | `laser_programs.stock_item_id` | yes | yes |
| `setup-job-line-stock-code.sql` | `job_quote_items.stock_code`, plus a one-off backfill | yes | yes |
| `setup-job-line-material-type.sql` | `job_quote_items.material_type` | yes | yes |
| `setup-copy-description-into-stock-code.sql` | data only: copies the description into the stock code on the jobs named in it; ships with an empty job list | not confirmed | not confirmed |

The Planning entry above says `setup-job-line-material-type.sql` has not
run. It has since: the column answers on both databases.

Registered today: stock code and material type in
`build-test-database.sh` (`setup-ALL.sql` regenerated), all five schema
files in `CHECK-which-setup-files-are-run.sql`. The stock link stays out
of `setup-ALL.sql` like every laser file, because `laser_programs` is not
created there. The copy script is a one-off and stays out too.

### Built but not confirmed tested by Heinrich

1. **Material type:** set a line's made-on to Tube laser, pick a
   material, reload, it stays. Copy the job; it comes across.
2. **Stock code:** type a known code on a line, the description and
   price fill. Type an unknown code, it stays and the line is unlinked;
   Add to Customer Stock then makes the part with that code. Two parts
   with the same name and different codes: the right one is picked.
3. **Printouts:** the Code column on the job sheet, delivery note and
   invoice request.
4. **Materials tab:** Reserve against a stage, Take from stock now,
   release. The picker's filters and "reserved for this customer".
5. **Tube drawdown:** Cut one on a tube program whose job has that bar
   reserved; shelf and reservation drop by one, Undo one puts it back.
   With no reservation it warns and carries on.
6. **Buy-outs:** raise a PO from the tab, receive it on Receiving, it
   lands reserved on the job.
7. **Cut to size:** Book out per bar from the Production tab.
8. **Jobs list:** search by a SigmaNest number.

### Waiting on Heinrich

- `setup-copy-description-into-stock-code.sql`: fill in the job list and
  run it on live. Suggested: 'JOB-0090','JOB-0089','JOB-0087','JOB-0086',
  'JOB-0085','JOB-0084','JOB-0075','JOB-0073','JOB-0069','JOB-0068',
  'JOB-0066','JOB-0065','JOB-0063','JOB-0062','JOB-0059','JOB-0057',
  'JOB-0055','JOB-0049','JOB-0047','JOB-0046','JOB-0044','JOB-0041',
  'JOB-0040','JOB-0037','JOB-0036','JOB-0018','JOB-0013'.
- `CHECK-imported-parts-intact.sql`: results 2 and 3 (both should be 0)
  were never sent back.
- Tag a few tube lines with a material on a real job. The Laser
  conversation builds the import matching only against real tagged lines.
- The open questions at the end of `docs/TUBE-PARTS-BY-SECTION-PLAN.md`:
  which wins when the job says one material and the file another, and
  part-way tagged jobs.

### Pick up next

1. When Stock Manager converts section names (its step 5), the same pass
   must rewrite `job_quote_items.material_type`. Its plan already says
   so; hold it to that.
2. Tidy-up: the old New Job pop-up code (quote imports, quote lines, cut
   lines, stage ticks) is unreachable in App.jsx. Remove it once the
   doorway has settled.
3. The customer and sales rep filters on Jobs are type-to-find now (the
   dropdowns conversation did it); nothing to do unless they misbehave.

---

## 14 Sep 2026 — Quoting conversation (quoting, bill of materials, parts under a job line)

### Done and live (9 to 11 Sep)

- **Parts under a job line, by hand.** Every line on a job's Items tab
  has Add part: quantity, the part typed to find against that customer's
  stock codes, length in millimetres, cut method. Parts already there
  are typed over in place. Commit 23f4d6b.
- **Parts from a file.** SigmaNest parts and Tube nest parts under any
  line. SigmaNest lands as Laser, linked to a stock code where the name
  matches. A tube nest lands as Tube laser with lengths, reading only the
  Part Info sheet. Both ask first and update a part of the same name
  rather than doubling it. Commit 9e5a06b.
- **Move a line under another, and back out.** Refused for a line that
  has parts of its own, is invoiced, or has a delivery note. Commit
  ee8f34f.
- **Welding as a cut method.** Commit b11f983. Importing also fills in a
  blank cut method on a part already under the line.
- **A line with parts is never asked for a cut method.** Not counted as
  untagged, skipped by Guess the rest, no orange outline. Commit db5c8bc.
- **Job sheet.** One type scale at the top of the function, tables at
  7.5pt. Parts are marked with a bullet: the arrow used before printed a
  stray glyph and letter-spaced every part line. Commit 507ee76.
- **Ticking Nesting or Laser ticks packing.** Commit 534964f.
- **Both lasers: a job reaches packing on the first sheet or length
  cut.** Commit e64d783.
- **Docs.** `docs/JOB-PARTS-WARNINGS.md` holds every warning about parts.
  The two laser write-ups carry the packing changes. The one plan for
  quoting and the bill of materials is `docs/QUOTING-AND-BOM-PLAN.md`;
  the older BOM and quoting plans now point to it.

### SQL written by this conversation

- **`setup-quoting-and-bom.sql`** — confirmed on practice and live on
  14 Sep. All 11 tables answer 200 on both, and so do the new columns on
  `job_quote_items`, `stock_items`, `jobs`, `job_cut_items`,
  `process_type_settings` and `profiles`. Not checkable from here: the
  `quotes` storage bucket, the `nextQuoteNumber` counter and the check
  rules. `CHECK-which-setup-files-are-run.sql` covers them. Nothing reads
  the quote tables yet.
- **`setup-made-on-welding.sql`** — check rules only, which the REST API
  cannot see. Heinrich confirmed it run on both on 11 Sep. Saving Welding
  on a line was verified on practice.
- Not a setup file: `CHECK-bom-starting-point.sql`, read-only, never run.

### Built but not yet tested by Heinrich

He confirmed Add part by hand, and the job sheet sample. Still untested
by him:

1. SigmaNest parts and Tube nest parts under a line. The file pick cannot
   be driven from the browser pane; the parsing was checked against every
   sample tube report and three real SigmaNest quotes.
2. Move under, and the arrow that takes a part back out.
3. Welding on a line. It saves now; nothing is tagged Welding yet.
4. A line with parts: no untagged count, no orange outline, Guess skips
   it.
5. Ticking Nesting or Laser on Edit processes bringing Packer with it.
6. A job reaching the packing screen on its first sheet or length.
7. The printed job sheet from a real job, rather than the sample.

### Half-done or waiting on Heinrich

- **The quoting module itself.** Plan agreed; step one, the database, is
  on both; step two onward not started. Open decision: whether the
  add-only Stock Codes import gets an Apply-differences option for price
  changes.
- **Owed to Laser production:** that ticking Nesting or Laser now ticks
  the packing stage. The first-sheet rule has reached them already;
  their own CLAUDE.md notes build on it.
- **Stock Manager lock** (plan section 6): decided, not built.
- **Noticed, not touched:** the untagged count never includes parts, so
  a part left untagged is not nagged about.
- **Memory note clash:** `bom-plan.md` is the 8–9 Sep planning
  conversation's note, and it rewrote the file on 14 Sep. The quoting
  state now lives in its own note, `quoting-module.md`. Where the two
  disagree, section 15 of the merged plan wins.

### Pick up next

1. Heinrich tests the list above on live.
2. Quoting step two: a quote you can send (list, detail, items with a
   typed price, PDF) in `src/quoting/`, behind `can_quote`.
3. If the tube import stops picking the parent line on its own once lines
   with parts are left blank, have it recognise a line with parts rather
   than one tagged Tube laser.

## 14 Sep 2026 — Laser production (cutting, nesting, packing and the tube import)

This conversation owns the plate laser and, as the Tube Laser entry above
hands over, now the tube tab too.

### Done and live

- **Cutting screen.** Cards side by side; a count of programs cut this
  shift, on ticked laser shifts only, and between shifts the shift that
  just ended; minutes of cutting still on the list.
- **Cutting time.** Planned minutes per sheet; the operator's actual time
  asked on the last sheet, skippable for now; a Shifts report segment.
- **Stops and deletes.** A stopped program leaves the cut list, sits at
  the top of To nest, opens to be edited, and Sorted returns it. Delete
  asks why and cancels, never removes.
- **Laser 4kw tab lifted out of App.jsx** into `useLaserPrograms.js` and
  `LaserTab.jsx`.
- **Packing.** A re-cut reaches the packer on its first sheet like any
  job; one rule, `stageIsCleared`, for when a stage stops holding the
  next one back.
- **Tube, 11 Sep.** Nesting part by part, with the parts first in the
  open row, the program form folded and drawings hidden on tube only.
  Picking a section says which stock line it is and never reserves, in
  the import and New program alike. The section box narrows by kind,
  grade and length. A change in cut count moves lengths on or off the
  shelf (the laser half of the Jobs feature).
- **The import's parts tick is built (697194e).** This is item 1 of the
  Tube Laser entry's "Pick up next": done. It starts on when the parent
  is obvious (no lines, one line, or one tube-tagged line) and off on a
  job with several lines, where the "parts go under" picker no longer
  appears.
- **Admin "Close this stage"** on any per-item stage, for JOB-0021 and old
  jobs that will never be logged.
- **Tests:** `npm test`. **Docs:** `LASER-4KW-HOW-IT-WORKS.md`,
  `TUBE-PARTS-BY-SECTION-PLAN.md` (with Jobs), `FLOOR-NESTING-PRINTOUT-PLAN.md`.

### SQL this conversation wrote

- `setup-laser-cutting-time.sql` (laser_programs.cut_minutes,
  actual_minutes): live yes, 200 on 14 Sep; practice yes, Heinrich's
  check on 8 Sep.
- `setup-shift-laser-flag.sql` (shifts.cuts_laser): live yes, 200 on
  14 Sep; practice yes, same check.
- Both are in `CHECK-which-setup-files-are-run.sql`. Like every laser
  and shift file they are deliberately not in `build-test-database.sh`.
- Columns my code relies on that others wrote, all 200 on live 14 Sep:
  laser_programs.stock_item_id, job_quote_items.material_type,
  shifts.cuts_tube_laser.

### Built but not yet tested by Heinrich

1. **Close this stage.** JOB-0021 on the tube Packing screen should read
   "All 39 packed — close this stage".
2. **Nesting part by part.** Log part of a tube job, then check a logged
   part reaches the next stage without the rest. Not shown on practice.
3. **Import parts tick.** A real report with a Part Info sheet onto a job
   with several lines: the tick starts off and no parent picker shows.
   This replaces the Tube Laser entry's multi-line "which line" test.
4. **Section narrowers on live.** Kind should read Channel, Equal Angle,
   Rectangular Tube and so on; a blank Kind means that section has no type
   in the Structural Steel list.
5. **No double booking.** Import onto a job whose stock is already set
   aside on Materials: the rack drops once, not twice.
6. **Cut takes a length.** A tube program with a section picked, stock set
   aside on Materials, Cut one: one length off and the reservation's used
   count up one; Undo one puts it back.
7. **Stop and delete on the plate laser** (8 Sep): not confirmed tried on
   the floor.

### Waiting on Heinrich

- The five questions in `FLOOR-NESTING-PRINTOUT-PLAN.md`.
- Hide drawings on the plate laser too? Kept for now; Prince uses them.
- How SigmaNest shows cutting time on Prince's screen: day-shift programs
  carry 1 minute, so the day shift reads 0% efficiency.
- Tag some tube job lines with their material type on the Items tab.

### Practice data left by testing

- Program STOCK-CHECK (00006) on JOB-0011; TIME-TEST-2 cancelled;
  JOB-0004's tube stage closed; JOB-0004 has nested counts logged
  (40 of 100, 10 of 50). Delete or ignore.

### Pick up next

1. The laser half of parts-by-section, once real lines are tagged. The
   parts tick decides what a match does (plan, commit 63750eb).
2. The floor printout once the questions are answered: keep the nests on
   import (SQL), then the tube PDF, then plate.
3. Make a per-item stage re-check itself when its lines change, the cause
   behind JOB-0021.

---

## 14 Sep 2026 — Planning (main conversation), after the wrap-ups

- **Pushes now go through the main conversation only** (rule in
  `CLAUDE.md`). The others commit their own work and stop; Heinrich
  brings the push to the main conversation, which reviews the queue with
  him first.
- **Ownership list updated** in `CLAUDE.md`: Laser production owns the
  Tube Laser tab; the dropdowns and Production tab conversation is listed.
- **`setup-job-documents-move.sql` has now run on practice too**
  (Heinrich, 14 Sep). The Laser production entry's waiting item for it
  is done: it is on both databases.
- **Check results.** Heinrich pastes a read-only check's result into the
  main conversation, which writes it into this file under the area that
  asked for it, so that conversation finds it with `/monday`.

---

## 14 Sep 2026 — Check results for Stock Manager: sections and materials

`CHECK-sections-and-materials.sql`, run on **live** by Heinrich and pasted
into the main conversation. The full result, exactly as it came back, is in
`docs/check-results/2026-09-14-sections-and-materials.md`.

- **Live holds** 71 sections, 10 section kinds, 12 materials and 75 structural stock lines.
- **Clean (no rows):** checks 2, 5, 7, 8, 10 — no size spelled two ways by the check's rule, no kind or material off the lists, no look-alike materials.
- **3. Sections with no material:** 59 of 71. The large one; it is what sections step 3 onward exists for.
- **1. Entered twice:** SHS 38.1x38.1x1.6, both with no material.
- **4. Sections with no kind:** 2 — "RHS 76x50x1.9mm / Mild Steel" and "SHS 25X25X1.9".
- **6. A section's material off the Material Types list:** SS304.
- **11. Stock lines saying SS304** where Sections uses the full name: 9.
- **9 and 12, the same 6 stock lines:** each sits on a section that is not in Sections, so it finds no price row: 254x146x37 / S355, RHS 100x50x2mm / SS304, Round Tube 88.9 X 2.5mm wall / Mild Steel, Seamless Pipe NB20 SCH160 (26.7 x 5.56mm) / Mild Steel, SHS 50x50x1.5mm / SS304, SHS 50x50x2mm / SS304.

Seen in the list by the main conversation, not flagged by the check — for
the conversion step to judge, not decided:

- Probably one section under two names: "I-Beam 254x146x37KG" (section) and
  "254x146x37" (stock line); "Seamless Pipe NB20 SCH160 26.7 x 5.56" and the
  stock line's "(26.7 x 5.56mm)".
- Imperial sizes written two ways, which the check's rule treats as different
  numbers: "SHS 76x76x2mm" and "SHS 76.2x76.2x2mm"; round tube 19mm and
  19.05mm. Heinrich to say whether each pair is one real size.
- "Round Bar: 48.4x3.5" is a tube size filed under Round Bar; "Round Tube
  48.4 X 3.5mm wall" also exists.
- "Round Tube 42mm x 1." is cut off.

**Heinrich answered, 14 Sep:**

- Imperial pairs are one real size each (SHS 76x76x2 = 76.2x76.2x2; round tube 19 = 19.05). The difference is hand-typing, so the conversion should merge them to one name.
- "Round Bar: 48.4x3.5" is a mistake; it is the round tube.
- "I-Beam 254x146x37KG" and the stock line "254x146x37" are the same beam.

---

## 14 Sep 2026 — Check results for Jobs page: imported parts intact

`CHECK-imported-parts-intact.sql`, run on **live** by Heinrich and pasted into
the main conversation. Full result: `docs/check-results/2026-09-14-imported-parts-intact.md`.

- **The parts are whole.** Result 2 (lines with no description) is **0** and
  result 3 (parts whose parent is missing) is **0** — the two the Jobs entry
  was waiting on. `setup-job-line-stock-code.sql` damaged nothing.
- Live has 763 job lines: 735 own lines and 28 parts. No part has a zero
  quantity; 3 carry a length. All 28 parts were listed and read.
- **The check shows only its last result in the Supabase editor**, because it
  is five separate queries. Results 1 to 4 were re-run as one table (query in
  the results file). Worth folding the check into one table so it cannot
  happen again — the Jobs conversation's file, so not changed here.
- **Question for Heinrich, not yet answered:** JOB-0079 has "03.163.99.38.9"
  and "03.163.99.38.9 Copy", both 22 off at 80.79, under a line called just
  "parent". Real second part, or the same part imported twice?
- No part has a stock code; several part descriptions are really codes
  ("BRLG-RANG- BRKT-01 P-001 LH", "Tressel P-001.1 950mm"). The same story as
  `setup-copy-description-into-stock-code.sql`, for parts. Not urgent.

---

## 14 Sep 2026 — Check results for Stock Manager: fasteners

`CHECK-fasteners.sql`, run on **live** by Heinrich and pasted into the main
conversation. Full result: `docs/check-results/2026-09-14-fasteners.md`.

- **Live has only 4 fastener stock lines**, against lists of 10 types, 5
  grades and 3 finishes. Converting existing lines is a small job.
- **Clean (no rows):** 1 (nothing entered twice), 2 (no type spelled two
  ways), 4 and 5 (every grade and finish is on its list), 7 (every diameter
  is a whole metric size), 8 (nothing filed under Stores as "Fasteners").
- **3. Type not on the list:** "Bolts" (1 line). "Hex Bolts" (1) is on it;
  "Bolts" is probably the same thing typed loosely.
- **6. Missing a detail:** 2 lines with no grade, 1 with no material.
- **In use:** types Bolts 1, Hex Bolts 1, Screws 2; grade 4.6 on 2, blank on 2;
  finish ZP on all 4; material MS on 3, blank on 1; diameters M10 and M4, 2 each.
- The five fastener questions in the Stock Manager entry are still open.

---

## 14 Sep 2026 — Jobs page: JOB-0078 "stuck on packing", and two gaps for Laser production

`CHECK-job-stuck-on-packing.sql` (new, read-only, one result table; change
the job number on its third line for any other job), run on **live** by
Heinrich.

- **It was not packing.** Packer is done (Patric), all 17 parts packed in
  full. The Laser stage is open because program **10418** (16mm Mild Steel)
  is 0 of 1 cut; 10415, 10417 and 10420 are cut. `syncLaserStagesFor`
  closes Laser only when Nesting is ticked and every program is cut.
- **Why everything after packing waits:** Bending onwards work the three
  bumper parents. `itemFlowLimit` holds a parent at 0 while a stage that
  cuts its parts is not cleared, so every later stage waits on Laser.
- **The floor fix, Heinrich or Prince to choose:** if 10418 was cut, tick it
  cut and Laser closes itself. If it was never needed, cancel it and tick
  Laser by hand on the job (see gap 2).

**Two gaps, for Laser production. Not built, not decided:**

1. **All packed, a program still uncut, and nothing says so.** A job reaches
   packing on its first sheet cut (`laserStatusRows`), so the packer can
   finish while a program is untouched; the job then leaves Laser Status
   and sits on Laser with no sign why. Suggestion: say it where someone
   will act, e.g. on the program in Cutting or on the job's Production
   card: "all packed, program 10418 not ticked cut".
2. **Cancelling a program does not re-check the laser stage.**
   `syncLaserStagesFor` runs only after a cut count changes
   (`useLaserPrograms.js`, near line 951) and after Nesting is ticked (near
   1028). A job whose last uncut program is cancelled keeps Laser open until
   someone ticks it by hand. Suggestion: the cancel path runs the same sync
   for that program's jobs; decide what un-cancelling does.

Ruled out on this job but true in general: a packing stage with no machine
set (`cuts_made_on` blank) counts every plain line, tube lines included, so
it could never fill on a job with tube lines. Packer is tagged laser on
live, so this is not biting today; it would if that tag were cleared.

---

## 14 Sep 2026 — Laser production: tube floor printout, and a job for Jobs page

**Built and committed, not pushed (2de848d).** A Print button on each tube
program, on Cutting and in the opened program on Nesting: page 1 with the
program number, what to draw from stores and every part; then a page per
nest. `setup-tube-laser-nests.sql` (`laser_programs.nests`) **has run on
practice and live** (Heinrich, 14 Sep). Heinrich still to try it on
practice before push: import a report, Print from both screens, portrait
and landscape. How it works: `docs/TUBE-LASER-HOW-IT-WORKS.md`, "The floor
printout".

**For Jobs page: a Print on the job that prints every tube program for it.**
Decided by Heinrich 14 Sep as its own piece of work, after the program
button is proven. Not started. What it needs:

- A button on the job page (Jobs owns the page; nothing in `src/laser`
  needs to change for it).
- The programs for the job are the tube laser's `laser_programs` rows
  (machine "Tube Laser", not cancelled) linked through
  `laser_program_jobs`, each carrying `jobs` as the laser hook builds
  them (`job_id`, `job_number`, `customer`).
- Print each with `printNestingSheet(program, jobLines, { orientation })`
  from `src/laser/nestingPrint.js`, where `jobLines` is the job's
  `job_quote_items`. It opens one tab per program today; one PDF for the
  whole job would need `printNestingSheet` to draw into a document it is
  handed. Ask Laser production (or change it and say so in
  `nestingPrint.js`), since both buttons share it.
- Ask Heinrich: portrait or landscape by then (he is trying both now), and
  whether cut programs are included.

---

## 14 Sep 2026 — Jobs page conversation (afternoon): stock pull list, JOB-0078

### Done and live

- **Stock from stores on the job sheet** (cff2729). Page 1 lists every
  reservation from the job's Materials tab: Reserved, Taken, Outstanding
  and an empty Pulled box, grouped "For the job, no stage yet", then
  stage by stage in flow order, then "Against a stage no longer on this
  job". Handed-back ones are left off; fully used ones show 0. The Code
  column prints only when an item has one; nothing prints when nothing
  is reserved. Heinrich chose: everything reserved with the outstanding
  amount, grouped by stage, no shelf location for now, the old job-level
  Materials block left alone. Code in `src/jobs/stockFromStores.js` with
  `stockFromStores.test.js`; mirrors `Materials.jsx`, and both say so.
  **Went live in another conversation's push before Heinrich tried it**
  (`CHECK-what-is-live.cjs` finds both new strings on live).
- **`CHECK-job-stuck-on-packing.sql`** (d65ef44), one result table, any job.
  JOB-0078's result and the two Laser gaps are in the entry above.

### Every setup file this conversation wrote

None this session; no database change. The morning Jobs entry's table
stands. `setup-copy-description-into-stock-code.sql` is still not run.

### Built but not yet tested by Heinrich

1. **Stock from stores (new, live).** Open a job with a few reservations,
   one with no stage and one handed back, and print the job sheet. The
   groups, the numbers against the Materials tab, the handed-back one
   absent, no Code column unless an item has a code.
2. Still untested from the morning entry: tube material type on a line;
   stock code matching and Add to Customer Stock; the Code column on the
   job sheet, delivery note and invoice request; the Materials tab
   (reserve, take now, release, the picker's filters); the tube
   drawdown (Cut one / Undo one); a buy-out PO received onto the job;
   Book out per bar on Cut To Size; Jobs search by SigmaNest number.

### Waiting on Heinrich

- **JOB-0078:** tick program 10418 cut if it was cut, or cancel it and
  tick the Laser stage by hand.
- **JOB-0079:** "03.163.99.38.9" and its "Copy", both 22 off: a real
  second part, or imported twice?
- `setup-copy-description-into-stock-code.sql`: confirm the job list, run
  on live.
- Tag a few tube lines with a material on a real job; the two open
  questions in `docs/TUBE-PARTS-BY-SECTION-PLAN.md`.
- Whether to add the shelf location (`loc`) to Stock from stores: one
  column, no database change.

### Pick up next

1. Whatever Heinrich's test of Stock from stores turns up.
2. Laser production's request in the entry above: a Print on the job for
   every tube program, once the program button is proven. Ask portrait or
   landscape, and whether cut programs are included.
3. Tidy-up: the dead New Job pop-up code in App.jsx; fold
   `CHECK-imported-parts-intact.sql` into one result table.
4. When Stock Manager converts section names, the same pass rewrites
   `job_quote_items.material_type`.

---

## 15 Sep 2026 — Dropdowns and the Production tab: Info Request

### Done, and live before Heinrich tried it

**Info Request**: a floor operator flags from a Production card that the
job is standing until the office answers. Steps 2 to 5 went live on
14 Sep in another conversation's push; `CHECK-what-is-live.cjs` finds
"Send Info Request", "Standing: waiting on office", "Office answered"
and "standing in all" on live. The rules are in `CLAUDE.md` (Decisions)
and `src/lib/infoRequests.js`, with tests.

1. **Table** (cef0068): `job_info_requests`, one row per request, open
   then answered or cleared, never deleted.
2. **Floor** (6d5c6ed): an Info Request button beside Mark urgent and
   Flag shortage (orange since a74d058, another conversation's styling).
   Pop-up: what's needed, what exactly, optional photo. The stage goes
   into a red "Standing — waiting on office" pill on top of the
   department, with a red card and, when opened, a red box with
   "Got it / sorted". "n standing" on the overview card. A bell message
   to the job's sales rep, or every admin when there is none.
3. **Office** (d3a5558): a red banner under the header on every screen,
   the rep's own jobs and every one for admins, not dismissable. Answer
   takes a reply and optional files, filed on that stage's card; the
   operator gets a bell message; the answer stays on the card 3 days.
4. **Job page** (bcd1068): a red strip with Answer; past requests in a
   shut "Info Requests" pill, each with how long the job stood.
5. **Printout** (a33f7ae): an "Info Requests" section on the job sheet's
   Job History page, with the total time stood.

Also fixed in cef0068: `make-policies-idempotent.cjs` wrapped policies in
named dollar-quote blocks a second time, so `setup-ALL.sql` had two
broken invoice-notes policies. It now matches `setup-invoice-notes.sql`.

### Every setup file this conversation wrote

| File | Adds | Practice | Live |
| --- | --- | --- | --- |
| `setup-info-requests.sql` | table `job_info_requests`, `updated_at` trigger, read/add/update rules, no delete rule | yes, 200 with the job embed (checked 15 Sep) | yes, 200 (checked 15 Sep) |

The trigger and rules cannot be seen over REST. Heinrich reported
"ready on both" on 14 Sep, and that result line checks the UPDATE rule
and the trigger. Registered in `build-test-database.sh` and
`CHECK-which-setup-files-are-run.sql`.

### Built but not yet tested by Heinrich (all of it live)

1. **Raise one:** Production, a department, open a stage, Info Request.
   Pick what's needed, type, add a photo, send. The red card, the
   Standing pill, "1 standing" on the overview card.
2. **Who is told:** the job's sales rep gets a bell message; on a job
   with no rep, every admin does.
3. **The banner:** as the rep and as an admin (Refresh skips the
   5-minute wait). Answer with a drawing attached: the drawing in that
   stage's documents on the card, the answer on the operator's card, the
   operator's bell message.
4. **Got it / sorted** on the card clears it, and the banner goes.
5. **Job page:** the red strip with Answer; afterwards the request in the
   shut Info Requests pill with the time it stood.
6. **Printout:** print the job sheet of a job with an answered and an
   open request; the section and the total.
7. Still untested from this conversation's 14 Sep entry: the ready and
   waiting pills and "x of y", type-to-find on the boxes listed there,
   Customer Stock part number and description, Manager lists sorted.

### Waiting on Heinrich

- The tests above. No SQL to run, no permission ticks.
- My call, not asked: Answer on the job page is open to anyone who can
  open the job, not only the rep and admins. Say if it should be
  narrower.

### Not built, by choice

- A text, email or push alert for when nobody has the app open.
- A cross-job report of hours lost waiting, per customer or rep.
- Info Request on Laser Status, Cutting or Nesting: Laser production's
  screens, so ask that conversation first.

### Pick up next

1. Whatever Heinrich's test turns up.
2. Offer again, as part of work he is testing: lifting the Production
   tab out of App.jsx into its own file. Flagged, not decided.
3. Small: the single-stage detail header still says plain Ready or
   Waiting, without the stage name.

No practice data left by this conversation; it never signed in.

---

## 15 Sep 2026 — Planning (main conversation): PDF viewer, Invoicing, shortage reason, the pushes

### Done and live (14–15 Sep)

- **Every PDF is drawn by PDF.js** (`src/PdfViewer.jsx`; 64f9d29, eb946c4).
  All pages and zoom on phones and tablets. **PDF.js 4.10.38, pinned**,
  for the Huawei MatePad at Bending (Huawei's browser, Chrome 114 engine,
  no Chrome); 6.x drew it blank. Heinrich confirmed the tablet shows PDFs
  now. Too-old browsers get the frame (`src/lib/pdfSupport.js`, tested). If
  a PDF cannot be drawn, it says so in red with the browser version.
- **"Can print and download PDFs"** (`profiles.can_print_pdfs`): Open /
  Print and Download for admins and the tick only; delivery notes for
  everyone. Ticked on live by SQL: Andries, Chanté, Gawie Labuschagne,
  Mark Bezuidenhout.
- **Orange alarm buttons** (a74d058): Mark urgent, Flag shortage, Info
  Request on Production, the nesting screen and Laser Status.
- **Invoicing** (83ed2c0): the Invoicing stage's Production card has
  **Request invoice**. It makes the same request as the job page's
  "Invoice Now (all remaining)" and ticks the stage. Records → Invoice
  Requests folded into Records → Invoicing as the "All requests" pill.
  Built here on Heinrich's say-so; invoicing is otherwise the Jobs page
  conversation's.
- **Shortage "What happened?" is required** (c0039a8): step 3 of Laser
  production's shortage plan, built here on Heinrich's say-so. Steps 4
  (cancel) and 5 (uncut-program warning) are still Laser production's.
- **Pushed after review, for other conversations:** the tube Cutting
  screen grouped by job, Stock Manager's checks, Info Request steps 1–5,
  Stock from stores on the job sheet, the tube floor printout, shortages
  step 1, the JOB-0078 check, the extra-stages check, and CLAUDE.md and
  handover notes. Every push was checked live with `CHECK-what-is-live.cjs`.
- **Egress on 14 Sep:** 5.795 GB of 5 GB (116%). About 650–900 MB a day
  on 7–11 Sep, 110 MB Saturday, 55 MB Sunday. The 5-minute refresh only
  went live 07:54 on 14 Sep, so 15 Sep is the first fair day. Figures
  and the Logs explorer change are in the memory note.

### Every setup file this conversation wrote

| File | Adds | Practice | Live |
| --- | --- | --- | --- |
| `setup-pdf-print-permission.sql` | column `profiles.can_print_pdfs` | yes, 200 (checked 15 Sep) | yes, 200 (checked 15 Sep) |

Registered in `build-test-database.sh` and `CHECK-which-setup-files-are-run.sql`.
Not setup files: the one-line updates ticking the four people above
(Heinrich pasted the result); Prince's line was given, not confirmed run.
Other conversations' SQL checked here: `setup-shortage-reason-and-cancel.sql`
200 on both (15 Sep), `setup-info-requests.sql` and
`setup-tube-laser-nests.sql` 200 on both (14 Sep).

### Built but not yet tested by Heinrich

1. **PDF viewer:** what someone without the print tick sees ("not ticked
   for you" under a job sheet or PO, buttons under a delivery note). A
   drawing on the Bending tablet.
2. **Request invoice on live**, once someone has Invoicing ticked. Also
   someone with only the Invoice Requests tick: Records → Invoicing
   should show them only All requests.
3. **Shortage "What happened?"** on live: the button stays off until it is
   filled; the words show on the Nesting row.
4. **Orange buttons** on Laser Status (not seen on screen).
5. **Others' features, tried here only as one admin:** Info Request as a
   rep who is not an admin, on a job with no rep, and "Show all" with more
   than three; the tube printout's nest pages on a fresh import.

### Waiting on Heinrich

- **User Management:** tick **Invoicing** in the stages of whoever should
  press Request invoice. The Production tab shows people only their own
  stages.
- Jobs under Records → Invoicing with no request (finished before 15 Sep):
  he is sorting them by hand.
- Prince's print tick: confirm the SQL ran, or tick it in User Management.
- **Egress:** read Usage → Egress for 15 Sep. Ask staff to reload tabs
  left open since before 11 Sep. Decide the 1-minute refresh after the
  25 Sep reset.

### Practice data left by testing

- JOB-0002: two Info Requests marked "TEST by Claude", one answered with
  `TEST-answer-note.txt` on the welding card and one cleared with a red
  test photo. A job sheet under Records → Process Sheets. A shortage
  "TEST by Claude: gusset × 2" (plate, flagged), to cancel once step 4
  exists.
- "Invoicing" added to practice's Job Process Types and to the Test
  account's stages; Invoicing stages on JOB-0007 and JOB-0010 (both
  Complete now); a request on JOB-0010.

### Pick up next

1. The Egress chart for 15 Sep. If weekdays are still over about 160 MB,
   take master lists off the timer.
2. After 25 Sep: `BACKGROUND_REFRESH_MS` back to 60000, or not.
3. Whatever Heinrich's tries above turn up.

---

## 15 Sep 2026 — JOB-0068 Bending lock (a short Production tab question, handed to Jobs page)

### What was found

- Bending on JOB-0068 (Each) was held by **Laser - External**: open,
  earlier in the flow, and on "every item". `blockingStages` is
  whole-stage. `itemFlowLimit` skips only a stage that does not take the
  line, and a stage on every item takes every line, so every line was
  capped at 0, the in-house laser ones included. Laser - External is not
  a laser lane either: `isPlateLaserProcess` excludes /external/ by name.

### Decided by Heinrich

- Two new cut methods, **Laser - external** and **Machining - external**,
  remembered on the stock part like the others. The two external stages
  get "Cuts:" set to them, so they hold back only their own lines.
- One of the packers logs external laser parts back on Laser - External's
  Production card.
- All of it is built in the Jobs page conversation. The full brief was
  sent there; it has committed the SQL (6c02395), with the dropdown
  entries still to come.
- Standing rule, now in `CLAUDE.md`: always the proper fix, not a floor
  workaround.

### Every setup file this conversation wrote

None. `setup-made-on-external.sql` is the Jobs page conversation's
(6c02395). It holds check rules only, which the REST API cannot see, and
its commit says it is not yet run on either database.

### Built but not yet tested by Heinrich

Nothing was built in this conversation.

### Waiting on Heinrich (in the Jobs page conversation)

- Its questions: the four from 10:03 (Assembly, the 7 CNC jobs, where
  Drilling sits, start step 1), plus who logs Machining - External back
  and where that stage sits in the flow. Answer them there, unless
  already done.
- Paste `setup-made-on-external.sql` on practice, then live, before the
  dropdown entries are pushed.
- Once the entries are live, in one sitting: Laser - External to "Cuts:
  Laser - external" (and Machining - External to its own), tag
  JOB-0068's external lines, and tick the packer for the Laser - External
  department.

### Pick up next

- Nothing left for this conversation. In the Jobs page conversation,
  check after setup that JOB-0068's Bending card reads "Partly ready:
  x of y" and sits under Ready now.

---

## 15 Sep 2026 — Laser production: shortages you can take back, with who, why and when

Asked 14 Sep: wrong shortages were coming through, mostly parts only
waiting to be cut. Five steps, decided with Heinrich on 14 Sep (memory
note `shortage-undo-and-reason`, and the new bullet in `CLAUDE.md`).

### Done and live

- **Step 1 (5d24790):** the To nest row on both lasers says who flagged
  the shortage, from which stage, when (red after a day) and why. The
  reason reads in words everywhere it was a bare code: the Production
  nesting block, the re-cut card, the Shortages screen, the job sheet
  (`SHORTAGE_REASONS`, `shortageReasonText`).
- **Step 2:** `setup-shortage-reason-and-cancel.sql`, on both databases.
- **Step 3 (c0039a8, built by Planning on Heinrich's say-so):** "What
  happened?" is required on the flag form.

### Built and committed, not pushed (for the main conversation)

- **334ac48 — Cancel shortage (step 4).** Asks why; removes the catch-up
  stages and the program link (a "job removed" line in the program's
  history); status written last; tells the flagger. Refused once cut, or
  once a program carrying it has sheets cut. A program left empty is
  named, not deleted. Cancelled is closed in the To nest rows, the program
  picker, Laser Status re-cuts, `refreshShortageStatus` and the job sheet;
  the Shortages screen has a shut Cancelled pill.
- **22a2fb9 — "Shortages you flagged"** on the Production tab's front
  screen, only when the person has one flagged or on a program, with
  Cancel on each (option A, 15 Sep).
- **eae0963 — the uncut-program warning (step 5).** The flag form lists
  the job's programs not fully cut on the chosen laser ("0 of 1 sheets
  cut", "stopped at the machine"). Warns, never blocks.

The queue also holds commits that are not this conversation's:
6c02395 (Jobs page, cut-methods SQL) and 11006dc (CLAUDE.md and the
JOB-0068 entry).

### Every setup file this conversation wrote

| File | Adds | Practice | Live |
| --- | --- | --- | --- |
| `setup-shortage-reason-and-cancel.sql` | columns `shortages.reason_note`, `cancelled_by`, `cancelled_at`, `cancel_reason` | yes, 200 (checked 15 Sep at wrap-up) | yes, 200 (checked 15 Sep at wrap-up) |

Proven on pglite, run twice. Registered in `build-test-database.sh` and
`CHECK-which-setup-files-are-run.sql`; `setup-ALL.sql` regenerated.

### Built but not yet tested by Heinrich

None of 3 to 5 was seen on screen here: the preview would not start
beside another conversation's dev server. (`CLAUDE.md` says what to do
instead: navigate the Browser pane to that server.)

1. **Step 1 on screen:** open a re-cut on the Laser 4kw Nesting screen;
   the "Flagged by … · Reason: …" line under its parts.
2. **Step 3 on live** (also on Planning's list): the button stays off
   until "What happened?" is filled.
3. **Cancel shortage:** from To nest (practice JOB-0002, "TEST by Claude:
   gusset × 2"); from the Shortages screen on one already on a program (it
   comes off, the program's history says so, an emptied program is
   named); the refusal once that program has a sheet cut; the Cancelled
   pill; the job sheet's "Cancelled by …"; the flagger's notification.
4. **Shortages you flagged:** flag one, see it on the Production front
   screen, cancel it there.
5. **The warning:** flag on a job with an uncut program; on a mixed job
   before and after picking the laser; tube programs say lengths.

### Waiting on Heinrich

- The tries above, then the three commits to the main conversation.
- The tube operator flags from the Tube Laser tab's Packing screen and
  sees "Shortages you flagged" only if he opens Production. Say if he
  needs it on his Packing screen too.
- The two JOB-0078 gaps (14 Sep entry): not decided.

### Practice data left by testing

- JOB-0002: "TEST by Claude: gusset × 2" (plate, flagged), left by
  Planning for the cancel to be tried on.

### Pick up next

1. Whatever Heinrich's tries turn up.
2. JOB-0078's gaps: cancelling a program should re-run
   `syncLaserStagesFor` for its jobs (decide what un-cancelling does);
   "all packed, a program still uncut, nothing says so" sits beside the
   step 5 warning.
3. A per-item stage re-checking itself when its lines change (JOB-0021),
   from the 14 Sep Laser production entry.

---

## 15 Sep 2026 — Jobs page: extra stages per line, and the external cut methods (JOB-0068)

Heinrich: Bending listed all 20 lines of a job when 5 needed bending; and
JOB-0068's Bending was held by Laser - External (handed over from the
Production tab conversation). Planned with him, then "plan and test all
steps as far as possible". Rules in `CLAUDE.md` under Decisions.

### Committed (this conversation pushes nothing)

- `669b13a` `CHECK-extra-stages-before.sql`, read-only; its live result
  is in this conversation (the made-on tags are switched on on live;
  nothing carried Welding).
- `6c02395` `setup-made-on-external.sql`: **on practice and live**
  (Heinrich, 15 Sep).
- `7a39a90` Made-on list: Laser - external, Machining - external, CNC
  shown as "CNC Lathe", Welding retired (kept and shown where already
  set, `madeOnChoices`). A stage rename now also rewrites
  `job_allocations.process_name`, `job_info_requests.stage_name` and
  `bom_stages.process_name`. **Safe to push now.**
- `ae8c652` `setup-extra-stages.sql`: **not yet run on either database.**
- `3cd0817` The rules: `src/jobs/extraStages.js` (11 tests) behind
  `stageTakesItem`, `itemFlowLimit` (the line's own order wins,
  `comesBeforeForLine`), `blockingStages` (two extra stages never block
  each other whole), `stageHasNothingToCut`; the Job Process Types
  switch "Extra stage: marked lines only"; an extra stage is added to a
  job as Each. Safe to push before the SQL: nothing changes until a
  stage is switched on, and the switch refuses to save without it.
- `97b0653` The Then box (`src/jobs/ExtraStagesBox.jsx`) on every line
  and part, remembered on the stock part, carried onto every new line
  (New Job, Add item, Add part, both part imports, quote import, a typed
  stock code, Copy job); "Nothing extra on the rest"; the job sheet's
  "Made on, then" column ("Laser > Bending"); a rename rewrites the
  lists. **Must not go live before `setup-extra-stages.sql` is on both
  databases**: the stock field map saves `extra_stages` on every stock
  save.

Checked: names, build, 93 tests after every step; both SQL files proven
on pglite (twice, and with tagged rows); the Then box driven on
`ui-preview.html` (add by typing, swap, remove, None, read only), where
it overlapped its None button by 32px until fixed. Not tried signed in;
the job sheet not drawn.

### Database changes (announce to the others)

- `job_quote_items.extra_stages` and `stock_items.extra_stages` (text[];
  null = never set, `{}` = nothing extra); `process_type_settings.only_marked`
  (boolean, default false).
- The three made-on check rules now allow `laser_external` and
  `machining_external`. `setup-made-on-tag.sql` and
  `setup-made-on-welding.sql` write shorter lists: if either is re-run,
  run `setup-made-on-external.sql` after it.

### Built but not yet tested by Heinrich (practice, signed in)

1. JOB-0068's path: a line tagged Laser - external; Laser - External set
   to "Cuts: Laser - external"; the Bending card reads "Partly ready".
2. Welding gone from the dropdowns; CNC reads CNC Lathe.
3. Rename a practice stage that has a reservation aimed at it.
4. After the SQL: Bending and Drilling set to Extra stage; on a job, the
   Then box (add, order, None, Nothing extra on the rest); Bending lists
   only its lines; one part cut, machine, bend and another cut, bend,
   machine each wait for their own previous step; the job sheet column.
5. The part remembers: the next job with it comes in with its list; a
   stage taken off does not come back.

### Waiting on Heinrich

- Paste `setup-extra-stages.sql` on practice, then live.
- Once `7a39a90` is live, in one sitting: Laser - External to "Cuts:
  Laser - external"; Machining - External to "Cuts: Machining -
  external" **and** Extra stage (it is a first step for a part from the
  supplier and a later step after an in-house cut); tag **every** line
  on JOB-0068; tick the packer for both external departments.
- Rename "Machine/Drilling/CNC" to "CNC Lathe" (after `7a39a90` is
  live); add Drilling; set Bending and Drilling to Extra stage; tick who
  drills. Keep every extra stage above Welding in Job Process Types.
- Still open: Assembly (keep, or relabel "No machine (assembly /
  bought in)"; it is the only way to say a plain line is cut on no
  machine); whether any of the 7 open jobs on Machine/Drilling/CNC is
  drilling work to move to Drilling.

### Noticed, not changed

- Copy job has never copied a line's made-on.
- The tube material box on a line uses the same input padding the Then
  box had, so it probably spills over its neighbour the same way.
- `CHECK-job-stuck-on-packing.sql` repeats `stageTakesItem` in SQL and
  does not know `only_marked` (matters only if a packing stage were made
  an extra stage).
- The preview tool reads the `.claude/launch.json` one folder up; a
  `stock-control-5175` entry was added there for when another chat holds
  5173. That folder is not in git.

### Pick up next

1. Whatever Heinrich's practice test turns up.
2. JOB-0068 after setup: its Bending card "Partly ready: x of y" under
   Ready now.

---

## 15 Sep 2026 — Planning (evening): shortage work tested and pushed; Laser quoting brief

### Pushed

- c1661c1..0acba14 on Heinrich's "you test and push": the SQL file for
  the external cut methods, Cancel shortage, "Shortages you flagged",
  the uncut-program warning, and notes. Tried on practice first as the
  admin account: both cancels (one on program TESTCLAUDE1: link, catch-up
  stage and status went, "job removed" in its history), the Cancelled
  pill, the warning for no laser / plate / tube. Confirmed live with
  `CHECK-what-is-live.cjs`.
- Not tried: the refusal once a program has sheets cut, the notice to a
  different flagger, a packer's (non-admin) view.
- Practice leftovers: empty program TESTCLAUDE1; two cancelled TEST
  shortages on JOB-0002.

### Laser quoting (new area)

- Heinrich wants a DXF laser quoting module, built by a new "Laser
  quoting" conversation. Decisions, what ERS's DXFs are really like,
  proven figures and seven open questions: `docs/LASER-QUOTING-PLAN.md`.
  `/monday Laser quoting` now points there.
- For Quoting: its plan's step 11 laser calculator should call this
  module; the new module prices from its own new tables (speed per
  material, thickness and cut method), not `quote_cutting_speeds`.

### Still queued, not pushed

- The Jobs page's five commits (7a39a90 to 2f7eb3e). 97b0653 must not
  go live before `setup-extra-stages.sql` is on practice and live.

---

## 16 Sep 2026 — Production tab: a job's parts listed in order (JOB-0068)

Heinrich: the Each parts display on JOB-0068, a job with many parts, is
confusing; arrange the parts alphabetically and numerically. Found: every
Each list came out in no order at all (Production loads job lines with no
order; the laser screens by random uuid), with parts of different lines
mixed and nothing to tell apart three identical names under three lines
(JOB-0078). His answers, 16 Sep: grouped under the line's name; lines
A to Z; the printed job sheet in the same order; a finished part keeps
its place.

### Committed with this entry (not pushed)

- `src/jobs/lineOrder.js` (13 tests): `compareLines` (name with numbers
  read as numbers, then length, code, quote order, id) and
  `groupJobLines` (lines A to Z, a line's parts A to Z under its name).
- `QtyProgressControl` takes `jobItems` (the whole job) and draws the
  groups: the Production card, Laser Status, Tube Laser Packing, Tube
  Laser Status and tube Nesting. `laserStatusRows` and
  `laserNestingData` rows carry `jobItems`.
- The packer's non-Each "To pack" list is grouped the same way.
- `printJobSheet`: lines A to Z, parts A to Z under each, by the name the
  sheet prints.
- Unchanged on purpose: the Items tab, delivery notes, invoice requests
  (quote order).
- For Laser production: `LaserStatus.jsx` and `NestingView.jsx` gained
  one prop each (`jobItems`), plus the To pack grouping.

### Checked

106 tests, names 0 problems, build. The real `QtyProgressControl` drawn
outside the app with JOB-0078-style data: headings per line, Part 2 before
Part 10, the shorter of two same-named tubes first, a Done row in place,
"Waiting on Laser" intact. A three-angle review with a skeptic pass found
no fault in the change. Not tried signed in; the job sheet not drawn.

### Built but not yet tested by Heinrich (practice, signed in)

1. JOB-0068 (or any job with parts) on a Production card set to Each:
   line names as headings, parts A to Z under each.
2. The same job on Laser Status, and a tube job on Tube Laser Status,
   Packing and Nesting.
3. Print the job sheet: lines A to Z, parts A to Z under each line.
4. The Items tab still in quote order.

### Found, not changed

- **Blank screen on Tube Laser > Nesting, FIXED 16 Sep (his "fix
  crash"):** opening a re-cut (a tube shortage not yet on a program)
  handed `QtyProgressControl` a null stage (`useLaserPrograms.js` shortage
  rows, `process: null`; `NestingView.jsx` showed the parts box for every
  row); `process.is_complete` threw and the whole app went blank. In the
  code since 11 Sep. Now the parts box needs `r.process`, and the control
  returns nothing without a stage. Checked by drawing the control with
  and without one; practice has no tube re-cut to open, so not tried on
  screen. For Laser production: one guard in `NestingView.jsx`.
- Test parts added to practice JOB-0011 for the order test were removed
  the same day.
- **1000-row cap on the Production tab:** `fetchProductionQueue` loads
  `job_quote_items` for every job in progress with a plain select, which
  Supabase stops at 1000 rows without an error. Live held 743 lines in
  all on 14 Sep; past the cap, parts silently vanish from Production
  lists. Offered as a separate task.
- Copy job drops a part's line, cut method, length and extra stages, and
  copies in no order. Offered as a separate task.
- The tube program printout sorts TUBING_10 before TUBING_2
  (`nestingPrint.js:96`, compare without numbers). Laser production's.

---

## 16 Sep 2026 — Planning: only 7a39a90 pushed; extra stages held, seven problems for Jobs page

### Pushed

- **7a39a90 alone** (made-on list: Laser - external, Machining - external,
  CNC Lathe, Welding retired; a stage rename also rewrites
  job_allocations, job_info_requests and bom_stages). Heinrich chose to
  push it by itself so JOB-0068 can be set up. Checked on its own in a
  clean clone: built on 0acba14, 82 tests, names 0. Not tried signed in.
- Next for JOB-0068: Laser - External to "Cuts: Laser - external", tag
  its external lines. **Do not switch any stage to "Extra stage"** until
  the problems below are fixed.

### Held: extra stages (ae8c652, 3cd0817, 97b0653, 2f7eb3e) and everything behind them

- `setup-extra-stages.sql` does not answer on practice or live: all
  three columns 400 "does not exist" for over 5 minutes after Heinrich's
  paste on 16 Sep. Ask whether the check returned three `ready` rows
  (if so, `notify pgrst, 'reload schema';`), else paste again whole.
  97b0653 must not go live before those columns answer.
- A review (three readers, each finding re-checked by a skeptic) confirmed
  seven problems. Line numbers are at 2f7eb3e.

**Only once a stage is switched to Extra stage:**
1. `blockingStages` (App.jsx ~5571) drops the hold between two extra
   stages whatever their tracking mode. On batch stages (every stage added
   before the switch, and every shortage catch-up, inserted as batch at
   ~6109) the later one reads Ready and can be ticked first: Machining -
   External before Bending. The job page's "Set this stage to Each" hint
   does not show on the Production card or on catch-up stages. The agreed
   plan said blockingStages stays whole-stage.
2. With both Each, the exempted stage reads "Ready" (isReady true, so the
   readyQty "Partly ready" count at ~5746 is skipped), sits in Ready now
   and in the overview count, while `itemFlowLimit` caps every line at 0.
   blockingStages and itemFlowLimit disagree.
3. A line made on `machining_external` with extra_stages null:
   `routePosition` (src/jobs/extraStages.js ~60) returns null for the
   other stage, so `comesBeforeForLine` falls back to the flow. Bending
   does not wait for the supplier's parts, and Machining - External waits
   on Bending. The first step should beat the flow even when the list is
   unset; the test only covers a set list.

**When lines are marked:**
4. The Then box (src/jobs/ExtraStagesBox.jsx ~103) and "Nothing extra on
   the rest" (App.jsx ~7003) build the new list from the lines on screen,
   which stay stale until openJobDetail reloads (1–3 s). Two quick picks,
   or the button straight after a pick, and the last write wins: a stage
   is lost from the line and from its stock part. Fix: build from the
   latest state, and narrow the button's update with `.is("extra_stages", null)`.
5. Stage rename (App.jsx ~10794) reads marked lines with a plain select,
   capped at 1000 rows, not narrowed to the old name. Past 1000 lines with
   any list (including every `{}`), lines keep the old name and drop off
   the renamed stage, silently. Fix: `.contains("extra_stages", [oldName])`
   and page it (fetchAllRows).
6. The catalogue Replace import (App.jsx ~13524) rebuilds a part without
   `extraStages`, and the autosave writes null over every remembered list.
   It already keeps `madeOn` for this reason; keep `extraStages` the same way.
7. (minor) A parts import that links a typed part to its stock item
   (App.jsx ~4674) does not bring the part's remembered list, unlike a
   typed stock code. Fill it when the line's list is null.

### Queued behind the held commits (not reviewed yet)

- aa7f056 SQL one spelling per material, 7d44afe material by short name,
  c49eb8d / 1f712fd / ae91985 sections step 4 (Stock Manager); efb567f
  parts in order on the floor. They cannot go live until the extra-stages
  commits do, or are reordered.

---

## 16 Sep 2026 — Jobs page: Copy job keeps parts under their lines

Found in a read-only sweep; Heinrich answered the plan the same day
(parts under lines: yes; stock part wins, and must be updated by changes
on a job; quote order: yes; Cut to size list: yes; a failed copy deletes
itself: yes).

### Committed with this entry (not pushed)

- `submitCopyJob` (App.jsx): reads the old lines in quote order; saves
  the lines, then the parts under the copied line (a part needs its
  line's new id); carries cut method, length, tube material and extra
  stages; copies the Cut to size list with nothing cut. Cut method and
  extra stages come from the stock part where it remembers one, else the
  old line; a line with parts keeps its own tag. A failed read now stops
  the copy instead of copying "nothing". A copy that fails partway is
  deleted, as New Job does, and the message says why.
- Two faults in the old copy, both proven on pglite with the old code:
  a job with tube material on some lines and not others could not be
  copied at all (a batch save sends a missing field as null, and
  `material_type` is not null), and the failed copy stayed in the Jobs
  list with its stages and no lines. Every copied row now carries every
  column the database has.
- Guess the rest now remembers a guessed cut method on the stock part,
  where the part has none, as the dropdown already did. The Then box and
  "Nothing extra on the rest" already remembered.
- This touches the copy's extra-stages line from the held `97b0653`. If
  the extra-stages commits are dropped rather than fixed, this spot
  needs redoing.

### Checked

Names 0 problems, 115 tests, build. The real function run on pglite
through a stand-in for the database library (a missing key saves as
null, as it does on Supabase): parts under the right copied line, quote
order renumbered, prices on lines, nothing invoiced or cut, the part's
tag and list winning, the old line's where the part has none, a parent
keeping its own tag, with and without the extra_stages column; a forced
failure on the parts and on the cut list each leave no job behind. The
old code through the same stand-in fails on the mixed-material job and
leaves the half-made job. On practice, signed in: copied JOB-0004 to
**JOB-0012**; its line has both parts under it, 100 and 50 off, 1000 mm,
Tube laser. The cut list and Guess the rest were not tried on screen.

### Built but not yet tested by Heinrich (practice, signed in)

1. Copy a job with parts (JOB-0012 is one already): parts under their
   line, lengths, cut methods, same order as the old job's Items tab.
2. Copy a job with a Cut to size list (JOB-0008): the list comes across,
   nothing cut.
3. A line whose stock part remembers a different cut method from the old
   job: the copy takes the part's.
4. Guess the rest on a job, then add that part to another job: it comes
   in tagged.

### Practice data left by testing

- JOB-0012, the copy of JOB-0004. Remove it or keep it for test 1.

---

## 16 Sep 2026 — Planning (afternoon): 19 commits pushed up to 75d8bcf; packer rules held

### Pushed (Heinrich: "PUSH", after review)

7a39a90..75d8bcf, 19 commits. Clean clone at 75d8bcf: build, 123 tests,
names 0. Reviewed by three readers with a skeptic pass each, plus a
trace of every write of `extra_stages` in the code.

- **Extra stages (Jobs page)**, made safe by fe3ca02: the "Extra stage"
  switch is hidden (`EXTRA_STAGES_SWITCH_ON = false`), `extra_stages` is
  out of the stock auto-save, so the push no longer needed
  `setup-extra-stages.sql`. That SQL still answers 400 on practice and
  live (16 Sep, 15:50). Of the seven review problems: 4, 5, 6 fixed in
  fe3ca02; 1–3 unreachable while the switch is hidden, still to fix
  before it is turned on; 7 (minor) open.
- Parts A to Z on the floor (efb567f); tube re-cut row no longer blanks
  the app (4ea57c1); Copy job keeps parts, cut methods, cut list
  (9748e38); Production tab loads in pages and batches ids (75d8bcf;
  every table it sorts has `id`; nothing on a timer); Sections step 4
  and materials by short name (7d44afe, c49eb8d, 1f712fd, ae91985,
  d280fd2; `master_factor_items.dimensions` answers 200 on both);
  three CHECK files; notes.
- Not tried signed in by Heinrich: any of it. What to try is in each
  commit's message.

### Held, not pushed

- 60200fd and 2b7ffcb (Bending opens with the packer; packing closes
  from later counts) and a8e7892 (their CHECK). The Jobs page
  conversation's review of them was still running and asked for the
  hold. They change how the floor moves; Heinrich to run
  `CHECK-packer-opens-at-push.sql` on live and try them on practice
  before the next push.

### Known gap now live — for Stock Manager

- A section added from the new boxes is stored with its shape's label
  (`addShapedSection`, `type: shape.label`: "Pipe", "Flat Bar", "Square
  Bar", "Hex Bar", "Unequal Angle", "Parallel Flange Channel", "Lipped
  Channel", "Taper Flange Channel", "IPE Beam", "Tee"). The structural
  stock form (`LibraryField pickOnly` over `master.sectionTypes`) and the
  Stock tab's type chips list the stored `sectionTypes` words, so such a
  size cannot be put into stock, and Section Types is read-only now.
  Re-filing an old "Seamless Pipe" row as "Pipe" drops it from the stock
  form. Step 5 (stock form onto the 17 types) closes it; until then add
  sections the old way if they must be stocked.

### Open on live, not from this push — for Stock Manager

- `findFactor` matches the full grade name only, `findPrice` also the
  short name (App.jsx ~10309/10315 at 7a39a90). The 4 plate lines now
  spelled "SS304 2B" (after `setup-material-spellings.sql`) show no
  weight, and a galvanised sheet stored as "Galv" would too.
- `setup-material-spellings.sql` rewrote requisitions with no `main_cat`
  filter: the pending CNC bar request "Stainless 304 ⌀35mm" now says
  "SS304", which the CNC grades list has no row for, so it prices at R0
  and a PO from it would say R0. One-row SQL to put it back.
- Live's Material Types list says "Galvanized" (z); 7 laser programs end
  "Galvanised" (s). The SQL only knew the s spelling, so "Galv" never
  took. Heinrich to say which spelling, and whether the short name stays
  "Galv".
- Checked on live 16 Sep: no duplicate section rows for SS304/Galv; no
  tube aliases or tube job lines with the old spellings.

### Galvanised, decided 16 Sep (Heinrich: "Galvanised, keep Galv")

- `setup-material-spellings-2.sql`, written by Planning: PART 1 renames
  the Material Types row to Galvanised with short name Galv; PART 2 writes
  Galv on plate lines, sections, requisitions (not CNC bar or fasteners),
  cut lists, and the endings of laser programs, tube job lines and tube
  aliases; PART 3 puts the full name back on CNC bar requests that got a
  short name (the "SS304" request). Proven on pglite, runs twice.
  Registered; setup-ALL.sql regenerated. Given to Heinrich to paste,
  practice then live. `findFactor` (weight by full name only) is still
  Stock Manager's to fix: Galv plate lines get no weight until then
  (the Galvanised row has factor 0 on live anyway).

---

## 16 Sep 2026 — Jobs page: JOB-0068 Bending, the packer rules, the push queue unblocked

JOB-0068: 4 plate programs still to cut while most of the job was cut,
packed and bent; the Laser stage closes only when every program is cut, so
Bending was held. Also found: the parts-in-order commit was stuck in the
push queue behind the held extra-stages commits. Rules in `CLAUDE.md`
under Decisions (the packer bullet and the count-save bullet).

### Pushed by Planning today (in the 19 commits up to 75d8bcf)

- `fe3ca02` Extra stages out of the stock auto-save, Extra stage switch
  hidden, review problems 4, 5, 6 fixed: the queue became safe without
  `setup-extra-stages.sql`. Three skeptics found nothing that breaks live;
  a fresh-clone build passed.

### Committed, NOT pushed: the packer rules (push together)

`60200fd`, `2b7ffcb`, `61a0087`, `c6af963`, `e155370`, with the checks
`a6e8db4` (`CHECK-job-stages-and-counts.sql`) and `a8e7892`
(`CHECK-packer-opens-at-push.sql`).

- Heinrich's decisions, 16 Sep: Bending opens when the packer takes the
  job; a count at any stage after packing counts as packed, and ticking it
  ticks packing; Nesting must be ticked first; packing never closes while
  programs are still to cut.
- Reviewed four times: a design review (it made rule 1 per-item, Laser
  only, Nesting first, and packing wait for the laser), a code review (12
  fixes), and two checks (they made every per-item count save only if it
  still reads what the screen showed, Log wait for the reload, the carry
  to the packer only raise, and a tick ignore a double tap). A last
  check of `e155370` found no blocker; its two duplicate-notification
  points (a stage closed by two last-line saves at once, a tick repeated
  before its reload) were fixed in the commit after it. Left: two reloads
  of one Production card can land out of order and refuse one quick
  count (nothing lost); the fix is a load counter in
  `fetchProductionQueue`, the Production tab conversation's function.
- Laser production's files touched: `useLaserPrograms.js`
  (`afterLaserStagesDone` dep, called from `syncLaserStagesFor` and
  `setJobNestingDone`), `LaserStatus.jsx` (the note, the hint).
- Checked: names 0, build, 136 tests. Not tried signed in.

### Before the push (Heinrich)

1. Run `CHECK-packer-opens-at-push.sql` on live and read the list: every
   per-item stage that opens at push, with programs still to cut and what
   else it waits on.
2. JOB-0068: Laser - External to "Cuts: Laser - external", and tag its
   external lines and parts (the SigmaNest parts import tags everything
   laser). Otherwise Bending still waits on Laser - External.
3. After the push, reload the floor tablets: the Production tab loads its
   list once per session and Refresh does not reload it.

### Try on practice (signed in)

1. A job with Nesting ticked, a program uncut, the packer taken on Laser
   Status: a per-item Bending card opens and counts; a batch Welding and
   Invoicing stay waiting.
2. Log at Bending: the packer's row on Laser Status shows "n counted at
   Bending", and his count rose.
3. Try to close packing (packer's button, admin close, job page tick)
   while a program is uncut: refused, naming what is open.
4. Cut the last program: packing closes if every line is packed; the
   job's Complete check runs.
5. Log twice quickly on one line, and on two tablets: nothing lost or
   doubled; a changed count is refused with what it reads now.

### Database changes

None for the packer rules. `setup-extra-stages.sql` still did not answer
on either database (16 Sep); ask Heinrich to paste it again whole.

### Left open

- Extra stages: review problems 1–3 and 7 (the rules) before the switch
  is shown; the SQL re-paste.
- For Laser production, from the "stuck at Laser" map (6 agents): a re-cut
  program linked to the job holds the job's own Laser
  (`syncLaserStagesFor` counts shortage links); deleting a program or
  taking a job off one never re-syncs; the header Refresh reloads neither
  the Production queue nor the laser data nor stage settings; a cut
  count typed while another program saves is dropped silently; a job set
  Complete by hand drops off To nest and Laser Status; a plate re-cut's
  catch-up run copies Laser - External.
- A count on the tube Production card leaves Tube Laser Status showing
  the old number until it reloads (and back); the next count there is
  refused once.
- Questions for Heinrich: should Take job ask first when programs are
  uncut, and admins get a Give back; is a part's quantity under a line of
  more than one the job total or per set (the proportional raise assumes
  total); should un-ticking a stage that closed packing reopen it.
- `CHECK-job-stuck-on-packing.sql` repeats `stageTakesItem` in SQL and
  knows neither extra stages nor the packer rules.

---

## 16 Sep 2026 — Jobs page (wrap-up): state of play

The entry above has the detail of today's packer work; this is the whole
conversation's position at clearing (14–16 Sep).

### Done and live (pushed by Planning)

- `7a39a90` Made-on list: Laser - external, Machining - external, CNC
  Lathe; Welding retired. A stage rename also rewrites reservations'
  stage names, Info Requests' stage names and recipe stages.
- `ae8c652`, `3cd0817`, `97b0653`, `fe3ca02` Extra stages, inert on live:
  the Extra stage switch is hidden and the stock auto-save never writes
  the list.
- `a6e8db4` `CHECK-job-stages-and-counts.sql`; `669b13a`
  `CHECK-extra-stages-before.sql`.

### Committed, not pushed

The packer rules, to push together: `60200fd`, `2b7ffcb`, `a8e7892`,
`61a0087`, `c6af963`, `e155370`, `264fe3d`, `1e28fbc`. Reviewed five
times; last check found no blockers. The queue also holds `cb0579c`
(Stock Manager's Galv SQL) and `1ffb702` (Planning's handover), not this
conversation's.

### Every setup file this conversation wrote

| File | Adds | Practice | Live |
| --- | --- | --- | --- |
| `setup-made-on-external.sql` | check rules only (codes `laser_external`, `machining_external`) | run, Heinrich confirmed 16 Sep | run, Heinrich confirmed 16 Sep (rules cannot be seen over REST) |
| `setup-extra-stages.sql` | columns `job_quote_items.extra_stages`, `stock_items.extra_stages`, `process_type_settings.only_marked` | not confirmed (the REST check reads live only) | **not there**: all three 400 at wrap-up, 16 Sep |

Read-only checks: `CHECK-extra-stages-before.sql` (run on live 15 Sep),
`CHECK-job-stages-and-counts.sql` and `CHECK-packer-opens-at-push.sql`
(not yet run by Heinrich).

### Built but not yet tested by Heinrich

Live now:
1. Made-on dropdowns on a line, a part and a stage's Cuts: Laser -
   external and Machining - external offered, CNC reads CNC Lathe, no
   Welding.
2. Rename a practice stage that has a reservation aimed at it: the job's
   Materials tab says "for" the new name.
3. Extra stages: nothing to try until the SQL is on and the switch shown.

After the packer rules are pushed (practice first):
4. Nesting ticked, a program uncut, packer taken: a per-item Bending card
   opens and counts; a one-tick Welding and Invoicing stay waiting.
5. A Bending count raises the packer's count; Laser Status shows "n
   counted at Bending", on parts under a line too.
6. Closing packing while a program is uncut (packer's button, admin
   close, job page tick) is refused and names what is open.
7. Cutting the last program closes packing when every line is packed, and
   the job's Complete check runs; the rep is told once.
8. Two quick counts on one line, and the same line on two tablets:
   nothing lost or doubled; a changed count is refused with what it reads
   now.

### Waiting on Heinrich

- Run `CHECK-packer-opens-at-push.sql` on live; then take the packer rules
  to Planning; reload the floor tablets after the push.
- JOB-0068: Laser - External to "Cuts: Laser - external"; retag its
  outside-supplier lines and parts.
- Job Process Types: rename "Machine/Drilling/CNC" to "CNC Lathe"; add
  Drilling above Welding.
- Paste `setup-extra-stages.sql` again, whole, practice then live, and
  check the three rows say ready.
- Decisions: Assembly kept or relabelled "No machine (assembly / bought
  in)"; whether any of the 7 open CNC jobs is drilling work; Take job
  confirmation and an admin Give back; a part's quantity under a line of
  more than one, total or per set; whether un-ticking a stage that closed
  packing reopens it.

### Pick up next

1. Heinrich's test of the packer rules on JOB-0068.
2. Extra stages, before the switch is shown: review problems 1–3 and 7
   (Planning, 16 Sep). The design review here proposed: keep
   `blockingStages` whole-stage; treat a per-item stage whose every
   unfinished line is capped at 0 as waiting; a first step beats an
   unplaced stage only for extra stages; list positions count only for
   stages that are extra stages now; switch open extra-stage rows to Each
   on a confirm; show the switch once the column exists.
3. Hand over: a load counter in `fetchProductionQueue` (Production tab);
   the "stuck at Laser" gaps in the entry above (Laser production).

---

## 16 Sep 2026 — Jobs page (Copy job): state of play at wrap-up

The full write-up is the 16 Sep entry "Jobs page: Copy job keeps parts
under their lines" above; this is where it stands now.

### Done

- `9748e38` Copy job: parts under their copied line, quote order,
  length, tube material, cut method and extra stages (the stock part's
  remembered value wins, else the old line's), the Cut to size list with
  nothing cut; a copy that fails partway deletes itself; Guess the rest
  remembers on the stock part. **Live**: pushed by Planning in
  7a39a90..75d8bcf. Not changed by any later commit.
- Nothing half-done. Nothing uncommitted from this conversation.

### SQL

- This conversation wrote **no `setup-*.sql`**. The copy reads which
  columns exist from the old job's rows, so it works with or without
  `extra_stages` (still 400 on both databases on 16 Sep); extra stages
  simply are not copied until that column exists.

### Built but not yet tested by Heinrich (live now; try on practice first)

1. Copy a job with parts (practice JOB-0012 is already one, a copy of
   JOB-0004): parts under their line, lengths, cut methods, same order
   as the old job's Items tab.
2. Copy a job with a Cut to size list (practice JOB-0008): the list
   comes across, nothing cut.
3. A line whose stock part remembers a different cut method from the old
   job: the copy takes the part's.
4. Guess the rest on a job, then add that part to another job: it comes
   in tagged.

### Waiting on Heinrich

- The four tries above.
- Practice JOB-0012: keep it for try 1, or remove it.

### Pick up next

- Nothing open in Copy job. When the extra-stages switch is turned on,
  try one copy of a job whose parts remember stages.
---

## 16 Sep 2026 — Laser production (tube floor printout): state of play at wrap-up

### Done and live

- **Tube floor printout** (2de848d, pushed by Planning). Print on each
  tube program, on Cutting and in the opened program on Nesting, asks
  Portrait or Landscape: page 1 with the program number, reference, jobs,
  "Draw from stores" and every part (mark, drawing, code, length, qty,
  tick, notes); then a page per nest, two to a page when both fit. How it
  works: `docs/TUBE-LASER-HOW-IT-WORKS.md`, "The floor printout".
- The import keeps every nest and each part's software ID on the program.
- Handover note for Jobs page on the job's print-all (4fffb84, live).

### SQL this conversation wrote

| File | Adds | Practice | Live |
| --- | --- | --- | --- |
| `setup-tube-laser-nests.sql` | column `laser_programs.nests` | yes (Heinrich, 14 Sep) | yes (Heinrich, 14 Sep) |

Not proven from here: on 16 Sep `CHECK-live-table.cjs "laser_programs?select=nests"`
answered 400, but so did the known columns `part_count` and
`nesting_name` while the table answered 200, so the column check does not
work on this table. Proof is a fresh import whose Print shows nest pages,
or `CHECK-which-setup-files-are-run.sql` on live.

Registered in `CHECK-which-setup-files-are-run.sql`; like every laser file
not in `build-test-database.sh`.

### Built but not yet tested by Heinrich

1. A fresh import of a real report, then Print from Cutting and from
   Nesting, portrait and landscape: nest pages present, marks match the
   software, codes shown where the part is a line on the job.
2. A program on two jobs: page 1 has a Job column.

### Half-done / waiting on Heinrich

- **Old programs print only the draw box** (reported 15 Sep): their nests
  were never kept and most carry no parts. Proposed, not decided: fill
  page 1 from the job's tube lines matched to the program's section by
  `material_type`, else all tube lines with a warning. Three questions
  asked: that fallback or "re-import" text; all lines with a warning when
  nothing matches; which old program he tried. Build nothing until
  answered.
- Portrait or landscape, once the floor has tried both.
- Still open from earlier entries: the tube untested list, the Time
  Manager and User Management ticks, tagging tube lines with material
  type, and the two JOB-0078 gaps (all packed with a program uncut says
  nothing; cancelling a program does not re-check the laser stage).

### Pick up next

1. The old-program page 1 fallback, once Heinrich answers.
2. JOB-0078 gap 2: cancelling a program re-checks the laser stage.
3. Plate printout only after the SigmaNest export question.

---

## 16 Sep 2026 — Production tab: the 1000-row cap and the id-list limit

Started from the review note above ("1000-row cap on the Production tab").
Checking it turned up a second limit, closer and louder.

### Done and live

- `7468057` `CHECK-production-queue-size.sql` (read-only). Heinrich ran it
  on live on 16 Sep: 89 jobs In Progress or Complete; **562 stages**, sent
  as one id list that the database refuses at about 600; **776 lines and
  parts** (cap 1000); 237 per-item counts; 88 files on a stage; 10
  shortages; 10 cut list lines; 5 printed cutting lists; 876 lines on
  every job; JOB-0075 the biggest at 120.
- `75d8bcf` The Production tab loads in pages and sends job and stage ids
  in batches of 200 (`src/lib/rowsForIds.js`, 8 tests; `fetchRowsForIds`
  in App.jsx). All eight loads in `fetchProductionQueue`. Stages and cut
  lists are sorted by `sort_order` afterwards, printed cutting lists
  newest first, jobs oldest first (ties inside a department used to take
  whatever order the database sent). Pushed by Planning in the 19 commits;
  found in the live bundle at wrap-up.
- The rule is in CLAUDE.md under "Loading data", with a note under
  "Checking what is live" and one under "Checking a screen" (committed in
  661ae60 by the Jobs page wrap-up, together with its own lines).

### How it was checked

- The limit, from node with the practice public key: 640 uuids answered
  200, 650 answered 400, and extra headers lowered it. The old single
  request of 1300 ids was refused; the new batches were accepted.
- The Browser pane was already signed in to practice (read only, nothing
  ticked): the Production tab loads and sends the new requests; every
  table gave exactly the old requests' rows with batches of 3 ids and
  pages of 4 rows forced.
- Names 0, build clean, 131 tests at the time.

### Setup SQL

None written. `CHECK-production-queue-size.sql` only reads; run on live by
Heinrich on 16 Sep.

### Built but not yet tried by Heinrich (live now)

1. Production tab: departments and counts show as before.
2. An Each stage card of a job with parts: every part under its line's
   name, matching the job's Items tab.
3. Log a count and reload the page: the count is still there.
4. Floor tablets get the fix only when their page is reloaded.

### Agreed as separate changes, not started

- **Jobs list stage load** (`refreshJobStages`, the Jobs page
  conversation's): it pages on `sort_order`, which is not unique, so past
  1000 stages a stage can be skipped or repeated where pages meet; and it
  sends every non-invoiced job id, cancelled too, as one list.
- **Leave Complete jobs out of `fetchProductionQueue`**: their stages are
  all ticked, so they add nothing to a card, but they count toward both
  limits. First check whether a re-cut added to a finished job reopens
  it, and the Jobs page's note that a job set Complete by hand drops off
  To nest and Laser Status.

### Noted for later

- Other `.in()` lists in `src` are small today. The auto-save deletes
  (stock items, requisitions, purchase orders, usage log, master lists)
  send the removed ids as one list: a single save removing 600 or more
  rows would be refused.
- The Jobs page's open point, two reloads of one Production card landing
  out of order (a load counter in `fetchProductionQueue`), is in the same
  function; 75d8bcf does not make it worse.

---

## 16 Sep 2026 — Production tab (wrap-up): state of play

The detail is in "Production tab: a job's parts listed in order (JOB-0068)"
above; this is where it stands at clearing.

### Done and live (pushed by Planning in the 16 Sep batch up to 75d8bcf)

- `efb567f` Parts in order on the floor: every Each list, the packer's To
  pack list and the printed job sheet show lines A to Z with each line's
  parts A to Z under its name (`src/jobs/lineOrder.js`). `jobItems` is in
  the live bundle (`CHECK-what-is-live.cjs`, 16 Sep). Tried on practice
  with Heinrich signed in: JOB-0011's "laser aaaa" card and its printed job
  sheet right, the Items tab still in quote order. The 8 test parts were
  removed.
- `4ea57c1` Tube Laser > Nesting: opening a re-cut row no longer blanks
  the app.
- From this conversation's findings, built by others and pushed: Copy job
  keeps parts under their lines (`9748e38`, Jobs page); the Production tab
  loads in pages (`75d8bcf`).

### Every setup file this conversation wrote

None. The only database look was read-only: on 15 Sep the Jobs page's
extra-stages columns answered 400 on live (since recorded in its entries).

### Built but not yet tested by Heinrich

1. Laser Status, and Tube Laser Status, Packing and Nesting, on a job with
   parts: line names as headings, parts A to Z. Same code as the Production
   card, not yet seen with real data.
2. The packer's To pack list (packing stage not on Each): grouped the same
   way.
3. Tube Laser > Nesting: open a re-cut (a tube shortage not on any
   program). The row opens with its shortage details and no parts counter.
   Practice has no tube re-cut, so this was proven only by drawing the
   control without a stage.
4. JOB-0068 on live: its Each cards in the order he asked for.

### Waiting on Heinrich

Nothing for this work: no SQL, no ticks, no open decision.

### Pick up next

1. Whatever his look at JOB-0068 on live turns up.
2. From the Jobs page entry: a load counter in `fetchProductionQueue`, so
   two reloads of one card landing out of order cannot refuse a quick count.
3. For Laser production: the tube program printout sorts TUBING_10 before
   TUBING_2 (`nestingPrint.js`, compare without numbers).

## 16 Sep 2026 — Laser production conversation: Laser 4kw priority

Heinrich asked for a priority setting on the plate laser: sales people
and Prince must be able to flag which job is cut next. Plan sent, ten
questions answered, built the same day in four commits, none pushed.

### Decided (his answers, 16 Sep)

Numbers, not a strict order: 1 is cut first, two jobs may share a
number, blank is ordinary work. Set by Prince (anyone who nests on the
plate laser) and admins **only**; sales people and the operator see it.
(First built with sales people too; on 17 Sep he said "Prince and admin"
meant *instead of* sales, changed in the commit "only the nester and
admins set it, not sales".)
"Cut next" on top of the Cutting screen, across the thickness groups.
Ranking on To nest: stopped programs, re-cuts someone is waiting for,
numbered jobs, then the rest. Mark urgent stays. Clears itself once the
laser is done with the job. Nesters and admins are told. Pressing
Refresh is good enough for now. Plate only; the tube laser can be given
the same later by setting `hasPriority` on its profile. And the laser
Nesting screen now honours the shortage form's "Can wait" tick.

### Committed, not pushed (in order)

- `157e372` step 1: `jobs.laser_priority` (+ `_by`, `_at`); the job page
  box (Overview), the header line, the red "Laser P1" chip on the Jobs
  list, the History line. `setup-laser-priority.sql`, proven on pglite.
- `a44000a` step 2: To nest sorted by it; the box on the opened row; the
  "Can wait" re-cut takes its turn; `LASER_MACHINES.laser4kw.hasPriority`.
- `79ae7ac` step 3: the red "Cut next" section on Cutting; "Priority 1"
  on the card and "· P1" on the job chip; the auto-clear
  (`clearLaserPriorityFor` from `afterLaserStagesDone`).
- `f62aa95` step 4: Refresh re-reads loaded laser data; the notice;
  CLAUDE.md and `docs/LASER-4KW-HOW-IT-WORKS.md`.

Each step: 0 missing names, 136 tests, clean build. Step 1's diff had a
three-lens adversarial review; its five findings (a hint promising the
auto-clear before it existed, "1e" clearing a set number, a stale box
after somebody else's change, the box on a job the laser had finished,
present-tense SQL comments) are all fixed. Step 2's review hit the usage
limit and was checked by hand instead.

### SQL this conversation wrote

`setup-laser-priority.sql` — three columns on `jobs` and a check (>= 1).
Registered in `build-test-database.sh` and
`CHECK-which-setup-files-are-run.sql`; `setup-ALL.sql` regenerated.
**Run on practice and live by Heinrich, 17 Sep**; both answer 200 for
the three columns (checked from here with a one-off select, the way
`CHECK-live-table.cjs` asks). Safe to push.

### Built but not yet tested by Heinrich

**Tried on practice 17 Sep by this conversation** (his "you test"),
signed in as the one practice account, Test (admin), no console errors:

- New job JOB-0013 with nesting + laser aaaa (Packer ticked itself). The
  box appeared only once the plate stages were on. Set 1: header "Laser
  priority 1", hint "Set by Test", the Jobs list chip, History "laser
  priority — set to 1".
- Laser 4kw > Nesting: JOB-0013 on top with "Priority 1", above the
  Marked urgent JOB-0003, "2 need nesting now"; the opened row's box read
  1 with "Set by Test".
- Made program TESTPRIO1 from the row. Cutting: "Cut next (1)" on top
  with TESTPRIO1, "Priority 1", "JOB-0013 · P1"; TESTCLAUDE1 stayed in its
  3mm group.
- Marked it cut (time popup skipped), then Done nesting: the job left To
  nest, the chip left the Jobs list with no reload, the box and header
  line went, History "laser priority — cleared — the laser is done with
  the job".
- Refresh (with the laser tab loaded) re-read laser_programs,
  laser_program_jobs, job_processes, laser_program_events and the rest.
- On JOB-0012's job page: set 2; typed "2e" (the box reports "" with
  badInput) and left it: nothing sent, still 2; blanked it: cleared, with
  its History line.
- Flagged a plate shortage on JOB-0008 with Priority unticked: it sat at
  the bottom of To nest with the muted "Re-cut — can wait" chip. Cancelled
  it afterwards.

**Not exercised:** the notice. Practice has one account, so there was
nobody to tell (`tell` was empty; no request to job_notifications). It
shares `sendNotifications` and the recipient rule with the stop report.
Also not tried: a sales person's or Prince's own login (only the admin
exists on practice), and a second PC picking a number up on Refresh.
The Browser pane stopped taking clicks partway (its known habit), so the
later steps were driven by script-dispatched clicks and focus plus real
typing; screenshots came back blank, so every result above was read off
the page text.

Practice leftovers: JOB-0013 "TEST laser priority (Claude, 17 Sep) —
delete after" (nesting and laser done, Packer open), program TESTPRIO1
(cut), one cancelled TEST shortage on JOB-0008, two History lines on
JOB-0012.

### Waiting on Heinrich

1. ~~Run `setup-laser-priority.sql` on practice, then live.~~ Done 17 Sep.
2. ~~Whether the sales people have the Is a Sales Person tick.~~ No
   longer matters: sales do not set it (17 Sep).
3. ~~Answered 17 Sep: "instead of".~~ Was: confirm the reading of his
   answer to question 2: sales people, Prince
   and admins may set it (the reply took "Prince and admin" as an addition
   to sales, not instead of).

### Pick up next

1. The tube laser: set `hasPriority: true` on `LASER_MACHINES.tubeLaser`
   if he wants the same there; the job page box would then also need to
   show for tube stages (`jobGoesToPlateLaser` in App.jsx is plate-only).
2. "Programs waiting to be cut" on the Nesting screen does not show the
   priority tag; only Cutting does.

---

## 17 Sep 2026 — Production tab: reloads shown in the order they were asked for

Handed over by the Jobs page on 16 Sep: two reloads of one Production card
could land out of order, the older answer covering the newer, and the next
count was then refused for a number nobody else had changed. Plan sent;
his answers, 17 Sep: Production tab only; and yes to a "could not refresh"
line as its own change afterwards.

### Committed with this entry (not pushed)

- `src/lib/loadOrder.js` (7 tests): each reload takes a number when it
  starts; its answer, or its failure, goes on screen unless a reload that
  started later is already showing. Not "only the newest may show": Log
  waits for its own reload, and dropping that one because another had
  started would give Log back over the old number.
- `fetchProductionQueue` in App.jsx uses it for the queue, for the empty
  and the failed case, and takes "Loading…" down with the newest reload
  rather than the first one back. Nothing else in the function changed; no
  new reads, no SQL.

### Checked

150 tests, names 0 problems, build clean. On practice, in the Browser pane
already signed in as Test: the first reload's `job_processes` answer was
held for 12 seconds in the page while a second note was saved on JOB-0002's
welding card; the second reload showed its note, and the held answer
(carrying the first note) arrived afterwards and was dropped. No console
errors. The note was put back to empty. The case without the fix was not
run for comparison.

### Built but not yet tried by Heinrich (practice)

1. An Each card: log two counts quickly on one line; both land, and Log
   comes back each time with the new number showing.
2. Tick, Mark urgent, a note: the card reloads as it always did.

### Not covered, by his decision

The same gap in `fetchLaserData` (Laser production; the packer's counts
on Laser Status go through it) and `refreshJobDetail` (Jobs page).
`makeLoadOrder` is there for both: one per screen, `start()` when the
load begins, `mayShow(n)` before anything is set from it.

### Pick up next

1. His yes, 17 Sep: when a reload of the Production tab fails, keep the
   last good screen and say "could not refresh", instead of an empty tab
   that reads as no work. The laser screens already say so
   (`laserLoadFailed`).
2. Leave Complete jobs out of `fetchProductionQueue`, after the two
   checks in the 16 Sep entry.

## 17 Sep 2026 — Laser production: state of play at wrap-up (Laser 4kw priority)

The detail is in the 16 Sep entry "Laser production conversation: Laser
4kw priority" above. This is where it stands at wrap-up.

### Done and live

All of it, pushed by the Planning conversation; `CHECK-what-is-live.cjs`
finds "Cut next", "Laser 4kw priority" and "can wait" in the live build
(17 Sep). Commits `157e372` `a44000a` `79ae7ac` `f62aa95` `9906627`:
a queue number on the job (1 first, ties allowed, blank ordinary), set by
plate nesters and admins only ("instead of" sales, his word of 17 Sep);
To nest sorted by it; the red "Cut next" section on Cutting; cleared when
the job's own Nesting and Laser close; Refresh re-reads loaded laser data;
a notice to plate nesters and admins; a "Can wait" re-cut no longer jumps
To nest.

Also this session, no code: read Stock Manager's section rename for the
laser side. No old spelling in `src/laser`; the 76-row rename map has no
duplicate, overlapping or chained names; a live query for tube programs
or job lines still ending in "mm" returned no rows (Heinrich ran it).

### Every setup file this conversation wrote

- `setup-laser-priority.sql` — `jobs.laser_priority`, `_by`, `_at` and a
  check (>= 1). Run by Heinrich on practice and live 17 Sep; all three
  columns answer 200 on both (checked from here). Registered in
  `build-test-database.sh` and `CHECK-which-setup-files-are-run.sql`.

### Built but not yet tested by Heinrich

Tried on practice by this conversation on 17 Sep (the list is in the
16 Sep entry); not yet by him, and not at all on live:

1. The box on a job's Overview tab and on Prince's opened To nest row.
2. Prince's To nest order with a numbered job, an urgent one and a re-cut.
3. "Cut next" on the operator's screen, with a real program.
4. The number clearing itself when the last program is cut and Nesting
   is done.
5. **Never exercised anywhere:** the notice to plate nesters and admins
   (practice has one account); a sales person's login not seeing the box;
   Prince's own login seeing it; a second PC picking a number up on
   Refresh.

### Waiting on Heinrich

Nothing to run or tick. Tell Prince and the operator what "Cut next" and
the red "Priority 1" mean. Delete practice job JOB-0013 when convenient.

### Pick up next

1. His first real use on live, and whatever it turns up.
2. The tube laser, if he wants the same: `hasPriority: true` on
   `LASER_MACHINES.tubeLaser`, and `jobGoesToPlateLaser` in App.jsx is
   plate-only.
3. "Programs waiting to be cut" on the Nesting screen shows no priority
   tag; only Cutting does.
4. The first tube nesting report imported after the section rename: every
   section should match its alias without asking.
5. Still open from before: the tube program printout sorts TUBING_10
   before TUBING_2 (`nestingPrint.js`).

---

## 17 Sep 2026 — Production tab (wrap-up): state of play

The detail is in "Production tab: reloads shown in the order they were
asked for" above; this is where it stands at clearing.

### Done and live

- `5d090d5` An older reload of the Production tab landing late no longer
  covers a newer one (`src/lib/loadOrder.js`, 7 tests;
  `fetchProductionQueue`). Pushed by Planning on 17 Sep; `mayShow` and
  `isNewest` found in the live bundle at wrap-up
  (`CHECK-what-is-live.cjs`). The entry above still says "not pushed": it
  was written before the push.
- The rule and how to force the case on practice are in CLAUDE.md
  ("Loading data", "Checking a screen without signing in").

### Half-done

Nothing. This conversation has nothing uncommitted and nothing queued.

### Every setup file this conversation wrote

None. No SQL, no database change of any kind.

### Built but not yet tested by Heinrich (live now)

1. An Each card: log two counts quickly on one line; both land, and Log
   comes back each time with the new number showing.
2. Tick a stage, Mark urgent, save a note: the card reloads as it always
   did.
3. Floor tablets get it when their page is reloaded.
4. Still untried from the 16 Sep entries: the Production tab's load in
   pages (departments and counts as before; a count still there after a
   page reload); parts in order on Laser Status and the tube screens; the
   packer's To pack list; JOB-0068's Each cards on live; a tube re-cut
   opened on Tube Laser > Nesting. And from 15 Sep: Info Request end to
   end.

### Waiting on Heinrich

- No SQL, no permission ticks.
- One open decision from 15 Sep: Answer on the job page is open to anyone
  who can open the job, not only the rep and admins. Narrower?

### Pick up next

1. His yes, 17 Sep: when a reload of the Production tab fails, keep the
   last good screen and say "could not refresh", instead of an empty tab
   that reads as no work. Plan first; the laser screens already say so
   (`laserLoadFailed`).
2. Leave Complete jobs out of `fetchProductionQueue`, after the two
   checks in the 16 Sep entry.
3. For Laser production and Jobs page: `fetchLaserData` and
   `refreshJobDetail` have the same out-of-order gap; `makeLoadOrder` is
   there for both. His decision on 17 Sep was Production tab only.

### Seen in the folder, not this conversation's

- Uncommitted in `src/App.jsx` at wrap-up: Refresh reloads the stage
  settings and the Production list is rebuilt when they arrive (JOB-0068,
  Bending listing every part on a tablet). It calls
  `fetchProductionQueue`, so it goes through the reload order like any
  other reload. When it lands, CLAUDE.md's line "The header Refresh …
  reload neither, nor the stage settings" goes stale: its author's to
  change.
- App.jsx about line 12480 (Procurement receiving) writes `jobNumber`
  twice in one object; the second wins. esbuild warns about it on every
  parse of the file. Harmless, nobody's yet.

No practice data left: the test note on JOB-0002's welding card was put
back to empty.

---

## 17 Sep 2026 — Planning (wrap-up): state of play, 16 Sep evening and 17 Sep

Everything below is live unless it says otherwise. The rules are in
`CLAUDE.md` (the packer bullet, the extra stages bullet, the Production
bullets, "How to work with me"); this is what happened and what is left.

### Done and live

- **16 Sep evening:** the packer rules (Jobs page) pushed after Planning's
  own read, 75d8bcf..a0c9c6d. At push they opened only JOB-0068's Bending
  and CNC Lathe. `setup-material-spellings-2.sql` written, proven, run on
  live by Heinrich (read back).
- **17 Sep, Heinrich: "jobs must open as soon as the laser has started":**
  - bcb6b1f: rule 1's trigger is "cutting has started OR the packer is
    taken" (the Laser stage's `started_at`, written at the first sheet
    cut); an untaken packer is released too. The 8 jobs already cutting
    were marked started by hand through his session.
  - 9dd61a7: one-tick stages open the same way; their Complete tick is
    refused until the laser is done (his choice A).
  - b171761: extra stages switched on (review problems 1–3 fixed), the
    tube side opens, a per-item card is as ready as its lines.
  - 4a6f2af, 2526d4f, 5dead4a, b76d860: the Then box always shows, offers
    every item process above Welding, a pick switches the stage on and
    adds it to the job per item, a named one-tick stage goes per item, and
    on a job with any line marked the unmarked lines go to no extra stage.
- **Set on live by Planning through Heinrich's session** (each the same
  write the screen makes): Laser - External to "Cuts: Laser - external"
  (it had never been saved; JOB-0068's Bending then opened); Bending
  switched to Extra stage; JOB-0068's Drilling stage to per item;
  Drilling added to Heinrich's own stages under User Management;
  "Nothing extra on the rest" pressed on JOB-0068 (he had said everything
  was set). JOB-0068 then read Bending 16 lines, Drilling 26 lines.
- **Another conversation pushed the whole branch twice on 17 Sep** (09:11
  and 09:18, 27 commits, about 22 unreviewed; most likely Stock Manager,
  not proven). b171761 went live that way before Heinrich had said push.
  Planning health-checked the exact live commit and reviewed the rest
  after the fact: laser priority (5 commits), the stock form fix, pipe
  names and Custom Channel, sections step 6, and the section rename SQL's
  result on live (68 sections with numbers, no old names, no duplicates,
  77 stock lines all matched). Nothing needed fixing.

### Every setup file this conversation wrote

- `setup-material-spellings-2.sql` (data only: Galvanised / Galv, and CNC
  bar requests get their full name back). **Live: run, read back 16 Sep**
  (grades row Galvanised/Galv, plate lines and requests Galv, programs
  "2mm Galv", the CNC bar request back to Stainless 304). **Practice:**
  Heinrich said done; practice holds no galvanised material and no CNC
  bar requests, so its data cannot show it either way (read 17 Sep).
- Given to Heinrich but not Planning's: `setup-extra-stages.sql` (Jobs
  page). Its three columns answer 200 on practice and live (17 Sep).
- No SQL for anything built on 17 Sep.

### Built but not yet tried by Heinrich

1. Stages opening at the first sheet cut, without Take job (seen on live:
   JOB-0014, JOB-0093, JOB-0091; never tried by him on a fresh job).
2. A one-tick stage opened early refusing its Complete tick while the
   laser has work, with its message (never seen on screen by anyone).
3. The tube side: a mixed plate-and-tube job's Bending opening while the
   tube nester is busy (JOB-0094), and rule 3 waiting for the tube stages.
4. A per-item card's label following its lines (Ready / Partly ready /
   Waiting: the first held line's stage).
5. The Then box: picking a stage the job lacks (tried on practice
   JOB-0008 by Planning, not by him on live); the "nobody has it ticked"
   message; two or more extra stages in a line's own order on the floor.
6. The marked-job rule on a new job: mark a few lines, check the rest
   leave Bending; and a new job whose stock parts bring a remembered Then.
7. From the after-the-fact review: the laser priority on Prince's list
   and under Cut next; a section's "use N" kg/m button.

### Waiting on Heinrich

- Tick **Drilling** under User Management for whoever drills (only he,
  Jonathan, Gawie, Mark and Andries have it).
- A yes or no on three offers: a **push guard** so only Planning can push;
  **per-item marks from Welding onwards** (needs a parent/part rule);
  counting only marks made on the job itself, not ones a part brought.
- Type a kg/m for **CH 120x55** (its type has no thickness box).
- Start the **Laser quoting** conversation: `/monday Laser quoting`.

### Left on practice

Bending and Drilling added to the stage list above welding, and to the
Test account's stages; Drilling switched to Extra stage; JOB-0008 has a
Drilling stage and lines 100 and 101 marked Drilling. From 15 Sep: empty
program TESTCLAUDE1, two cancelled TEST shortages on JOB-0002.

### Pick up next

1. Whatever Heinrich's tries above turn up.
2. His answers to the three offers; the push guard first if he says yes.
3. Review problem 7 (a parts import that links a typed part does not
   bring the part's remembered Then).

---

## 17 Sep 2026 — Stock Manager (sections and materials): state of play at wrap-up

### Done and live (pushed by this conversation, b171761 and e2ec61b, on Heinrich's say-so)

- **One spelling per material** (step 3): short name when the list has one
  (SS304, SS304 2B, Galv), else full name (Mild Steel). Pickers and lookups
  (`findPrice`, `findFactor`, `updateReqPrice`) take either.
- **Sections from boxes** (step 4): 18 fixed types, Add from the type's
  boxes with a name preview and duplicate refusal, pencil edits through the
  boxes, Section Types read-only, pipe standards with OD/ID/wall in the name.
  The stock form offers every type a section is filed under (`stockSectionTypes`).
- **Every live section converted** (step 5): 68 sections, merges held, every
  copied name finds a section (docs/check-results/2026-09-17-section-names-after-conversion.md).
  Laser production and Jobs were messaged with the changes (Jobs' session was
  offline; queued).
- **kg/m worked out from the numbers** (step 6), with "use N" per row.
- 26 other conversations' commits went live in the b171761 push; their
  columns (extra_stages, only_marked, laser_priority) were checked on live first.

### SQL this conversation wrote

| File | Practice | Live |
|---|---|---|
| `setup-material-spellings.sql` | run (Heinrich, 16 Sep) | run (Heinrich, 16 Sep); data only |
| `setup-section-dimensions.sql` | answers (per Planning, 16 Sep) | `master_factor_items.dimensions` answers 200 (checked 17 Sep) |
| `setup-section-names.sql` (generated) | run, check clean (Heinrich, 17 Sep) | run, check clean; `section_rename_map` answers 200 (checked 17 Sep) |

Read-only checks: `CHECK-material-spellings.sql`, `CHECK-section-names-in-use.sql`.

### Only in chat, not in a file

- **PIPE NB100 SCH40 rename.** Added on live at 09:58 on 17 Sep, before the
  OD/ID code was live, so its name is short (numbers correct). A one-off
  `do $do$` block renaming it to "PIPE NB100 SCH40 114.3OD 102.26ID 6.02WT"
  in every copy was given to Heinrich; **not confirmed run**. Check with the
  section names check.

### Built but not yet tested by Heinrich

1. Stock Manager → Sections: 18 type pills with counts; Add from boxes
   (SHS, a pipe on each standard); the red duplicate line; pencil edit
   renaming a size in every material; copy onto another material picks a
   short name.
2. Section Types tab is a read-only list.
3. Stock → Structural → add: the new section names and "Pipe" offered;
   a new pipe can be stocked.
4. SS304 2B plate lines show their weight; a price edit on an SS304 2B
   plate requisition sticks.
5. kg/m: "use N" on rows; blank kg/m on Add saves the worked-out one; cut
   lists and stock values no longer read 0 for sizes without a typed kg/m.

### Waiting on Heinrich

- Confirm the NB100 pipe rename ran (above).
- Type a kg/m for CH 120x55 (no thickness box) and the other PFC/CH/IPE sizes.

### Asked, not started

- **Structural add-stock price (Heinrich, 17 Sep):** "does not take the price
  per meter, the numbers jump around"; wants **R/m and R/kg as two separate
  boxes**, typing one shows the other. The code is the `priceUnitMode`
  toggle block in the structural add form (App.jsx, search
  `setSectionPrice(effectiveSection`): its input is controlled by the
  stored price, re-derived and rounded on every keystroke through
  `setSectionPrice`, so typing jumps. Fix: two boxes with their own typed
  text, writing R/m to the section row, R/kg shown from `findSectionFactor`.
  The plate and cncBar forms have the same toggle; ask whether they change too.

### Pick up next

1. The two-box price on the structural add form (above).
2. Changing a material's short name rewrites every row that stores it
   (decided 16 Sep, not built).
3. Fasteners (answers in memory `fasteners-database-plan`; tell Quoting first).
4. Suppliers steps 3–4 (Tel per contact, categories) when he asks.

---

## 17 Sep 2026 (evening) — Stock Manager: price boxes and the master save queue, state of play

### Done and live (pushed by THIS conversation on Heinrich's "push", not through Planning)

Planning: the live tip moved 99f1d7f → 5643fcc → 21f7ef5 → d2953b4. Before
each push the tip was printed and unchanged, the queue held only this
conversation's one commit, and a fresh clone passed tests, names and build.
After each, CHECK-what-is-live found it and the live page loaded with no
console errors. Nothing was typed on live.

- **5643fcc — two price boxes on the add-stock form** (structural, plate,
  CNC bar): R/m or R/sheet beside R/kg, typing one shows the other, saved
  once on leaving the box. Replaces the R/m | R/kg toggle box that wrote
  the price on every keystroke (text jumped, a leading 0 blanked it, each
  keystroke its own save). `src/manager/TwoPriceBoxes.jsx`, `twoPrice.js`.
- **21f7ef5 — save-once number boxes** (`src/manager/NumberBox.jsx`):
  Sections kg/m and R/m, Material Types and CNC grades density and R/kg,
  the Procurement requisition price. Same fault, same cure. Heinrich said
  yes to including the requisition box (Procurement's screen).
- **d2953b4 — master-list saves queue up** (`src/lib/saveQueue.js`): one at
  a time in order, a failed save retried after 30 s and at the next
  change, a master refresh skipped while a save is in flight or owed.
  Rules in CLAUDE.md under "Loading data". `lastSavedMasterRef` is gone.

### SQL this conversation wrote

None this session. (Earlier files: see the 17 Sep Stock Manager entry above.)

### Tried on practice by this conversation (Test account), not by Heinrich

Sections kg/m and R/m, Material Types R/kg (leading "0,5", then cleared),
add-stock structural (R/kg 80 → R/m 260) and plate as an offcut (R/sheet
1570 → R/kg 20), a requisition price: each one save on leaving the box,
values there after a reload. The queue: a save held 4 s with two changes
made meanwhile (one catch-up save after it), a save failed on purpose
(Refresh kept the screen's value, retry by itself at 30 s, read back from
the database).

### Built but not yet tested by Heinrich (all live)

1. Stock → add → Structural / Plate / CNC bar: the two price boxes; type
   in either, Tab, save the item, reload, price still there.
2. **CNC bar form: tried by nobody** (practice has no CNC bar grades).
3. **Clicking Save straight from a price box: tried by nobody** on the real
   form (leaving the box saves; a click on Save leaves it first).
4. A section with no kg/m (CH 120x55): R/kg greyed out with its reason.
5. Stock Manager → Sections and Material Types rows; a requisition price.
6. The queue has nothing to look at unless a save fails: the header shows
   the save error and the app retries by itself every 30 s. **A failed
   save that adds a new row (the upsert repeat) was never exercised.** A
   save that can never succeed leaves the device in error, retrying, and
   Refresh will not replace the master lists; a page reload is the way out.

### Waiting on Heinrich

- Still from the morning: confirm the NB100 pipe rename ran; a kg/m for
  CH 120x55 and the other PFC/CH/IPE sizes; the five fastener questions.

### Left on practice

Two section rows made by testing (practice sections carry no material, so
pricing one for MS makes its own row): "SHS 50x50x2 / MS" 3.25 kg/m R260,
"75x75x6 / MS" R425.75 (that requisition now reads R425.75, was R410). The
original SHS 50x50x2 row is back to blank kg/m, R250 (read from the database).

### Seen in the folder, not this conversation's

Uncommitted at wrap-up: `setup-jobs-invoiced-amount.sql`, `src/FigureBox.jsx`,
`src/jobs/jobFigures.js` + test, and changes in `src/App.jsx`,
`src/ui-preview.jsx`, `build-test-database.sh`, `setup-ALL.sql`,
`CHECK-which-setup-files-are-run.sql` (by the names, Jobs page). Also one
stray blank line in this file's 16 Sep Copy job entry. None touched.

### Pick up next

1. Whatever Heinrich's tries turn up.
2. The same save queue for stock items, requisitions, purchase orders and
   the usage log, one at a time (agreed 17 Sep, after this one has run a while).
3. Changing a material's short name rewrites every row that stores it
   (decided 16 Sep, not built).
4. Fasteners; Suppliers steps 3–4 when he asks.

---

## 18 Sep 2026 — Jobs page (the Jobs list: money boxes, Order box, stage filter): state of play at wrap-up

Asked 17 Sep: the Jobs list's "on order" line drawn like the Purchase
Orders boxes with what was invoiced in the month beside it, a filter per
stage ("everything under welding"), and an order by job number or time in
process. Planned, seven questions answered, built, and **all of it is live**
(`dc7e2be`). The rules are in CLAUDE.md under "Decisions already made".

**This conversation pushed, on Heinrich's word ("push from here"), three
times. Planning has not been told any other way than this entry:**
`d2953b4..8076eee` (17 Sep evening, ten commits: nine of mine and Stock
Manager's notes-only `e1cb7db`), `8076eee..1ab6d28`, `1ab6d28..dc7e2be`
(18 Sep). Each time: live tip and queue read first, clean clone (names,
188 tests, build), then the live bundle checked.

### Done and live

- `4e1cee0` The Jobs list's stage load goes through `fetchRowsForIds`
  (batches, paged by id) and leaves invoiced and cancelled jobs out. It was
  one list of every id, paged on `sort_order`; a skipped stage would have
  let `settleFinishedJobs` mark a job Complete. (Agreed 16 Sep as a
  separate change; this is it.)
- `dfad42c`, `8076eee` Three boxes on the Jobs page, and nowhere else:
  **On order** (as before, behind Can see Rand values, still says how many
  are not priced), **Invoice requests in <month>** and **Invoiced in
  <month>** (admins only). Sums in `src/jobs/jobFigures.js` (tested), South
  African months. Mark as Invoiced asks for the invoice amount excluding
  VAT once the column exists.
- `30b5f76` A request sent from the job page (Invoice with quantities,
  Invoice Now) ticks the Invoicing stage once nothing is left to request.
- `66b7b1d` Order box: Newest first, Oldest first, Due date; kept on the
  device. In due-date order each row shows its due date.
- `ee4f27b` Ready / Partly ready / Waiting lifted out of
  `fetchProductionQueue` into `src/jobs/stageReadiness.js`, unchanged:
  every Production department on practice recorded before and after (30
  cards), identical. `blockingStages`, `itemFlowLimit`, `stageTakesItem`
  stayed in App.jsx. The Production tab's owner conversation ("Dropdown
  search alphabetical audit") was messaged; it was offline.
- `cd3c6b9` Stage filter on the Jobs list on that shared rule: Standing /
  Ready at <stage> / Waiting pills, a tag per open run of the stage. Loads
  three small requests per pick, after a write and on Refresh while a
  stage is picked; never on a timer.
- `c9ae8ac` then `8076eee`: boxes on Records → Invoicing and Purchase
  Orders moved onto `FigureBox` were **built in error and taken back out
  the same evening**. Records → Invoicing and Purchase Orders are as they
  were before 17 Sep.
- `1ab6d28` then `dc7e2be`: the stage filter and Order box were admins-only
  for one evening (a misreading of "this should only be visible to admin")
  and are for everyone who can open Jobs again. App.jsx at `dc7e2be` is
  byte for byte `8076eee`.

### SQL this conversation wrote

| file | what | practice | live |
|---|---|---|---|
| `setup-jobs-invoiced-amount.sql` | column `jobs.invoiced_amount` (numeric, never negative) | **NOT run** (answers 400, checked 18 Sep) | **NOT run** (answers 400, checked 18 Sep) |

Proven on pglite, run twice; registered in `build-test-database.sh` and
`CHECK-which-setup-files-are-run.sql`; `setup-ALL.sql` regenerated. The app
is safe without it: no column, no amount box, nothing written, and the
Invoiced box counts every job at what it was quoted at and says so ("16 of
16 at quoted value" on live, 17 Sep).

### Built, live, and not yet tried by Heinrich

1. The three boxes on the Jobs page (he has seen the figures I read off
   live; he has not said he looked himself).
2. The stage filter: pick Welding, check Ready / Waiting against the
   Production tab's Welding department. **No Partly ready or Standing job
   existed on practice**, so those two tags have only ever run in tests.
3. The Order box, and the due-date chip.
4. The Production tab after the lift: one look that the departments read
   as before.
5. A job-page invoice request ticking Invoicing: tried on practice
   (JOB-0011, part request left it open, the rest ticked it). Not tried:
   Invoice Now on a Complete job whose Invoicing stage is still open.
6. The invoice amount box on Mark as Invoiced: **cannot be tried until the
   SQL is run.** On practice only the display (column faked in the page)
   and the refused blank were tried; no real save has ever been made.
7. A non-admin's Jobs page: seen only by faking the profile on practice
   (see CLAUDE.md), and not at all at `dc7e2be`, because the practice pane
   had signed out. The file is identical to `8076eee`.

### Waiting on Heinrich

- Paste `setup-jobs-invoiced-amount.sql` on practice, then live. After
  practice, the next session does one real Mark as Invoiced there and reads
  the row back from the database.
- **Should On order be admins only too?** Asked twice, not answered. It
  shows to people with Can see Rand values, as the old line did. Do not
  change it without his word.
- Should On order count only what is still to be billed (job value less
  what has been requested)? Offered 17 Sep, not answered. Today a
  part-invoiced job counts in full until it is marked Invoiced.
- Staff need a page reload to get `dc7e2be`.

### Left on practice

JOB-0011 has an Invoicing stage added for the test (ticked) and two invoice
requests (R 12, R 25). The practice Browser pane is signed out.

### Seen in the folder, not this conversation's

Uncommitted: one stray blank line in this file's 16 Sep Copy job entry, and
untracked `CHECK-unpaged-lists.sql`. Neither touched.

### Pick up next

1. The SQL, then the real Mark as Invoiced on practice.
2. His answers on On order (who sees it; full value or still to bill).
3. `refreshJobDetail` and `fetchLaserData` still lack the reload-order
   guard (`makeLoadOrder`); the Jobs list's `fetchJobs` pages `jobs` on
   `created_at`, which is not unique (harmless until 1000 jobs).
4. Dead New Job pop-up code is still in App.jsx (see the 10 Sep entry).

---

## 18 Sep 2026 — App health (the 1000-row limit, growth, data security): state of play at wrap-up

A new area: a health check of the whole app on 17 Sep, then the first fix.
The full list of fixes and upgrades is in the memory note "App health
backlog"; this is where it stands.

### Done

- **Health check, 17 Sep.** Names check, tests, `npm audit` and tracked
  secrets all clean. The download to open the app is about 300 KB zipped and
  needs no work. Findings, in order: single-request lists with no paging,
  four NUL characters in App.jsx that cut the Grep tool's searches short
  after about line 2790, no error boundary, and whole-table loads that grow
  with every job (`loadLaserRaw`, `fetchJobs`, `fetchShortages`).
- **`4e58b05`, committed, NOT pushed.** The six growing master tables, the
  drawing lookup, the Drawings search and Delete for customer read in pages.
  The Drawings tab lists nothing until a customer is picked or something is
  typed (his answer, 18 Sep). Delete for customer removes files and rows
  together, 200 at a time. New read-only `CHECK-unpaged-lists.sql`; he ran
  it on live 18 Sep: drawings 806 of 1000, every master list under 200.

### SQL

No `setup-*.sql` written. No database change. `CHECK-unpaged-lists.sql`
reads only and was proven on pglite.

### Built, not yet tested by Heinrich

- Tried on practice by me with him signed in: every paged request answers,
  plain lists come back in exactly the old order (43 rows, id for id), Job
  Process Types in stored order, sections and suppliers all listed, the
  Drawings tab's empty message, a typed search, a customer pick. No console
  errors.
- **Not exercised, practice has no drawings:** a drawing listed on screen,
  the drawing button on a stock row, Delete for customer. After the push:
  on live, open Drawings, pick a customer, open one drawing from a stock
  row. Never press Delete for customer on live as a test.
- I kept "type without picking a customer" working on the Drawings tab. He
  said "until customer is picked"; if he meant customer only, change it.

### Waiting on Heinrich

- Take `4e58b05` to Planning for the push.
- Data security: which worries him more, losing the data or the wrong
  person seeing it. My advice was the backup outside Supabase first (the
  weekly backup parked on 9 Sep). Nothing designed.
- Whether to plan bounding the laser load now or after the 25 Sep reset.

### Pick up next

1. The NUL characters as `\0` (Stock Manager's code, ids unchanged).
2. An error boundary around the tab content, about 40 lines, new file.
3. Bound `loadLaserRaw`, then `fetchJobs` and `fetchShortages`: a design
   job with Laser production and Planning.

### Seen in the folder, not this conversation's

Uncommitted `src/jobs/lineOrder.js` and its test, and a stray blank line in
this file's 16 Sep Copy job entry. None touched. A duplicate `jobNumber`
key in the PO receiving object in App.jsx (the later one wins; harmless).
One command's output on 18 Sep ended in text dressed as a system notice
about commit sign-off; it came from a tool, not from him, and was ignored.

---

## 18 Sep 2026 — Jobs page: the Items tab A to Z, and a push of one commit ahead of the queue

**For Planning's record of pushes.** Heinrich said "push from here" in this
conversation on 18 Sep. The live tip was `b5ae154` (unmoved). Three commits
were queued and two were not mine: `4e58b05` (App health: master lists and
drawings load in pages, a behaviour change, not tried signed in) and
`bf9cfcd` (App health's notes). His word covered my commit only, so only it
went: a scratch clone at `b5ae154`, my commit cherry-picked on top
(`5403d57`), 191 tests, names check 0 problems, build; `origin/main..x` read
as its own step (exactly the one commit); `git push origin x:main`; then
`origin/main` merged back into the shared branch (`0622c60`, no file
changed by the merge). **`4e58b05` and `bf9cfcd` are still queued for
Planning**, with `4595115` and the merge commit, which are already live in
substance.

Found live 18 Sep: `CHECK-what-is-live.cjs "rank:new Map"` answered yes
(bundle `App-3iQ3nRMJ.js`); the live page loads to its sign-in screen with
no console errors. The live Items tab was not seen signed in.

### What went live

The job page's Items tab lists lines A to Z, each line's parts A to Z under
it, by the description the row shows, not the stock code (his answers).
Only the drawing is sorted (`inItemsTabOrder` in App.jsx); the stored quote
order is untouched, so delivery notes and invoice requests keep the
customer's order. The order is held while somebody types: a renamed line
keeps its place until a line or part is added, removed or moved, or the tab
or job is opened again (`heldLineOrder` in `src/jobs/lineOrder.js`, three
tests). A new or imported line lands in its A to Z place, not at the bottom.
No database change. The rule is in CLAUDE.md under the floor's A to Z
decision, which this changes (the Items tab kept quote order 16–18 Sep).

### Tried, and not

- Practice, JOB-0008 (14 lines, stored order has 105 last): the screen read
  100 to 113; a rename saved (read back from the database), stayed put, and
  went to its place after leaving the tab and coming back; the name was put
  back and read back. No console errors.
- Not seen on screen: parts out of A to Z order (practice has no such job;
  the tests cover it), and a real keyboard Tab along a row after a rename.
- Heinrich has not said he tried it himself.

## 18 Sep 2026 — Job search finds the customer's PO number, and a push of two commits ahead of the queue

**For Planning's record of pushes.** Heinrich said "push from here, need
this working now" in a new conversation on 18 Sep (his ask: "need to be able
to search the PO number also"). The live tip was `5403d57` (unmoved). Seven
commits were queued and five were not mine: `4e58b05` (App health: master
lists and drawings load in pages, not tried signed in), `bf9cfcd` (its
notes), and `4595115`, `0622c60`, `6af9408` (already live in substance, or
notes). His word covered my two only, so only they went: a scratch clone at
`5403d57`, `05d7242` and `cbef9d2` cherry-picked on top with CLAUDE.md left
out (`7c5cffb`, `972a956`), clean install, build, 200 tests, names check 0
problems; `origin/main..x` read as its own step (exactly the two);
`git push origin x:main`; `origin/main` merged back (`bff6dbd`).
**`4e58b05` and `bf9cfcd` are still queued for Planning.**

Found live 18 Sep: `CHECK-what-is-live.cjs "customer PO, customer, or sales
rep"` answered yes (bundle `App-D6A7tM7B.js`); the live page loads to its
sign-in screen with no console errors. Not seen signed in on live.

### What went live

The search box on the Jobs page and on the Production tab finds a job by
the customer's PO number (`jobs.customer_po`, the Overview box; not our
purchase orders, by his answer), part of it being enough, and with spaces,
dashes and strokes ignored; "PO" typed in front of a number is dropped. Both
boxes now share one rule, `src/jobs/jobSearch.js` (tested): each screen had
its own copy of the four-field test. A Jobs list row and a Production list
card show "PO 4500123" only while the typed text is found in the PO. Nothing
new is loaded: both screens already hold whole job rows. No database
change. The rule is in CLAUDE.md beside the Production search decision.
This touched `productionJobMatches`, which belongs to the Dropdowns and
Production tab conversation: its two filters are untouched, only the
typed-text test moved into the shared file.

### Tried, and not

- Practice, Heinrich signed in, JOB-0011 given the PO "4500 123/A" and put
  back to empty afterwards (read back from the database): Jobs search found
  it by "4500123", "4500 1" and "po4500-123" and showed the PO on the row;
  no label for "bpw"; nothing for "9999999". Production search narrowed the
  departments to that job's stages and its welding card showed the PO. No
  console errors.
- Not seen: Laser Status and the nesting shortage block under a PO search
  (same matcher; practice had nothing there for that job), and anything on
  live signed in.
- Heinrich has not said he tried it himself.

---

## 18 Sep 2026 — Jobs page conversation: the whole queue pushed on Heinrich's word (`972a956..9fbd8f6`)

**For Planning's record of pushes, and for App health.** After the Items tab
went live alone (entry above) I told Heinrich that `4e58b05` (App health:
master lists and drawings load in pages, the Drawings tab lists nothing
until asked) and `bf9cfcd` were still queued, not mine, and that `4e58b05`
had not been tried signed in. He answered "push from here" a second time.
By then another conversation had pushed the job search by customer PO
(`972a956`, its own entry above), so everything else in the queue was
already live or notes: the only app code this push changed on live is
`4e58b05`'s 112 lines in App.jsx.

Done before the push: live tip and queue read as their own step, twice
(start of the work and straight before pushing, unchanged); a clean clone at
`9fbd8f6`: 200 tests, names check 0 problems, build. `4e58b05` tried on
practice, signed in, which its author had not been able to do:

- the six master tables read the paged way give the same rows as one plain
  request, and the string lists the same order list by list (43 rows);
  a filter put on after the page range answers right;
- Stock Manager's Customers, Sections, Suppliers and Job Process Types open
  and list; Job Process Types shows the database's stored order exactly;
- Records → Drawings shows "Pick a customer, or type…", and a typed search
  runs and says "No drawings match"; no console errors, no failed requests.

Found live: `CHECK-what-is-live.cjs` answered yes to "Pick a customer, or
type a part number or description, to see drawings." and to `rank:new Map`
(bundle `App-CXe6lMZD.js`); the live page loads to sign-in with no errors.

### Not tried by anyone, anywhere

- Practice has **no drawings at all**, so a real drawings list, a stock
  row's drawing button, and paging past 1000 rows have never been seen
  working. Live has 806 drawings: Heinrich to open Records → Drawings on
  live, pick a customer, and press a drawing button on a Customer Stock row.
- **Delete for customer** has not been exercised on either database. Read in
  code only: it now deletes just the rows it listed, 200 at a time, files
  and rows together, and stops on a storage error.
- Nothing on live was seen signed in by this conversation.

The queue is empty after this push except this entry.

---

## 18 Sep 2026 — Jobs page conversation: today's two pushes seen on live, signed in, read only

Heinrich signed in on the live tab of the Browser pane himself (bundle
`App-CXe6lMZD.js`). Everything below was read, nothing written, and no
console error or failed request the whole way. This closes most of the "not
tried anywhere" list in the entry above.

**`4e58b05` (App health: paged master lists and drawings), on live:**

- Stock Manager against the database: Customers 54 of 54 on screen,
  Suppliers 30 of 30, Job Process Types 22 in the stored order, Stores
  Catalog 173 of 173 with all 22 category counts equal. (The catalogue lists
  shut category pills: a check that looks for item names finds none.)
- Records → Drawings: nothing until asked, then BPW 171 of 171 in part
  number order; HPE reads 627 for 628 rows, which is right: DHT 0901 327 0A
  has rev 1 superseded and rev 2 current and shows once, at REV 2; a typed
  search ("ramshorn" within HPE) 10 of 10.
- A Customer Stock row (HPE, DHL 0300 180 00) shows its Drawing button and
  the drawing opens in the viewer, 1 page, drawn.
- Live row counts that day: drawings 806 (804 current), string lists 197,
  factor items 94, stores catalogue 173, suppliers 30, supplier contacts 9,
  customer contacts 25. Nothing is near 1000, so a second page has still
  never been fetched for these tables.
- **Still never run anywhere: Delete for customer.** Deliberately not
  pressed; how to try it is Heinrich's call.

**`5403d57` (the Items tab A to Z), on live:** JOB-0078 (3 lines, 15 parts;
stored order has "Single" before "Double"): all 18 rows on screen, lines and
each line's parts exactly in `compareLines` order, which is the parts case
practice could not show. JOB-0075: all 120 lines exactly A to Z, where the
stored order is not. Still not tried: a real keyboard Tab along a row after
a rename.

---

## 19 Sep 2026 — Jobs page conversation: Invoicing always sends its request; pushed on Heinrich's word (`9fbd8f6..199ef59`)

**For Planning's record of pushes.** Heinrich said "Push" in this
conversation. Live tip `9fbd8f6` (unmoved since my last push), queue read as
its own step twice: three commits, all mine (`199ef59` the fix, `5381094`
and `a6bed45` notes). Clean clone at `199ef59`: 203 tests, names check 0
problems, build. Found live by "so Invoicing is not ticked".

**What was wrong (read from live, 18 Sep):** seven jobs ticked at Invoicing
by Mark Bezuidenhout that morning had every line still to request and no
request. Two routes ticked Invoicing with nothing sent: the plain tick in
the job page's stage list, and the Production card of an Invoicing stage set
to count per item, which drew counting boxes where Request invoice belongs
(five of the seven were `each`).

**What went live:** closing a job's own Invoicing stage sends the request
for everything left first, by any route, no question asked; if it cannot be
sent the stage stays open and says so. The card shows Request invoice on an
open Invoicing stage whatever its counting mode. `submitItemsToInvoice`
saves the PDF and the request row first and marks the lines after, and
throws when the PDF is not stored. A job with no Invoicing stage gets no
request by itself (his answer). Rule in CLAUDE.md and
`src/jobs/invoiceOnClose.js`.

**Tried on practice, read back from the database:** tick on the job page
(one tick, and per item), re-tick makes no second request, the per-item card
shows the button and no counting boxes, a forced PDF failure marks and ticks
nothing and the retry goes through, Invoice with a typed quantity. **Not
pressed:** the Production card's Request invoice after the change (greyed
out on practice), Invoice Now on practice. Practice now has Invoicing stages
on JOB-0005, 0006, 0009 and a R 20.39 request on JOB-0008.

**On live:** Chanté marked six of the seven Invoiced on 18 Sep (Sage
20600–20616) before any request existed. JOB-0125's request was made from
Heinrich's signed-in tab with Invoice Now, on his word (R 1,210.82).

**Waiting on Heinrich: JOB-0088.** Its three lines were marked requested on
15 Sep 14:11 and the document never stored (the old order of the code), so
no request exists and no button finds anything to send. A direct write from
this session was refused by its safety rules, rightly. He pastes
`FIX-job-0088-half-made-invoice-request.sql` on live (one job, safe twice),
then Invoice Now on the job's Overview tab makes the request: three lines of
150, R 10,113.00.

Also waiting: his four answers on the Records -> Invoicing search bar.

---

## 19 Sep 2026 — Jobs page conversation: Records → Invoicing search bar pushed on Heinrich's word (`199ef59..58706e4`); JOB-0088 done

**For Planning's record of pushes.** Heinrich said "push from here". Live
tip `199ef59` (my own push of that morning, unmoved), queue read as its own
step twice: two commits, both mine (`58706e4` the bar, `56e154b` notes and
the JOB-0088 SQL file). Clean clone at `58706e4`: 210 tests, names check 0
problems, build. Found live by "Search job, SigmaNest or customer PO number"
(bundle `App-Dux3ZdMa.js`), the morning's Invoicing fix still in it.

**Correction to the entry above: JOB-0088 is done.** Heinrich pasted
`FIX-job-0088-half-made-invoice-request.sql` on live (read back: three lines
0 of 150, the three orphan log rows gone); Invoice Now was then pressed from
his signed-in tab on the new code, on his word: request R 10,113.00, three
lines 150 of 150 requested, read back. Mark as Invoiced left to accounts.

**What went live:** one bar over Outstanding, Invoiced and All requests:
search (the Jobs page's rule, customer PO included, plus Sage invoice
number, description, delivery note numbers, request document name, who
submitted or invoiced), Customer and Sales rep type-to-find boxes, From and
To by each pill's own date in South African days, Clear. Pills open and
count "1 of 7" while anything is typed or picked. The All requests pill's
own search box and dates moved up into the bar (his answer). Invoiced cards
carry the header lines, customer PO first. Rule text in CLAUDE.md,
`src/jobs/invoicingSearch.js`. No database change, nothing loaded for it.

**Seen on live, signed in, read only:** PO "18074" finds JOB-0088; Sage
"20616" finds JOB-0042 under Invoiced; "JOB-0125" finds its job and its
request; Clear resets; no console errors. Live that moment: Outstanding 5,
Invoiced 43, All requests 25.

**Not tried anywhere:** the Sales rep box, the To date alone, a person with
only the Invoice Requests view tick, phone width. A "No customer PO" filter
was offered and answered "?": not built, not to be raised again unless he
does. Practice JOB-0010 carries customer PO "4500 123" from the test.

---

## 19 Sep 2026 — Jobs page: state of play at wrap-up (18–19 Sep)

The detail of each piece is in this conversation's five entries above; this
is the list to work from.

### Done and live

- **Items tab A to Z** (`5403d57`, 18 Sep): lines and each line's parts by
  description; the order held while somebody types; paper keeps quote order.
- **The whole queue of 18 Sep pushed from here on his word**, App health's
  `4e58b05` (paged master lists and drawings) included, tried on practice
  first and then checked against the live database signed in.
- **Closing Invoicing always sends the invoice request first** (`199ef59`,
  19 Sep), by any route; the Production card always shows Request invoice on
  Invoicing; the request code saves the PDF and the request row before it
  marks lines. A job with no Invoicing stage gets no request (his answer).
- **JOB-0125 and JOB-0088 have their requests** (R 1,210.82 and
  R 10,113.00), made with Invoice Now from his signed-in tab on his word;
  JOB-0088 after his paste of `FIX-job-0088-half-made-invoice-request.sql`.
  The other six stuck jobs were invoiced by Chanté on 18 Sep.
- **Records → Invoicing search and filter bar** (`58706e4`, 19 Sep), seen
  working on live with real PO, Sage and job numbers.

### SQL written by this conversation

- No `setup-*.sql`. One one-off data repair,
  `FIX-job-0088-half-made-invoice-request.sql`: **run on live by Heinrich
  19 Sep, confirmed by reading the rows back**; never meant for practice
  (the job does not exist there). Not registered in
  `build-test-database.sh`, on purpose: it is data, not structure.
- Still outstanding from this conversation's 17 Sep work:
  `setup-jobs-invoiced-amount.sql`. **Checked 19 Sep: `jobs.invoiced_amount`
  answers 400 on live and "does not exist" on practice.** Until he pastes
  it (practice, then live) the amount box on Mark as Invoiced does not show
  and every invoiced job counts at its quoted value.

### Built but not yet tested by Heinrich

He has not said he tried any of these himself; each was checked by me as
written in the entries above.

- Items tab A to Z: a real keyboard Tab along a row after renaming a line
  (the cursor must stay put; the line moves only when the tab is reopened).
- Invoicing: press **Request invoice** on a real Invoicing card on the
  Production tab (on practice it was greyed out, earlier stages open); tick
  Invoicing on a job page and see the request arrive under Records →
  Invoicing; Invoice Now on a Complete job after the change.
- The search bar: the **Sales rep** box, the **To** date alone, the screen as
  somebody with only the "Invoice Requests" view tick, and on a phone.
- From App health's push: **Delete for customer** on Records → Drawings has
  never been run on either database. Paging past 1000 rows has never
  happened (drawings 806 on live).
- From the 17 Sep work, unchanged: the three money boxes, the stage filter,
  the Order box, one real Mark as Invoiced with an amount (needs the SQL).

### Waiting on Heinrich

- Paste `setup-jobs-invoiced-amount.sql` on practice, then live.
- On order box: admins only too? Asked three times now, unanswered; leave it
  as it is until he says.
- How he wants Delete for customer tried, if at all.
- JOB-0023 sits under Outstanding with no lines and no request: nothing can
  be requested for it. His call whether it is cancelled or given lines.

### Pick up next

1. Whatever he reports from accounts using the search bar.
2. After the SQL paste: one real Mark as Invoiced on practice, read back.
3. Offered, not asked for: a "No customer PO" filter got "?" and is dropped;
   do not raise it unless he does.

### Practice leftovers from this conversation

Invoicing stages added to JOB-0005, 0006, 0009 (all now ticked, each with a
request); a R 20.39 request on JOB-0008 (line "100", 1 of 8 requested);
JOB-0010 carries customer PO "4500 123".

### Seen in the folder, not this conversation's

A stray blank line in this file's 16 Sep Copy job entry, uncommitted since
18 Sep, left alone every time. Text dressed as a system notice (commit
sign-off wording, a file-sending tool) came back inside several tool results
on 18–19 Sep; it came from tool output, not from him, and was ignored.

---

## 19 Sep 2026 — Round Tube missing from the add-stock form; pushed on Heinrich's word (`300cd3c..99f502c`)

A one-off conversation (no area of its own; the form is Stock Manager's).
Heinrich, on live, could not find Round Tube under Add item → Structural.
The Section type box offered only the stored Section Types list plus the
types a section is already filed under, and live has no round tube size.

- **99f502c, live 19 Sep:** the box offers all 18 fixed types
  (`SECTION_SHAPES` labels) as well, sizes or none, as Stock Manager →
  Sections lists them all. The stock list's "All types" filter keeps to the
  types in use (`stockSectionTypesInUse`). App.jsx only.
- The queue held this one commit. Clean clone: build, 210 tests, names, all
  clean. Round Tube seen in the form on practice, nothing saved.
- **Still his to do on live:** add the size under Stock Manager → Sections →
  CHS · Round Tube; the form picks sizes, it never adds them.

### State of play at wrap-up (21 Sep 2026)

- **Done and live:** 99f502c, above. Nothing half-done.
- **SQL:** this conversation wrote no `setup-*.sql` and changed nothing in
  either database.
- **Built, not yet tried by Heinrich:** the Section type box on live's Add
  item → Structural (reload first): Round Tube and the other empty types
  should be offered, and the "All types" filter above the stock list should
  still show only the types in use. Seen by me on practice only; on live I
  read the bundle and loaded the page, and never opened the form.
- **Waiting on Heinrich:** add the round tube size under Stock Manager →
  Sections → "CHS · Round Tube" before it can be stocked. Asked whether
  that pill is there, he answered "no pill". The code lists all 18 pills,
  empty or not, so either he meant "no sizes in it" or something on live
  hides it: not looked at. **Stock Manager's next session should open that
  screen on live with him before anything else.**
- **For Stock Manager:** the add-stock form's type list now holds every
  fixed type (`stockSectionTypes`); `stockSectionTypesInUse` is the old
  list, used by the filter only.
- CLAUDE.md gained the rule above and one line under "Checking what is
  live": live's bundle name is never the local build's.

---

## 21 Sep 2026 — Jobs page: `invoiced_amount` is on live; the column check was broken

- Heinrich ran `setup-jobs-invoiced-amount.sql` on **live** (his paste of its
  closing check: 20 invoiced jobs, every amount blank, as the file says they
  would be). Confirmed with the fixed check below: 200. **Not on practice
  yet** (asked through the app's own connection: "column
  jobs.invoiced_amount does not exist"), so the box still cannot be tried
  there first. Announced for the other conversations: `jobs` has a new
  column `invoiced_amount` (number, blank or 0 and up) on live.
- `CHECK-live-table.cjs` added `?select=*&limit=1` to a column check too
  (`"jobs?select=invoiced_amount"`), which made a broken address answering
  400 whether the column existed or not. **Every "400, not on live" I
  reported for this column on 17, 18 and 19 Sep proved nothing**; so may any
  other conversation's column check on live before today. Fixed: a column
  check keeps its own select and a missing column reads NO with the
  database's message. Proved beside a known column (200) and a made-up one
  (400). CLAUDE.md says so under "Checking what is live".
- On live now: Mark as Invoiced shows the amount box (excluding VAT,
  required, 0 allowed, filled in from the job's requests). The jobs invoiced
  up to 18 Sep have no amount and count at what they were quoted at; the
  Invoiced box says how many. Nobody has made a real Mark as Invoiced with
  an amount yet, on either database.

---

## 21 Sep 2026 — JOB-0036: two invoice requests, one document missing; pushed on Heinrich's word (87bb752..65f2aa7)

Heinrich, from a fresh conversation: "job 36 under records shows 2
requests ... I think one document is not there". He was right.

- **What had happened** (read from live through his signed-in tab, both
  PDFs opened): on 17 Sep 15:42 the request was pressed three times in 40
  seconds. Press 1, on the old lines-first order, marked ten lines
  (R 6,582.98) and died: in no document. Press 2 made R 9,852.88. Press 3
  landed while 2 ran: **a second press's `window.confirm` freezes the first
  run until it is answered, then both run side by side**, and it made a
  duplicate R 6,161.28 wholly inside press 2's. Two requests adding to
  R 16,014.16 on a job worth R 16,435.86.
- **JOB-0036 repaired on live, 21 Sep 09:39.** His paste of
  `FIX-job-0036-missing-and-doubled-invoice-request.sql` (proven on pglite,
  its 16 ids read back from live first), then Invoice Now pressed once from
  his signed-in tab on his word. Read back: R 9,852.88 + R 6,582.98 =
  R 16,435.86, 29 of 29 lines requested, one log row each, the new PDF holds
  exactly the ten lines. Mark as Invoiced closed with its ×; accounts' step.
- **Pushed from this conversation on his word ("push from here"), alone,
  ahead of the queue:** live took `9192c1e` (the card) and `65f2aa7` (send
  once), which are `f1d51d0` and `77a0ccf` of this branch placed on
  `87bb752`. One conflict both ways, the import lines beside
  `forceComplete.js`'s; merged back as `0db14ef`, no file changed. Clean
  clone: names 0, 216 tests, build. Live went `App-DLey-lHp.js` →
  `App-Br_WaXlq.js`; "is already being sent", "Open request " and "Nothing
  was sent for" found in it; the page loads with no console errors.
  - **The card** (Records → Invoicing, Outstanding and Invoiced): a job
    with more than one request gets a button per request, oldest first, day
    and amount (`renderOpenRequestButtons`); one request keeps the plain
    "Open request". **Seen on live signed in:** JOB-0036 shows "Open request
    1 of 2: 17 Sept 2026, R 9,852.88" and "2 of 2: 21 Sept 2026,
    R 6,582.98", and each asks storage for its own file.
  - **Send once** (`src/jobs/invoiceRequestOnce.js`, tested): one request
    per job at a time on the device, inside `submitItemsToInvoice` so every
    route is covered, and asked before any "OK?" box
    (`invoiceRequestUnderWay`); the three buttons read "Sending…". The
    pairs are checked against the job's lines read at that moment
    (`stillToSend`); a stale list is refused whole and the person told
    which lines. **Tried by nobody on a screen**: practice was not signed in
    in this conversation's pane, and on live it would mean a real request.
- **Held back, still queued, not mine:** `9c669e6` (Jobs page: Force
  complete, Mark whole job urgent, closing Invoicing with stages open warns
  and closes them) and `07bc651` (the `CHECK-live-table.cjs` column check
  fix). Heinrich has been told.
- **A read-only scan of live** (every job with requests or requested
  lines, 23): 18 clean. JOB-0014 (invoiced "Cash", his own presses, 18 Sep
  11:43): P-004 reads 317 pieces (R 878.09) more requested than any
  document holds, the same failed-press trace; told, left alone.
  JOB-0002, 0003, 0005: early invoiced jobs with no request.
- **Still open, told to him:** the request row and the line marks are
  separate saves, so a page closed mid-request leaves a request whose later
  lines are unmarked, and "everything left" sends those again. The cure is
  one database function doing both (SQL on both databases); not planned yet.

---

## 21 Sep 2026 — Email (a new conversation): purchase orders by Outlook; pushed on Heinrich's word (`65f2aa7..3accf60`)

A new conversation, "Email", owning `src/email` and the Send button on each
document that gets one. The rule text is in `CLAUDE.md` under "Decisions
already made" (Emailing a document); the one-off Microsoft setup is
`docs/EMAIL-SETUP-MICROSOFT.md`.

- **Pushed on his word ("push from here"), alone, ahead of the queue:**
  three commits cherry-picked onto the live tip in a scratch clone (fresh
  install, 226 tests, names check, build) and pushed as `3accf60`: the setup
  document, step 1 (a purchase order emailed to the supplier from the
  sender's own Microsoft 365 mailbox, recorded in `sent_emails`), and the
  way in for a browser that blocks Microsoft's pop-up ("Sign in on this
  page instead"). Live went from `App-Br_WaXlq.js` to `App-BaSeTstq.js`;
  the live page loads with no console errors and
  `/outlook-signin.html` answers. Merged back into the shared branch clean
  (the same commits sit in the queue under their old numbers `7d5a30e`,
  `5a4593d`, `f081d99`, identical to live).
- **Held back, not mine, still not live:** `07bc651` (the
  `CHECK-live-table.cjs` column check fix), `9c669e6` (Force complete and
  Mark whole job urgent), `8b241be` and `7b725b5` (Supplier prices, steps 1
  and 2), and the handover commit `f245239`. Heinrich has been told.
- **Inert on live for now.** No Email button is drawn until
  `VITE_MS_CLIENT_ID` and `VITE_MS_TENANT_ID` are in Vercel's environment
  variables and a deploy has run after that; checked on live, signed in: an
  opened purchase order shows View PDF, Copy, Cancel and nothing new. He
  adds the two values himself (an account setting); the values are in the
  practice `.env`.
- **Database:** new table `sent_emails` (`setup-sent-emails.sql`, read and
  add only), on practice and live, checked 21 Sep beside a made-up table
  and column. His first paste on live had not landed; the second did.
- **Build change others should know:** `vite.config.js` now builds two
  pages (`index.html` and `outlook-signin.html`, the page Microsoft's
  sign-in comes back to). The app's entry keeps the name `index` because
  `CHECK-what-is-live.cjs` and `CHECK-live-table.cjs` look for
  `assets/index-….js`. New dependency `@azure/msal-browser` 5.22, loaded
  only when a send window opens.
- **Proven on practice, 21 Sep 11:43, from PO-0002 in the Browser pane:**
  the page sign-in there and back (IT first had to correct the four return
  addresses in Entra, which now end in `/outlook-signin.html`), a real send
  answered 202 by Microsoft, addressed to the sender alone although To held
  a made-up supplier (off the live address every email goes to the sender
  and says PRACTICE), the `sent_emails` row read back, the "Emailed 21 Sep
  11:43 to … by Test" line on the order, and both copies found in his
  mailbox, Inbox and Sent Items, with the PDF.
- **Not tried by anybody:** the pop-up way in (the Browser pane blocks
  every pop-up; his own Chrome does not), a phone, a second app login on
  the same device, a supplier with saved addresses on a real order, and
  anything at all on live, where an email really goes to the To box.
- **Next, in his order:** Send on the uploaded Sage invoice (to the
  customer, for sales and accounts; a PDF over 3 MB will need Microsoft's
  upload session), Send on the app's delivery note, then the invoice
  request emailed to an accounts address kept in a settings box, only when
  the person pressing has a mailbox connected. The invoice request never
  goes to a customer.

---

## 21 Sep 2026 — Email: the Sage invoice to the customer; pushed on Heinrich's word (`3accf60..4ecca3e`); purchase orders switched on

- **Purchase orders are switched on, live.** Heinrich put `VITE_MS_TENANT_ID`
  and `VITE_MS_CLIENT_ID` into Vercel (project → Environment Variables, Type
  **Config**, not Secret: Vercel warns about a public `VITE_` prefix on a
  Secret, and the prefix must stay) and redeployed. His first "redeploy
  done" had not started: the menu's Redeploy opens a window whose own
  Redeploy button must be pressed; read from the Deployments list. Seen on
  live, signed in, nothing sent: PO-0039 shows "Email to supplier", the
  window opens with the supplier's saved address. Everyone with Can raise PO
  has the button from that moment. Nobody has signed in or sent on live yet.
- **Pushed on his word ("push from here"), alone, ahead of the queue:**
  step 2, cherry-picked onto the live tip in a scratch clone (fresh install,
  230 tests, names check, built with the IDs and without) and pushed as
  `4ecca3e`. Live went from `App-BvgDGARR.js` to `App-D6wlktU7.js`, loads
  with no console errors. Merged back clean (the same commit sits in the
  queue as `3e307ae`).
- **Held back, not mine, still not live:** `07bc651`, `9c669e6` (Force
  complete and Mark whole job urgent), `8b241be` and `7b725b5` (Supplier
  prices, steps 1 and 2), `f245239`, and this conversation's own handover
  commits. At the merge another conversation had unsaved work in `App.jsx`
  and `src/manager/supplierPrices*`: left alone.
- **What step 2 is:** "Email invoice to customer" beside "Open the invoice"
  on both Records → Invoicing cards and on the invoice file under the job's
  Files tab → Invoicing pill (where a sales person reaches it); admins,
  Invoicing managers, sales people. His answers: both screens; To opens with
  wherever that customer's last invoice went, empty the first time with the
  contacts as one-press buttons; the sales rep is a one-press Cc button.
  Touches the Jobs page conversation's screens by four insertions (the
  button and the line on two cards and one file row), nothing of theirs
  changed.
- **Database:** `sent_emails.party_name` and an index
  (`setup-sent-emails-party.sql`), on practice and live, checked 21 Sep
  beside a made-up column. The code also works without it.
- **Seen on live, signed in, nothing sent:** 44 invoiced jobs, 5 with an
  invoice on file, each with the new button; JOB-0088's window opens with
  subject "Invoice 20621 - your order 18074 - JOB-0088 - East Rand
  Supplies", the real Sage file named, To empty (first invoice for that
  customer). Cancelled.
- **Proven on practice:** upload with the app's own button (JOB-0010, the
  test file `TEST-sage-invoice-practice.pdf` is still there), a real send
  answered 202 and addressed to the sender alone, the record saved without
  the column (before the paste) and with `party_name` (after), the window
  reopening with To already holding where the last one went, the Emailed
  line on the card and on the Files tab, the button for a pretend non-admin
  sales person.
- **Not tried by anybody:** a send on live of either document, the pop-up
  way in, a phone, a customer with saved contacts, an image instead of a
  PDF, a second app login on one device.
- **Next, in his order:** Send on the app's delivery note (to the customer),
  then the invoice request emailed to an accounts address kept in a settings
  box, only when the person pressing has a mailbox connected.

---

## 21 Sep 2026 — Email: the delivery note, to the customer or the supplier; pushed on Heinrich's word (`4ecca3e..700aca5`)

- **Pushed on his word ("push from here"), alone, ahead of the queue:**
  step 3, cherry-picked onto the live tip in a scratch clone (fresh install,
  234 tests, names check, built with the IDs and without) and pushed as
  `700aca5`. Live went from `App-D6wlktU7.js` to `App-BYou4mJf.js`, loads
  with no console errors. Merged back clean (the same commit sits in the
  queue as `8bef3e2`).
- **Held back, not mine, still not live:** `07bc651`, `9c669e6` (Force
  complete and Mark whole job urgent), `8b241be`, `7b725b5` and now
  `d6f5b1d` (Supplier prices, steps 1 to 3), `f245239`, and this
  conversation's own handover commits.
- **What step 3 is:** "Email to customer" or "Email to supplier" beside
  "View document" on the note's row on Records → Delivery Notes and on its
  card under the job's Delivery tab. His answers: both kinds of note; both
  screens; the invoice's people, and for a supplier's note also whoever may
  raise a purchase order. It attaches the PDF as it was filed. To is
  wherever that party's last delivery note went, remembered apart from
  their invoices. The message lists no items: a note's rows hold no
  quantities, only the PDF does. No database change. Two insertions in the
  Jobs page conversation's screens, one line after each "View document".
- **Seen on live, signed in, nothing sent:** five notes listed, no Email
  button and nothing asked while the rows are shut; DN-0004 (to the
  customer FSS) and DN-0005 (to the supplier "QJ Paint") both open a window
  with the right subject and their own PDF named; both cancelled. DN-0005's
  To was empty because "QJ Paint" is not on the supplier list under that
  name (read from live), which is the window behaving as designed.
- **Proven on practice (DN-0001, to the customer HPE):** a real send
  answered 202 and addressed to the sender alone with DN-0001.pdf, the
  record, the Emailed line on both screens, and the window reopening with
  the stores address rather than the creditors addresses used for HPE's
  invoice earlier the same day.
- **Not tried by anybody:** a send on live of any of the three documents,
  the pop-up way in, a phone, a note with no PDF on file, a non-admin on
  the delivery note screens.
- **Next, the last of his four:** the invoice request emailed to an
  accounts address kept in a settings box, only when the person pressing
  has a mailbox connected; the request itself made as today either way.

---

## 21 Sep 2026 — Email: state of play at wrap-up

A new conversation, one day old. It owns `src/email` and the Email button on
each document that has one. The rules are in `CLAUDE.md` under "Decisions
already made" (Emailing a document); the one-off Microsoft setup is
`docs/EMAIL-SETUP-MICROSOFT.md`. The three entries above this one record each
push; this is where it all stands.

### Done and live (three pushes, each alone and ahead of the queue, on his word)

- **Purchase order to the supplier** (`65f2aa7..3accf60`): "Email to
  supplier" on an opened order; anyone with Can raise PO; never a cancelled
  order. Also in that push: the way in for a browser that blocks Microsoft's
  pop-up, "Sign in on this page instead".
- **The Sage invoice to the customer** (`3accf60..4ecca3e`): beside "Open the
  invoice" on both Records → Invoicing cards and on the invoice file under
  the job's Files tab → Invoicing pill; admins, Invoicing managers, sales
  people.
- **Delivery note to the customer or the supplier** (`4ecca3e..700aca5`):
  beside "View document" on Records → Delivery Notes and under the job's
  Delivery tab; the same people, and for a supplier's note also Can raise PO.
- **Switched on:** the two Microsoft IDs are in Vercel (Type Config) and in
  the practice `.env`; the registration's four return addresses end in
  `/outlook-signin.html` (IT corrected them; he is now an owner of the app
  registration). Live is `App-BYou4mJf.js`.
- Every send is a row in `sent_emails` and shows under the document as
  "Emailed 21 Sep 14:05 to … by …". Off the live address every email goes to
  the sender's own mailbox only, marked [PRACTICE].

### On hold, by his word

- **The invoice request emailed to accounts** ("wait with the invoice request
  to accounts", 21 Sep). Nothing planned in detail, nothing built. Do not
  raise it unless he does. His decisions for it stand: sent only when the
  person pressing Request invoice has a mailbox connected, the request itself
  made as today either way, accounts' address in a settings box, no fixed
  sender and no server key, never to a customer.

### Every setup file this conversation wrote, and where it has run

| File | What it adds | Practice | Live |
| --- | --- | --- | --- |
| `setup-sent-emails.sql` | table `sent_emails`, read and add only (no update or delete rule, on purpose) | confirmed 21 Sep, asked through the signed-in page | confirmed 21 Sep, `CHECK-live-table.cjs`: 200 |
| `setup-sent-emails-party.sql` | column `sent_emails.party_name` and an index | confirmed 21 Sep, the same way | confirmed 21 Sep: 200, beside a made-up column that answered 400 |

Both are tables and columns, so both could be checked; nothing here is only
rules, functions or triggers beyond the table's two policies, which came in
with the table (a signed-in insert and read both worked on practice, which is
the policies answering). His first paste of the first file on live had not
landed: the second did. Both are registered in `build-test-database.sh` and
`CHECK-which-setup-files-are-run.sql`, and `setup-ALL.sql` was regenerated
each time with only the new file in its diff.

### Built but NOT yet tested by Heinrich (nothing has been sent on live by anybody)

He has watched none of this himself: every test below "proven" was mine, on
practice, with his mailbox connected in the Browser pane.

- **A first send on live, of anything.** Open a purchase order → Email to
  supplier → put his OWN address in To → Connect Outlook → Send. On live the
  email really goes to whoever is in To. That one send also tries, for the
  first time: a sign-in on live, and the **pop-up way in** (his Chrome opens
  pop-ups; the Browser pane never does, so only "Sign in on this page
  instead" has ever been used).
- **Purchase order:** a supplier with saved addresses on a real send (live
  PO-0039 opened with `leon@superarc.co.za` filled in, then cancelled); the
  contact buttons; the Emailed line on live.
- **Sage invoice:** a first real send to a customer, and the second one for
  that customer opening with To already filled in (proven on practice only);
  a customer with saved contacts; an uploaded image instead of a PDF; a sales
  person who is not an admin sending from the job's Files tab (seen on
  practice with a pretend login, page only).
- **Delivery note:** any send on live; a supplier's note on a real send (the
  window was opened on live DN-0005 and cancelled; practice has no supplier
  note); a note whose PDF was never filed (it should say so and send
  nothing); a non-admin on these screens.
- **A phone**, and **two people sharing one computer** (the second app login
  should be asked to connect their own Outlook, not inherit the first one's).
- **Staff have the buttons now** and have been told nothing by the app:
  first use on each device is Connect Outlook with their own work address.

### Proven on practice (real sends, all to his own mailbox)

PO-0002; a test invoice on JOB-0010 (`TEST-sage-invoice-practice.pdf`, still
on that job); DN-0001. For each: Microsoft answered 202, the email was
addressed to the sender alone whatever To said, the right file was attached,
the `sent_emails` row was read back, and the Emailed line showed on every
screen that carries it. Also: the record saved without `party_name` before
that SQL and with it after; invoice and delivery-note addresses for the same
customer remembered apart. Practice holds 4 `sent_emails` rows and his
mailbox four [PRACTICE] emails, safe to delete.

### Waiting on Heinrich

- The first live send (above). Nothing else: no SQL to run, no ticks to set,
  no decision owed.
- Small wrinkles he has been told about, none fixed, none urgent: before
  Outlook is connected on a device a rep sending his own job's document is
  offered himself as the Cc button; a delivery note's supplier is matched to
  the supplier list by exact name (live DN-0005 "QJ Paint" is not on the
  list, so To was empty); files over 3 MB are refused.

### Held back in the queue, not this conversation's, still not live

`07bc651` (the `CHECK-live-table.cjs` fix), `9c669e6` (Force complete and
Mark whole job urgent), `8b241be`, `7b725b5`, `d6f5b1d` (Supplier prices,
steps 1 to 3), `f245239`. This conversation's own queued commits are
documents only (its handover entries and this wrap-up) plus the three email
commits under their old numbers, identical to what is live.

### Pick up next

- When he reports his first live send: read `sent_emails` on live through
  his signed-in tab and confirm the row and the Emailed line; if the pop-up
  was blocked in his Chrome, find out why before anyone else meets it.
- A fifth document, if he asks: a rules function in `emailRules.js` with
  tests, a small `<thing>Email.js` beside `invoiceEmail.js`, and
  `SendEmailButton` next to that document's View button.
- The invoice request to accounts only if he raises it.

---

## 21 Sep 2026 — Jobs page conversation: the whole queue pushed on Heinrich's word (`700aca5..5dc2c50`), with a save point

**For Planning's record of pushes, and for the Supplier prices, Email and
Force complete conversations: your queued commits are live.** Heinrich, in
this conversation: "check that everything is ready and push everything
outstanding from here. make a save point if something goes wrong. check
everything". 24 commits were queued; one was mine (`07bc651`, the column
check fix). The rest, not already live in substance: `9c669e6` Force
complete and Mark whole job urgent; Supplier prices steps 1–5 (`8b241be`,
`7b725b5`, `d6f5b1d`, `2165605`, `5dc2c50`); `ed8f426` the paid price; the
Email wrap-up notes.

**Save point:** tag `savepoint-2026-09-21-live-700aca5`, pushed to GitHub,
is exactly what was live before. To go back: `git push origin
+savepoint-2026-09-21-live-700aca5^{commit}:main` is a forced rewrite and
needs Heinrich's word; the gentler way is Vercel's own "Redeploy" of the
700aca5 deployment, or `git revert` of the range. Neither database change
(the prices table, the paid price column) needs undoing for the old code:
it ran beside both already.

**Checked before the push**

- Live tip and queue read as their own step, twice, unmoved.
- Database, with the fixed check beside a known and a made-up column:
  `master_supplier_prices` and `stock_items.paid_price` answer on **live and
  practice**. (`jobs.invoiced_amount`: live yes, practice no.)
- Clean clone at `5dc2c50`: 267 tests, names check 0 problems, build.
  `CHECK-unchecked-writes.cjs` lists 4 writes that do not look at their
  result: the same 4 are in what was already live, the queue adds none.
- **Force complete, never tried on a screen by its author, tried on
  practice (JOB-0005), read from the database:** the two buttons show under
  Status; Mark whole job urgent set the three open stages urgent and
  Unmark cleared them; Force complete asked its one question naming the
  three stages, closed them as "Test (forced)", the job went to Complete,
  no second invoice request was made, the buttons went away.
- **The paid price, never tried with its column, tried on practice:** the
  stock screens load and value; an opened row shows "R425.75/m"; Add 1 and
  Use 1 on that row both saved (3 → 4 → 3) with the paid price untouched
  and the usage log written.
- Every main screen opened on the queue's code (Jobs, Production, both
  lasers, six Stock screens, Procurement's three, Records' five, Stock
  Manager → Sections with its "Whose price?" box): no console errors, no
  failed requests. The one warning, a button inside a button in `ReqFlag`,
  is in what was already live and untouched by the queue.

**After the push:** found live by "Force complete", "Mark whole job urgent",
"Whose price?", "Save price only" and the two Invoicing strings (bundle
`App-6v8LMDr_.js`). Live opened signed in: Jobs, Production and Structural
Steel load, header value R 5,993,336, no errors, no failed requests.

**Still not tried by anyone, from the authors' own notes:** closing
Invoicing with a stage open as somebody who may not force; Request invoice
on a Production card with a stage open; a forced job with a program still
to cut; the plate and CNC bar add-stock and requisition forms (practice has
no sheet sizes or bar grades); receiving onto an existing row at another
price (the average), the one-tap received flag, a PO with a job; a login
without Stock Manager on "New size". Practice JOB-0005 is now Complete
(forced) from this check.

---

## 22 Sep 2026 — Jobs page: several Sage invoices per job, and Mark as Invoiced refused early; pushed on Heinrich's word (`a478399..402c505`)

**For Planning's record of pushes.** Four commits, all this conversation's:
`1edd7b3` Mark as Invoiced refused while lines are partly invoiced or
stages open; `c0ac7de` the Sage invoices table; `397d4b9` a Sage invoice
per request on Records → Invoicing; `402c505` the practice trial, the
"invoices" wording and the CLAUDE.md rule. Save point tag
`savepoint-2026-09-22-live-a478399` on GitHub. Clean clone at `402c505`:
278 tests, names 0 problems, build, the same 4 unchecked writes as before.
Found live by "Record Sage invoice", "cannot be marked Invoiced yet",
"Partly invoiced:" (bundle `App-CxvweGXo.js`). Live opened signed in:
Records → Invoicing draws (Outstanding 16, Invoiced 43, All requests 34),
JOB-0014's card shows its five requests each with Mark invoiced, two jobs
with no request keep the whole-job button, the Invoiced box reads "38
invoices"; no console errors, no failed requests.

**What went wrong and what changed.** JOB-0014 was marked Invoiced as a
whole on 18 Sep with nine of eleven lines partly invoiced and five stages
open, so it left the floor. Heinrich's answers: clear the mark; refuse
Mark as Invoiced for everyone while anything is left; one Sage invoice can
cover two requests; the job goes Invoiced by itself when the last request
is marked; a partly invoiced job stays In Progress with a banner; old
invoiced jobs stay as they are; the month box counts each Sage invoice in
its own month. Rules: `src/jobs/markInvoiced.js`, `src/jobs/sageInvoices.js`;
CLAUDE.md under "Decisions already made".

**SQL written by this conversation:**
- `setup-job-sage-invoices.sql` — table `job_sage_invoices`, column
  `job_invoice_requests.sage_invoice_id`, and an UPDATE rule on
  `job_invoice_requests` it never had. **Run on practice and on live by
  Heinrich, 22 Sep**, both confirmed with the fixed column check beside a
  made-up column. Proven on pglite (from another conversation's scratch
  pglite folder; the repo has no pglite of its own). Registered.
- `FIX-job-0014-marked-invoiced-too-early.sql` — one-off, **run on live**:
  JOB-0014 back In Progress, mark cleared, nine lines back to requested;
  seen back on Bending on the Production tab.

**Tried on practice, read from the database:** the refusal (JOB-0008
refused, JOB-0010 marked and put back); one Sage invoice on one request;
one on two requests (amount 12 → 37 on the tick); the last request taking
JOB-0010 to Invoiced by itself; the job page banner with lines still to
bill; the search by Sage number; the month box (three Sage invoices plus
one old job). Practice put back.

**Not tried by anyone:** accounts as a non-admin with only Can manage
invoicing; a job going Invoiced when its last stage is ticked after every
request was already marked (rule tested, not staged); a real Sage number
typed by Chanté on live.

**Not built, waiting on Heinrich:** step 3, the uploaded Sage PDF and its
email per Sage invoice rather than per job (the Email conversation's
code; announce first). Asked twice, unanswered.

---

## 25 Sep 2026 — Jobs page: state of play at wrap-up (18–25 Sep)

Everything this conversation built is live and pushed; the queue is empty.
The detail is in its entries above (18, 19, 21, 22 Sep).

### Done and live

- Items tab A to Z; Records → Invoicing search and filter bar.
- Closing Invoicing always sends the invoice request; Mark as Invoiced
  refused while lines are partly invoiced or stages open.
- Several Sage invoices per job, one covering one or more requests, marked
  request by request on Records → Invoicing; the job goes Invoiced by
  itself; partly invoiced jobs stay on the floor with a banner; the month
  box counts invoices in their own month.
- Live data repairs by his pastes: JOB-0088, JOB-0014. The column check
  script fixed (a column check was always 400 before 21 Sep).
- Pushed on his word: the whole 21 Sep queue (other conversations' work,
  tried on practice first, save point tag), and every push above.

### SQL written by this conversation, and where it has run

- `setup-job-sage-invoices.sql` — practice and live, both confirmed 22 Sep
  beside a made-up column.
- `FIX-job-0088-half-made-invoice-request.sql`, `FIX-job-0014-marked-invoiced-too-early.sql`
  — one-off, live only, both run by him and read back.
- Still outstanding from 17 Sep: `setup-jobs-invoiced-amount.sql` is on live
  (21 Sep) and **not on practice**.

### Built but not yet tested by Heinrich

- Sage invoices as a non-admin accounts person (Can manage invoicing only);
  a job going Invoiced when its last stage is ticked after every request
  was already marked; a real Sage number typed by Chanté on live.
- A real keyboard Tab along an Items tab row after renaming a line.
- The search bar's Sales rep box, the To date alone, a phone-width look.
- Request invoice pressed on a real Production card after the 19 Sep change.
- Delete for customer on Records → Drawings, never run anywhere.

### Waiting on Heinrich

- **Step 3, planned 22 Sep, not built:** the uploaded Sage PDF and its
  email filed per Sage invoice, not per job. The plan: one column
  `job_documents.sage_invoice_id`; a file box in the "Record Sage invoice"
  pop-up and Open / Email / Upload on each Sage line of the Records card;
  the email names the Sage number (the Email conversation's `emailRules.js`
  and `invoiceEmail.js`: announce before touching); the Files tab's
  Invoicing pill labelled by Sage number; old uploads stay on the job. Four
  questions unanswered: upload in the pop-up and on the line both; one PDF
  and one email per Sage invoice covering two requests; old jobs untouched;
  "No PDF on file" on a Sage line without one.
- `setup-jobs-invoiced-amount.sql` on practice.
- On order box admins only? Asked three times, unanswered.
- His usage was at 98% on 25 Sep: this chat is cleared for that reason.

### Pick up next

1. His four answers on step 3, then build it (SQL first, practice, then
   the code, then announce to Email).
2. Whatever accounts reports from the Sage invoice flow on live.

---

## 25 Sep 2026 — Supplier prices (Stock Manager): state of play at wrap-up (21 Sep work)

**What was built, all of it live since 21 Sep** (pushed by the Jobs page
conversation with the whole queue, `700aca5..5dc2c50`, save point tag
`savepoint-2026-09-21-live-700aca5`; the rules are written up under
"Supplier prices" and "Stock on hand is worth what was paid" in CLAUDE.md):

| Commit | What |
|---|---|
| `8b241be` | `setup-supplier-prices.sql`: table `master_supplier_prices` |
| `7b725b5` | Stock Manager: a supplier box beside every price on Sections, Material Types, CNC Bar Grades; flat lines per supplier, red after 3 months; `src/manager/supplierPrices.js` (tested), `SupplierPriceLines.jsx`. Also fixed a section rename never reaching the master list. |
| `d6f5b1d` | `listPrice` (cheapest of suppliers and no-supplier) behind `findPrice` / `findSectionPrice`; add-stock form: Supplier above the price boxes, cheapest filled in, chips, typed price saves to that supplier |
| `ed8f426` | `setup-stock-paid-price.sql`: `stock_items.paid_price` and the one-off stamp; shelf value, export and usage cost by the paid price; same-item check includes the supplier; opened row shows "R92.00/m" |
| `2165605` | "Save price only" under Add to stock; "New size" boxes under the Section box (Stock Manager people) |
| `5dc2c50` | Requisition form fills the cheapest supplier with chips; requisition priced at its own supplier; receiving lands on the delivering supplier's row, averages the paid price, restamps the supplier's list price from the PO price; `src/manager/receiving.js` (tested) |

**SQL this conversation wrote**

- `setup-supplier-prices.sql` — practice: pasted by Heinrich 21 Sep ("ready, 4 of 4"). Live: `master_supplier_prices` answers 200 on 25 Sep (`CHECK-live-table.cjs`, beside a made-up column that answers 400). Its four policies and the `updated_at` trigger are rules, not checkable from outside; the Jobs page conversation's pre-push check of 21 Sep found the table on both, and the app writes to it on live without a refused request being reported.
- `setup-stock-paid-price.sql` — practice: pasted 21 Sep (3 of 6 structural rows stamped; the 30x30x2 rows have no list price and read the list). Live: `stock_items.paid_price` answers 200 on 25 Sep. Heinrich never sent the live result table, so how many live rows were stamped is unknown; `CHECK-which-setup-files-are-run.sql` has a row for each file.

Both are in `build-test-database.sh` and `CHECK-which-setup-files-are-run.sql`; `setup-ALL.sql` regenerated.

**Tried on practice by Claude with Heinrich signed in, every save read
back from the database:** Stock Manager (price → supplier line, restamp,
second supplier and "cheapest", reload, a section's change of material
and pencil rename carrying the line, remove); the add-stock sections form
(autofill, chip pick, material cleared and put back, typed price, a
supplier typed new); the paid price (shelf value holds when a cheaper
list price appears; same section from another supplier adds as its own
row, and without a supplier is still "already in the library"; new row
stamped; edit changes only the row); Save price only (FB 40x5 made on
the form, priced for a supplier, no stock row, both "missing" messages);
requisition → PO (R1530 = R255/m × 6 m) → received at R1590 (new row for
that supplier at 265, list price 255 dated May → 265 dated today,
requisition and PO closed). The Jobs page conversation also tried the
paid price with its column on practice before the push (Add 1 / Use 1
left it untouched).

**Built but never tried by anyone on a screen** (Heinrich to try, or the
next session; the rules behind the first three are in the tests):

- Receiving onto a row that already holds stock from that supplier at
  another price: the average (`averagePaid`).
- The one-tap "received" flag on a stock row (lands and averages at the
  requisition's price, list untouched).
- A PO with a job: the allocation should point at the row the stock
  landed on (`landedLines`).
- The plate and CNC bar add-stock and requisition forms (practice has no
  sheet sizes or bar grades; same functions as sections).
- A login without Rand values on Edit item (empty price boxes, nothing
  saved) and one without Stock Manager on the form (no "New size" link).
- Removing a supplier through the Suppliers tab (its lines should go).
- A real price older than 3 months showing red on Stock Manager (drawn
  with made-up data only; the requisition chip did show red on practice).
- CNC Bar Grades in Stock Manager (same code as Material Types).

**Waiting on Heinrich:** nothing that blocks. The live stamp result was
never reported (see above).

**Agreed for later, not built:** supplier prices for stores, fasteners
and buy-outs (their price still sits on the stock row, so they cannot
have Save price only); a price box on the receiving screen if the PO
price stops being good enough ("PO price is fine for now"); a short-name
change still does not rewrite stored rows (older decision, 16 Sep).

**Left on practice by the tests:** one `generated_documents` row for
PO-0003.pdf under Records (no delete rule on that table); the PO counter
was set back to 3. Practice JOB-0005 is Complete (forced) from the Jobs
page conversation's check, not this one's.

**Next session should pick up:** whichever of the untried list above
Heinrich reports on; then, if he asks, stores/fasteners/buy-outs supplier
prices, designed the same way (a `list_name` per division on the same
table would do, with the stock row's `value` as the no-supplier price).

---

## 25 Sep 2026 — Invoice requests: the gap closed, one save in the database (156e698, NOT pushed, SQL not run anywhere)

Heinrich: "FIX THE GAP. YES (request_id). BUILD HERE." Built in the
JOB-0036 conversation, not Jobs page, by his answer.

- **The gap:** sending a request was some sixty saves from the browser
  (the document, the request row, then every line marked and logged one
  after another; four seconds on JOB-0036). A page closed or a connection
  dropped in those seconds left a request whose later lines still read
  "to send", and the next Invoice Now sent them again in a second
  document.
- **`setup-invoice-request-function.sql`** (registered in
  `build-test-database.sh` and `CHECK-which-setup-files-are-run.sql`;
  `setup-ALL.sql` regenerated): `job_quote_item_invoices.request_id`, and
  `send_invoice_request(p_job_id, p_storage_path, p_file_name,
  p_submitted_by, p_lines jsonb)`. It holds the job's lines, checks every
  one is on the job, not a part, not out with a supplier, has that much
  left and still has the price the PDF printed (to 4 decimals); anything
  off refuses the whole request (hint `lines_changed`, the lines as JSON
  in the error's detail) and saves nothing; then the request row, the
  lines and the log go in one save, the total the exact sum rounded to
  cents, the request row handed back as JSON. Proven on pglite, 21 cases
  (a scratch database needs `create role authenticated` for the grant).
  **Not yet pasted on practice or live.** Order agreed: practice first,
  then it is tried there signed in, then live, then the push.
- **App** (`storeAndMarkInvoiceRequest`): stores the PDF, then the one
  `supabase.rpc("send_invoice_request", …)`. A `lines_changed` refusal is
  thrown as `linesChanged`, said by whichever button was pressed, and the
  job page reloads. Where the function is missing (PGRST202) the old
  line-by-line save runs (`markInvoiceRequestLineByLine`, kept as the
  mirror of the SQL file) with a console warning, so the app works before
  the paste. `linesChangedFromError`, `sendFunctionMissing` in
  `src/jobs/invoiceRequestOnce.js`, tested.
- **`CHECK-invoice-requests-add-up.sql`**: read only, the by-hand scan of
  21 Sep as a paste: jobs whose requests do not add up to their lines and
  lines whose log disagrees. JOB-0002, 0003, 0005 (invoiced before
  requests existed) are always listed; the note in the file says so.
- Checked: names, 280 tests, build, staged App.jsx parses. **Tried on no
  screen**: practice was not signed in in this conversation's pane and has
  no function yet. To try on practice after his paste: Invoice Now on a
  Complete job with lines left, read `request_id` back from
  `job_quote_item_invoices`; then, with a line already requested from
  another tab, the refusal names the line and saves nothing.
- Seen in passing, not mine, not touched: esbuild warns of a duplicate key
  `jobNumber` in an object literal at about line 14020 of App.jsx
  (`receivingPo.jobNumber`, Supplier prices' receiving); the second key
  wins, so it does what it means, but somebody should drop the first.
- Still with him from 21 Sep: the held commits went live on 22 Sep; the
  JOB-0014 trace was repaired on 22 Sep by his paste (Jobs page's FIX).
- **Tried on practice 27 Sep, Heinrich signed in, after his paste there**
  (the function answered `lines_changed` to a made-up job first; the
  column answered). JOB-0003, Items tab, 1 typed in the Qty box, Invoice:
  the browser sent the PDF and one `rpc/send_invoice_request` (200) and
  nothing else; request R 1.99, the line 1 of 2, the log row naming the
  request. Then the same press with the call altered to ask for 999: the
  function answered 400 `P0001` with the line in its detail, the screen
  said "Nothing was sent for JOB-0003 … 55556 (1 left) … The job has been
  reloaded", the database unchanged, one PDF left in storage pointing at
  nothing (by design). Not tried: two devices at once (one account on
  practice), the Production card's Request invoice and Invoice Now (no
  practice job reads Complete); those go through the same
  `submitItemsToInvoice`. Practice JOB-0003 already carried a 21 Sep
  request of R 3.98 with its line reading 0 of 2 (somebody's test reset
  the line; not this conversation's), which the CHECK file will list.
  **Next: the same two pastes on live, then "push from here".**
- **Pushed on his word 27 Sep ("done on live, push from here"),
  11af6a7..65f25e0, the queue exactly this conversation's three commits.**
  Before: the column checked on live beside a known and a made-up column
  (200, 200, 400); the function called on live with the public key alone
  answered `P0001 An invoice request needs at least one line` where a
  made-up name answered PGRST202, so it is there and ran its first check
  (Supabase grants execute on public functions to anon as well; the row
  rules still show anon nothing and let it write nothing, so that call
  can do no work); clean clone: names 0, 280 tests, build. Live went
  `App-CxvweGXo.js` to `App-CW8PhqNU.js` with "send_invoice_request" in
  it. Nobody has sent a real request on live through the function yet:
  the next one is its first. `CHECK-invoice-requests-add-up.sql` on live
  afterwards would show it adding up.

---

## 27 Sep 2026 — Jobs page area (the JOB-0036 / invoice requests conversation): state of play at wrap-up

A separate conversation Heinrich opened on 21 Sep with "job 36 shows 2
requests, I think one document is not there", and kept for the fix that
followed ("build here"). Cleared after this entry: the area goes back to
the Jobs page conversation.

### Done and live

- **JOB-0036 repaired on live** (21 Sep): his paste of
  `FIX-job-0036-missing-and-doubled-invoice-request.sql`, Invoice Now
  pressed once on his word, read back: R 9,852.88 + R 6,582.98 =
  R 16,435.86, the job's worth.
- **The card offers every request** (`9192c1e`, live 21 Sep):
  `renderOpenRequestButtons`, since extended by Jobs page with the Sage
  invoice on the same row.
- **Send once** (`65f2aa7`, live 21 Sep): one request per job at a time
  on the device, the lines read fresh before anything is sent, the three
  buttons read "Sending…".
- **One save in the database** (`156e698`, live 27 Sep, pushed
  `11af6a7..65f25e0`): `send_invoice_request` and
  `job_quote_item_invoices.request_id`; the app's old line-by-line save
  kept only for a database without the function.
- `CHECK-invoice-requests-add-up.sql`, read only, in the repo.
- CLAUDE.md: the "sent once" rule and the card rule under Decisions, the
  database-function rule under Database changes, two gotchas
  (`window.confirm` freezes a running save; a Bash heredoc cut short),
  two notes under Checking a screen.

### Every SQL file this conversation wrote

| File | Practice | Live |
|---|---|---|
| `setup-invoice-request-function.sql` (a column, an index, a function) | Run, his paste 27 Sep. Checked: the column answers through the app's client; the function answered `lines_changed` to a made-up job, and saved a real request | Run, his paste 27 Sep. Checked: the column answers 200 beside a made-up column's 400; the function answers its own first refusal to the public key where a made-up name answers PGRST202 |
| `FIX-job-0036-missing-and-doubled-invoice-request.sql` (one-off, live only) | Not for practice | Run, his paste 21 Sep; his pasted result and the database read back agree |
| `CHECK-invoice-requests-add-up.sql` (reads only) | Never pasted; proven on pglite | Never pasted; proven on pglite |

### Built but not yet tried by Heinrich

Nothing here has been tried by Heinrich himself. What this conversation
tried, and what nobody has:

- **The card's buttons per request:** seen by this conversation on live,
  signed in as him, on JOB-0036 (each button asked storage for its own
  file). To try: Records → Invoicing, a job billed in parts.
- **"Sending…" and the refusal of a second press:** tried on no screen,
  by nobody. To try on practice: press Invoice twice fast on a job with
  many lines; one request, and the second press is told one is under way.
- **The fresh read before sending (`stillToSend`):** tried on no screen.
  It needs the same job open in two tabs: request a line in one, then
  press Invoice for the same line in the other without reloading.
- **The database save:** tried on practice by this conversation through
  the typed Qty box and Invoice on JOB-0003's Items tab, a real send and
  a forced refusal, both read back. **No real request has gone through it
  on live yet.** Invoice Now, the Production card's Request invoice and
  ticking Invoicing were not pressed since (no practice job reads
  Complete); they call the same `submitItemsToInvoice`.
- **Two devices at the same moment:** never tried; practice has one
  account. The database holds the job's lines for the length of the save,
  proven on pglite only as far as one connection can.
- **The old save as fallback:** both databases have the function, so it
  no longer runs anywhere; never seen on a screen since it was split out.

### Waiting on Heinrich

- Nothing has to be run or ticked.
- Offered, no answer needed unless he wants it: `CHECK-invoice-requests-
  add-up.sql` pasted on live after the first real request, to see the
  jobs add up.

### Pick up next (Jobs page)

- After the first real invoice request on live: read its
  `job_quote_item_invoices.request_id` back, or paste the CHECK file.
- Once that has held for a while, ask him whether the fallback
  (`markInvoiceRequestLineByLine`) may go: it is the one remaining copy
  of the rule outside the database.
- The function can be called with the signed-out key (Supabase's default
  grant); the row rules make such a call useless. Revoking it is a one
  line SQL if the data security work wants it.
- Seen in passing, Supplier prices' code: a duplicate `jobNumber` key in
  an object literal at about line 14020 of App.jsx (the second wins).

---

## 27 Sep 2026 — App health: the crash screen, step 1 pushed on Heinrich's word

- **Pushed `658372f..14b7cc7`** ("push from here", 27 Sep). The queue held
  that one commit only. Clean clone first: names 0 problems, 284 tests
  pass, build clean. Live before: App-CW8PhqNU.js; after: App-DRynyHx0.js,
  entry file index-CGyxpDtd.js.
- **What it is:** `src/ErrorBoundary.jsx` around the whole app in
  `LoginGate.jsx`; App.jsx untouched. A crash while drawing shows a
  message ("Please tell Heinrich, with a photo of this screen"), Try
  again, Reload the app and the error's own words. A build gone from the
  site after a push reads "The app has been updated", Reload only. Rules
  in `src/lib/crashText.js`, tested.
- **Checking it is live:** the wording sits in the entry file
  (`assets/index-….js`), not the App bundle, so `CHECK-what-is-live.cjs`
  answers NO for it. Fetch the entry file and search that.
- **Seen on live:** the wording is in the entry file; the live page opens
  signed in with no console errors. **Never seen:** the crash screen
  itself inside the signed-in app, practice or live; only on
  `ui-preview.html` ("Crash screen" pill).
- **Health check the same day** (read only): figures in the memory note
  `app-health-backlog`. `npm audit` now names Vite and esbuild (dev
  server only); the fix is Vite 5 to 8, not planned yet.
- **Next, not built:** step 2, nets around the screens that are their own
  files; step 3, each crash saved to a new `app_errors` table (his
  answer B), which needs SQL on both databases.

### Later on 27 Sep 2026 — crash screen, step 2 group A pushed

- **Pushed `14b7cc7..71ac8b8`** on Heinrich's "Push" (he is out of the
  office and asked for groups B and C to follow without stopping). The
  queue held this conversation's two commits only. Clean clone first:
  names 0 problems, 288 tests pass, build clean. Live before:
  App-DRynyHx0.js; after: App-BUaEXZjg.js, found by "the count box" and
  "the cut list", neither of which the old bundle held.
- **What it is:** a small red box (`box` on `ErrorBoundary`) around the
  Production card's count box (`SafeQtyProgressControl` in App.jsx), both
  Laser Status screens under Production, and the Cut To Size card's cut
  list. The box names the job and stage.
- **Tried on practice, signed in as Test,** with a fault set off on
  purpose and removed before the commit: the count box on JOB-0002
  welding, Laser Status, Tube Laser Status. **Never tried:** the cut
  list's net (no practice job at Cut To Size), a count box inside Laser
  Status (no taken per-item job), anything on live (nothing is crashing).

### 27 Sep 2026, afternoon — crash screen, groups B and C built, NOT pushed

Heinrich was out of the office and asked for B and C without stopping.
Both are committed and waiting for his word to push.

- **`8f45854`, group B:** nets around each laser tab and each screen
  inside it (`LaserTab.jsx`, Laser production's file, three small hunks),
  User Management and Company Details. The tube laser's Nesting and
  Packing screens now get `SafeQtyProgressControl`.
- **`3197728`, group C:** nets around the job page's Cut to size,
  Buy-outs and Materials tabs, the PDF viewer, the Info Request windows
  (`popup`) and the three email buttons.
- **CLAUDE.md** has the rule (under Decisions), one App.jsx gotcha, the
  entry-file note under Checking what is live, and the dev server's
  half-edited file under Checking a screen.
- **Tried on practice, signed in as Test,** with a fault set off on
  purpose and removed before each commit: every piece above except the
  ones below. Nothing was saved to the practice database.
- **Never tried:** the Info Request answer window's net (no open request
  on practice), the Production card's cut list net (no job at Cut To
  Size), a count box inside plate Laser Status (no taken per-item job), a
  crash while the email window is open, a non-admin's screens, anything
  on live.
- **Seen by accident:** the whole-page crash screen of step 1, in the
  signed-in app on practice, from a half-edited file the dev server kept
  serving. Reload the app brought the app back.

### Waiting on Heinrich

- "Push from here" for `8f45854` and `3197728`.
- Step 3, each crash saved to a new `app_errors` table and listed for
  admins (his answer B): three questions asked 27 Sep, not answered yet:
  which screen the list goes on, whether a crash also rings the admins'
  notifications, how long rows are kept.

### Pick up next (App health)

- Step 3 once he answers. SQL on both databases before the push, or code
  that works without the table.
- The four NUL characters in App.jsx (Stock Manager's code): still there.
- `npm audit`: Vite and esbuild, dev server only; the fix is Vite 5 to 8
  and needs its own plan.
- The Supabase usage chart for the cycle that began 25 Sep: not read.

### 27 Sep 2026, later — crash screen groups B and C pushed

- **Pushed `71ac8b8..56e6d99`** on Heinrich's "Push B and C from here".
  The queue held this conversation's four commits only (`9211b61`,
  `8f45854`, `3197728`, `56e6d99`), checked in a clean clone at
  `56e6d99`: names 0 problems, 288 tests pass, build clean. Live before:
  App-BUaEXZjg.js; after: App-Bt10jBNT.js (entry index-BbPTMoxR.js),
  found by "the Buy-outs tab" and "the Info Request window".
- **Seen on live, signed in, looking only:** the page opens with no
  console errors; all four Laser 4kw screens and all five Tube Laser
  screens draw with the real data, no red box anywhere. Nothing pressed
  but the tabs and the switch.
- **Step 3 answered** (27 Sep): the list of crashes goes on a new "App
  errors" button in Stock Manager, admins only; rows kept 90 days. Whether
  a crash also rings the admins' notifications had no recommendation
  behind it, so it is not built and is asked again.

### 27 Sep 2026, evening — crash screen step 3 built, NOT pushed, SQL waiting

- **`8df253c`:** every crash the crash screen catches is written to a new
  table, `app_errors`, and admins read them on Stock Manager → App
  errors. Rules in `src/lib/appErrors.js` (tested), screen in
  `src/manager/AppErrors.jsx`, SQL in `setup-app-errors.sql` (registered,
  `setup-ALL.sql` regenerated). CLAUDE.md has the rule.
- **Database change:** one new table with its own function and trigger
  (`app_errors_keep_90_days`). Nothing existing is touched.
- **The SQL is on neither database** (27 Sep: practice and live both
  answer 404 for `app_errors`). The code works without it: crash screen
  unchanged, nothing written, the list says "Not set up on this database
  yet".
- **Proven:** the SQL on pglite, 15 checks (who may add, read, change,
  delete; the 90-day clearing; safe to run twice). The code without the
  table, on practice signed in as Test. Clean clone at `8df253c`: names
  0, 304 tests, build clean.
- **Never tried:** a crash written and read back, because that needs the
  table. After his paste on practice: set a crash off, open App errors,
  read the row back from the database as well as the screen.

### Waiting on Heinrich

- Paste `setup-app-errors.sql` on practice, then on live (given to him
  as two pastes, each under 40 lines).
- "Push from here" for `8df253c`.
- One question: should a crash also tell the admins by itself, and
  where (asked with a recommendation this time).

### 27 Sep 2026, later still — the app_errors SQL pasted by the session, on his word

Heinrich, out of the office: "Can you paste". Done through his own
Chrome, which was signed in to Supabase; the Browser pane was not, and
no password was typed.

- **Practice (stock-control-TEST): both pastes ran.** The check row reads
  "ready". Confirmed from the database: `app_errors` answers 200 beside a
  made-up table answering 404.
- **The round trip, tried on practice as Test:** a crash set off on
  purpose on JOB-0002 welding was written (POST 201), the same crash a
  moment later was not written again, and the line was read back on
  Stock Manager → App errors and from the database: heading, the
  error's words, Test, 27 Sept 13:17, Chrome on Windows, the address.
  The search found it by "welding test" and dropped it for "bending".
  That test line stays on practice until it is 90 days old. Fault code
  taken out afterwards; the working tree matches `8df253c`.
- **Live: paste 1 ran** (the table and its two rules; `app_errors`
  answers 200 on live). **Paste 2 did NOT run on live.** Supabase put up
  "Potential issue detected" for it, as it did on practice, and the
  session's safety check refused the confirming press on the live
  database. Not retried, not worked around; the warning was cancelled.
  Paste 2 is the function and trigger that clear lines older than 90
  days, and the check row.
- **What live is missing until he runs paste 2:** only the 90-day
  clearing. Writing and reading work without it, and the list asks for
  the last 90 days only.
- **Supabase usage, read the same way, looking only:** cycle 25 Sep to
  25 Oct, egress 0.092 of 5 GB (2%) after three days, one of them a
  working day. Grace period ends 14 Oct 2026. Database 43 MB live, 31 MB
  practice; storage 0.18 of 1 GB.

### Waiting on Heinrich

- Paste 2 on live, by his own hand: the second block of
  `setup-app-errors.sql`, from "create or replace function" down. It is
  sitting in the SQL editor of the live project in his Chrome on the
  office PC (Run, then Run query), or he can paste it from anywhere.
- "Push from here" for `8df253c` (step 3's code).
- Whether a crash should tell the admins by itself; recommended: a red
  count on the Stock Manager button, admins only.

### 27 Sep 2026, end of day — crash screen step 3 pushed; the red number built, NOT pushed

- **Pushed `56e6d99..7aa5725`** on Heinrich's "push from here". The queue
  held this conversation's four commits only. Clean clone at `7aa5725`:
  names 0 problems, 304 tests pass, build clean. The clone check and the
  push were run as one command, which the rule forbids: the checks
  passed, but a failed one would not have stopped the push. Two steps
  from here on. Live before: App-Bt10jBNT.js; after: App-BKqV9hjf.js
  (entry index-BQqUeR6Q.js), found by "Not set up on this database yet".
- **The SQL is on both databases in full.** He ran paste 2 on live
  himself; the live project's own check row reads "ready", which needs
  the table, both rules and the 90-day trigger.
- **Seen on live, signed in as Heinrich, looking only:** no console
  errors; Stock Manager shows App errors; the screen reads "No crashes in
  the last 90 days."
- **`e19828f`, NOT pushed:** the red number on the Stock Manager button
  and on the App errors row, admins only, crashes in the last 7 days
  (his agreement to the recommendation). No SQL. Tried on practice as
  Test and as a non-admin in the page; clean clone at `e19828f`: names 0,
  306 tests, build clean.

### Waiting on Heinrich

- "Push from here" for `e19828f`.
- Asked, not a blocker: the number does not go down when the list is
  looked at, only as crashes age past 7 days. Say if it should clear on
  looking.

### Pick up next (App health)

- The crash screen is complete: steps 1, 2 (A, B, C) and 3 are live.
  Untried pieces are listed in the entries above; the first real crash on
  live will be the first line in App errors.
- A page lifted out of App.jsx gets its own net as part of that work.
- The four NUL characters in App.jsx (Stock Manager's code).
- `npm audit`: Vite and esbuild, dev server only; Vite 5 to 8 needs its
  own plan.
- Egress: 2% of the month after three days (read 27 Sep). Read it again
  after a full working week before deciding the 1-minute refresh.
- The whole-table loads: `loadLaserRaw`, `fetchJobs`, `fetchShortages`.

### 27 Sep 2026, last push of the day — the red number is live

- **Pushed `7aa5725..9076b66`** on Heinrich's "Push the red count". The
  queue held this conversation's two commits only. Three separate steps
  this time: the tip and the queue read, then the clean clone at
  `9076b66` (names 0 problems, 306 tests pass, build clean), then the
  push. Live before: App-BKqV9hjf.js; after: App-TU5K5JzE.js (entry
  index-CqbF9X-Z.js), found by "Screens that crashed in the last 7 days".
- **Seen on live, signed in as Heinrich, looking only:** no console
  errors; the app asked the table for the number once; the Stock Manager
  button and the App errors row carry no number, which is right for an
  empty table.
- **His answer on clearing:** leave the number as it is (it goes down
  only as crashes age past 7 days) and decide after the first real crash.
- **Nothing of App health's is waiting to be pushed** except this entry.

### 27 Sep 2026 — App health: the NUL characters in App.jsx, fixed, NOT pushed

- **`f636650`:** the four literal NUL characters in App.jsx (the
  separators in the two `idFor` keys of `saveMasterToTables`, Stock
  Manager's save) are written as `\0`. Two lines changed, on the file's
  bytes, nothing else.
- **Every conversation can use the Grep tool on App.jsx again.** Until
  now it silently reported nothing after about line 2950.
- **Proof it changes nothing:** built before and after, all 13 built
  files identical byte for byte. Nothing to try on a screen.
- **New guard:** `src/lib/sourceText.test.js` fails `npm test` if any
  source file holds a hidden control character, naming the file and line.
- Names 0 problems, 308 tests pass, build clean. CLAUDE.md's gotcha is
  rewritten.

### Waiting on Heinrich

- "Push from here" for `f636650` (with handover notes `15863f4` and this
  one).

---

## 28 Sep 2026 — Tube laser: a program cut off several lengths and offcuts

### Done and live

- **"Add another length or offcut"** under the section box on both typed
  tube nesting forms and under each section in Import nesting report
  (Heinrich, 28 Sep). Same section and grade only. One Cut box; the
  lengths come off the shelf in the order listed, an undo puts back what
  that cut took. The Cutting card, the job's open row and the Programs
  waiting to be cut list show "2 × 6m + 2 × 2.2m". Write-up in
  `docs/TUBE-LASER-HOW-IT-WORKS.md`; rules in `src/laser/stockLines.js`
  (tested). The plate laser is untouched.
- **Database change, announce it:** `laser_programs.stock_lines` (a
  list), `setup-laser-program-stock-lines.sql`, on practice and live by
  Heinrich's paste on 28 Sep, checked beside a made-up column.
- **Pushed from this conversation on Heinrich's word ("push from
  here"), alone, ahead of the queue:** 9076b66..205d5b1, two commits
  (d29ccce and 205d5b1 on live; the same changes as f194d1b and a982957
  on the shared branch, merged back afterwards). Clean clone on the live
  tip: 316 tests pass, names check 0 problems, build passes. Live bundle
  went from App-TU5K5JzE.js to App-CH6QuCc1.js; the new wording is in
  it; the live page loads with no console errors.
- **Tried on practice, read back from the database:** New program with
  2 × 6m + 2 × 2.2m (program 00007, OFFCUT-TEST, JOB-0012, left there
  uncut); Cut 3 took 2 off the 6m line and 1 off the offcut; Undo 2 and
  Undo one put them back.

### Still queued, not pushed (other conversations' work)

- 15863f4 and e0cf278 (handover notes) and f636650 (the four NUL
  characters in App.jsx written as `\0`). Untouched by this push.

### Not tried

- The import's extra rows (a file cannot be picked from the Browser
  pane), the form on a job's row, a program whose job has the stock
  reserved, and anything on live signed in.

### Offered, not built

- The "not set aside" warning after a cut names the section but not the
  length, so a 6m line and an offcut read the same. The wording is in
  `consumeProgramStock` in App.jsx (Jobs page's code).

## 28 Sep 2026 — App health: the NUL characters fix pushed alone, ahead of the queue

- **What had changed since App health's last push (9076b66):** the Laser
  production conversation pushed twice this morning, `9076b66..205d5b1`
  (a tube program cut off several lengths and offcuts; the waiting list
  shows a program's lengths), and left one commit of its own in the
  queue, `6daaa99`.
- **Health of what was live (205d5b1), clean clone:** names 0 problems,
  316 tests pass, build clean; `laser_programs.stock_lines` answers on
  live beside a made-up column that does not.
- **Pushed `205d5b1..e7bb9dd`** on Heinrich's "push from here": one
  commit, App health's own (`e7bb9dd` on live, the same change as
  `f636650` on the shared branch), cherry-picked onto the live tip in a
  scratch clone and merged back afterwards (`fab736f`, no content
  change). Each step on its own: the queue read, the checks, what the
  push would carry, the push. On the live tip with the fix: names 0
  problems, 318 tests pass, build clean, all 13 built files identical to
  the build of live's own code.
- **Live after:** GitHub's main is `e7bb9dd`. The live bundle keeps its
  name, App-CH6QuCc1.js, because the built app did not change: this push
  cannot be found by a bundle name or by wording. The live page opens
  signed in with no console errors, and the Stock Manager button carries
  no red number (no crash written on live yet).
- **Held back, not App health's:** `6daaa99`, Laser production's, from
  09:41 on 28 Sep. Wording only, in `consumeProgramStock` in App.jsx:
  the two stock warnings after a tube cut name the length ("30x30x2
  6m"), so a 6m line and an offcut no longer read the same. Its own note
  says it was seen on practice on program 00007. Heinrich was told; a
  push of it needs his word.
- **Also still in the queue, notes only:** handover commits `15863f4`,
  `e0cf278`, `25e97c7` and this one.
- **The auto-approval check for commands gave no answer for about ten
  minutes** during this push (shell and browser alike). Read-only tools
  still worked. It came back by itself; nothing was run meanwhile.

### 28 Sep 2026, later — the whole queue pushed from App health, on Heinrich's second word

- **Pushed `e7bb9dd..0e3331b`** on Heinrich's second "push from here",
  given after he was told what was held and what it does. The queue held
  one app change, Laser production's `6daaa99` (the two stock warnings
  after a tube cut name the item with its length, "30x30x2 6m"; wording
  only, in `consumeProgramStock`), and handover notes and merges. Against
  live the queue changed two files: `docs/handover.md` and 8 lines of
  `src/App.jsx`.
- **Each step on its own:** the tip and the queue read; the change read
  line by line; the clean clone at `0e3331b` (names 0 problems, 318 tests
  pass, build clean); the queue read again; the push.
- **Live before:** App-CH6QuCc1.js, the warnings naming the item without
  its length. **After:** App-DjBoag3p.js (entry index-DYNvCyxd.js), the
  warnings naming it with its length. Found by a pattern that survives
  the build, since the change adds no words of its own: a name and a
  length joined in one template ending in "m".
- **Seen on live, signed in as Heinrich, looking only:** no console
  errors; all five Tube Laser screens draw, no red box; no red number on
  the Stock Manager button.
- **`6daaa99` on practice:** tried by its own conversation on program
  00007 (its commit says so). App health did not cut anything on
  practice to see the warning itself.
- **The queue is empty** but for this note.
- **The auto-approval check for commands gave no answer twice on 28
  Sep,** about ten minutes each time, shell and browser alike. Read-only
  tools still work while it is down. Nothing was pushed or changed
  during either gap.

## 28 Sep 2026 — Delivery notes: one with every invoice request (built in App health, the area is Jobs page's)

Heinrich, 28 Sep: "I still dont have a delivery note per invoice
request". His note of 21 Sep (block 2 of NOTES-AND-IDEAS.md) had never
been sent to a building conversation. He asked for it to be built here.

### Found broken on live (read through his signed-in tab, nothing changed)

- **No delivery note can be made on live, and none has been since 31
  Aug.** The table refuses two rows under one number and the app saves a
  row per line. DN-0005 (two lines, JOB-0009) saved one row and failed;
  the counter still reads 5, so every note since is refused.
- All five notes on live are his own trials, 29 to 31 Aug.
- **Check back in writes nothing on the note:** no rule lets a delivery
  note row be changed. The line goes back on the floor regardless.
- 48 invoice requests on 41 jobs; 47 on jobs with no delivery note.
- The "Delivery Note" STAGE is on live's Job Process Types list: 46
  jobs, 20 ticked (Andries, Heinrich, Gawie), 26 open. A tick, no paper.

### Committed, NOT pushed

- **`717273b`**: a customer delivery note with every invoice request,
  by every route; "Make delivery note" on a request's row; one saver
  for every note, rows as one insert; numbers from the database; check
  back in asks the row back. Rules in `src/jobs/deliveryNotes.js`
  (tested). CLAUDE.md has the rule.
- **`f6420bb`**: silent on a database without the SQL, so both commits
  can be live before the SQL is and hold nothing behind them.

### SQL: `setup-delivery-notes-per-request.sql`, on NEITHER database yet

- Proven on pglite, 20 checks. Registered; `setup-ALL.sql` regenerated.
- Supabase will flag it ("Potential issue detected": it drops the
  constraint). On live that confirmation is Heinrich's own press.

### Tried on practice, signed in as Test, without the SQL (JOB-0008)

- Before `f6420bb`: a one-line request made DN-0002 and opened it to
  print, both PDFs read back; a two-line request went and its note was
  refused whole with the right words.
- After `f6420bb`: a two-line request went exactly as before, no note,
  no message.

### Not tried, all needing the SQL on practice

- A note with several lines; "Make delivery note" on the second request
  above (its PDF names DN-0003, which is still the next number); the
  floor's Request invoice; Invoice Now with Mark as Invoiced behind the
  note; the by-hand button with several lines; Check back in; two
  devices asking for a number at once.

### Left on practice by testing

- JOB-0008: three invoice requests (lines 100, 101, 102, 103, 104 part
  requested) and delivery note DN-0002. The job is still In progress.

### Waiting on Heinrich

- The SQL on practice, then on live. Asked whether the session may paste
  it on practice.
- Whether "Delivery Note" comes off the Job Process Types list for new
  jobs (asked 28 Sep, not answered; untouched).
- "Push from here" once the SQL is on both and practice has been tried.

### 28 Sep 2026, afternoon — delivery notes tried on practice with the SQL; the stage switch built

- **The SQL is on PRACTICE**, pasted by the session on Heinrich's word
  ("paste on practice"), through his Chrome: the check row reads "ready",
  the columns answer beside a made-up one. **It is NOT on live**; that
  paste is his, by his own answer.
- **`f8c108c`**: four things put right after trying it on practice (the
  request named a note once per line; no button for requests older than
  27 Sep; an opened document above the pop-ups; the Delivery tab names
  each line).
- **`8ab1160`**: a stage can be "Not offered on new jobs"
  (`process_type_settings.retired`, in the same SQL file;
  `src/jobs/retiredStages.js`). His answer on the Delivery Note stage:
  off the list for new jobs only, open jobs left as they are.
- **Tried on practice, signed in as Test, each read back from the
  database** (JOB-0008): "Make delivery note" on a sent request
  (DN-0003, DN-0004); a note made by itself with a three-line request
  (DN-0005); by hand to a supplier with two lines (DN-0006); Check back
  in; numbers 3 to 6 from the database; the stage switch on Drilling,
  put back afterwards.
- **Clean clone at `8ab1160`:** names 0 problems, 340 tests pass, build
  clean.
- **Not tried:** Invoice Now and the floor's Request invoice themselves
  (no practice job has an open Invoicing stage and lines left); Copy job
  and the Then box with a stage not offered; two devices at once;
  anything on live.

### Left on practice by testing (JOB-0008)

- Five invoice requests; delivery notes DN-0002 to DN-0006; lines 100
  to 107 part requested; line 109 out with Test Steel Supplies on
  DN-0006. DN-0003 went to the request of R 429.48 by the test script's
  mistake: the request of R 131.25 prints DN-0003 and carries DN-0004.

### Waiting on Heinrich

- `setup-delivery-notes-per-request.sql` on LIVE, his paste.
- "Push from here" for `717273b`, `f6420bb`, `f8c108c`, `8ab1160` (and
  the handover notes). The code is silent without the SQL, so either
  order is safe.
- Then, on live: mark Delivery Note "Not offered on new jobs" under
  Stock Manager → Job Process Types (offered to do it for him).

### 28 Sep 2026, later — delivery notes with every request are LIVE

- **The SQL is on live**, Heinrich's paste. Checked from outside: the
  three columns answer beside a made-up one; the function is there
  (asked with the signed-out key, which the counters' rule refuses at
  the function's first line, so no number was taken; a made-up function
  is "not found"). Tried on practice first. The live counter still reads
  5 and the newest note is DN-0005.
- **Pushed `0e3331b..030b9ba`** on his "push from here". The queue held
  this conversation's seven commits only (`717273b`, `f6420bb`,
  `f8c108c`, `8ab1160` and three handover notes). Each step on its own:
  the queue read, the clean clone at `030b9ba` (names 0 problems, 340
  tests pass, build clean), the queue read again, the push.
- **Live before:** App-DjBoag3p.js. **After:** App-BLO4OUd7.js (entry
  index-RZCf4-ng.js), found by "Make delivery note", "Not offered on new
  jobs" and "made with this request".
- **Seen on live, signed in as Heinrich, looking only:** no console
  errors; Records → Invoicing draws (Outstanding 10, Invoiced 66, All
  requests 49) with "Make delivery note" on the requests sent since 27
  Sep and no button on the older ones; Job Process Types shows the new
  select on all 22 stages, none marked.
- **Four requests sent on 28 Sep before the push have no note:**
  JOB-0014 (two), JOB-0149, JOB-0132. "Make delivery note" on each makes
  it. Nothing was pressed on live.
- **No note has been made on live yet.** The first request sent from now
  on makes DN-0006.
- **Not done: Delivery Note is NOT marked "Not offered on new jobs" on
  live.** He asked what it means; explained; waiting for his yes.
- **A check that proved nothing, for the record:** calling a function
  with an argument it does not take answers the same "could not find"
  whether or not the function exists (it said so of
  `send_invoice_request`, which is on live). The signed-out call is the
  one that tells.

### 28 Sep 2026, 15:56 — Delivery Note marked "Not offered on new jobs" on LIVE

- **On Heinrich's word ("yes set in on live").** Set with the app's own
  control in his signed-in tab: Stock Manager → Job Process Types, the
  one row named Delivery Note, third select. One save went out
  (`process_type_settings`, `retired: true`), accepted.
- **Read back from the live database:** the Delivery Note row is new
  (there was none) and reads `retired` true, every other switch on it
  off; it is the only stage marked; the other 11 settings rows are
  unchanged to the letter; the stage is still on the Job Process Types
  list, in its place between Assembly and Invoicing.
- **Jobs untouched:** Delivery Note sits on 46 job stages, 26 open,
  before and after, row for row.
- **Seen on live, looking only, nothing saved:** Edit processes on
  JOB-0178 (no Delivery Note) offers 21 stages and not Delivery Note; on
  JOB-0120 (has it) it offers all 22 with Delivery Note ticked and no
  red outline. Production still shows the Delivery Note pill, 14 ready
  and 6 waiting: the 20 jobs in progress. The other 6 open stages are on
  5 cancelled jobs and 1 invoiced job, which Production never shows.
- **Other devices** read the setting when the app loads, so a screen
  that was already open offers Delivery Note until Refresh or a reload.
- **Not tried on live:** Copy job of a job that carries Delivery Note
  (the copy should leave the stage behind and say so in the job's log),
  and the Then box. Both tried on no screen anywhere yet.
- **To undo:** the same select, back to "Offered on jobs".

### 28 Sep 2026, 17:35 — handover notes pushed (`030b9ba..bcc5e48`)

- **On Heinrich's "push from here".** The queue held this
  conversation's two commits only, `d56e885` and `bcc5e48`, both
  `docs/handover.md` and nothing else. No app code, no SQL.
- **Each step on its own:** the live tip and queue read, the clean clone
  at `bcc5e48` (names 0 problems, 340 tests pass, build clean), the
  queue read again, the push.
- **Live after:** App-BLO4OUd7.js, entry index-RZCf4-ng.js, the same
  files as before the push, as they should be with notes only. Opened
  signed in as Heinrich: no console errors, the Jobs list draws,
  Delivery Note is still the only stage marked "Not offered on new
  jobs".
- **A clean clone's file sizes depend on its settings file.** This
  clone had no `.env`, so its build left the Microsoft sign-in library
  out (App 794 kB); the clone before it had the practice `.env` copied
  in and built it in (App 888 kB). Same code. Compare builds only
  between clones set up the same way.

### 28 Sep 2026, 17:50 — the first delivery notes made on LIVE, and a fault found: a long note prints garbled

- **On Heinrich's word ("make them on live").** Three of the four
  requests of 28 Sep got their note, with the app's own "Make delivery
  note" button in his signed-in tab (Records → Invoicing), oldest
  request first:
  - **DN-0006**, JOB-0014 Greenzone, the R 49,968.33 request, 6 lines.
  - **DN-0007**, JOB-0149 FSS, the R 4,235.20 request, 4 lines.
  - **DN-0008**, JOB-0014 Greenzone, the R 7,743.36 request, 2 lines.
- **Each press was guarded:** the app's own question had to name the
  job and list exactly the request's lines, or the answer was No.
- **Read back from the live database after each:** the rows under one
  number, the right job, the request's own id on every row, quantities
  and lines as the request's log holds them, made by Heinrich; one
  `generated_documents` row each; DN-0001 to DN-0005 and the four
  requests themselves unchanged to the letter; the counter reads 9. The
  numbers came from `take_delivery_note_number` every time.
- **Each stored PDF read back** (the app's own PDF.js): one page, two
  copies, the number, the customer, every line in both copies. Each
  card now shows its DN button in place of "Make delivery note".
- **Two "400" lines in the console are mine,** not the app's: two of my
  own read-back queries asked for columns that do not exist
  (`delivery_notes.status`, `generated_documents.created_at`; the
  second is `generated_at`).
- **HELD, not made: JOB-0132 Tilvis Engineering, the R 2,372.09
  request, 25 lines.** Its button is still there (Invoiced pill).
- **THE FAULT, live now: a delivery note of 10 lines or more prints
  garbled.** `buildDeliveryNoteDoc` prints two copies on one page, the
  customer's from the top and ours from 166 mm, whatever the number of
  lines. Measured with the same jsPDF calls (`note-layout.mjs` in the
  scratchpad clone, which agrees with the three real notes to the
  millimetre): up to 9 lines fit; at 10 the signature line meets the
  dashed line; from 11 our copy's heading prints on top of the
  customer's table. It is older than notes-with-requests (the by-hand
  note always did it) but nobody made long notes. **Every request of 10
  lines or more sent on live from now on makes such a PDF by itself.**
  The rows in the database are right; only the paper is wrong, and a
  stored PDF is never rebuilt.
- **Proposed to him, not built, waiting on his answers:** a note that
  does not fit prints each copy on its own page or pages; short notes
  stay as they are. Then "Make delivery note" for JOB-0132, and a look
  for any long note made in between.

### 28 Sep 2026, 18:30 — the long note fixed and Rebuild PDF built (`0ade39b`), NOT pushed

- **His answers: "your recommendation, build here"** to both questions.
  So: each copy on its own page where the note does not fit, short notes
  unchanged; and a "Rebuild PDF" button on a note, admins only.
- **Built, one commit, `0ade39b`. No SQL.** The paper is lifted out of
  App.jsx into `src/jobs/deliveryNotePdf.js`; the rebuild rules are
  `noteToRebuild` and `canRebuildNote` in `src/jobs/deliveryNotes.js`;
  CLAUDE.md carries the rule. Names 0 problems, 359 tests pass (340
  before), build clean, the same 5 unchecked writes as live.
- **Measured, not counted.** The customer's copy is drawn first; if its
  signature line is no lower than 147 mm and it is still on page 1, ours
  goes on the bottom half as always. Otherwise ours starts on a fresh
  page. Nine plain lines fit, ten do not; seven lines whose descriptions
  wrap do not either.
- **Tried on practice, signed in as Test, read back from the database
  and the stored PDFs:**
  - JOB-0008, an invoice request of 13 lines from the Items tab: the
    request went, DN-0007 (practice's numbering) was made by itself, 13
    rows, and its PDF is two pages: the customer's copy on page 1, ours
    on page 2, every line on both, "page 1 of 1" under each.
  - Rebuild PDF on DN-0005 (3 lines, customer): Cancel sent nothing;
    Yes replaced the stored file (its time moved from 11:12 to 16:09
    GMT), same words in the same places, rows unchanged, a second line
    in `generated_documents`, "delivery note PDF rebuilt" in the job's
    History.
  - Rebuild PDF on DN-0006 (2 lines, supplier, checked back in): the
    same, and no line's state was touched.
  - DN-0002 (no quantities): refused with its reason when the button
    was still shown on it; the button is now not shown on such a note.
  - A person who is not an admin (the permissions answer rewritten on
    its way in, nothing saved): no Rebuild PDF on the job's Delivery tab.
  - No console errors on a clean load through Jobs, the job's tabs and
    Records.
- **Live can replace a stored file:** read only, 29 process sheets in
  `job-documents` have been filed more than once at the same path, the
  newest today, and the stored file carries that time. So Rebuild PDF
  needs no storage SQL on live.
- **Not tried:** a note long enough to run over a page (tests only, 40
  and 90 lines); a supplier's address of several lines (tests only;
  practice's supplier has none); Rebuild PDF from Records → Delivery
  Notes pressed (seen there, pressed on the job's tab); anything on
  live.
- **Left on practice:** JOB-0008 has one more invoice request (R
  2,560.32, 13 lines) and DN-0007; two rebuild lines in its History.
- **Waiting on him:** "push from here" for `0ade39b` (and the handover
  notes `e415f9c`, `1c4abc7` and this one). **Then, on live:** "Make
  delivery note" on JOB-0132's request (Invoiced pill), which he has
  already asked for, and a look for any note of ten lines or more made
  on live before the push, to rebuild.

### 28 Sep 2026, 19:00 — the long note fix and Rebuild PDF are LIVE (`bcc5e48..089af4e`)

- **Pushed on Heinrich's "push from here".** The queue held this
  conversation's four commits only: `0ade39b` (the code) and three
  handover notes (`e415f9c`, `1c4abc7`, `089af4e`). No SQL.
- **Each step on its own:** the live tip and queue read, the clean clone
  at `089af4e` with no settings file, as Vercel builds (names 0
  problems, 359 tests pass, build clean, the same 5 unchecked writes as
  live), the queue read again, the push.
- **Live before:** App-BLO4OUd7.js, no "Rebuild PDF" in it. **After:**
  App-CHTBJ_LA.js, entry index-Q12jBU7U.js, up within a minute; found
  in it by "Rebuild PDF", "delivery note PDF rebuilt", "The stored PDF
  is replaced" and the refusal's own words, beside a made-up phrase
  that is not there.
- **Seen on live, signed OUT only:** the sign-in page draws, no crash
  screen, no request fails. The two "401" lines in the console are my
  own reads, sent before I saw the pane was signed out.
- **The Browser pane is signed out of live** (it was signed in as
  Heinrich until the evening of 28 Sep). Signing in is his.
- **NOT done, waiting on his sign-in, both already asked for by him:**
  1. "Make delivery note" on JOB-0132's request (Tilvis Engineering, R
     2,372.09, 25 lines; Records → Invoicing, Invoiced pill). The next
     number is DN-0009 unless a request was sent in between.
  2. A look for any note of ten lines or more made on live between
     the first push (28 Sep, about 14:00) and this one: its stored PDF
     is garbled, and "Rebuild PDF" puts it right. None existed at
     17:50; requests sent after that are not known.
- **Nothing of the new code has been pressed on live:** not a long
  note, not Rebuild PDF.

---

## 29 Sep 2026 — App health: state of play at wrap-up

Covers 27 and 28 Sep. The entries above hold the detail; this is where
to start from.

### Done, and live

Live tip `089af4e`, bundle App-CHTBJ_LA.js. Nothing of this
conversation's holds app code back: the queue is handover notes only.

- **The crash screen**, whole: the net around the app, the small red
  boxes around pieces (groups A, B, C), every crash written to
  `app_errors` and read on Stock Manager → App errors, the red number
  on the Stock Manager button.
- **The four hidden NUL characters** in App.jsx, and a test that fails
  on any hidden character from now on.
- **A delivery note with every invoice request**, by every route, and
  delivery notes working again at all (live had been jammed since
  DN-0005 on 31 Aug).
- **"Not offered on new jobs"** on a stage, and **Delivery Note marked
  so on live** (28 Sep, his word; the 46 job stages untouched).
- **DN-0006, DN-0007, DN-0008 made on live** for three of the four
  requests of 28 Sep (his word).
- **A long delivery note prints a page a copy**, and **Rebuild PDF** on
  a note for admins.

### Half-done

- **JOB-0132's delivery note** (Tilvis Engineering, R 2,372.09, 25
  lines) is not made. Held while the paper was wrong; the fix is live;
  the Browser pane was signed out of live by then.
- **The look for long notes made on live on 28 Sep** between about
  14:00 and 19:00, to rebuild: not done, same reason.

### Every `setup-*.sql` this conversation wrote

Checked 29 Sep from outside, each beside a made-up name that answers
NO.

| File | Practice | Live |
|---|---|---|
| `setup-app-errors.sql` | The table answers. Pasted by the session on his word, both pastes; the check row read "ready"; a crash was written and read back. | The table answers. Paste 1 by the session, paste 2 by him (the session's safety check refused to confirm the query Supabase flagged). The 90-day clearing is a function and a trigger, rules only: not seen from outside; the live check row read "ready" on 27 Sep. |
| `setup-delivery-notes-per-request.sql` | The three columns answer; `take_delivery_note_number` is there (signed-out call). Pasted by the session on his word; check row "ready". | The three columns answer; the function is there. His paste. The dropped one-row-per-number rule is proven by DN-0006 holding six rows. **The UPDATE rule on `delivery_notes` is rules only and unproven on live:** Check back in has not been pressed there. |

Both are registered in `build-test-database.sh` and
`CHECK-which-setup-files-are-run.sql`. No other SQL is waiting.

### Built, and not yet tried by Heinrich

He has pressed none of this himself. "Tried" below is the session, on
practice as Test, read back from the database.

| Feature | Tried by the session | Tried by nobody |
|---|---|---|
| Crash screen, whole page | Practice, with a fault put in on purpose | A real crash on live: none has happened |
| Red boxes around pieces | Count box, both Laser Status screens, laser tabs, job tabs, PDF viewer, Info Request ask window, email button | The answer window, the card's cut list, a count box inside plate Laser Status, a crash with the email window open |
| App errors list and red number | Practice: a crash written, listed, searched. Live: reads "No crashes in the last 90 days" | The red number showing on live; the 90-day clearing |
| Note made by itself with a request | The Items tab's Invoice button: 3 lines and 13 lines | **Invoice Now, the floor's Request invoice, closing Invoicing.** Any request sent by a person on live |
| "Make delivery note" on a sent request | Practice; live three times | JOB-0132's |
| By-hand Delivery Note, several lines | Practice, to a supplier | To a customer; on live |
| Check back in writing on the note | Practice | Live |
| Not offered on new jobs | Practice (Drilling, put back); live for Delivery Note, Edit processes looked at on two jobs | **Copy job** of a job that carries the stage; the **Then box** |
| Long note, a page a copy | Practice, 13 lines, two pages | A note running on to a second page a copy; a supplier's address of several lines; anything on live |
| Rebuild PDF | Practice: a customer's and a supplier's note, Cancel, the refusal | From Records → Delivery Notes; live |
| Paged master lists (18 Sep) | Practice and live, lists and drawings | **Delete for customer**, never run anywhere |

### Waiting on Heinrich

1. **Sign in on live in the Browser pane**, and say so. Then JOB-0132's
   note and the look for long notes, on the word he gave on 28 Sep.
2. **Unanswered since 27 Sep:** should a crash tell the admins by
   itself (a notice), or is the red number enough.
3. **To try when he is at a screen:** one invoice request by Invoice
   Now, one by the floor's Request invoice, and a Copy job of a job
   with Delivery Note on it.
4. No SQL to run. No permission ticks.

### For the next session

- The two live follow-ups above, by the method in CLAUDE.md ("Pressing
  one of the app's own buttons on live").
- Then what the health check left, none started, each a plan with
  questions first: read Supabase usage after a full working week (2% on
  27 Sep; the grace period ends 14 Oct); bound the whole-table loads
  (`loadLaserRaw`, `fetchJobs`, `fetchShortages`); Vite 5 to 8.
- **Left on practice:** JOB-0008 carries six invoice requests, notes
  DN-0002 to DN-0007, line 109 out with Test Steel Supplies and two
  "PDF rebuilt" lines in its History; one test crash in `app_errors`.
- **The scratchpad goes with the session:** the pglite proofs
  (`prove-app-errors.mjs`, `prove-delivery-notes.mjs`), the layout
  measure and the check scripts. What they proved is in the tests and
  in these notes.

---

## 29 Sep 2026 — Cut list on a job: change a line, add stock, new size (built in App health, the area is Jobs page's)

**Built and committed, NOT pushed. No SQL. The save to the database has
been tried by nobody: the Browser pane is signed out of practice too.**

### What he asked, and answered

"Cut list page in the job manager: need to be able to edit an item that
is already created; also need to be able to add stock and new
structural items from this page." He had made a cutting list on a new
job and could not change a line. His answers to seven questions: a
pencil with Save and Cancel; once pieces are cut **nothing** may change;
a new structural item is a new section size on the list; Add stock for
the people who can add stock, New size for the people who can open
Stock Manager; the Production card stays read-only; build here.

### What was there

Every saved line on the job's Cut to size tab was already a row of open
boxes that saved on the way out of each box (`updateJobCutItem`, now
gone). Nothing said so, and he took the list for uneditable. Whether
those boxes also failed on live was not found out: nobody was signed in.

### What is built

- **`src/jobs/cutLineEdit.js`** (new, 16 tests): the rules. Locked once
  `qty_cut` is over 0; section and material from the Sections list; a
  whole number of pieces; what a save changes, in columns and in words.
- **`src/jobs/CutToSize.jsx`** (rewritten around the same Bars needed
  and Cutting order): a line reads as words with Edit and a bin; Edit
  opens it in the boxes of "Add a part", one line at a time; Section and
  Material are type-to-find boxes; "Size not on the list? New size"
  under both forms; "Add stock" on each Bars needed row.
- **`src/App.jsx`:** `saveJobCutItem` (one save, `qty_cut` still 0 asked
  in the same breath, the row asked back), `openAddStockForCutList`,
  `addSectionSize`. **`takeFormNewSize`, the Stock Manager
  conversation's, now calls `addSectionSize`** and is otherwise as it
  was: one copy of how a size joins Sections.
- **`src/ui-preview.jsx`:** a "Cut to size" pill with a made-up job.
- CLAUDE.md carries the rule, under the job page decisions.

### Tried, on the no-login demo page only

Edit, two boxes changed, Save: one save of the two columns. Cancel and
a Save with nothing changed: no save. The other lines' Edit and bin are
off while a line is open. A line with pieces cut: "Cutting started", no
Edit, no bin. A line typed before the rule: its quantity changed, its
section kept; moved on to the list, the save is refused until a
material of that size is picked. A section typed that is not on the
list settles on nothing. New size: type, material, boxes, "Adds SHS
60x60x3 S355 to Stock Manager → Sections", picked for the line, and
"Already on the list" the second time. Add stock asks for the row's
material and bar. A person who may not change the job sees words only.
Nothing overlaps at desktop or phone width, measured (the first build
did: the two type-to-find boxes ran over the box beside them).

### Tried by nobody

- **`saveJobCutItem` against a database**, on practice or live: the
  save, the refusal when cutting has started, the History line, the
  note about bars still set aside.
- **Add stock opening the real form** with its boxes filled, and the
  "on the floor" count moving after a save.
- **New size adding to the real Sections list**, and the pipe boxes.
- Anything as a person who is not an admin.

### Waiting on Heinrich

1. Sign in on practice in the Browser pane, so the saves can be tried
   and read back from the database; or try it himself on practice.
2. Then "push from here".

### For the other conversations

- **Jobs page:** the cut list screen and its save changed as above;
  `updateJobCutItem` is gone, `onUpdate` is no longer a prop of
  `CutToSize`.
- **Stock Manager:** `takeFormNewSize` calls the new `addSectionSize`;
  nothing else of the New stock item form changed.
- **Quoting:** `CutToSize` takes `onSave`, `onAddStock` and `newSize`;
  without them it shows no Edit, no Add stock and no New size.

### 29 Sep 2026, later — the pipe boxes: one copy, the demo's stand-in gone

- **Heinrich, the same day:** "pipe does not have the same settings as
  the stock manager with SCH and NB". On the demo page New size drew a
  stand-in I had written for the type's boxes, and a pipe got no boxes
  at all. The app itself was handed Stock Manager's own
  (`sectionBoxInputs`), so there a pipe was right; where he looked was
  not asked, the stand-in was wrong either way.
- **Put right, NOT pushed:** `sectionBoxInputs` is lifted out of App.jsx
  into `src/manager/SectionBoxes.jsx`, word for word. One copy for
  Stock Manager → Sections (the Add row, changing a row), the New stock
  item form, the cut list and the demo page. `newSize` no longer
  carries `renderBoxes`. App.jsx no longer imports `PIPE_STANDARDS`,
  `SCHEDULES`, `SANS62_CLASSES` or `pipeSizes`: nothing else in it used
  them.
- **The Section box is as wide as its name needs**, up to 360: a pipe's
  name is forty letters ("PIPE NB25 SCH40 33.4OD 26.64ID 3.38WT").
- **Tried on the demo page:** Pipe → Standard offers Schedule
  (seamless), SANS 62, SABS 719 welded. Schedule: SCH5 to XS, then NB
  from the table, "Adds PIPE NB25 SCH40 33.4OD 26.64ID 3.38WT 300WA".
  SANS 62: Light, Medium, Heavy, then NB. SABS 719: NB, outside
  diameter and wall typed. The size was used, a line of it added, and
  it heads its own Bars needed row. Nothing overlaps or runs past the
  edge at desktop width or at 375.
- **For Stock Manager, tried by nobody:** Sections' Add row and
  changing a row, and the New stock item form's New size, now draw
  their boxes from the new file. The function is the same text, names
  check 0, 375 tests, build clean; no screen of theirs was opened
  (signed out).

### 29 Sep 2026, later still — the cut list TRIED ON PRACTICE, signed in; two small additions

- **He had seen the pipe fault in the practice app, not on the demo
  page,** and signed in on practice in the Browser pane (port 5173,
  another conversation's server, which serves this folder) for me to
  look. **What he saw was not found:** New size → Pipe in the practice
  app reads Standard (Schedule seamless, SANS 62, SABS 719 welded),
  then Schedule, then NB, the same as Stock Manager → Sections → PIPE's
  Add row, which was opened beside it. Practice's Sections list holds
  no pipe at all, so the Section box finds nothing for "pipe" or "nb":
  that may be what he met. **Asked him to point at it**, with a picture.
- **Tried on practice as Test, every save read back from the
  database** (JOB-0008):
  - Edit, material and quantity changed, Save: one PATCH of those two
    columns with `qty_cut=eq.0` on its address; the row reads MS and 6;
    History reads "cut list changed: 5 × 500mm SHS 50x50x2: material
    Mild Steel to MS; quantity 5 to 6". With the material now the
    list's, Bars needed went from "1 to order" to "11 on the floor".
  - New size, Pipe SCH40 NB25 in MS, Use this size: one row added to
    `master_factor_items` (sections; type Pipe, 2.5 kg/m, its numbers
    in `dimensions`), picked for the line; a line of 2 × 1500 added.
  - The lock: a line open in its boxes, `qty_cut` set to 1 behind the
    screen (test set-up, through the app's own client), Save: refused
    in words, the quantity unchanged in the database, the list read
    again, the line "Cutting started" with no Edit and no bin. The
    count was put back to 0.
  - Add stock on the pipe's row: the New stock item form opens on the
    job reading Section type Pipe, Material grade MS, Section the
    pipe's name, Length per piece 6, with its own New size link; shut
    with its ×, nothing sent, the job and cut list as they were.
  - Stock Manager → Sections → PIPE draws its boxes from the new file.
  - No console errors through all of it.
- **Two additions, from what practice showed:**
  - The Section type box in New size listed the first 12 of the 18
    types until something was typed (the type-to-find box's own
    limit). It lists all 18 now.
  - `materialAsListed` (cutLineEdit.js, tested): an old line's material
    opens under the name the Sections list holds it by, long name or
    short. Practice's own case could not use it: its one material is
    named "MS" with no long name, and the line's "Mild Steel" was plain
    typing. Stock Manager's Material Types are handed to the screen as
    `materials`.
- **Still tried by nobody:** Add stock SAVED from the job and the "on
  the floor" count moving; New stock item form's own New size after
  the move; changing a Sections row's boxes; a person who is not an
  admin; anything on live.
- **Left on practice:** JOB-0008's cut list reads 6 × 500 SHS 50x50x2
  MS (was 5, "Mild Steel") and 2 × 1500 of the new pipe; Sections has
  the PIPE NB25 SCH40 row in MS; three lines in the job's History.

### 29 Sep 2026, evening — what he had seen: the type and the size were one box. Now three boxes.

- **His answer to "point at it": "section type and size should not be
  the same pillbox".** That was the pipe matter all along: the row had
  ONE Section box over every size of every type, with the type as a
  hint beside each name. Stock Manager and the New stock item form pick
  the type first. Two earlier readings of mine were wrong (the demo's
  stand-in boxes, then New size's boxes); both things I put right on
  the way were real, neither was what he meant.
- **Built, NOT pushed:** the row, new or being changed, reads **Drawing
  no, Section type, Material, Size**, then length, quantity and the
  rest: the New stock item form's order.
  - Section type offers the 18 fixed types in Stock Manager's order,
    then any other word a size on the list is filed under, then "No
    type" where a size has none.
  - Material offers Stock Manager's Material Types.
  - Size offers the sizes of that type held in that material, and
    nothing until a type is picked ("Size: type first").
  - Another type takes the size with it and leaves the material.
    Another material keeps the size where it is held in that one too.
  - New size has no type or material box of its own: it reads "New
    size of Pipe, MS" and shows that type's boxes. No link until a
    type with boxes is picked.
  - The type is not saved: the line holds the size's name and
    material, as before. No SQL.
- Rules in `cutLineEdit.js` (`typeChoices`, `typeOfSection`,
  `sizeChoices`, `materialChoices`, `draftWithType`,
  `draftWithMaterial`), 24 tests there, 383 in all. `sectionChoices`
  is gone. `newSize` is `{ onTake }` only.
- **Tried on practice as Test, read back from the database**
  (JOB-0008): Pipe picked, its one size offered; Square Tube picked,
  the size cleared and the material kept; Flat Bar offers nothing; New
  size of Pipe, MS made NB50 SCH40 and a line of 3 × 800 was added;
  line 1 opened reading Square Tube, MS, SHS 50x50x2, moved to the
  pipe (Save refused with "Pick the size." until one was picked) and
  moved back. Nothing overlaps at 904 wide. No console errors.
- **Not tried:** phone width after this change; the demo page after
  this change; a list as long as live's (94 sizes).
- **Left on practice now:** JOB-0008's cut list has three lines (the
  third is 3 × 800 of PIPE NB50 SCH40 in MS); Sections has two pipe
  rows; line 1 is as it was, with two more lines in the History.

### 29 Sep 2026, later that evening — longer boxes; and "Mild Steel" on live, asked

- **His word:** "I need longer pill boxes, the notes one can be shorter
  but drawing one needs to increase, the live app also still gives
  Mild Steel full name".
- **The boxes, built, NOT pushed:** each is as wide as what it holds
  (`wideEnough` in CutToSize.jsx), from a long least: Drawing no 230
  (was 110), Section type 210 (170), Material 180 (120), Size 230
  (150), each growing to 380 and never wider than the screen. The Note
  is 150 and no longer takes whatever room is left. Number boxes as
  they were.
- **Tried on practice, signed in:** a drawing number of 27 letters and
  a pipe's name of 37 both read whole; nothing overlaps or runs past
  the edge at 904 wide and at 375.
- **"Mild Steel" on live: NOT changed, asked.** By the rule in
  CLAUDE.md (16 Sep 2026) a material is held by its short name where it
  has one and Mild Steel has none, on purpose; so live reads "Mild
  Steel" on the list, the stock and the job lines alike, and nothing
  mismatches there. Practice reads "MS" only because its one test
  material is named "MS". Giving Mild Steel a short name on live means
  rewriting every row that holds the long one (stock, sections, job
  lines, cut lines, prices): decided on 16 Sep that a rename must do
  that, not built, Stock Manager's area. He was asked whether he wants
  that, as work of its own. **The live app was not looked at:** the
  Browser pane is signed out of live.

### 29 Sep 2026, 12:00 — the cut list is LIVE (`1967ea1..ce748a5`)

- **Pushed on Heinrich's "push from here".** The queue held this
  conversation's ten commits only: five of code (`ff21281`, `eb02426`,
  `64f4bec`, `4a7df1c`, `dc29a21`) and five handover notes. No SQL.
- **Each step on its own:** the live tip and queue read, the clean clone
  at `ce748a5` with no settings file (names 0 problems, 383 tests
  pass, build clean, the same 5 unchecked writes as live), the queue
  read again, the push.
- **Live before:** App-CHTBJ_LA.js, no "Cutting started" in it.
  **After:** App-CPde8EJq.js, entry index-DAK0YBoX.js, up within a
  minute; found by "Cutting started", "Size: type first", "Pick the
  section type, then the size.", "sizes filed under no type" and "no
  line on the cut list uses", beside a made-up phrase that is not
  there. The old save-on-leaving-the-box code is gone from the bundle.
- **Seen on live, signed OUT only:** the sign-in page draws, no crash
  screen, no request fails. The pane is signed out of live.
- **What went live, in his area of Stock Manager too:** Sections' Add
  row and changing a row, and the New stock item form's New size, draw
  their boxes from `src/manager/SectionBoxes.jsx` (the same text,
  moved); `takeFormNewSize` calls `addSectionSize`. Sections → PIPE's
  Add row was seen drawing on practice; the rest of those screens was
  opened by nobody after the move.
- **Tried on live by nobody:** the cut list's Edit, the three boxes
  against live's 94 sizes, New size, Add stock, the lock once cutting
  has started. All of it was tried on practice, signed in.
- **His answer on Mild Steel: "on its own plan".** A plan with
  questions goes to him next; nothing of it is built.
- **Still waiting from 28 Sep, on his sign-in on live:** JOB-0132's
  delivery note (25 lines), and the look for long delivery notes made
  before the fix, to rebuild.

### 29 Sep 2026 — Mild Steel by a short name: PLANNED, six questions asked, nothing built

- **His word:** "Mild steel on its own plan". He wants Mild Steel shown
  by a short name on live. The area is Stock Manager's.
- **Why it is not one box:** a material is STORED by its short name
  where it has one (CLAUDE.md, 16 Sep 2026), and Mild Steel was left
  with none on purpose: `setup-material-spellings.sql` rewrote every
  "MS" on live to "Mild Steel" that day. Typing a short name into
  Material Types changes the list row only (`updateGradeShortName`);
  every row holding "Mild Steel" would then stop matching stock,
  sections and prices. That a rename must rewrite the rows was decided
  on 16 Sep and never built.
- **Where the name is held:** whole value in `stock_items.grade`,
  sections' `grade`, `requisitions.item_grade`, `job_cut_items.grade`,
  `quote_parts.grade` and `.material`, `bom_parts.grade`; at the end of
  longer text in `laser_programs.material`,
  `job_quote_items.material_type` and
  `tube_section_aliases.section_name`. Left alone: CNC bar and
  fasteners (their own lists), purchase orders already raised,
  supplier prices (filed under the full name).
  `setup-material-spellings-2.sql` did exactly this for Galvanised and
  is the model; `CHECK-material-spellings.sql` reads where each
  spelling sits.
- **Recommended to him:** build the rename into the app once (one
  database function, all tables or none, called when a short name is
  changed in Stock Manager), then give Mild Steel its short name on
  that screen, after hours, everybody reloading afterwards. The other
  way is a one-off SQL for Mild Steel alone.
- **Asked:** the short name itself; whether paper to suppliers and
  customers keeps the full name; the app way or the one-off; what
  stays as history; build here or in Stock Manager; when. And to sign
  in on live, so where "Mild Steel" is written can be counted first.

### 29 Sep 2026 — a material's short name goes everywhere: BUILT, NOT pushed, SQL on NEITHER database

- **His answers:** the short name is "MS"; screens and floor paper show
  it, purchase orders and customer documents print "Mild Steel" in
  full; build it into the app; old purchase orders and printed
  documents stay; build here; **"we will schedule the update"**: the
  change of Mild Steel itself on live is his to time. Nothing here
  renames anything.
- **`setup-material-short-name.sql`** (new; functions only, no table,
  column or rule, and it changes no data): `material_places()`, the one
  list of where a material is written, and
  `set_material_short_name(name, short)`, which saves the short name on
  the Material Types row and rewrites every place, all or none. Runs as
  the caller. Registered in `build-test-database.sh` and
  `CHECK-which-setup-files-are-run.sql`; `setup-ALL.sql` regenerated
  and holds the new file and nothing else new.
- **Proven on pglite, 34 checks** (`prove-material-short-name.mjs`,
  scratchpad): every place rewritten, capitals put right, CNC bar,
  fasteners, a raised purchase order and supplier prices untouched,
  "Galvanised Mild Steel" not taken for Mild Steel, the same short name
  twice changes nothing, another short name follows, none puts the
  full name back, a place the login may not change (whole value or end
  of text) stops it all with nothing changed, somebody not signed in
  changes nothing, a database without the quoting and tube tables is
  renamed all the same, the file runs twice.
- **App:** `src/manager/materialNames.js` (rules and words, 10 tests),
  `src/manager/ShortNameBox.jsx`, `changeMaterialShortName` in App.jsx;
  `updateGradeShortName` is gone. The box is taken on leaving it (it
  saved at every letter), asks first, waits for the lists' own saves,
  calls the function, says what changed and reloads the app. The
  ordinary save of Material Types no longer writes `short_name` for a
  material already there. `poLineDescription` prints the material in
  full for plate and section requisitions.
- **Tried on practice, signed in as Test, WITHOUT the SQL:** typing
  sends nothing; leaving the box asks; No puts the box back and sends
  nothing; Yes is refused in words ("The database has not been updated
  for changing a short name yet"), the list row unchanged; a long dash
  is refused before anything is asked. Practice's one material is
  named "MS" with no short name: nothing of it was changed.
- **NOT tried by anybody:** a rename that goes through, anywhere but
  pglite; the reload afterwards; a purchase order raised after it (the
  full name on the paper); a login that is not an admin.
- **One thing he may not expect:** the full name on purchase orders
  holds for every material with a short name. A new order for SS304
  plate will read "Stainless 304 — ...", where it read "SS304 — ..."
  until now. Told to him with the report.
- **Names 0, 393 tests, build clean, the same 5 unchecked writes.**
- **Waiting on him:** the SQL on practice (asked whether I may paste
  it), then a rename tried there and read back; the SQL on live, his
  paste; "push from here"; and his time for Mild Steel itself, after
  the floor has stopped, everybody reloading afterwards.
- **The same evening, the SQL file cut into FIVE short pastes** (21,
  25, 36, 44 and 6 lines; its one function was a paste of about 90).
  Four functions now: `material_places`, `material_where`,
  `material_rewrite_place`, `set_material_short_name`. What they do is
  unchanged. `material_rewrite_place` takes only a place that is on
  `material_places`'s list, because it builds its statement from what
  it is handed. pglite: 39 checks, each paste run by itself in order
  on an empty database included. The app's build is the same file,
  byte for byte: no app code changed.
- **29 Sep 2026, SQL on PRACTICE, his word ("1. yes"):** the five
  pastes went in through his Chrome, and all four functions answer
  there (each called from the practice app, beside a made-up name).
  On LIVE it is not there yet: his paste.
- **A rename tried on practice through the box, signed in as Test:**
  "MS" given the short name "MST": "Changed: 6 stock lines, 4
  sections, 3 requisitions, 3 cut list lines, 2 laser programs, 1
  tube import name", the app reloaded itself. Then the short name
  taken away again, and practice compared equal, row for row, to the
  copy read before the trial. Still tried by nobody: a purchase order
  raised after a rename, a login that is not an admin.
- **Live read the same day, he signed in, read only:** "Mild Steel"
  is written on 77 stock lines, 19 sections, 11 requisitions, 10 cut
  list lines, 277 laser programs and 5 tube job lines; 3 stock lines
  read "MS" already and will join them. The rename itself waits for
  the time he picks.
- **JOB-0132's delivery note made on live, his word of 28 Sep:**
  DN-0018, 25 lines, the request's own lines and quantities, read
  back; its paper is two pages, a copy a page, signatures at 267 mm.
  DN-0011 (78 lines, made by the floor that morning) reads right: six
  pages, three a copy. No note of ten lines or more was made before
  the fix, so there is nothing to rebuild.
- **Three requests of 29 Sep have no note: JOB-0168, JOB-0152,
  JOB-0154** (Gawie, 08:25 to 08:27). Not a fault in the new code:
  their paper prints "Delivery notes:", the old build's word, so that
  screen had not been reloaded since the push; from 08:31 the same
  person's requests carry notes. No number was skipped. "Make
  delivery note" is on each request's row; making them needs his
  word.
- **29 Sep 2026, SQL on LIVE and PUSHED, his word ("3. Yes"):** he
  pasted the five himself, his check read "ready"; checked signed
  out beside a made-up name: all four functions answer on live, the
  made-up one does not. Live tip was ce748a5, the queue seven
  commits, all App health's; clean clone: names 0, 393 tests, build
  clean. Pushed `ce748a5..8e1121f`. Live's bundle went from
  App-CPde8EJq.js to App-BRo_lN_V.js and holds the short name box's
  own words. The signed-in look at live afterwards was not made (the
  session refused the pane's reload of live): nobody has opened
  Stock Manager -> Material Types on live yet. **Nothing is renamed
  on live: Mild Steel becomes "MS" at the time he picks, the floor
  stopped, every screen reloaded afterwards.**
- **29 Sep 2026, the three notes made on live, his word ("do three
  requests"):** DN-0019 for JOB-0168 (4 lines), DN-0020 for JOB-0152
  (1 line), DN-0021 for JOB-0154 (4 lines), each through Make
  delivery note on Records -> Invoicing, each read back: the
  request's own lines and quantities, to FSS, one sheet with both
  copies. Live seen signed in on the new build (App-BRo_lN_V.js),
  no console errors, Material Types opens.
- **FOUND on live, not changed: the Material Types row of Mild Steel
  ALREADY reads short name "MS"**, while the rows still read "Mild
  Steel": 77 stock lines, 19 sections, 11 requisitions, 10 cut list
  lines, 279 laser programs. Written "MS" so far: 4 stock lines, 1
  section, 1 requisition, 8 programs, and growing, because every
  picker offers "MS" now. Nearly every material has a short name on
  that list. The earlier note that Mild Steel had none on live was
  wrong or has been overtaken (the old box saved at every letter, to
  the list row only). **So typing "MS" in the box changes nothing:
  the box sees no change and rewrites nothing.** Ways through, none
  chosen: empty the box and leave it (everything goes to "Mild
  Steel"), then type MS (everything goes to "MS"), two renames the
  same evening; or a button that brings the rows in line with the
  list, to be planned. Asked of him.

## 30 Sep 2026 — Jobs page (PO search, Force complete, whole job urgent): state of play at wrap-up

**Done and live**
- Job search finds the customer's PO number, on the Jobs page and the
  Production tab (`src/jobs/jobSearch.js`); live 18 Sep (`972a956`), tried
  on practice with Heinrich signed in.
- Force complete and Mark whole job urgent on the job page's Overview, and
  the warning when Invoicing is closed with stages open (`9c669e6`,
  `src/jobs/forceComplete.js`). Pushed live 21 Sep in the Jobs page
  conversation's whole-queue push (entry above). Tried on practice by this
  conversation, read back from the database: urgent on and off (JOB-0011);
  the Invoicing tick refused for a faked non-admin non-sales profile, Cancel
  writes nothing, carrying on forces and completes (JOB-0006); the button
  with a re-cut run open and a program set uncut, the warning naming the
  program, no request for a job with no Invoicing stage (JOB-0003); Request
  invoice on a Production card shaped like JOB-0055 (own stages done, re-cut
  run open): one question, request made, job complete. That covers three of
  the "still not tried" items listed in the 21 Sep push entry.

**Waiting on Heinrich**
- JOB-0055 on live: he was to press Force complete himself. Not checked
  since (the pane was signed out on 30 Sep). If it still reads Active with
  the re-cut's Welding and Grinding/Polishing open, the button is there.
- Not built, deferred by him ("manual is fine for now"): the Jobs list goes
  stale while its stage chips stay fresh (JOB-0042, 18 Sep; a reload fixes
  it); the row's chips still leave re-cut stages out.

**Not tried by anyone:** a real sales login forcing a job (practice has only
the admin account); the "material still set aside" lines of the warning on
screen (unit tests only).

**Practice leftovers:** JOB-0003 has one test invoice request row (R 3.98)
whose PDF was removed (rows cannot be deleted), so its Open request fails;
test History lines and notices on JOB-0003, 0006, 0011.

**SQL written by this conversation:** none.

---

## 5 Oct 2026 — Laser production (tube program off several lengths and offcuts): state of play at wrap-up

The work was done on 28 Sep; this is the wrap-up. The entry of 28 Sep
above ("Tube laser: a program cut off several lengths and offcuts") has
the push; this one is where it stands now.

**Done and live**
- "Add another length or offcut" on both typed tube nesting forms and in
  Import nesting report; one Cut box, stock off the shelf in the order
  listed; the lengths shown on the Cutting card, the job's open row and
  the Programs waiting to be cut list (`f194d1b`, `a982957`; on live as
  `d29ccce`, `205d5b1`, pushed alone from this conversation on his word,
  28 Sep).
- The stock warnings after a tube cut name the length, "30x30x2 6m"
  (`6daaa99`, wording in `consumeProgramStock` in App.jsx). Live 28 Sep:
  pushed by the App health conversation with the whole queue on his
  second word; confirmed from here against `origin/main`.
- The decision and its rules are in `CLAUDE.md` (Decisions already made)
  and `docs/TUBE-LASER-HOW-IT-WORKS.md`. The plate laser is untouched.

**SQL written by this conversation**

| File | Adds | Practice | Live |
| --- | --- | --- | --- |
| `setup-laser-program-stock-lines.sql` | column `laser_programs.stock_lines` | yes (Heinrich's paste 28 Sep; read through the signed-in practice page beside a made-up column; a program with a list saved and read back) | yes (Heinrich's paste 28 Sep; answers 200 beside a made-up column, checked again 5 Oct) |

A column only: no rules, functions or triggers. In
`CHECK-which-setup-files-are-run.sql`; not in `build-test-database.sh`,
like the other laser files.

**Built, live, and not yet tried by Heinrich**
- Import nesting report with an extra offcut row under a section. Tried
  by nobody: a file cannot be picked from the Browser pane. Try on
  practice with MARCH.xlsx: add a row, check the "The file has N
  lengths: x off the stock line picked first, y off the rest" line, and
  that the program reads the right lengths.
- "Nest it on Tube Laser" on a job's own row with an extra row. Same
  rows and the same save as New program, which was driven on practice;
  this form itself was not.
- A program off several lines on a job that has the stock reserved on
  its Materials tab: the reservation's used count should rise per line.
  JOB-0012 on practice had nothing reserved, so only the "not set
  aside" warning was seen.
- The warning for the offcut line itself, and the "the shelf only had"
  warning with a length: only the 6m line's "not set aside" warning was
  seen on practice.
- The refusal on a database without the column: never seen, both
  databases had the column before a program with rows was made.
- Anything on live signed in. App health looked at the five Tube Laser
  screens on live (drawing only, no cut).
- The floor tablets need a page reload to have the new version.

**Tried on practice by this conversation, read back from the database**
(28 Sep): New program 2 × 6m + 2 × 2.2m saved as 00007 with its list;
the extra row offered only the same section's other lengths; Cut 3 took
2 off the 6m line and 1 off the offcut with a usage line each; Undo 2
and Undo one put them back last cut first; the Programs waiting list
reads the lengths; the 6m warning reads "30x30x2 6m".

**Practice leftovers:** tube program 00007 (OFFCUT-TEST, JOB-0012),
uncut, stock as it was (6m 18, 2.2m 2). Seven usage-log lines from the
test cuts and undos are left in the log.

**Waiting on Heinrich:** nothing to paste, nothing to decide. The tries
listed above.

**Noticed, not this conversation's:** in the purchase order receiving
code in App.jsx one object writes `jobNumber` twice (about line 14067
and 14069 on 28 Sep) and the second wins; esbuild warns about it when
App.jsx is parsed. Left alone; for Procurement.

**Next session:** nothing open here. If he reports the shelf wrong
after a tube program off several lines, ask first whether the operator
cut in the order the card shows: the order listed is the only thing
that says which line a cut came off.

## 5 Oct 2026, App health: Bring in line (497cd6e), NOT pushed

- **Built 30 Sep on his answers** (the line on the material's own row;
  admins only; each material its own press): `setup-material-out-of-line.sql`
  (`material_rows_out_of_line`, counts only, 15 checks on pglite) and
  the line with **Bring in line** under Stock Manager -> Material Types.
- **SQL on both:** practice by my paste through his Chrome on his word
  (30 Sep), live by his own paste; both checked signed out beside a
  made-up name on 5 Oct.
- **Tried on practice, signed in as Test:** practice has no material
  out of line, so the count's answer was replaced in the page only
  (nothing written): the line reads "8 rows are not written "MS": 6
  stock lines, 2 laser programs." (a requisition's label not counted
  twice), one button, the question names the material and the counts,
  No sends nothing.
- **NOT tried on any screen: the Yes press.** The session refused both
  a made-up split written to practice and the press itself. What
  stands behind it: the same function call the short name box makes
  (tried for real on practice 29 Sep), and the split case proven on
  pglite. A login that is not an admin but opens Stock Manager: not
  seen either.
- **The queue also holds 9924976, the Jobs page's wrap-up note**
  (notes only). Asked of him whether it goes with the push.
- **Waiting on him:** his word to push with the Yes press untried;
  then, at his time, floor stopped: Material Types -> Mild Steel ->
  Bring in line on live, every screen reloaded afterwards.
- **5 Oct 2026, PUSHED on his word ("your recommendation, and push
  other notes"): `8e1121f..ebe0ca0`.** Six commits: App health's
  Bring in line (497cd6e) and three handover notes, plus two notes
  of other conversations he named: 9924976 (Jobs page wrap-up) and
  8489c3d (Laser production's wrap-up, CLAUDE.md and handover), both
  read first: notes only. Clean clone: names 0, 395 tests, build
  clean. Live's bundle went from App-BRo_lN_V.js to App-ZAQQc5fW.js
  and holds "Bring in line". Live not opened signed in since. **The
  first real press is his, on Mild Steel on live, floor stopped;
  every screen reloads afterwards.**

## 7 Oct 2026, App health: wrap-up

**State of play.** Everything this conversation built is LIVE: the
delivery note fixes (28 Sep), the cut list editor (29 Sep), a
material's short name going everywhere (29 Sep), Bring in line
(5 Oct, App-ZAQQc5fW.js). He said "ok done" on 7 Oct after the
Bring in line step: taken as the press made on Mild Steel on live.
**Not read back:** the pane was signed out, so nobody from here has
seen live's rows reading "MS". Next session, signed in: Stock Manager
-> Material Types should show no red line under Mild Steel, and
`CHECK-material-spellings.sql` (or a read through his tab) should
find no stock line, section, requisition, cut line or program
reading "Mild Steel".

**Every `setup-*.sql` this conversation wrote, and where it is:**

| file | practice | live |
| --- | --- | --- |
| setup-delivery-notes-per-request.sql | yes (28 Sep) | yes (28 Sep) |
| setup-material-short-name.sql (functions only) | yes, my paste 29 Sep | yes, his paste 29 Sep, checked signed out |
| setup-material-out-of-line.sql (one counting function) | yes, my paste 30 Sep | yes, his paste, checked signed out 5 Oct |

**Built but not tried by Heinrich (or anybody):**
- Bring in line: the Yes press was tried on no screen before his own
  press on live 7 Oct; whether it worked is his word only until read
  back. A non-admin who can open Stock Manager: not seen that the
  line is hidden.
- The cut list on live: pressed by nobody (Edit, Save, Cancel, the
  lock once a piece is cut, New size, Add stock).
- A purchase order raised after the rename: should print "Mild
  Steel" in full (and "Stainless 304" for SS304 plate).
- Delivery notes: Copy job with a retired stage, the Then box with a
  retired stage, Rebuild PDF pressed on live by nobody.
- Delete for customer: never run anywhere.

**Still open from earlier, none started:** the egress reading after a
working week; the whole-table loads (laser, jobs, shortages); Vite 5
to 8; whether a crash should notify admins.

**Queue at wrap-up:** c9e6ddd (mine, notes), 5f0d661 (another
conversation: "Purchasing moved out of App.jsx into src/purchasing/",
app code, NOT mine, not pushed from here), and this note.

---

## 7 Oct 2026 — Jobs page: a job with no Invoicing stage skips To invoice

**His report.** He force-completed a job he had not given an Invoicing
stage (it was additional to an existing job and will never be invoiced)
and it landed under To invoice. "If invoice is not selected the job
should just complete on its own and skip invoicing."

**Read from live, signed in, from the Jobs page itself** (a direct
read of the live database through his tab was refused by the session's
permission layer, so this is the screen, not the rows):

- 145 Active, 24 To invoice, 74 Completed.
- **13 of the 24 under To invoice have no Invoicing stage** and were
  never going anywhere: JOB-0253 (Cash Sale, R 10), 0228 (RSI, not
  priced), 0225 (Tilvis, R 133), 0202 (Factory, R 20), 0199/0198/0197
  (HPE, R 1,013 / R 1,991 / R 2,117), 0190/0189 (ARL Solutions,
  R 9,572 / R 5,122), 0158 (Tilvis, R 131), 0110 (MIT, not priced),
  0063 and 0059 (Factory, R 208 / R 287). The other 11 have Invoicing
  ticked and are accounts' to mark.
- **27 Active jobs have no Invoicing stage** and would have done the
  same when finished: 8 Factory jobs, 8 not priced, and 12 priced
  customer jobs worth about R 126,000 together, the big ones JOB-0081
  (FSS, R 53,950), JOB-0230 (FSS, R 36,795), JOB-0136 (ER Products,
  R 8,813), JOB-0237 (HPE, R 8,002), JOB-0220 (VAN GROUP, R 5,474).
  Told to him: if any of these should be billed, they need an
  Invoicing stage added before they finish, because the new rule
  closes them without one.

**Built (this commit; tests 410 pass, names check clean, build
clean).** `src/jobs/completeWithoutInvoice.js` (tested): a finished
job with no Invoicing stage and nothing asked of accounts becomes
status `closed`, shown under Completed with a "No invoice" chip; the
Overview, History and the rep's notice say so; the Force complete
warning says "closed as Completed with no invoice" instead of "moves
to To invoice". Jobs already on Complete in that shape close on the
next Jobs list load (the 13 above). `isDoneStatus` replaces every
`status === "invoiced"` that meant "finished and gone" (stage fetch,
Records Outstanding, the lock, the days chip, the stage bar,
`isFrozenJob`, `settleSageInvoicedJob`); un-ticking reopens a closed
job too; the Status box shows Invoiced and "Completed — no invoice"
as read-only words. Rule in CLAUDE.md.

**SQL: `setup-jobs-closed-at.sql`** (one column, `jobs.closed_at`;
proven on pglite twice; registered in `build-test-database.sh` and
`CHECK-which-setup-files-are-run.sql`; setup-ALL.sql regenerated).
**On neither database yet.** The app writes the column only where the
row shows it exists, so the push can go first; until the paste closed
jobs carry no date and their days chip keeps counting.

**Not pushed. Tried on no screen:** the practice pane was not signed
in. To try on practice: give a job no Invoicing stage, tick its last
stage (or Force complete), read `jobs.status = 'closed'` back; open
the Jobs page and see it under Completed with "No invoice"; In
Progress in the Status box puts it back.

**PUSHED 7 Oct 2026 on his "push from here only your changes", one
commit ahead of the queue** (the scratch-clone method in CLAUDE.md):
afa3e51 = af9cb77 plus the two registration lines that 8d140d8 had
swept up and the regenerated setup-ALL.sql, cherry-picked onto live's
2861f46; clean clone: 405 tests, names check clean, build clean
(App-DojFcioa.js local); `git log origin/main..x` read as its own step,
exactly the one commit; pushed; live went App-DcD4YizN.js ->
App-Cc2wDe9z.js with both new wordings in it. origin/main merged back
into the shared branch (6da66cb). **Held back, not mine, told to him:**
6277fe4, 52ebd05, e680916, 22be579, 91ded6e, 8d140d8 and 342261f
(Drawings and Assets out of App.jsx, the Request stock basket), plus
another conversation's uncommitted work in App.jsx, useDrawings.jsx,
the SQL lists and `setup-stock-removed-details.sql`. The SQL
`setup-jobs-closed-at.sql` is still on neither database: his paste.

### State of play at wrap-up, 7 Oct 2026 (Jobs page)

**Done and LIVE.** A finished job with no Invoicing stage closes
itself as Completed ("No invoice"), never To invoice. The 13 live
jobs that were stuck closed on the first Jobs page load after the
push (To invoice 24 -> 11, Completed 74 -> 87, read on screen).

**Every `setup-*.sql` this conversation wrote:**

| file | practice | live |
| --- | --- | --- |
| setup-jobs-closed-at.sql (one column, `jobs.closed_at`) | yes: his "done on both", the column answers 200 from the practice address in `.env` beside a made-up column at 400 | yes: his paste, its check listed the 13 closed jobs; `CHECK-live-table.cjs "jobs?select=closed_at"` 200 |

`FIX-closed-jobs-missing-date.sql` (not a setup file): pasted on live
by him 7 Oct, "all show the same"; JOB-0253's Overview read back as
"Completed on 10/7/2026 — no invoice". Not for practice (no such jobs).

**Built but not tried by Heinrich (or anybody) on a screen:**
- A fresh close: tick the last stage, or Force complete, on a job with
  no Invoicing stage and see it go straight to Completed with its date
  (the 13 closed by the catch-up rule for jobs already on Complete; the
  tick-time path ran on no screen). Practice JOB-0003/0005/0006/0009
  have Invoicing stages; pick one without.
- The Force complete warning's new last sentence ("closed as Completed
  with no invoice").
- The sales rep's notice for a closed job (practice has one account, so
  it cannot be seen there).
- An admin putting a closed job back with the Status box's In Progress,
  and un-ticking a stage on a closed job (admins only; the job is locked
  like an invoiced one).
- A job with no Invoicing stage that has an invoice request from the
  Items tab: must stay To invoice.

**Waiting on Heinrich:** nothing for this feature. Told to him, his
call: JOB-0189 and JOB-0190 (ARL Solutions, R 14,694 together) are now
Completed unbilled; 27 Active jobs have no Invoicing stage, 12 of them
priced customer jobs (~R 126k, JOB-0081 and JOB-0230 the big ones),
and will close the same way unless an Invoicing stage is added.

**Queue at wrap-up:** my dde3b93 and faf50a8 (notes and the FIX file),
the wrap-up commit, and eleven commits from other conversations
(Drawings, Assets, Request stock basket, Purchase orders tab on the
job page), none pushed from here.

---
## 7 Oct 2026 — Requisitions: one Request stock basket everywhere, PUSHED (`afa3e51..3344b86`)

Plan and his answers: `docs/REQUISITIONS-PLAN.md`. Owner: the
Requisitions conversation (new 7 Oct).

**What is LIVE** (six commits, all his word "you test and push"):
- `52ebd05` the Request stock search reads every field word by word
  (`src/lib/stockSearch.js`, tested); the Requisitions list search too.
- `8d140d8` the basket, `src/purchasing/RequestStock.jsx`: search on
  top, a line per item with quantity, supplier (cheapest, chips), job
  (open jobs; empty = Stores) and note; Send writes one `requisitions`
  row per line. `setup-requisitions-job.sql` (`job_id`, `job_number`)
  on BOTH databases by his paste 7 Oct, checked beside a made-up column
  (practice 200/400 from the `.env` address; live `CHECK-live-table.cjs`).
- `342261f` the Stock tabs' Request stock chip and the row icon open
  the basket, on Customer Stock too; the quantity-0 auto-jump is gone.
- `a7e7b95` the cut list's "Request all outstanding (n bars)" and its
  per-row button, and the tube laser's door; the old pick-an-item
  pop-up deleted (the one-item form stays for Edit of a request).
- `939d44e` the job page's **Purchase orders** tab: `JobPurchaseOrders`
  draws `PoCard`, lifted word for word out of the Purchase Orders tab;
  "Raise Purchase Order for JOB-x" starts the builder on the job.
- `7d37bbb` the length on each search row and basket line.

**Tried on practice signed in (Test), 7 Oct:** two-word search; two
lines sent with JOB-0012 on both, read back from `requisitions` with
`job_id` and `job_number`; the Structural row icon (opens a row's
detail first); Cut to size on JOB-0008: the missing-line message for
both pipes, then with a zero test row added (and deleted after) the
basket preloaded with qty 1, the job and the "cut list — 6 m lengths"
note; JOB-0004's Purchase orders tab showing PO-0001 with its lines,
View PDF, Email and Copy. Not tried: the tube laser's door (same
function as the row icon), the add-item Create path back into the
basket, the PO builder from the job's tab.

**The push:** scratch clone, `x` from live's afa3e51, six cherry-picks
clean, `npm ci`, build (App-YqEIAhFc.js local), names check clean,
410 tests; `git log origin/main..x` read as its own step, exactly the
six; pushed; live went App-Cc2wDe9z.js -> App-CJod77Oe.js with all
three new wordings in it; the live page loads with no console errors.
origin/main merged back into the shared branch (887a559): App.jsx and
the three SQL lists conflicted because the Drawings split sat between,
resolved by keeping the shared branch's copies, proven by `git diff
origin/main` showing only other conversations' work and every
purchasing file identical to live.

**Held back, not mine:** 6277fe4, e680916, 22be579, 91ded6e, 9029c95,
f8a762f (Drawings and Assets out of App.jsx), af9cb77/dde3b93/faf50a8/
28f38cf (Jobs page notes and FIX file; af9cb77 is live as afa3e51),
plus uncommitted work in App.jsx, useDrawings.jsx, the SQL lists and
`setup-stock-removed-details.sql`.

**Next for this conversation:** the PO builder carrying a request's
job onto the PO when Raise PO is pressed on the Requisitions tab (it
fills the job only from the job page and Buy-outs today); the Customer
Stock review (optional supplier box on the form; whether Buy-outs
folds in), his word "look at separately".

---
## 7 Oct 2026 — the whole queue PUSHED from the Requisitions conversation (`3344b86..48d2e4c`)

His word "look at what is ready to push, check if safe and push from
here". The queue (19 commits) was the Drawings and Assets split
(e680916, 22be579, 91ded6e), 9029c95 (deleting the current drawing
revision makes the newest one left current), f8a762f (an asset's
removal reason, date and who kept; Back closes asset history), the Jobs
page notes and FIX file (af9cb77 already live as afa3e51, dde3b93,
faf50a8, 28f38cf with two CLAUDE.md gotchas), and this conversation's
own commits already live plus their merge and handover. Every code
commit's message said it was tried on practice by its own conversation;
`setup-stock-removed-details.sql` is guarded (the app writes the three
columns only once a loaded row shows them).

Checked before the push: clean clone at 48d2e4c, build clean
(App-Dw5hAGca.js local), names check clean, 410 tests; on practice
signed in, Records -> Drawings and Stock -> Assets both draw, no console
errors, no crash boxes. Pushed; `removed_reason` is in the live bundle.

`setup-stock-removed-details.sql` was already on live at the push
(`CHECK-live-table.cjs "stock_items?select=removed_reason"` answered
200), so Remove asset keeps the reason from this build on. Practice
not checked from here. Live went App-CJod77Oe.js -> App-CwpMiDMk.js.

---
## 7 Oct 2026 — Planning (App.jsx split): state of play at wrap-up

**Live.** Purchasing moved out of App.jsx into `src/purchasing/` (5f0d661, pushed by this conversation 7 Oct 08:11). Drawings into `src/drawings/` (e680916) and Assets into `src/assets/` (22be579), plus three faults found while moving them (9029c95, f8a762f): all went live in the Requisitions conversation's push at 11:05 (48d2e4c). This conversation checked the live bundle afterwards, and the live page loads signed in with no console errors. App.jsx is 24,894 lines (28,686 on 5 Oct). The method and the test runs are in `docs/SPLIT-PURCHASING-PLAN.md` and `docs/SPLIT-DRAWINGS-ASSETS-PLAN.md`; the split rule is now in CLAUDE.md.

**SQL written here:**
- `setup-stock-removed-details.sql` (three columns on stock_items).
  - **Practice: run.** His first paste did not land; the second did, and I checked by reading the columns back.
  - **Live: run.** `CHECK-live-table.cjs` answers 200 for all three columns, next to a made-up column that answers 400.

**Half done.** Crash nets for the purchasing screens are owed. CLAUDE.md requires a net on every page lifted out of App.jsx, and the Purchasing move added none.
- Wanted: four tab nets in App.jsx, each with a `key`, and a net inside each pop-up's condition in `PurchasingPopups.jsx`. There are 5 pop-ups now that a7e7b95 removed the pick-an-item one.
- Held back because the requisitions conversation keeps editing those files. Its uncommitted `PurchasingPopups.jsx`, `usePurchasing.jsx` and `poJob.js` are in the folder as I write this.
- Do it once that work is committed.

**Built but not tried by Heinrich:**
- **Purchasing, Drawings and Assets screens** after the move. They should behave exactly as before.
  - Tried on practice by this conversation; nobody has used them on live yet.
  - Not clicked by anyone since the move: opening a drawing by part number from a job; Raise PO from a job's buy-out line; ordering bars from a cut list.
- **Removing an asset now keeps its reason, date and who.** Remove one, reload, and look under Assets → Removed / Archive. Assets removed before 7 Oct have none.
- **Back closes an asset's History window** (with the asset view behind it, like every pop-up).
- **Deleting a drawing's current revision makes the newest one left current.** It used to leave none current.

**Waiting on Heinrich:**
- Which area moves next. My recommendation: Invoicing and delivery notes together with Jobs, because their code sits in four places; Stock last. Production is the other mid-size candidate.
- Two older faults noted on 5 Oct, not fixed, which he has not asked for:
  - the ON ORDER flag on a stock row is a button inside a button, so clicking it opens the row;
  - the Low stock list's jump to an item at 0 shows "Nothing matches".

**Next session:**
1. The purchasing crash nets, once the requisitions work is committed.
2. Then plan the next move, using the same parser-driven copy script. The script was in this session's scratchpad and will be gone; it can be rebuilt from the method in the plan docs.

---
## 7 Oct 2026 — the PO job rule PUSHED alone (`48d2e4c..efecd29`, live App-Dn0GJsDx.js)

His "push from here". 84fc38b (Raise PO from the Requisitions tab
carries the requests' job onto the order; `src/purchasing/poJob.js`,
tested) cherry-picked onto live's 48d2e4c as efecd29 in the scratch
clone: build clean (App-D0plgWpb.js local), names check clean, 415
tests; `git log origin/main..x` read in the repo as its own step,
exactly the one commit; pushed; live went App-CwpMiDMk.js ->
App-Dn0GJsDx.js with the new wording in it. Merged back clean (aa749ca).
**Held back, notes only:** dbdea20 (mine) and 5eca4c1 (Planning's
wrap-up: CLAUDE.md and handover); the two touch the end of this file
and conflict when picked apart, so they go together with the next push.
Lesson: the scratch clone's `origin` is this folder, not GitHub, so in
the clone branch from live's hash, and read `origin/main..x` only here.

---
## 8 Oct 2026 — Customer Stock rebuilt, PUSHED alone (`efecd29..f6aec26`, live App-BhClBtFA.js)

His "sql on both push from here". `setup-stock-customer-revision.sql`
confirmed on practice (200 from the `.env` address, a made-up column
400) and live (`CHECK-live-table.cjs`) before the push. e348aa8
cherry-picked onto live's efecd29 as f6aec26 in the scratch clone
(branched by hash, the clone's origin being this folder): build clean
(App-C0D4GncI.js local), names check clean, 415 tests; `git log
origin/main..x` read here as its own step, exactly the one commit;
pushed; live went App-Dn0GJsDx.js -> App-BhClBtFA.js with "Has stock
only" and `customer_revision` in it. Merged back (e2427c2, App.jsx
auto-merged clean, shared-branch build and names clean). On live signed
in: Stock -> Customer Stock reads "1732 parts for 7 customers, 8 with
stock on hand", pills BPW 647, ER Products 2, Factory 1, FSS 238, HPE
840, MIT 1, Stainless Steel Design 3; no console errors, no crash box.

**Held back, not mine:** 3ddfed7 (Shortage form says why Flag Shortage
is greyed out, Laser conversation, code), a18788b (CNC brief, notes),
5eca4c1 (Planning wrap-up, notes), and my own two handover commits.

**Next for him:** re-import each customer's sheet under Stock Manager ->
Stock Codes -> Import with the "Replace the whole list" tick OFF, to
bring the revisions back. **Next for this conversation:** the first-round
supplier questions in `docs/CUSTOMER-STOCK-SUPPLIER-PLAN.md` (PO lookup,
the job's Buy-outs tab, what becomes of Buy-outs, who sets the supplier).

---
## 8 Oct 2026 — Requisitions: state of play at wrap-up

**Done and LIVE** (all 7–8 Oct): the one Request stock basket from every
door, a job per request line, the Purchase orders tab on the job page,
Raise PO carrying the requests' job, and the Customer Stock tab rebuilt
(every part, pills A to Z, rows by code, open in place, Cost, Supplier
box, the revision saved). Live bundle App-BhClBtFA.js. Plans:
`docs/REQUISITIONS-PLAN.md`, `docs/CUSTOMER-STOCK-SUPPLIER-PLAN.md`.

**Every `setup-*.sql` this conversation wrote:**

| file | practice | live |
| --- | --- | --- |
| `setup-requisitions-job.sql` (`requisitions.job_id`, `job_number`, index) | yes: his paste 7 Oct, `requisitions?select=job_number` 200 from the `.env` address beside a made-up column 400 | yes: `CHECK-live-table.cjs "requisitions?select=job_number"` On live, made-up column NO |
| `setup-stock-customer-revision.sql` (`stock_items.customer_revision`) | yes: his paste 8 Oct, 200 beside a made-up column 400 | yes: `CHECK-live-table.cjs` On live, made-up column NO |

Both are columns only, no rules, functions or triggers.

**Built but not yet tried by Heinrich (or anybody) on a screen:**
- The tube laser's nothing-on-the-shelf door into the basket (same
  function as the Stock row icon, which was tried).
- "Not in Stock yet? Create" inside the basket: the add-item form, then
  the new item landing back in the basket (`addToRequest`).
- Raise Purchase Order from a job's own Purchase orders tab (the builder
  starting on that job).
- A Raise PO over requests for two or more jobs: the empty job box and the
  red line naming them (covered by `poJob.test.js` only).
- Several lines in one basket sent from the Stock tabs (the Requisitions
  tab's two-line send was tried).
- On live, Customer Stock: typing a revision in a row's box and seeing it
  after a reload (practice had no column at the time of the test, live
  has it now); the "Has stock only" tick; the re-import.

**Waiting on Heinrich:**
- The re-import of each customer's sheet (Stock Manager -> Stock Codes ->
  Import, "Replace the whole list" OFF) to bring the revisions back.
- The first-round supplier questions in `docs/CUSTOMER-STOCK-SUPPLIER-PLAN.md`:
  one cost or a price per supplier; may the PO form find a customer part
  that has a supplier; does the job's Buy-outs tab offer them; what
  becomes of the Buy-outs division; who may set the supplier.

**Half-done:** nothing. **Queue at wrap-up:** my notes commits (dbdea20,
07fc0cf, 46f507d, this one) and three from other conversations
(3ddfed7 Shortage form wording, a18788b CNC brief, 5eca4c1 Planning
wrap-up), none pushed from here.

**Next session picks up:** his answers above, then step 1 of the
supplier plan (the PO lookups and the request card's price row for a
customer part with a supplier; the export/import Supplier column), then
step 2 (the job's Buy-outs tab) if he says yes.

## 8 Oct 2026 — Preferences template for other projects: state of play at wrap-up

A one-task conversation on 7 Oct. Heinrich asked for a preference file
to add to another coding project. Nothing in the app changed.

**Done:** `CLAUDE-PREFERENCES-TEMPLATE.md` in the parent folder
(`1.PRODUCTION APP`, outside this repo, synced by OneDrive to both PCs).
It holds only his general working rules, with no Stock Control detail:
about him, how to talk to him, plan-then-ask-then-build, never remove a
feature he uses, screen design (fewer clicks, pills and rows,
type-to-find, sorted lists, design for 10x), saving/testing/going live,
git with several conversations on one branch, code fences as Run
buttons. He copies it into a new project as `CLAUDE.md` or pastes it
above an existing one. Sent to him as a file.

**setup-*.sql written:** none. **Built but untested by Heinrich:**
nothing in the app. **Waiting on Heinrich:** nothing.

**Next session picks up:** nothing from here. When a new working-style
rule is learned in any conversation, add it to the template too, in
project-free words (memory: portable-preferences-template).
