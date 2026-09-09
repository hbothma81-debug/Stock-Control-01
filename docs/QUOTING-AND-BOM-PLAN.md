# Quoting and bill of materials — the one plan

Written 9 September 2026. This replaces two earlier documents,
`docs/QUOTING-MODULE-PLAN.md` (6 September) and `docs/BOM-PLAN.md`
(8 and 9 September), which are now pointers to this file. Where this
file and either of them differ, this one is right. Heinrich's
decisions from both are carried forward in section 15.

Planning only. Nothing in sections 4 to 12 has been built. The work
is owned by one conversation, the one that also carries the BOM.

The word **assembly** is retired in the app's wording. Live has a
stage called Assembly, and a thing you sell must never be confused
with a stage.

---

## 1. The idea

Every job starts as a quote, and quoting a thing means listing the
parts it is made of and every step they go through, because every
step is priced. That list is the bill of materials. So the quote
builds the recipe, and nobody builds it twice.

The flow:

    quote  →  the item builder lists parts and steps, and prices them
           →  submitted; optionally saved to Stock Manager as a recipe
           →  accepted; one click makes the job with its lines, stages,
              buy-outs and cut list
           →  production tracks every part to packing
           →  invoice

Two kinds of customer. A once-off job lives in its quote and never
touches Stock Manager. A repeat customer's items are saved to Stock
Manager when the quote is submitted, so the next order picks the
recipe, and every part is tracked.

What it replaces: the Excel costing workbook, six years of quotes
deep, and the way a BOM lands on a job today as one line that nobody
can trace to its parts. Heinrich says the parts go missing at
packing.

## 2. What is already live and is reused

- **Material costing** already works cost out from size: plate by
  weight × R/kg (Grades), structural by metres × R/m (Sections), CNC
  bar by weight (CNC Grades), stores and customer parts at their own
  price. The calculators call this rather than repeat it.
- **Stock Codes** are a customer's parts: part number, description,
  price, customer, drawing and revision, and the **cut method**
  (`stock_items.made_on`: laser, tube_laser, cnc, cut_to_size, or
  blank). The cut method chosen on a job line is remembered on the
  part. Live; stays.
- **Job lines** (`job_quote_items`) carry description, quantity, unit
  price, a link to a stock item and the cut method. They already
  drive per-item counts (`job_process_item_progress`), delivery notes
  and invoicing.
- **Stages**: Job Process Types in shop order, each with a **Cuts: …**
  setting so a cutting stage lists only its machine's lines. The
  plate and tube lasers are separate lanes. Helpers in App.jsx:
  `cutsMadeOn`, `stageTakesItem`, `itemsForStage`,
  `stageHasNothingToCut`.
- **Drawings** (`drawings`): keyed by part number, an internal
  revision that counts up, the customer's revision letter, current or
  superseded. Every screen looks up the current one.
- **Job history** (`job_events`): add-only. Copied for items and
  recipes below.
- **Buy-outs on a job** (`src/jobs/BuyOuts.jsx`) and **Cut to size**
  (`src/jobs/CutToSize.jsx`, `job_cut_items`, maths in
  `cutToSize.js`): both in their own files so a quote can show the
  same lists. The cut-to-size memory already says the quoting module
  should reuse the table with a nullable `quote_id`, not fork it.
- **The SigmaNest quote import** (`src/lib/sigmanestQuote.js`) reads a
  quote PDF into lines with part name, quantity, material, thickness
  and unit price.
- **Documents**: purchase orders build a PDF, upload it, record it and
  show it. Quotes use the same path. **Counters** issue the next
  number. **Permissions** are per-person ticks in User Manager.
- **The screen pattern**: compact list, tap a row, full detail with
  tabs. Pills that open, one line per thing, finished things shut.
- **The Laser 4kw tab** does not change. The made-on tag, the lanes
  and the per-item counts on cutting stages do not change.

## 3. The shapes

**A quote** sells a small number of **items**: item 1, item 2. Under
each item are **cost lines**, one per process: laser, tube laser, CNC,
cut to size, welding, bending, surface finish, from stores. A cost
line has a cost, its own markup and a sell figure, and they roll up to
the item, and the items to the quote. That is the workbook's second
sheet.

**Parts sit under cost lines.** The laser line carries the laser
parts, the tube laser line the tube parts, the CNC line the turned
parts, the cut-to-size line the sawn lengths, the from-stores line
the bought-in items. **Which line a part sits under is its cut
method.** Nobody tags a part; it is decided by where it was put.
Welding, bending, surface finish and galvanising are work done to
parts that already exist, so those lines carry a cost only.

**An item is one of three things**, chosen when it is created:

| Item kind | What the customer gets | On the job |
|---|---|---|
| **Loose parts** | The parts, sold and delivered as themselves | One line per part. A SigmaNest quote pulled in and nothing else is this. |
| **Set** (a BOM) | A set of loose parts sold together, priced per part or per set | One line per part, counted to packing; a set line carries the money if priced per set |
| **Fabrication** | The parts welded or bolted into one thing, priced as one | A parent line plus a child line per part; counted per part up to the hinge, as one thing after it |

A **recipe** is an item saved to Stock Manager: its own Stock Code
row (part code, description, price, kind, revision) plus the parts
under it with quantity per set, and the stages it needs. A recipe is a
template: changing it changes the next quote or job, never one already
issued. Nothing inside a recipe is a typed line; every part is a
Stock Code, created on saving if new.

**A part sits under one line only**, and a set or a fabrication may
not contain another (no nesting, for now).

## 4. The item builder

Heinrich's description, kept as the centre of the design:

> Create the item, call it Cabinet. Open the item builder. It has
> cost lines like the second sheet of the workbook. Select Laser; on
> that line there is Add items, which opens a page with an add-items
> list and Import SigmaNest. Import the quote, and all the laser
> items are there. Back on the builder, Add step, pick CNC from the
> dropdown; the CNC module opens and the CNC parts are costed there:
> billet, price per metre, time in seconds, the same options the
> workbook has. And so on for welding, cut to size, tube laser and
> every other process. Each process has its own quote module.

**Quote detail** opens full screen like a job, with tabs: Details,
Items, Costing, Document.

**Items tab.** Add item asks for a name, a kind (loose parts, set,
fabrication) and a quantity. Each item is a pill: its total, and
**Build**.

**Build** opens the item builder for that item. Top to bottom:

- The item's name, kind, quantity, and its pricing: as a whole (the
  lines add up, markup on each) or per part (each part carries its
  own sell price, the way a SigmaNest quote does).
- **The cost lines**, one row each: 1.1 Laser, 1.2 CNC, 1.3 Welding.
  Each row shows unit, quantity, rate, cost, markup, sell, and how
  many parts sit under it. Tapping a row opens that process's module.
- **Add step**: a dropdown of the Quote Processes list. Picking one
  adds a row and opens its module. A step may appear more than once:
  two laser lines for two thicknesses is normal.
- A footer: the item's cost, sell, weight and price per kg, the way
  the workbook shows a subtotal per item.

**Each process module** is a page of its own with Back, asking only
what that process needs. Where a process holds parts, the page has
two halves: the parts list on top, the costing beneath.

| Process | Parts under it | How it is priced |
|---|---|---|
| **Laser** | Yes. Add items: type-to-find over the customer's Stock Codes, or type a new line (name, quantity, thickness, material). **Import SigmaNest** puts every line of the PDF here with its quantity and price. | Either per part from the SigmaNest prices, or built: cut length, thickness and pierces against the cutting speed table, rate per metre, pierce charge, handling, per hour. |
| **Tube laser** | Yes. Same Add items and Import SigmaNest. | Its own rate; tube is not priced like flat. |
| **CNC** | Yes. | Billet diameter, finished length, parting blade, parts per metre, machine rate per hour (three machines), seconds, setup once off. The workbook's CNC sheet. |
| **Cut to size** | Yes: section, length, quantity, reusing the CutToSize screen and maths. | Metres × R/m from Sections, bars needed, offcut. The workbook's STRUCTURAL sheet and cutting list. |
| **From stores / buy-outs** | Yes: reusing the BuyOuts screen against Buy-out Codes and Stores, with supplier and cost. | The item's cost, marked up. |
| **Welding** | No | Per metre of weld, by weight, or rate × count of connection points. |
| **Bending, rolling** | No | Rate × count, or per hour. |
| **Surface finish** | No | Per m², per kg, or the supplier's price when bought in. |
| **Galvanising, powder coating, plating** | No | Per kg or the supplier's price. |

Where a process has more than one basis, the page asks the basis
first and shows only those fields.

**Typed lines are allowed** under a part-holding process. A part typed
in with a name and quantity is fine on a quote; a once-off job never
needs a part code. If the quote is later saved to Stock Manager, every
typed line becomes a Stock Code then, and a part code is asked for
where one is missing.

**Rates** live in Stock Manager: every hourly rate, rate per metre,
the cutting speed table by thickness, the setup charges. The numbers
are Heinrich's to change without anyone editing code.

**Quote Processes** is its own list in Stock Manager, separate from
Job Process Types, editable, each entry saying which module it opens
and **which job stages it means** (one process can mean several: a
laser line means Nesting, Laser Operator and Packer). Stored as a
pointer, not a name match, so renaming either side breaks nothing.

## 5. Submitting a quote

Statuses: draft → sent → accepted or lost or expired. Expired sets
itself once past valid-until. Lost records a reason. A revision copies
the quote to Rev B under the same number and links back; the old one
stays as it was.

**On submit, one question: add the quoted items to Stock Manager?**

- **No.** The quote keeps its items and parts. A once-off job is made
  from the quote when it is accepted, and that is the end of it.
- **Yes.** Every item becomes a recipe: a Stock Code row for the item,
  a Stock Code for every part under it that is not one already (a
  part code is asked for where a typed line has none), the parts
  under it with quantity per one item, and the stages its processes
  map to. A part that already exists is linked, not duplicated, and
  keeps its price, cut method and drawing. The quote's quantities are
  per item, so nothing has to be divided; the quote is one set.

The choice can also be made later, from the accepted quote, for a
customer who turns out to be a repeat one.

**Accepted makes the job**, in one click: the items' parts become job
lines with cut method from the line they sat under, kind and parent
links per section 8, the from-stores parts become the job's buy-out
lines, the cut-to-size parts become the job's cut list, and the
stages come from the processes used. The quote records the job it
became; the job records the quote.

## 6. Stock Manager: locked items, edit with history

Heinrich's decision: items in Stock Manager are too easy to change.

- **Rows are read-only.** No typing straight into a row. Each row has
  an **Edit item** button.
- **Edit item** opens the item full screen: every field, the current
  drawing with its revision (and Upload, which supersedes the old
  one), and the item's **history**. Save writes each changed field to
  the history: what, from, to, who, when. Add-only, the shape of the
  job history.
- **The import can only add.** The Stock Codes import loses its
  replace option. A part in the file that is not in the list is
  added; a part that is already there is left alone. The import
  reports what it added and what it skipped. Recommended, Heinrich to
  decide: for a part that exists but whose price in the file differs,
  the report lists the difference and offers Apply, which records it
  in the part's history like any edit. Without that, a customer's new
  price list means editing parts one by one.
- Applies to every tab in Stock Manager: Stock Codes, Buy-out Codes,
  Stores, Fasteners, plate and structural stock.

This is separate from quoting and can be built and tested on its own,
before or alongside it. It touches the Stock Manager screens in
App.jsx that other conversations also work in, so it is announced
before it starts.

## 7. Recipes: the library, and the drawings

Saved recipes are listed under Stock Manager as **Recipes**: every set
and fabrication for a customer as pills, shut by default, one line per
part when open. Opening one edits it with the same item builder as a
quote, so there is one editor. This is where a recipe that never
started as a quote is made: the truss workbook imported (section 9),
or a SigmaNest quote saved straight as a set.

A recipe carries a **revision** (A, B, C), bumped by hand when it is
deliberately changed, and a history. Each part shows its current
drawing revision, and a missing or superseded drawing is flagged.
**Drawings** on a recipe: the recipe's own drawing at the top, then
each part's, with Open and Upload, and Print all for the drawing pack.
It reads the existing drawings table; nothing new is stored.

**New Job gets one pick: Add a recipe.** Type-to-find over the
customer's recipes, how many, Add. That loads everything the recipe
remembers, the same way an accepted quote does. Loading a SigmaNest
quote straight onto a job as loose parts stays exactly as it is.

## 8. On the job

**Loose parts and set parts** load as ordinary lines, one per part,
qty = per-item × how many, cut method from the line they sat under.
Every cutting stage lists its own machine's lines with the per-item
counts exactly as today. Nothing here changes that.

**A set priced per set, and a fabrication,** load as a **parent line**
(the item, its price, how many) plus **child lines** (the parts, price
0, pointing at the parent). On the job they are the same shape; the
only difference is the hinge:

- a set has no hinge: its child lines are counted all the way to
  packing and delivered as parts; only the money sits on the parent
- a fabrication hinges at the stage that joins it, Welding or
  Assembly, chosen on the item as **welded** or **bolted**. Stages
  before the hinge list the children and never the parent; the hinge
  and every stage after list the parent and never the children. How
  many fabrications may be counted at the hinge is capped by the
  parts, the way the per-item cap already gates every Each stage.

The hinge tick, *puts fabrications together*, sits on the stage under
Job Process Types, on Welding and on Assembly, so a rename breaks
nothing.

**Snapshots.** Every line loaded from a recipe records the recipe
revision and the drawing revision it was loaded with. The Items tab
says "made to Rev B, current is Rev C" when the drawing has moved on.
A job says what it was built to, which is what ISO 9001 means by
control of documented information.

**Quantities.** Changing the parent's quantity re-scales the children
until cutting has started; then it is refused with a message. Removing
the parent removes the children. A child's quantity cannot be edited
directly. Loose and set-per-part lines can be edited one by one; the
set label then says the count no longer matches.

**The running balance.** Every part line on the Items tab shows
quoted, cut, packed, delivered, invoiced, read from the counts the
stages already keep, the delivery notes and the invoiced count. A
part whose packed count is short of its cut count is where the loss
is.

**The Items tab** shows a parent as a pill that opens to its children,
shut by default; loose parts and set parts as plain rows, set parts
with their label.

## 9. Bringing in the old work

- **The workbook import stays permanently.** An old `ERS QU…` workbook
  is read into a quote: items from the ERS QUOTE sheet, cost lines
  from QUO-01, parts from the take-off sheets under the matching
  lines. Done on demand, when a customer reorders, one quote at a
  time; six years are not migrated in bulk.
- **SigmaNest** on the laser and tube laser lines, as in section 4.
- **The truss workbook** ("GRNZ TUBE TRUSS 294 SETS.xlsm" on JOB-0014)
  is the other shape a set arrives in: per-set quantities in a
  spreadsheet. Its columns are not known yet; the first real file
  decides them, and it imports into Recipes.

## 10. Money and paper

- **The quote document** shows the sell price only, never cost or
  margin: bill-to, quote number and revision, date, valid until,
  representative, the items, terms and banking from company settings
  (editable per quote), subtotal, VAT at 15%, total. The cutting list
  and material order print from the same quote.
- **Invoicing** lists loose lines, set-per-part lines and parent
  lines. Child lines are never invoiced: a hard rule in code, and the
  request screen says "N part lines left out". A set's parent can be
  invoiced up to the whole sets delivered.
- **Delivery notes** list loose lines, set parts (grouped under the
  set's label with the whole sets they add up to) and fabrication
  parents. Never children, never a set's parent.
- **Buy-outs** are a cost inside something quoted, never billed.
- **The process sheet** prints loose lines, each set's lines under its
  label, each fabrication with its children indented, every line with
  its cut method and drawing revision.

## 11. Where it lives in the database

All in the one Supabase database, practice first, then live. Every
table announced to the other conversations before the SQL runs.

**Quoting**, all prefixed `quote_` so the module is obvious:

| Table | One row per |
|---|---|
| `quotes` | quote: number, revision, supersedes, customer and contact, project, status, sales rep, dates, lead time, instructions, terms, VAT rate, notes, converted job, created by |
| `quote_items` | thing sold: quote, order, description, **kind** (loose, set, fabrication), **pricing** (whole, per part), **joined_at** (welded, bolted), unit, qty, sell rate, cost and sell totals, linked recipe |
| `quote_cost_lines` | process under an item: quote process (pointer), process name and calculator copied in, description, **inputs** (that process's numbers, one field), unit, qty, cost rate, markup, cost and sell amounts |
| `quote_parts` | part under a cost line: linked stock item or typed name, qty per item, thickness, material, unit price, and for cut to size the section and length |
| `quote_processes` | entry in the Quote Processes list: name, calculator, **stages it maps to** (several), order, active |
| `quote_rates` | rate: name, value, unit |
| `quote_cutting_speeds` | thickness → metres per minute |
| `quote_documents` | PDF issued: quote, revision, when, by whom, file |

**Recipes**, the item saved to Stock Manager:

- on `stock_items`: `recipe_kind` ('' , 'set', 'fabrication'),
  `recipe_pricing`, `recipe_joined_at`, `recipe_revision`
- `bom_parts`: parent item, part item, qty per set, sort order; for a
  sawn part the section and length. No foreign keys: a retired part
  shows as "part missing" rather than taking the recipe with it.
  Whether a line is cut here or bought in is read from the item it
  points at.
- `bom_stages`: parent item, stage name, order.
- `bom_events`: add-only history of a recipe.

**Items**: `stock_item_events`, add-only history of every stock item:
item, field, from, to, who, when.

**Jobs**, on `job_quote_items`: `parent_quote_item_id`, `recipe_item_id`
and `recipe_qty` (the label), `recipe_revision` and `drawing_revision`
(the snapshots). On `jobs`: `quote_id`. On `job_cut_items`: a nullable
`quote_id`, so a quote's cut list and a job's are one table.

**Stages**: `process_type_settings.puts_fabrications_together`.

**Permissions** on `profiles`: `can_quote` (make and send quotes),
`can_see_quote_cost` (cost and margin, sales people only),
`can_manage_quote_rates`, `can_manage_recipes`.

## 12. Build order

Each step one commit, tested on practice, then live. Quoting lives in
its own folder, `src/quoting/`, behind its permissions from the first
step, so it can go live and be used by one person while everyone else
sees nothing. The floor changes only at step 9.

1. **Database.** Everything in section 11, blank. Nothing changes on
   any screen.
2. **A quote you can send.** Quotes list, quote detail, Details and
   Items tabs, add item with kind and quantity and a typed price, the
   PDF, statuses, revisions. Replaces the ERS QUOTE sheet only.
3. **The item builder** with cost lines, Add step, and the two easy
   modules: **From stores** and **Welding**. Typed prices on every
   other line. This proves the shape: item, lines, markup, totals.
4. **Parts under lines.** Laser and Tube laser modules with Add items
   and Import SigmaNest; Cut to size reusing CutToSize; From stores
   reusing BuyOuts. Per-part pricing. The Costing tab.
5. **Submit, and save to Stock Manager.** The question on submit;
   items become recipes; the Recipes list under Stock Manager reusing
   the builder; recipe revision and history.
6. **Accepted makes the job**, and **Add a recipe** on New Job and the
   Items tab. Lines with cut method, parents and children, buy-outs,
   cut list, stages from the mapping, snapshots. The tracking benefit
   lands here.
7. **Stock Manager lock.** Read-only rows, Edit item with drawing and
   history, add-only import. Independent of quoting; can be pulled
   forward.
8. **The running balance** on the Items tab.
9. **The hinge rule** and the fabrication's cap. The floor changes.
10. **Money and paper**: invoicing and delivery rules, process sheet,
    cutting list and material order from a quote.
11. **The calculators**, one at a time: Laser built from cut length
    and the speed table, CNC, Structural, Surface finish; Rates and
    the speed table in Stock Manager first.
12. **The workbook import** and the truss importer.
13. **Finishes.** Drawings on a recipe with Print all; quantity-one
    lines as a single tick; Copy job carries links and snapshots;
    Edit processes flags children with no hinge; lost-quote reasons
    and quote-to-order reporting.

## 13. Risks

1. **Double invoicing.** A child line reaching an invoice. Step 10
   makes it a rule in code and says how many lines were left out.
2. **Saving a quote with typed lines to Stock Manager.** Every typed
   line needs a part code then. The save screen lists them and asks;
   it does not invent codes.
3. **Part codes with the revision inside them.** The FSS parts on
   live read "… REV-B …". A new revision then becomes a new part and
   history splits. House rule: code without revision, revision on the
   drawing. Step 7's Edit item shows the revision where it belongs.
4. **Add-only import and price lists.** Without the Apply-differences
   option in section 6, a new price list is a day of edits.
5. **Two process lists.** Quote Processes and Job Process Types are
   separate by decision. The mapping must be set before step 6 is
   useful; the screen for it is in step 3.
6. **Quantity drift** on parents and children: derived and read-only;
   change the parent.
7. **Recipe drift.** A recipe changed after jobs are loaded does not
   touch them, and the snapshot says which revision they had.
8. **Renaming the stored code** `assembly` to a recipe kind: a plain
   update of live rows in step 1, not a rename inside a check rule.
9. **Collision in App.jsx.** Steps 2 to 5 are a new folder and one tab;
   6 and 8 are Jobs-page work; 7 is Stock Manager, where other
   conversations work; 9 touches the Production helpers; 10
   invoicing. Each announced before it starts.
10. **Adoption.** Sales keep the workbook until step 11 makes the app
    faster than Excel. Steps 2 to 6 have to be usable with typed
    prices, which is why the calculators come late.

## 14. Later, and kept in mind

- **Weekly backup of the whole app**, every table and every file
  bucket, to somewhere outside Supabase, run on a schedule. Not part
  of this build; recorded so it is not forgotten.
- **Quality control points**: an inspection tick on a recipe's stage,
  a pass or fail record with a reason feeding the shortage and rework
  flow. The tables are shaped so this adds without change.
- **Material traceability**: a certificate on a stock item and the
  allocation carrying it, for customers who ask for EN 1090 or ISO
  3834 paperwork. Hangs off the allocations table.
- **Nested recipes**: a set inside a fabrication. Refused for now.
- **Tightening typed lines on a job** outside any recipe.

## 15. Decisions

From the quoting plan, 6 September 2026: quote numbers start fresh at
QU-0001; the PDF shows the sell price only; revisions keep the number
as "Rev B"; expiry is automatic; lost quotes record a reason; one set
of terms and banking, editable per quote; cost and margin behind a
tick for sales people; any accepted quote converts, no approval
needed; the workbook import stays permanently; a saved item captures
its processes as well as its parts; usable directly on a job; no
nesting; a saved item carries a stored price that does not drift as
rates move; per customer; markup per line; two process lists with a
mapping between them.

From the BOM plan, 8 and 9 September 2026: the word assembly retired;
a set is loose parts with a multiplier, priced per part or per set; a
fabrication has a parent and children with the hinge at Welding or
Assembly, chosen per fabrication; everything inside a recipe is a
Stock Code, buy-outs included; per-item counts on cutting stages do
not change; the cut method on a job is remembered on the part; a
SigmaNest quote is one set; a changed quantity re-scales and is
refused once cutting has started; losses are at packing, so the
running balance; on screen "Cut method"; snapshots of recipe and
drawing revision on job lines; recipe kind on the part rather than
Fabrication as a cut method.

On 9 September 2026, merging the two: this conversation builds the
quote module; a quote item is built in an item builder with cost lines
per process, parts under the part-holding lines, each process its own
module; typed lines are allowed on a quote; on submit, an option to
save the items to Stock Manager, for repeat customers; Stock Manager
items are locked behind Edit item with drawing, revision and history;
the Stock Codes import can only add; a weekly backup is wanted later.
