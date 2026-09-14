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
- **Tube line material.** The box is live but `setup-job-line-material-type.sql`
  (adds `job_quote_items.material_type`) has not been run on either
  database. Until it runs, the box explains that it cannot save yet. This
  is the Jobs / Laser conversations' feature.
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
2. Get `setup-job-line-material-type.sql` run on practice and live.
3. If egress is still high: take master lists off the timer entirely
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
