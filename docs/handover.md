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
