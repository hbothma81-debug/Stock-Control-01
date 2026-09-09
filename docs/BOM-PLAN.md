# Bill of materials (BOM) and Fabrications — plan

First written 8 September 2026. Rebuilt 9 September 2026 around a
separate BOM Manager, then reviewed the same day against the rest of
the app and against standard practice (section 14). Where this file
and an earlier version differ, this one is right. Planning only;
nothing in sections 5 to 11 has been built.

The word **assembly** is retired in this plan and in the app's wording.
Live has a stage called Assembly, and a recipe must never be confused
with a stage. The two recipe types are called **BOM** and
**Fabrication**. The quoting plan's "assemblies" are the same thing
and are folded into this build (section 14, point 1).

---

## 1. The idea

Set everything up **once**, on its own screen, then creating a job is
one pick: choose the BOM, say how many sets, done. Not ten buttons.

Today the New Job form is already bulky and the job screens are busy.
So the setup work moves **off the job** onto a **BOM Manager**: a
separate screen, built like New Job, that creates a BOM or a
Fabrication instead of a job. It has its own switch, so normal work
carries on during the day while the new system is tested on the side.

The problem it fixes: a BOM lands on a job as one line, "TRUSS, 294
sets", and nobody can say which parts were cut, packed or delivered.
Heinrich says the losses happen **at packing**.

## 2. What is already live and is not re-done here

- Every job line carries a **cut method** (`job_quote_items.made_on`):
  laser, tube_laser, cnc, cut_to_size, assembly, or blank. Blank
  behaves as before. Set on the job's Items tab, with Guess the rest.
- **The cut method chosen on the job is remembered on the Stock Code**
  (`stock_items.made_on`) when the line is linked to one, and comes
  back on the next job that picks that part. Live; stays. The BOM
  Manager shows the same value and can set it too.
- The catalogue "replace" import keeps a part's row and id, so tags
  and job links survive it.
- Each stage under Stock Manager → Job Process Types has a **Cuts: …**
  setting (`process_type_settings.cuts_made_on`). A cutting stage lists
  its own machine's lines plus untagged ones, never another machine's,
  never an assembly. A cutting stage with nothing to cut warns and
  keeps a single tick; Edit processes flags it. Helpers in App.jsx:
  `cutsMadeOn`, `stageTakesItem`, `itemsForStage`,
  `stageHasNothingToCut`.
- **Per-item counts** at every Each stage live in
  `job_process_item_progress`, one row per stage per line. The
  running balance in section 7 reads these; it adds nothing to them.
- The plate laser and the tube laser are **separate lanes**
  (`inOtherLaserLane`). Tube parts are packed under the Tube Laser
  stage; Laser Status shows plate lines only.
- **Drawings** (`drawings` table, `drawings` bucket): one row per
  drawing, keyed by part number, with an internal revision that counts
  up, the customer's revision letter, and a status of current or
  superseded. Uploading a new revision supersedes the old one. Every
  screen that shows a drawing looks up the *current* one by part
  number (`drawingLookup`). The Drawings tab in section 5 is a view
  over this; no new drawing storage.
- **Job history** (`job_events`): add-only, who did what and when on a
  job. Nobody can edit or delete an entry. The recipe history in
  section 6 copies this shape.
- **Job files** sit on a stage's card as pills, with Move.
- **Buy-outs on a job** (`src/jobs/BuyOuts.jsx`): bought-in lines typed
  to find against Buy-out Codes, with supplier and cost, and the
  purchase orders raised for them. The BOM Manager reuses the screen.
- **Cut to size** (`src/jobs/CutToSize.jsx`, `job_cut_items`): the
  job's sawing list, separate from the quoted lines, with lengths and
  bar counts. Section 14 point 6 is about tying it in.
- The **SigmaNest quote import** (`src/lib/sigmanestQuote.js`) reads a
  quote PDF into lines. The **Stock Codes import** reads a customer's
  parts list from a spreadsheet. The BOM Manager reuses both.
- The **Laser 4kw tab** (Nesting, Cutting, Shortages, Shifts) does not
  change. Nothing in this plan touches it.
- The **quoting module** is planned (`docs/QUOTING-MODULE-PLAN.md`) and
  not built. Nothing of it exists in code or the database yet.

## 3. The two recipe types

Both are recipes kept in the BOM Manager. They differ in what happens
after loading onto a job.

| | BOM | Fabrication |
|---|---|---|
| What it is | A set of loose parts sold together, with a set multiplier | Parts that are welded or bolted into one thing |
| On the job after loading | One loose line per part, each with its own qty, cut method, drawing, packed and delivered counts | One parent line (the fabrication, its part code and price) plus one child line per part, pointing at the parent |
| Money | Either **per part**, each line priced from its own Stock Code, or **per set**, one set line carrying the price and the part lines at price 0. Chosen once on the recipe | The parent only. Children carry price 0 and are never invoiced or delivered |
| Counting on the floor | Every part counted per item on its cutting stage and at packing, as any loose part | Parts counted per item up to the hinge; from the hinge on, the parent is counted as one thing |
| Hinge stage | None | The stage that joins it: **Welding** for a welded one, **Assembly** for a bolted one. Chosen on the recipe (question 7, answered) |
| Remembered as | A label on each line: "from BOM X, 5 sets" | The parent link on each child |

**A BOM works the way SigmaNest does it.** The recipe lists parts with
a quantity per set. Loading it asks how many sets, and every part's
quantity becomes per-set × sets. From then on the parts are ordinary
loose lines. The set count only fills in the quantities; it stays on
the lines so the label can say "5 sets". Changing it after loading
re-scales the lines, and is refused once cutting has started.

**On the job, a per-set BOM and a Fabrication are the same shape:** a
parent line with money and child lines with counts. The only
difference is the hinge. The loader is one piece of code for both.

## 4. The one rule: everything inside a recipe is a Stock Code

No typed-in lines inside a BOM or a Fabrication, ever (question 1,
answered: **strict inside a recipe**). The BOM Manager simply has no
way to type a free line; a part the customer does not have yet is
created as a Stock Code first, with a part code, from the same "add
it" button New Job has.

"Stock Code" here means any row of the stock list:

- a **customer part** (Stock Codes), which is cut here and carries a
  cut method
- a **bought-in item** from Buy-out Codes or Stores, which is not cut
  and carries a supplier and a cost. These go in the recipe's
  **Buy-outs section** and land on the job as buy-out lines, not as
  parts to cut.

Loose lines typed straight onto a job, outside any recipe, stay as
they are today: allowed, shown as untagged, Guess the rest. Tightening
that is a separate decision for later, not part of this build.

## 5. The BOM Manager

A separate screen. Its own top-level tab, **BOM Manager**, next to
Stock Manager, behind its own permission so it can be switched on for
the people testing it and nobody else. Its code lives in its own
folder, `src/bom/`, the way the laser screens do, so it never collides
with the job screens while it is being built.

Built like the New Job form, with the same feel, but **Save creates a
recipe, not a job.** Top to bottom:

| Section | What it holds |
|---|---|
| Customer | Type-to-find, as on New Job. A recipe belongs to one customer; its parts come from that customer's Stock Codes. |
| Type | BOM or Fabrication. For a BOM: price per part or per set. For a Fabrication: welded or bolted. |
| Part code, description, price, revision | The recipe's own Stock Code row. Price is the set price (per-set BOM) or the fabrication's price; blank for a per-part BOM. Revision is the recipe's own, A, B, C, bumped by hand when the recipe is deliberately changed (section 14, point 2). |
| Parts | One line per part: type-to-find over the customer's Stock Codes, quantity per set, the part's **cut method** shown and editable right there, and its current drawing revision or "no drawing". "Not in Stock Codes — add it", as on New Job. |
| Import | The same two importers New Job has: a **SigmaNest quote PDF** (always one set, so its quantities are the per-set quantities) and the **Stock Codes spreadsheet**. Either brings in a big list of parts at once, creating any the customer does not have yet. Section 8. |
| Buy-outs | The Buy-outs list, reused from the job: bought-in items per set, from Buy-out Codes or Stores, with supplier and cost. |
| Stages | The stage picker from New Job: which stages this recipe's parts go through. Remembered on the recipe so a job that loads it gets the stages it needs without anyone ticking them. |
| Drawings | A tab. The recipe's own drawing (the fabrication or set drawing, uploaded against the recipe's part code) at the top, then one row per part: part code, current revision, customer revision, open, and Upload for a part with none. A superseded or missing drawing is flagged. It reads the existing drawings table; nothing new is stored. Print all gives the drawing pack for the recipe. |
| History | The recipe's own add-only log: who added, changed or removed what, and when, and each revision bump. Same shape as the job history. |
| Footer | What the recipe adds up to: "12 tube laser, 4 laser, 2 CNC, 3 buy-outs", the cost of the buy-outs, and for a per-part BOM the set price its parts add up to. |

The list side of the screen: every BOM and Fabrication for the chosen
customer as pills, shut by default, one line per part when open.
Opening one edits it. A recipe is a template: changing it changes the
next job, not jobs already on the floor.

A BOM may not contain a Fabrication and a Fabrication may not contain
another (question 8: refused for now). The quoting plan made the same
decision.

**Stock Codes stays the parts list.** The cut method column, the
untagged count and the Parts / Fabrications / BOMs / Untagged filter
still go on it (step 9), because that is where a customer's parts are
tidied up in bulk. The BOM Manager is where recipes are made.

## 6. Where it lives in the database

All in the app's one Supabase database, practice first, then live.

- **The recipe itself** is a row in `stock_items`, the same table as
  every customer part, with three new columns:

      recipe_kind       text   '' for a plain part, 'bom' or 'fabrication'
      recipe_pricing    text   'per_part' or 'whole' (a set price, or the
                               fabrication's price); '' for a plain part
      recipe_joined_at  text   '' or 'welded' or 'bolted'; a Fabrication only
      recipe_revision   text   'A', 'B', ... ; '' for a plain part

  This departs from the earlier decision that Fabrication is a cut
  method. Section 14, point 3 says why: the cut method column then
  says only which machine cuts a part, and the live rows already
  tagged `assembly` move to `recipe_kind = 'fabrication'` with their
  cut method blanked, instead of a rename inside a check rule on live
  data. Heinrich can veto; the screens are the same either way.
- **What is inside it** is one new table, one row per line:

      bom_parts
        id               uuid
        parent_item_id   text     the BOM or Fabrication, a stock_items row
        part_item_id     text     what is inside it: a customer part, or a
                                  buy-out / stores item, also a stock_items row
        qty_per_set      numeric  how many per set (BOM) or per fabrication
        sort_order       integer

  Whether a line is a part to cut or a buy-out is read from the item
  it points at (its main category), not stored twice. No foreign keys,
  on purpose: a retired part must not take a recipe with it. It shows
  as "part missing" on the recipe instead.
- **The stages a recipe needs** is one small new table:

      bom_stages
        id               uuid
        parent_item_id   text     the recipe
        process_name     text     a stage name from Job Process Types
        sort_order       integer

- **The recipe's history** is one add-only table, the shape of
  `job_events`:

      bom_events
        id, parent_item_id, action, detail, acted_by, acted_by_id, acted_at

- **On a job** the lines stay in `job_quote_items`, with five new
  columns: `bom_item_id` and `bom_sets` (the label);
  `parent_quote_item_id` (a child's parent line); and two snapshots
  taken at load, `bom_revision` and `drawing_revision`, so a job says
  what it was built to even after the recipe or the drawing moves on
  (section 14, point 2). Buy-out lines land in the job's buy-outs
  table as today.
- **The hinge** is one tick on `process_type_settings`:
  `puts_fabrications_together`. Ticked on Welding and on Assembly. A
  welded recipe hinges at the first ticked stage on the job whose
  name is the welding one; a bolted one at the assembly one. In code:
  the hinge for a parent line is the earliest ticked stage on the job
  that matches the recipe's `recipe_joined_at`, falling back to the
  earliest ticked stage of any kind.
- **The switch** is one permission on `profiles`, `can_manage_boms`,
  false for everyone until a tester is given it.

## 7. The job side: one pick

On New Job, next to the quoted items, one control: **Add a BOM**.
Type-to-find over the customer's BOMs and Fabrications, then "how many
sets?" (or "how many?" for a Fabrication), then Add. That one action
does everything the recipe remembers:

- **A per-part BOM** loads one loose line per part: qty = per-set ×
  sets, price from the part's Stock Code, cut method from the part,
  the BOM label, and the part's current drawing revision as a
  snapshot.
- **A per-set BOM or a Fabrication** loads one **parent line** (the
  recipe itself, qty = sets, price = its price, its revision as a
  snapshot) and one **child line per part**: qty = per-set × sets,
  price 0, cut method from the part, drawing revision snapshot,
  pointing at the parent.
- **Buy-outs** in the recipe land on the job's Buy-outs list, qty ×
  sets, with supplier and cost, ready for the purchase order.
- **Stages** in the recipe are ticked on the job if not already ticked.
- **Before adding**, the screen says if any part has no drawing or a
  superseded one, and if any part has no cut method. It still adds;
  the warning is so it is seen.

The same Add a BOM control sits on the job's Items tab, for a job
already open. The loader is one function in `src/bom/loadRecipe.js`,
used by New Job, the Items tab, and later the quoting module's
quote-to-job.

Changing the parent's quantity or the set count re-scales the lines
until cutting has started; then it is refused with a message.
Removing the parent removes its children. A child's quantity cannot be
edited directly. A per-part BOM's lines are loose and can be edited
one by one; the label then says the set count no longer matches.

The Items tab shows a Fabrication, and a per-set BOM, as a pill that
opens to its lines, shut by default; per-part BOM lines and loose
parts as plain rows, BOM lines with their label. A line whose drawing
has moved on since it was loaded says so: "made to Rev B, current is
Rev C".

**The running balance.** Because the losses are at packing, every
part line on the Items tab shows a short balance: quoted, cut, packed,
delivered, invoiced. Cut and packed come from the per-item counts the
cutting and packing stages already keep; delivered from delivery
notes; invoiced from the count already on the line. A part whose
packed count is short of its cut count is the one to go looking for.

## 8. Bringing in a big list of parts

Heinrich's standing instruction to the sales people: **a SigmaNest
quote is always one set.** So a quote's quantities are per-set
quantities, and a quote becomes a recipe without retyping.

On the BOM Manager, **Import** takes:

- **A SigmaNest quote PDF.** Every line becomes a recipe line at the
  quote's quantity. A part name the customer already has in Stock
  Codes is linked, not duplicated, and keeps its price and cut method.
  A new one is created: part name as part code, description, material
  and thickness, price from the quote line, cut method guessed from
  the material (plate → Laser, tube → Tube laser) and shown for
  correction. Before saving, the screen shows the quantities it is
  about to keep and asks "is this one set?", so a quote done at 294
  sets cannot silently become a recipe with 294 of everything.
- **A Stock Codes spreadsheet**, the same file the catalogue import
  reads, with a quantity-per-set column. Same linking and creating.
- **The truss workbook.** JOB-0014's "GRNZ TUBE TRUSS 294 SETS.xlsm"
  is the other shape a BOM arrives in. Its columns are not known yet;
  the first real file decides them, and the importer is built against
  it (step 10).

On the job side, loading a SigmaNest quote onto a job stays as today.
If someone wants that quote as a recipe, they do it once on the BOM
Manager; the job then picks the BOM. One place to make recipes.

## 9. Who sees what on the floor

**Loose parts and BOM lines: unchanged.** Every cutting stage lists its
own machine's lines with the per-item counts exactly as today; the
stages after cutting list them all. This is the per-item check that
matters on every cutting process, and nothing here touches it. A
parent line is never listed on a cutting stage; its part lines are.

**Fabrication parts: the hinge rule.** With the hinge worked out as in
section 6:

- stages **before** the hinge (cutting, bending) list **child lines**,
  filtered by machine like any line, and never the parent
- the hinge and every stage **after** it list the **parent** and never
  the children

A per-set BOM has no hinge: its child lines are listed all the way to
packing and delivery, and only the money sits on the parent.

A Production card for a child line says which fabrication it belongs
to, so the operator knows the twelve tubes are for the truss and not
the gate.

**The fabrication's cap.** At the hinge, how many fabrications may be
counted is capped by the parts: the smallest of (child done at the
stage before ÷ per-part qty), rounded down. Same mechanism as the
per-item cap that already gates every Each stage.

A job that has fabrication children but no hinge stage is flagged in
Edit processes; until it has one, children are listed everywhere
before delivery and the parent only at delivery and invoicing, so
nothing is hidden and nothing counts twice.

## 10. Money and paper

- **Invoicing** lists and invoices loose lines, per-part BOM lines and
  parent lines. Child lines carry price 0 and are never invoiced. A
  hard rule in the invoicing code, and the request screen shows "N
  part lines left out" so it is visibly deliberate.
- **A per-set BOM's parent line** can be invoiced up to the number of
  whole sets delivered: the smallest of (part delivered ÷ per-set),
  rounded down. Deliveries stay per part.
- **Delivery notes** list loose lines, BOM part lines and fabrication
  parents. Never fabrication children, never a per-set BOM's parent.
  BOM part lines print grouped under their label with the whole sets
  they add up to, so the customer's paper says "3 sets of TRUSS" as
  well as the parts.
- **Buy-outs** are a cost inside something quoted, never billed to the
  customer, as today.
- **The process sheet** prints loose lines, then each BOM's lines
  under its label, then each fabrication with its children indented
  beneath, every line with its cut method and the drawing revision it
  was loaded with.
- **Totals** on cards count what the card lists.
- **Shortages** on a child or BOM line work as today; it is an ordinary
  line with a cut method.

## 11. Build order

Each step one commit, tested on practice, then live. The BOM Manager
is behind its permission from step 2, so steps 2 to 5 can go live
without anyone but the testers seeing them; the floor changes only at
step 7. The database items in step 1 are announced to the other
conversations before the SQL runs.

1. **Database.** `bom_parts`, `bom_stages`, `bom_events`; on
   `stock_items` the four `recipe_*` columns, and the rows tagged
   `assembly` moved across; on `job_quote_items` the five columns; on
   `process_type_settings` the `puts_fabrications_together` tick; on
   `profiles` the `can_manage_boms` permission. Blank everywhere;
   nothing changes.
2. **The BOM Manager, first cut.** The tab behind its permission;
   customer, type, part code, description, price, revision; the parts
   list with type-to-find, per-set quantity and the cut method per
   line; the list of recipes as pills; the history. Save creates the
   Stock Code row and the recipe. This is the screen to test on the
   side.
3. **The BOM Manager, the rest.** Buy-outs section reusing
   `BuyOuts.jsx`, the stage picker, the Drawings tab, the footer, the
   SigmaNest and spreadsheet imports with the "is this one set?"
   check.
4. **Add a BOM on New Job and the Items tab.** `loadRecipe.js`; lines,
   snapshots, buy-outs and stages. Creating a job from a recipe works
   end to end here. Per-set BOMs and Fabrications both load as parent
   and children; nothing on the floor treats them differently yet.
5. **The Items tab**: the pill for a parent, the label on BOM lines,
   re-scale and refusal, the "made to Rev B" note.
6. **The running balance** on the Items tab: quoted, cut, packed,
   delivered, invoiced. The packing loss becomes visible here.
7. **The hinge rule** and the fabrication's cap. The floor changes
   here.
8. **Money and paper** per section 10.
9. **Stock Codes.** The cut method column, the untagged count and
   Guess, the Parts / Fabrications / BOMs / Untagged filter. Bulk
   tidy-up per customer.
10. **The truss workbook importer**, once a real file is in hand.
11. **Cut-to-size lines in a recipe** (section 14, point 6), once the
    first sawn recipe shows what it needs.
12. **Finishes.** Quantity-one lines as a single tick; Copy job
    carries parent links, BOM labels, snapshots and cut methods
    (today it drops the cut method); the catalogue import keeps
    recipes; Edit processes flags a job with fabrication children and
    no hinge.

## 12. Risks

1. **Double invoicing.** A child line reaching an invoice charges the
   customer twice. Step 8 makes it a rule in code, and the request
   screen says how many lines it left out.
2. **Setup effort.** Every part needs a cut method before it earns
   anything. The BOM Manager shows and sets it per line, the imports
   guess it, and step 9 tidies a whole customer at once. Until a
   customer is done, their jobs behave as today.
   `CHECK-bom-starting-point.sql` measures the work.
3. **A quote that is not one set.** The standing instruction says one
   set; the "is this one set?" check before saving is the guard.
4. **Quantity drift.** Child quantities are derived and read-only on
   the job; change the parent. Per-part BOM lines are loose and can be
   edited one by one, which is by design; the label then says the set
   count no longer matches.
5. **Recipe drift.** A recipe changed after jobs are loaded does not
   touch those jobs. Right, and now visible: the job carries the
   recipe revision it was loaded from.
6. **Catalogue import.** Recipes are customer parts, so the
   keep-the-row fix carries them. A part dropped from the file leaves
   a "part missing" line in any recipe that used it; it does not
   cascade.
7. **Part codes with the revision inside them.** The FSS parts on live
   read "FSS_FOU-CVR REV-B P-011 A": the revision is part of the code.
   A new revision then makes a new part, and history and recipes
   break. Section 14, point 4.
8. **Two hinge stages on one job.** Handled by the recipe saying
   welded or bolted, and the fall-back in section 6.
9. **The quoting module builds a second recipe.** Its plan has stage 5,
   assemblies, which is this. Section 14, point 1: the Quoting
   conversation is told before it starts stage 5.
10. **Four conversations.** Steps 2 and 3 are a new folder and one tab
    wired into App.jsx; 4 to 6 are Jobs-page work; 7 touches the
    Production helpers; 8 invoicing. Announce the database items
    before the SQL runs.

## 13. Questions

All answered as of 9 September 2026:

1. **Strict inside a recipe.** Loose lines on a job stay as today.
2. BOM price: **either**, per set or per part, chosen per recipe.
3. The set count only fills in quantities.
4. A changed set count re-scales; **refused once cutting has started**.
5. Importing recipes from files like the truss workbook: **yes**.
6. The SigmaNest import: a quote is **always one set**; saved as a
   recipe on the BOM Manager.
7. Hinge: **each Fabrication says welded or bolted**; both stages
   carry the tick.
8. Nesting of recipes: **refused for now**.
9. Parts go missing **at packing**. The running balance is step 6.
10. On screen: **Cut method**.

## 14. Review against the app and standard practice

Heinrich asked for the whole process to be looked at, with ISO 9001
and quality control plans (QCP) in mind, and for a better way to be
said out loud where there is one. This is that. Each point says
whether it is already folded into the plan above, or is his call.

**1. The quoting plan is designing the same thing. Build one.**
`docs/QUOTING-MODULE-PLAN.md` has stage 5, "assemblies": saved sets of
parts, per customer, with a stored price, no nesting, copied onto a
quote rather than linked, usable directly on a job, kept in a Stock
Manager tab. That is this recipe, decision for decision. Two tables
for one idea means two editors, two imports, and a quote that cannot
find the BOM the job was built from. **Folded in:** the recipe here is
the one the quoting module picks. Its quote-to-job step calls the same
`loadRecipe.js`. What quoting adds later is costing against the recipe
(its cost lines and calculators), not a second parts list. The Quoting
conversation needs telling before it starts stage 5; nothing in that
plan is built yet, so nothing is undone.

**2. Revision control, which ISO 9001 calls control of documented
information.** Three things the app does not do today:

- A recipe has no revision and no history. Someone changes the truss
  recipe and nobody can say when or what it was before. **Folded in:**
  `recipe_revision` on the recipe, bumped by hand on a deliberate
  change, and `bom_events`, add-only, the shape of the job history.
- A job line shows the drawing's *current* revision, looked up live.
  A part cut in June to Rev B shows Rev C in September, and a
  customer asking "what revision did you make these to?" gets the
  wrong answer. **Folded in:** `drawing_revision` and `bom_revision`
  snapshots on the job line at load, and the "made to Rev B, current
  is Rev C" note on the Items tab. This is the single most useful ISO
  item in the plan and it costs two columns.
- No warning when a recipe is loaded with a superseded or missing
  drawing. **Folded in:** the check before Add a BOM.

**3. Keep the cut method about cutting.** Fabrication as a cut method
value puts a thing that is never cut into the list that says which
machine cuts a part, and every cutting filter has to know to skip it
(the way `assembly` is skipped today). It also means renaming a stored
code inside a check rule on live rows. **Folded in, Heinrich to veto:**
`recipe_kind` on the part instead, with the cut method blank for a
recipe. The screens read the same. The migration is a plain update of
the rows tagged `assembly`, no constraint dance.

**4. Part codes must not contain the revision.** The two FSS parts on
live are coded "FSS_FOU-CVR REV-B P-011 A". When Rev C comes, that is
a new part code, so the recipe points at the old part, the drawing
history splits, and the running balance starts from zero. Standard
practice is code without revision, revision on the drawing, which is
exactly what the drawings table already does. **His call:** a house
rule for the sales people, and the Stock Codes tidy-up in step 9
flags codes that look like they carry one.

**5. Quality control points.** A QCP names the points where something
is checked, what against, and who signed. The app has a Quality Check
stage that is a plain stage, and per-stage completion already records
who and when. Nothing structural is needed now; the shape to grow
into is: a tick on a stage in the recipe's stage list, *inspection
point*, and later a record per inspection (pass, fail, reason) with a
fail feeding the shortage and rework flow that already exists.
**Not built now; the tables are shaped so it can be added without
change.** The one QCP item worth doing early is the packing count:
the running balance in step 6 is the check that packed equals cut,
and a shortfall there is where the loss is caught.

**6. Cut-to-size parts in a recipe have nowhere to put their length.**
A truss has sawn members. The job's cut list (`job_cut_items`) is
separate from the quoted lines and holds section and length; a recipe
line with cut method Cut to size holds neither, so Add a BOM would
give the saw operator nothing. **Folded in as step 11, after the
first sawn recipe:** a recipe line for a cut-to-size part carries the
section and length, and Add a BOM also fills the job's cut list. Not
in step 1 because the first real truss recipe will show what the line
needs.

**7. Material traceability (heat numbers, mill certificates).** If
welded fabrications go to customers who ask for EN 1090 or ISO 3834
paperwork, the job needs to say which plate or bar each part came
from. The app's allocations already tie stock to a job and a stage;
the missing piece is a certificate on the stock item and the
allocation carrying it. **Not part of this build.** Worth knowing the
allocations table is the place it would hang from.

**8. What the design already gets right, so it is not undone by
accident:** recipes are templates, jobs are copies (both plans agree);
history is add-only; nothing on a job is deleted when a recipe or a
part is retired; the floor's per-item counts are untouched; money
sits on one line per thing sold; and the switch means the whole thing
can be tested during a working day with no one else seeing it.
