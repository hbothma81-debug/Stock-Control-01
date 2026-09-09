# Bill of materials (BOM) and Fabrications — plan

First written 8 September 2026. Rebuilt 9 September 2026 around a
separate BOM Manager screen, at Heinrich's request, after two earlier
rewrites the same day. Where this file and an earlier version differ,
this one is right. Planning only; nothing in sections 5 to 11 has been
built.

The word **assembly** is retired in this plan and in the app's wording.
Live has a stage called Assembly, and a recipe must never be confused
with a stage. The two recipe types are called **BOM** and
**Fabrication**.

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
  back on the next job that picks that part. Heinrich asked for this;
  it is live and stays. The BOM Manager shows the same value and can
  set it too, so it can be fixed from either side.
- The catalogue "replace" import keeps a part's row and id, so tags
  and job links survive it.
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
- **Buy-outs on a job** (`src/jobs/BuyOuts.jsx`): bought-in lines typed
  to find against Buy-out Codes, with supplier and cost, and the
  purchase orders raised for them. The screen lives in its own file so
  another screen can show the same list. The BOM Manager reuses it.
- The **SigmaNest quote import** (`src/lib/sigmanestQuote.js`) reads a
  quote PDF into lines: part name, quantity, material, thickness, unit
  price. The **Stock Codes import** reads a customer's parts list from
  a spreadsheet. The BOM Manager reuses both to bring in a big list of
  parts at once.
- The **Laser 4kw tab** (Nesting, Cutting, Shortages, Shifts) does not
  change. Nothing in this plan touches it.

## 3. The two recipe types

Both are recipes kept in the BOM Manager. They differ in what happens
after loading onto a job.

| | BOM | Fabrication |
|---|---|---|
| What it is | A set of loose parts sold together, with a set multiplier | Parts that are welded or bolted into one thing |
| On the job after loading | One loose line per part, each with its own qty, cut method, drawing, packed and delivered counts | One parent line (the fabrication, its part code and price) plus one child line per part, pointing at the parent |
| Money | Either **per part**, each line priced from its own Stock Code, or **per set**, one set line carrying the price and the part lines at price 0. Chosen once on the BOM | The parent only. Children carry price 0 and are never invoiced or delivered |
| Counting on the floor | Every part counted per item on its cutting stage and at packing, as any loose part | Parts counted per item up to the hinge; from the hinge on, the parent is counted as one thing |
| Hinge stage | None | The stage ticked *puts fabrications together*: Welding, or Assembly for a bolted one (question 7) |
| Remembered as | A label on each line: "from BOM X, 5 sets" | The parent link on each child |
| On the Stock Code | The **Is a BOM** tick and the pricing choice. A BOM is never a cut method | Cut method **Fabrication** |

**A BOM works the way SigmaNest does it.** The recipe lists parts with
a quantity per set. Loading it asks how many sets, and every part's
quantity becomes per-set × sets. From then on the parts are ordinary
loose lines. The set count only fills in the quantities; it stays on
the lines so the label can say "5 sets". Changing it after loading
re-scales the lines, and is refused once cutting has started.

## 4. The one rule: everything inside a recipe is a Stock Code

No typed-in lines inside a BOM or a Fabrication, ever. A typed line
has no cut method, no drawing, no price and no memory.

"Stock Code" here means any row of the stock list:

- a **customer part** (Stock Codes), which is cut here and carries a
  cut method
- a **bought-in item** from Buy-out Codes or Stores, which is not cut
  and carries a supplier and a cost. These go in the recipe's
  **Buy-outs section**, the same list New Job has, and land on the job
  as buy-out lines, not as parts to cut.

Whether loose lines typed straight onto a job must also be Stock Codes
is question 1 in section 13, still open.

## 5. The BOM Manager

A separate screen. Its own top-level tab, **BOM Manager**, next to
Stock Manager, behind its own permission so it can be switched on for
the people testing it and nobody else. Its code lives in its own file,
`src/bom/BomManager.jsx`, the way CutToSize and BuyOuts do, so it
never collides with the job screens while it is being built.

Built like the New Job form, with the same feel, but **Save creates a
recipe, not a job.** Top to bottom:

| Section | What it holds |
|---|---|
| Customer | Type-to-find, as on New Job. A recipe belongs to one customer; its parts come from that customer's Stock Codes. |
| Type | BOM or Fabrication. For a BOM: price per part or per set. For a Fabrication: welded or bolted, if question 7 goes that way. |
| Part code, description, price | The recipe's own Stock Code row. Price is the set price (per-set BOM) or the fabrication's price; blank for a per-part BOM. |
| Parts | One line per part: type-to-find over the customer's Stock Codes, quantity per set, and the part's **cut method** shown and editable right there, so a part with no cut method gets one while the recipe is being set up. "Not in Stock Codes — add it", as on New Job. |
| Import | The same two importers New Job has: a **SigmaNest quote PDF** (always one set, so its quantities are the per-set quantities) and the **Stock Codes spreadsheet**. Either brings in a big list of parts at once, creating any the customer does not have yet. Section 8. |
| Buy-outs | The Buy-outs list, reused from the job: bought-in items per set, from Buy-out Codes or Stores, with supplier and cost. |
| Stages | The stage picker from New Job: which stages this recipe's parts go through. Remembered on the recipe so a job that loads it gets the stages it needs without anyone ticking them. |
| Footer | What the recipe adds up to: "12 tube laser, 4 laser, 2 CNC, 3 buy-outs", the cost of the buy-outs, and for a per-part BOM the set price its parts add up to. |

The list side of the screen: every BOM and Fabrication for the chosen
customer as pills, shut by default, one line per part when open.
Opening one edits it. A recipe is a template: changing it changes the
next job, not jobs already on the floor.

A BOM may not contain a Fabrication and a Fabrication may not contain
another (question 8: refused for now).

**Stock Codes stays the parts list.** The cut method column, the
untagged count and the Parts / Fabrications / BOMs / Untagged filter
still go on it (step 9), because that is where a customer's parts are
tidied up in bulk. The BOM Manager is where recipes are made.

## 6. Where it lives in the database

All in the app's one Supabase database, practice first, then live.

- **The recipe itself** is a row in `stock_items`, the same table as
  every customer part, with a marker: `is_bom` and `bom_pricing` for a
  BOM, cut method `fabrication` for a Fabrication.
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

- **On a job** the lines stay in `job_quote_items`, with three new
  columns: `bom_item_id` and `bom_sets` (the label), and
  `parent_quote_item_id` (a child's parent, or a per-set BOM part's
  set line). Buy-out lines land in the job's buy-outs table as today.
- **The hinge** is one tick on `process_type_settings`:
  `puts_fabrications_together`.
- **The switch** is one permission on `profiles`, `can_manage_boms`,
  false for everyone until a tester is given it.

## 7. The job side: one pick

On New Job, next to the quoted items, one control: **Add a BOM**.
Type-to-find over the customer's BOMs and Fabrications, then "how many
sets?" (or "how many?" for a Fabrication), then Add. That one action
does everything the recipe remembers:

- **A BOM** loads one loose line per part: qty = per-set × sets, cut
  method from the part, the BOM label.
  - Priced **per part**: each line takes its part's Stock Code price.
  - Priced **per set**: one **set line** loads first, the BOM itself,
    qty = sets, price = the set price. The part lines load at price 0
    and point at the set line. No hinge: the part lines are counted
    all the way to packing and delivered as parts; only the money sits
    on the set line.
- **A Fabrication** loads one **parent line** (its price and quantity)
  plus one **child line per part**: qty = per-part × fabrications,
  price 0, cut method from the part, pointing at the parent.
- **Buy-outs** in the recipe land on the job's Buy-outs list, qty ×
  sets, with supplier and cost, ready for the purchase order.
- **Stages** in the recipe are ticked on the job if not already ticked.
- **Cut-to-size** lines are not part of a recipe for now; they stay on
  the job as today.

The same Add a BOM control sits on the job's Items tab, for a job
already open.

Changing the parent's quantity or the set count re-scales the lines
until cutting has started; then it is refused with a message.
Removing the parent removes its children. A child's quantity cannot be
edited directly. A per-part BOM's lines are loose and can be edited
one by one; the label then says the set count no longer matches.

The Items tab shows a Fabrication, and a per-set BOM, as a pill that
opens to its lines, shut by default; per-part BOM lines and loose
parts as plain rows, BOM lines with their label.

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
per-set BOM's set line is never listed on the floor; its part lines
are.

**Fabrication parts: the hinge rule.** The stage that puts
fabrications together is marked with one tick under Job Process Types,
*puts fabrications together*, so the rule survives a rename. On live
that is Welding, and may also be Assembly for bolted fabrications
(question 7). Then:

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
- **Buy-outs** are a cost inside something quoted, never billed to the
  customer, as today.
- **The process sheet** prints loose lines, then each BOM's lines
  under its label, then each fabrication with its children indented
  beneath, every line with its cut method.
- **Totals** on cards count what the card lists.
- **Shortages** on a child or BOM line work as today; it is an ordinary
  line with a cut method.

## 11. Build order

Each step one commit, tested on practice, then live. The BOM Manager
is behind its permission from step 2, so steps 2 to 5 can go live
without anyone but the testers seeing them; the floor changes only at
step 7. The database items in step 1 are announced to the other
conversations before the SQL runs.

1. **Database.** `bom_parts`, `bom_stages`; on `job_quote_items` the
   columns `parent_quote_item_id`, `bom_item_id`, `bom_sets`; on
   `stock_items` the `is_bom` tick and `bom_pricing`; on
   `process_type_settings` the `puts_fabrications_together` tick; on
   `profiles` the `can_manage_boms` permission; the cut method code
   `assembly` renamed `fabrication` on both tables and in their check
   rules. Blank everywhere; nothing changes.
2. **The BOM Manager, first cut.** The tab behind its permission;
   customer, type, part code, description, price; the parts list with
   type-to-find, per-set quantity and the cut method per line; the
   list of recipes as pills. Save creates the Stock Code row and the
   recipe. This is the screen to test on the side.
3. **The BOM Manager, the rest.** Buy-outs section reusing
   `BuyOuts.jsx`, the stage picker, the footer, the SigmaNest and
   spreadsheet imports with the "is this one set?" check.
4. **Add a BOM on New Job and the Items tab.** A BOM loads as lines
   with the label, per part or per set, plus its buy-outs and stages.
   Creating a job from a BOM works end to end here.
5. **Loading a Fabrication.** Parent and children, quantity re-scale,
   removal, the pill on the Items tab.
6. **The running balance** on the Items tab: quoted, cut, packed,
   delivered, invoiced. The packing loss becomes visible here.
7. **The hinge rule** and the fabrication's cap. The floor changes
   here.
8. **Money and paper** per section 10.
9. **Stock Codes.** The cut method column, the untagged count and
   Guess, the Parts / Fabrications / BOMs / Untagged filter. Bulk
   tidy-up per customer.
10. **The truss workbook importer**, once a real file is in hand.
11. **The part-code rule** for loose lines per question 1.
12. **Finishes.** Quantity-one lines as a single tick; Copy job
    carries parent links, BOM labels and cut methods (today it drops
    the cut method); the catalogue import keeps recipes; Edit
    processes flags a job with fabrication children and no hinge.

## 12. Risks

1. **Double invoicing.** A fabrication child or a per-set BOM's part
   line reaching an invoice charges the customer twice. Step 8 makes
   it a rule in code, and the request screen says how many lines it
   left out.
2. **Setup effort.** Every part needs a cut method before it earns
   anything. The BOM Manager shows and sets it per line, the imports
   guess it, and step 9 tidies a whole customer at once. Until a
   customer is done, their jobs behave as today.
   `CHECK-bom-starting-point.sql` measures the work.
3. **A quote that is not one set.** The standing instruction says one
   set; the "is this one set?" check before saving is the guard.
4. **Quantity drift.** Fabrication child quantities are derived and
   read-only on the job; change the parent. BOM part lines are loose
   and can be edited one by one, which is by design; the label then
   says the set count no longer matches.
5. **Recipe drift.** A recipe changed after jobs are loaded does not
   touch those jobs. Right, but worth knowing.
6. **Catalogue import.** BOMs and Fabrications are customer parts, so
   the keep-the-row fix carries them. A part dropped from the file
   leaves a "part missing" line in any recipe that used it; it does
   not cascade.
7. **Renaming the stored code.** `assembly` → `fabrication` is a data
   change on live rows. The SQL does it in one statement with the
   check rule dropped and re-added around it, and the app is pushed at
   the same time, or one side refuses the other's value.
8. **Two hinge stages on one job.** If both Welding and Assembly are
   ticked and a job carries both, the rule needs to know which one a
   fabrication uses. Question 7 decides; until then the earliest
   ticked stage on the job is the hinge.
9. **The strict rule bites on SigmaNest quotes loaded straight onto
   a job.** Lines that match a part name get linked; the rest are
   flagged, and under strict they must be created before the job
   saves. Decide in question 1.
10. **Four conversations.** Steps 2 and 3 are a new file and one tab
    wired into App.jsx; 4 to 6 are Jobs-page work; 7 touches the
    Production helpers; 8 invoicing. Announce the database items
    before the SQL runs.

## 13. Questions

Answered 9 September 2026:

2. BOM price: **either**, one price per set or priced per part.
   Chosen per BOM.
3. The set count only fills in quantities.
4. A changed set count re-scales; **refused once cutting has started**.
5. Importing recipes from files like the truss workbook: **yes, part
   of the build** (step 10).
6. The SigmaNest import: **a selector** for loose parts / BOM /
   Fabrication, then price each or per set; a quote is **always one
   set** by standing instruction. Now done on the BOM Manager
   (section 8) rather than on the job.
8. Nesting of recipes: **refused for now**.
9. Parts go missing **at packing**. The running balance is step 6.
10. On screen: **Cut method**.

Still open:

1. **Strict or lenient** part-code rule for loose lines typed on a
   job (section 4).
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
     no untagged lines on the floor either. Recommended.
7. **Which stage is the hinge** for a Fabrication when some are
   welded and some bolted. Options:
   - *One tick, one stage*: only Welding carries the tick; a bolted
     fabrication is counted as one thing from Welding even though
     the joining happens at Assembly.
   - *Ticks on both, earliest wins*: Welding and Assembly both
     ticked; on a job that has both, Welding is the hinge for every
     fabrication.
   - *Per fabrication*: both stages ticked, and each Fabrication says
     on the BOM Manager whether it is "Welded" or "Bolted". A welded
     truss hinges at Welding, a bolted gate at Assembly, on the same
     job. Recommended: one more choice on the recipe, set once.
