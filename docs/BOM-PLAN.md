# Bill of materials (BOM) and Fabrications — plan

First written 8 September 2026. Rewritten 9 September 2026 to match the
decisions Heinrich made after the first version. Where this file and
the earlier one differ, this one is right. Planning only; nothing in
sections 5 to 9 has been built.

The word **assembly** is retired in this plan and in the app's wording.
Live has a stage called Assembly, and a recipe must never be confused
with a stage. The two recipe types are called **BOM** and
**Fabrication**.

---

## 1. The problem

A BOM lands on a job as one line: "TRUSS, 294 sets". Nobody can then
say which of its parts were cut, which were packed and which were
delivered, so parts get lost between the machine and the truck. The
fix is that a job is a list of parts, each with its own cut method and
its own counts, and the work of saying what a part is happens once, in
Stock Manager, not on every job.

## 2. What is already live and is not re-done here

- Every job line carries a **cut method** (`job_quote_items.made_on`):
  laser, tube_laser, cnc, cut_to_size, assembly, or blank. Blank
  behaves as before. Set on the job's Items tab, with Guess the rest.
- The cut method is **remembered on the stock part**
  (`stock_items.made_on`) and comes back onto the next job that picks
  the part. The catalogue "replace" import keeps a part's row and id.
- Each stage under Stock Manager → Job Process Types has a **Cuts: …**
  setting (`process_type_settings.cuts_made_on`). A cutting stage lists
  its own machine's lines plus untagged ones, never another machine's,
  never an assembly. A cutting stage with nothing to cut warns and
  keeps a single tick; Edit processes flags it. Helpers in App.jsx:
  `cutsMadeOn`, `stageTakesItem`, `itemsForStage`,
  `stageHasNothingToCut`.
- The plate laser and the tube laser are **separate lanes**
  (`inOtherLaserLane`). Tube parts are packed under the Tube Laser
  stage; Laser Status shows plate lines only.
- Job files sit on a stage's card as pills, with Move.
- The **Laser 4kw tab** (Nesting, Cutting, Shortages, Shifts) does not
  change. Nothing in this plan touches it.

## 3. The two recipe types

Both are recipes kept in Stock Manager. They differ in what happens
after loading.

| | BOM | Fabrication |
|---|---|---|
| What it is | A set of loose parts sold together, with a set multiplier | Parts that are welded into one thing |
| On the job after loading | Loose lines only, one per part, each with its own qty, price, cut method, drawing, delivered and invoiced counts | One parent line (the fabrication, its part code and price) plus one child line per part, pointing at the parent |
| Money | Per part line. The BOM carries no price of its own | The parent only. Children carry price 0 and are never invoiced or delivered |
| Counting on the floor | Every part counted per item on its cutting stage, as any loose part | Parts counted per item up to the hinge; from the hinge on, the parent is counted as one thing |
| Hinge stage | None | Welding, marked by a tick on the stage: *puts fabrications together* |
| Remembered as | A label on each line: "from BOM X, 5 sets" | The parent link on each child |
| Cut method on the Stock Code | None. A BOM is never a cut method | **Fabrication**, a new value in the cut method list |

**A BOM works the way SigmaNest does it.** In Stock Manager it lists
parts with a quantity per set. Loading it asks how many sets, and
every part's quantity becomes per-set × sets. From then on the parts
are ordinary loose lines.

## 4. The one rule: every part inside a recipe is a Stock Code

No typed-in lines inside a BOM or a Fabrication, ever. A typed line has
no cut method, no drawing, no price and no memory. Whether loose lines
typed straight onto a job must also be Stock Codes (strict) or may stay
typed but flagged (lenient) is question 1 in section 12. Recommended:
strict, because the whole point is that setup happens once.

## 5. What a Stock Code carries

Already there: part code, description, customer, price, stock on hand,
revision and drawing, cut method.

To add or change:

| Field | What it means |
|---|---|
| Cut method | Laser, Tube laser, CNC, Cut to size, or **Fabrication**. The stored code `assembly` is renamed `fabrication` by the step-one SQL; the on-screen name is question 10. |
| Is a BOM | A tick on the part (`stock_items.is_bom`). Not a cut method, because a BOM is never cut: it is loose parts. A BOM's own cut method stays blank and does not count as untagged. |
| Untagged count | Above the Stock Codes list: "37 of 412 parts have no cut method", with a Guess button that reads the section type and description the way the job's Items tab does. |
| Filter | Parts / Fabrications / BOMs / Untagged, so setup can be done customer by customer. |

A part is a Fabrication if its cut method is Fabrication. A part is a
BOM if its tick is on. Both have a recipe on the BOM tab. A plain part
has neither.

## 6. The BOM tab: the recipe

One new table, one row per part in a recipe:

    bom_parts
      id               uuid
      parent_item_id   text     the BOM or Fabrication, a row in Stock Codes
      part_item_id     text     a part inside it, a row in Stock Codes
      qty_per_set      numeric  how many per set (BOM) or per fabrication
      sort_order       integer

No foreign keys, on purpose: a retired part must not take a recipe
with it. It shows as "part missing" on the recipe instead.

The tab: pick a BOM or Fabrication (type-to-find over the customer's
Stock Codes that are one or the other), see its recipe, add a part by
typing its code or description with suggestions from that customer's
Stock Codes, give a quantity per set, Add. Remove with the bin. A
footer reads what the recipe adds up to: "12 tube laser, 4 laser, 2
CNC, 1 cut to size". The tab holds no parts; every part it mentions is
a row in Stock Codes.

A recipe is a template. Changing it changes the next job, not jobs
already on the floor.

Whether a BOM may contain a Fabrication, and a Fabrication another
Fabrication, is question 8. Until answered the editor refuses both,
which is the safe default and easy to lift.

## 7. The job side: what loading does

Picking a part on New Job or the Items tab already links the line to
the part and brings its cut method. That stays. The additions:

- **A loose part** loads as one line, as today.
- **A BOM** asks "how many sets?" and loads one loose line per part:
  qty = per-set × sets, price from the part's own Stock Code, cut
  method from the part, and the BOM label. Two new columns carry the
  label so it can be shown and searched, not parsed:

      job_quote_items.bom_item_id   text     the BOM's Stock Code row, or null
      job_quote_items.bom_sets      numeric  the set count it was loaded with

  What the set count is for after loading is question 3; whether a
  changed count re-scales the lines is question 4.
- **A Fabrication** loads one **parent line** (the fabrication, its
  price and quantity) plus one **child line per part**: qty = per-part
  × fabrications, price 0, cut method from the part, pointing at the
  parent:

      job_quote_items.parent_quote_item_id   uuid, null for a loose line

  Changing the parent's quantity re-scales its children until cutting
  has started; then it is refused with a message (question 4 may
  change this to a warning). Removing the parent removes its children.
  A child's quantity cannot be edited directly.

The Items tab shows a Fabrication as a pill that opens to its children,
shut by default; BOM lines and loose parts as plain rows, BOM lines
with their label. A job with two fabrications, one BOM of six parts and
four loose parts reads as twelve lines, not thirty.

## 8. Who sees what on the floor

**Loose parts and BOM lines: unchanged.** Every cutting stage lists its
own machine's lines with the per-item counts exactly as today; the
stages after cutting list them all. This is the per-item check that
matters on every cutting process, and nothing here touches it.

**Fabrication parts: the hinge rule.** The stage that welds
fabrications together is marked with one tick under Job Process Types,
*puts fabrications together* (`process_type_settings.puts_fabrications_together`),
so the rule survives a rename. On live that stage is Welding. Then:

- stages **before** the hinge (cutting, bending) list **child lines**,
  filtered by machine like any line, and never the parent
- the hinge and every stage **after** it (welding, finishing,
  assembly, dispatch, invoicing) list the **parent** and never the
  children

A Production card for a child line says which fabrication it belongs
to, so the operator knows the twelve tubes are for the truss and not
the gate.

**The fabrication's cap.** At the hinge, how many fabrications may be
counted is capped by the parts: the smallest of (child done at the
stage before ÷ per-part qty), rounded down. Same mechanism as the
per-item cap that already gates every Each stage.

A job that has children but no hinge stage is flagged in Edit
processes; until it has one, children are listed everywhere before
delivery and the parent only at delivery and invoicing, so nothing is
hidden and nothing counts twice.

## 9. Money and paper

- **Invoicing** lists and invoices loose lines, BOM lines and
  fabrication parents. Fabrication children carry price 0 and are
  never invoiced. A hard rule in the invoicing code, and the request
  screen shows "N fabrication part lines left out" so it is visibly
  deliberate.
- **Delivery notes** the same. A BOM is delivered per part line; part
  deliveries are normal.
- **The process sheet** prints loose lines, then each BOM's lines
  under its label, then each fabrication with its children indented
  beneath, every line with its cut method.
- **Totals** on cards count what the card lists.
- **Shortages** on a child or BOM line work as today; it is an ordinary
  line with a cut method.

## 10. Build order

Each step one commit, tested on practice, then live. The database
items in step 1 are announced to the other conversations before the
SQL runs.

1. **Database.** `bom_parts`; on `job_quote_items` the columns
   `parent_quote_item_id`, `bom_item_id`, `bom_sets`; on `stock_items`
   the `is_bom` tick; on `process_type_settings` the
   `puts_fabrications_together` tick; the cut method code `assembly`
   renamed `fabrication` on both tables and in their check rules.
   Blank everywhere; nothing changes.
2. **Stock Codes.** Cut method column shown and editable per part, the
   Is a BOM tick, the untagged count and Guess, the Parts /
   Fabrications / BOMs / Untagged filter. Useful on its own today for
   the tag that is already live, and can go first.
3. **The BOM tab.** Recipe editor. Recipes can be defined; nothing
   loads them yet.
4. **Loading a BOM.** Sets × per-set into loose lines with the label,
   on New Job and the Items tab.
5. **Loading a Fabrication.** Parent and children, quantity re-scale,
   removal, the pill on the Items tab.
6. **The hinge rule** and the fabrication's cap. The floor changes
   here.
7. **Money and paper** per section 9.
8. **The part-code rule** for loose lines, strict or lenient per
   question 1.
9. **Finishes.** Quantity-one lines as a single tick; Copy job carries
   parent links, BOM labels and cut methods (today it drops the cut
   method); the catalogue import keeps recipes; Edit processes flags a
   job with fabrication children and no hinge.

## 11. Risks

1. **Double invoicing.** A fabrication child reaching an invoice
   charges the customer for parts and fabrication. Step 7 makes it a
   rule in code, and the request screen says how many lines it left
   out.
2. **Setup effort.** Every part needs a cut method before it earns
   anything. The untagged count and Guess in step 2 make that a
   morning's work per customer. Until a customer is done, their jobs
   behave as today. `CHECK-bom-starting-point.sql` measures the work.
3. **Quantity drift.** Fabrication child quantities are derived and
   read-only on the job; change the parent. BOM lines are loose, so
   they can be edited one by one, which is by design (question 4).
4. **The strict rule bites on SigmaNest quote imports**, which bring
   lines with descriptions and no codes. Lines that match a part
   number get linked; the rest are flagged, and under strict they must
   be created before the job saves. Decide in question 1.
5. **Recipe drift.** A recipe changed after jobs are loaded does not
   touch those jobs. Right, but worth knowing.
6. **Nesting.** If question 8 allows a Fabrication inside a
   Fabrication, either the inner one is its own welded line or it is
   flattened into parts. Not decided; the editor refuses nesting until
   it is.
7. **Catalogue import.** BOMs and Fabrications are customer parts, so
   the keep-the-row fix carries them. A part dropped from the file
   leaves a "part missing" line in any recipe that used it; it does
   not cascade.
8. **Renaming the stored code.** `assembly` → `fabrication` is a data
   change on live rows. The SQL does it in one statement with the
   check rule dropped and re-added around it, and the app is pushed at
   the same time, or one side refuses the other's value.
9. **Four conversations.** Steps 2 to 5 are Stock Manager and Jobs-page
   work; 6 touches the Production helpers; 7 invoicing. Announce the
   database items before the SQL runs.

## 12. Questions to settle before step one

1. **Strict or lenient** part-code rule for loose lines typed on a job
   (section 4)? Recommended: strict.
2. Is a BOM's price always **per part**, from each part's own Stock
   Code price, with the BOM carrying no price of its own?
3. Does the **set count** matter anywhere after loading, or only to
   fill in the quantities?
4. If the set count **changes after loading**, re-scale every line?
   Refuse once cutting has started, or allow with a warning?
5. JOB-0014 has a file "ERS QU226518_GRNZ TUBE TRUSS 294 SETS.xlsm"
   that looks like a BOM with per-set quantities. **Import recipes**
   from such files instead of typing them?
6. Does the **SigmaNest quote import** carry per-set quantities or
   only totals?
7. Is **Welding always the hinge** for a Fabrication, or do some get
   bolted at Assembly?
8. Can a **BOM contain a Fabrication**? Can a Fabrication contain
   another, and if so is the inner one its own welded line or
   flattened into parts?
9. Where do parts **go missing today**: between cutting and packing,
   or packing and delivery? Would a per-part running balance on the
   Items tab help: quoted, cut, packed, delivered, invoiced?
10. On screen, keep **Made on** or rename it **Cut method**? The plan
    uses Cut method. Dropdown values: Laser, Tube laser, CNC, Cut to
    size, Fabrication. BOM is never a cut method.
