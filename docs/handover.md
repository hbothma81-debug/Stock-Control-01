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
