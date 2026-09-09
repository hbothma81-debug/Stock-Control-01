# Bill of materials (BOM) and Fabrications — plan

First written 8 September 2026. Rewritten 9 September 2026 to match
Heinrich's decisions, and updated the same day with his answers to the
first round of questions (section 12). Where this file and an earlier
version differ, this one is right. Planning only; nothing in sections
5 to 10 has been built.

The word **assembly** is retired in this plan and in the app's wording.
Live has a stage called Assembly, and a recipe must never be confused
with a stage. The two recipe types are called **BOM** and
**Fabrication**.

---

## 1. The problem

A BOM lands on a job as one line: "TRUSS, 294 sets". Nobody can then
say which of its parts were cut, which were packed and which were
delivered, so parts get lost. Heinrich says the losses happen **at
packing**. The fix is that a job is a list of parts, each with its own
cut method and its own counts through to packing, and the work of
saying what a part is happens once, in Stock Manager, not on every
job.

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
- The **SigmaNest quote import** (`src/lib/sigmanestQuote.js`) reads a
  quote PDF into job lines: part name, quantity, material, thickness,
  unit price. Today the lines are typed lines; section 8 changes that.
- The **Laser 4kw tab** (Nesting, Cutting, Shortages, Shifts) does not
  change. Nothing in this plan touches it.

## 3. The two recipe types

Both are recipes kept in Stock Manager. They differ in what happens
after loading.

| | BOM | Fabrication |
|---|---|---|
| What it is | A set of loose parts sold together, with a set multiplier | Parts that are welded or bolted into one thing |
| On the job after loading | One loose line per part, each with its own qty, cut method, drawing, packed and delivered counts | One parent line (the fabrication, its part code and price) plus one child line per part, pointing at the parent |
| Money | Either **per part**, each line priced from its own Stock Code, or **per set**, one set line carrying the price and the part lines at price 0. Chosen once on the BOM's Stock Code | The parent only. Children carry price 0 and are never invoiced or delivered |
| Counting on the floor | Every part counted per item on its cutting stage and at packing, as any loose part | Parts counted per item up to the hinge; from the hinge on, the parent is counted as one thing |
| Hinge stage | None | The stage ticked *puts fabrications together*: Welding, or Assembly for a bolted one (question 7) |
| Remembered as | A label on each line: "from BOM X, 5 sets" | The parent link on each child |
| Cut method on the Stock Code | None. A BOM is never a cut method | **Fabrication**, a new value in the cut method list |

**A BOM works the way SigmaNest does it.** In Stock Manager it lists
parts with a quantity per set. Loading it asks how many sets, and
every part's quantity becomes per-set × sets. From then on the parts
are ordinary loose lines. The set count is only there to fill in the
quantities (question 3); it stays on the lines so the label can say
"5 sets".

## 4. The one rule: every part inside a recipe is a Stock Code

No typed-in lines inside a BOM or a Fabrication, ever. A typed line has
no cut method, no drawing, no price and no memory. Whether loose lines
typed straight onto a job must also be Stock Codes is question 1 in
section 12, still open.

## 5. What a Stock Code carries

Already there: part code, description, customer, price, stock on hand,
revision and drawing, cut method.

To add or change:

| Field | What it means |
|---|---|
| Cut method | Laser, Tube laser, CNC, Cut to size, or **Fabrication**. On screen the field is called **Cut method** (question 10). The stored code `assembly` is renamed `fabrication` by the step-one SQL. |
| Is a BOM | A tick on the part (`stock_items.is_bom`). Not a cut method, because a BOM is never cut: it is loose parts. A BOM's own cut method stays blank and does not count as untagged. |
| BOM pricing | Per part or per set (`stock_items.bom_pricing`, `per_part` or `per_set`). Per set uses the BOM's own price field as the price of one set. Only shown when Is a BOM is ticked. |
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

A BOM may not contain a Fabrication and a Fabrication may not contain
another (question 8: refused for now). The editor refuses both; easy
to lift later.

## 7. The job side: what loading does

Picking a part on New Job or the Items tab already links the line to
the part and brings its cut method. That stays. The additions:

- **A loose part** loads as one line, as today.
- **A BOM** asks "how many sets?" and loads one loose line per part:
  qty = per-set × sets, cut method from the part, and the BOM label.
  Two new columns carry the label so it can be shown and searched,
  not parsed:

      job_quote_items.bom_item_id   text     the BOM's Stock Code row, or null
      job_quote_items.bom_sets      numeric  the set count it was loaded with

  - Priced **per part**: each line takes its part's Stock Code price.
  - Priced **per set**: one extra **set line** is loaded first, the
    BOM itself, qty = sets, price = the BOM's price. The part lines
    load at price 0 and point at the set line through
    `parent_quote_item_id`, the same column a Fabrication's children
    use. The difference from a Fabrication is that there is no hinge:
    the part lines are counted all the way to packing and delivered
    as parts; only the money sits on the set line.

  Changing the set count after loading re-scales every part line
  until cutting has started; then it is refused with a message
  (question 4).
- **A Fabrication** loads one **parent line** (the fabrication, its
  price and quantity) plus one **child line per part**: qty = per-part
  × fabrications, price 0, cut method from the part, pointing at the
  parent:

      job_quote_items.parent_quote_item_id   uuid, null for a loose line

  Changing the parent's quantity re-scales its children until cutting
  has started; then it is refused with a message. Removing the parent
  removes its children. A child's quantity cannot be edited directly.

The Items tab shows a Fabrication, and a per-set BOM, as a pill that
opens to its lines, shut by default; per-part BOM lines and loose
parts as plain rows, BOM lines with their label. A job with two
fabrications, one BOM of six parts and four loose parts reads as
twelve lines, not thirty.

**The running balance.** Because the losses are at packing, every
part line on the Items tab shows a short balance: quoted, cut, packed,
delivered, invoiced. Cut and packed come from the per-item counts the
cutting and packing stages already keep; delivered from delivery
notes; invoiced from the count already on the line. A part whose
packed count is short of its cut count is the one to go looking for.

## 8. Saving a recipe from an import

Heinrich's standing instruction to the sales people: **a SigmaNest
quote is always one set.** So the quote's quantities are per-set
quantities, and a quote can become a recipe without retyping.

When a SigmaNest quote PDF is loaded (New Job, and later the quoting
module), after the lines are read, a selector asks what they are:

| Choice | What happens |
|---|---|
| Loose parts | As today: lines onto the job. Under the strict rule they must be linked to or created as Stock Codes first. |
| Save as a BOM | Asks *price each part* or *price per set*. Creates any part not yet in the customer's Stock Codes (part name = part code, description, material, thickness, cut method guessed from the material, price from the quote line), creates the BOM Stock Code with its recipe at the quote's quantities, then asks how many sets and loads it onto the job as section 7 says. |
| Save as a Fabrication | Creates the parts the same way, creates the Fabrication Stock Code with its recipe and the quote's total as its price, then asks how many and loads it. |

A part name that already exists in the customer's Stock Codes is
linked, not duplicated; its price and cut method are left as they are.

**The truss workbook.** JOB-0014's "GRNZ TUBE TRUSS 294 SETS.xlsm" is
the other shape a BOM arrives in: a spreadsheet with per-set
quantities. A second importer on the BOM tab reads such a file into a
recipe. Its columns are not known yet; the first real file decides
them, and the importer is built against it.

## 9. Who sees what on the floor

**Loose parts and BOM lines: unchanged.** Every cutting stage lists its
own machine's lines with the per-item counts exactly as today; the
stages after cutting list them all. This is the per-item check that
matters on every cutting process, and nothing here touches it. A
per-set BOM's set line is never listed on the floor; its part lines
are.

**Fabrication parts: the hinge rule.** The stage that puts
fabrications together is marked with one tick under Job Process Types,
*puts fabrications together* (`process_type_settings.puts_fabrications_together`),
so the rule survives a rename. On live that is Welding, and may also
be Assembly for bolted fabrications (question 7). Then:

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

## 10. Money and paper

- **Invoicing** lists and invoices loose lines, per-part BOM lines,
  per-set BOM set lines and fabrication parents. Fabrication children
  and per-set BOM part lines carry price 0 and are never invoiced. A
  hard rule in the invoicing code, and the request screen shows "N
  part lines left out" so it is visibly deliberate.
- **A per-set BOM's set line** can be invoiced up to the number of
  whole sets delivered: the smallest of (part delivered ÷ per-set),
  rounded down. Deliveries stay per part.
- **Delivery notes** list loose lines, BOM part lines and fabrication
  parents. Never fabrication children, never a set line.
- **The process sheet** prints loose lines, then each BOM's lines
  under its label, then each fabrication with its children indented
  beneath, every line with its cut method.
- **Totals** on cards count what the card lists.
- **Shortages** on a child or BOM line work as today; it is an ordinary
  line with a cut method.

## 11. Build order

Each step one commit, tested on practice, then live. The database
items in step 1 are announced to the other conversations before the
SQL runs.

1. **Database.** `bom_parts`; on `job_quote_items` the columns
   `parent_quote_item_id`, `bom_item_id`, `bom_sets`; on `stock_items`
   the `is_bom` tick and `bom_pricing`; on `process_type_settings` the
   `puts_fabrications_together` tick; the cut method code `assembly`
   renamed `fabrication` on both tables and in their check rules.
   Blank everywhere; nothing changes.
2. **Stock Codes.** Cut method column shown and editable per part, the
   Is a BOM tick and its pricing choice, the untagged count and Guess,
   the Parts / Fabrications / BOMs / Untagged filter. Useful on its
   own today for the tag that is already live, and can go first.
3. **The BOM tab.** Recipe editor. Recipes can be defined; nothing
   loads them yet.
4. **Loading a BOM.** Sets × per-set into lines with the label, per
   part or per set, on New Job and the Items tab.
5. **Loading a Fabrication.** Parent and children, quantity re-scale,
   removal, the pill on the Items tab.
6. **Saving a recipe from a SigmaNest quote.** The selector in
   section 8. Recipes stop being typed in.
7. **The running balance** on the Items tab: quoted, cut, packed,
   delivered, invoiced. The packing loss becomes visible here.
8. **The hinge rule** and the fabrication's cap. The floor changes
   here.
9. **Money and paper** per section 10.
10. **The part-code rule** for loose lines per question 1.
11. **The truss workbook importer**, once a real file is in hand.
12. **Finishes.** Quantity-one lines as a single tick; Copy job
    carries parent links, BOM labels and cut methods (today it drops
    the cut method); the catalogue import keeps recipes; Edit
    processes flags a job with fabrication children and no hinge.

## 12. Risks

1. **Double invoicing.** A fabrication child or a per-set BOM's part
   line reaching an invoice charges the customer twice. Step 9 makes
   it a rule in code, and the request screen says how many lines it
   left out.
2. **Setup effort.** Every part needs a cut method before it earns
   anything. The untagged count and Guess in step 2 make that a
   morning's work per customer, and step 6 creates parts from quotes
   so the catalogue fills itself. Until a customer is done, their jobs
   behave as today. `CHECK-bom-starting-point.sql` measures the work.
3. **Quantity drift.** Fabrication child quantities are derived and
   read-only on the job; change the parent. BOM part lines are loose
   and can be edited one by one, which is by design; the set count on
   the label then no longer matches, and the label says so.
4. **The strict rule bites on SigmaNest quote imports** loaded as
   loose parts. Lines that match a part name get linked; the rest
   are flagged, and under strict they must be created before the job
   saves. Decide in question 1.
5. **A quote that is not one set.** The standing instruction says one
   set; a quote done at 294 sets and saved as a BOM would give a
   recipe with 294× quantities. The selector shows the quantities it
   is about to save and asks "is this one set?" before saving.
6. **Recipe drift.** A recipe changed after jobs are loaded does not
   touch those jobs. Right, but worth knowing.
7. **Catalogue import.** BOMs and Fabrications are customer parts, so
   the keep-the-row fix carries them. A part dropped from the file
   leaves a "part missing" line in any recipe that used it; it does
   not cascade.
8. **Renaming the stored code.** `assembly` → `fabrication` is a data
   change on live rows. The SQL does it in one statement with the
   check rule dropped and re-added around it, and the app is pushed at
   the same time, or one side refuses the other's value.
9. **Two hinge stages on one job.** If both Welding and Assembly are
   ticked and a job carries both, the rule needs to know which one a
   fabrication uses. Question 7 decides; until then the earliest
   ticked stage on the job is the hinge.
10. **Four conversations.** Steps 2 to 7 are Stock Manager and
    Jobs-page work; 8 touches the Production helpers; 9 invoicing.
    Announce the database items before the SQL runs.

## 13. Questions

Answered 9 September 2026:

2. BOM price: **either**, one price per set or priced per part.
   Chosen per BOM (section 5).
3. The set count only fills in quantities.
4. A changed set count re-scales; **refused once cutting has started**.
5. Importing recipes from files like the truss workbook: **yes, part
   of the build** (step 11).
6. The SigmaNest import: **a selector on load** asks loose parts / BOM
   / Fabrication, then price each or per set; a quote is **always one
   set** by standing instruction (section 8).
8. Nesting of recipes: **refused for now**.
9. Parts go missing **at packing**. The running balance is step 7.
10. On screen: **Cut method**.

Still open:

1. **Strict or lenient** part-code rule for loose lines typed on a
   job (section 4). Heinrich asked for the options to be explained.
   - *Strict*: every line on a job is picked from Stock Codes. A
     part the customer has never sent before is created first, from
     the "Not in Customer Stock — add it" button, which insists on a
     part code. Nothing on a job is ever untagged. The cost: a
     one-off line for a customer needs a part code, and the
     catalogue collects one-offs.
   - *Lenient*: a typed line is allowed, shown as untagged, with
     Guess the rest as today. Less friction; an untagged line lands
     on every cutting stage until someone tags it.
   - *In between*: a typed line is allowed but must have a cut
     method before the job saves. No part code needed for a one-off;
     no untagged lines on the floor either.
7. **Which stage is the hinge** for a Fabrication when some are
   welded and some bolted. Options:
   - *One tick, one stage*: only Welding carries the tick; a bolted
     fabrication is counted as one thing from Welding even though
     the joining happens at Assembly.
   - *Ticks on both, earliest wins*: Welding and Assembly both
     ticked; on a job that has both, Welding is the hinge for every
     fabrication.
   - *Per fabrication*: both stages ticked, and each Fabrication's
     Stock Code says which one joins it, "Welded" or "Bolted". A
     welded truss hinges at Welding, a bolted gate at Assembly, on
     the same job. Recommended: it is one more dropdown on the part,
     set once.
