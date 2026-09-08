# Bill of materials (BOM) — plan

Written 8 September 2026, replacing the earlier assemblies architecture.
Planning only; nothing has been built.

Builds on the "made on" tag (docs/MADE-ON-TAG-PLAN.md), which is live.
In this plan "made on" is called the **cut method**, because that is
what it is: which machine cuts the part.

---

## 1. The idea, in one paragraph

A job is a bill of materials: a list of parts, each with its cut method.
Some parts are **loose**: they go through the shop start to finish as
themselves. Others are grouped under an **assembly**: cut as parts, put
together at the Assembly stage, and one thing from then on. One job can
carry several assemblies and loose parts side by side. The work of
saying what a part is and how it is cut is done **once, in Stock
Manager**, and comes with the part onto every job. Creating a job is
then picking parts, not describing them.

## 2. The two things said about where this lives, reconciled

You said "a separate tab under Stock Codes" and also "maybe stick to one
list but more info per part". Both, and they do not clash:

- **One list.** Every part is a row in Stock Codes, the customer parts
  list that already exists. That row gets more information: its cut
  method (already there, called Made on), and whether it is an
  assembly. There is no second list of parts anywhere.
- **One extra tab, for recipes.** An assembly needs a list of what is
  inside it. That list is edited on a **BOM tab** next to Stock Codes.
  The BOM tab does not hold parts; it holds *which parts go into which
  assembly, and how many*. Every part it mentions is a row in Stock
  Codes.

So: Stock Codes says what each part is and how it is cut. The BOM tab
says what is inside each assembly. A job reads both.

## 3. The one rule: every part has a part code

Everything inside a BOM is a Stock Code. No typed-in descriptions inside
an assembly, ever, because a typed line has no cut method, no drawing,
no price and no memory.

For loose lines on a job the rule is a decision to make (question 1 in
section 11). Two options:

- **Strict**: every job line must be picked from Stock Codes. A part
  the customer has never sent before gets created in Stock Codes first,
  from the New Job form, with the "Not in Customer Stock — add it"
  button that already exists. Nothing on a job is ever untagged.
- **Lenient**: a typed line is allowed but shown as untagged, with the
  Guess the rest button as today. Less friction, and the untagged
  count keeps nagging until someone fixes it.

The plan recommends **strict**, because the whole point is that setup
happens once in Stock Manager and never again on a job.

## 4. What a part carries, in Stock Codes

Already there today: part code, description, customer, price,
recommended stock, revision, drawing, and the cut method.

To add:

| Field | What it means |
|---|---|
| Cut method | Laser, Tube laser, CNC, Cut to size, or Assembly. Already live as "Made on". Renamed on screen to Cut method. |
| Is an assembly | Not a separate field: a part whose cut method is Assembly is one. Its recipe lives on the BOM tab. |
| Untagged count | Above the list: "37 of 412 parts have no cut method", with a Guess button that reads the section type and description the way the job's Items tab does today. This is the setup work, made fast. |
| Filter | Parts / Assemblies / Untagged, so setup can be done customer by customer. |

Nothing new in the database for this section. The tag column exists.

## 5. The BOM tab: the recipe of an assembly

One new table:

    assembly_parts
      id                 uuid
      assembly_item_id   text     the assembly, a row in Stock Codes
      part_item_id       text     a part inside it, a row in Stock Codes
      qty                numeric  how many per assembly
      sort_order         integer

No foreign keys, on purpose: a retired part must not take a recipe with
it. It shows as "part missing" on the assembly instead.

The tab: pick an assembly (type-to-find over the customer's assemblies),
see its recipe, add a part by typing its code or description with
suggestions from that customer's Stock Codes, give a quantity, Add.
Remove with the bin. A footer reads what the recipe adds up to: "12 tube
laser, 4 laser, 2 CNC, 1 cut to size". A part may itself be an assembly;
loading walks down until it reaches parts that are cut.

A recipe is a template. Changing it changes the next job, not jobs
already on the floor.

## 6. The job side: what loading does

Picking a part on New Job or the Items tab already links the line to
the part and brings its cut method. That is live. The additions:

- **A loose part** loads as one line, tagged from the part, as today.
- **An assembly** loads as one **parent line** (the assembly, price and
  quantity) plus one **child line per part** in the recipe: tagged from
  the part, quantity = part qty × assembly qty, price 0, pointing at
  the parent. One new column makes that possible:

      job_quote_items.parent_quote_item_id   uuid, null for a loose line

- **Several assemblies on one job** each get their own parent and their
  own children. A child always knows which assembly it belongs to, so
  two assemblies that share a part still count separately.
- Changing the parent's quantity re-scales its children until cutting
  has started; then it is refused with a message. Removing the parent
  removes its children. A child's quantity cannot be edited directly.

The Items tab shows an assembly as a pill that opens to its children,
closed by default, and loose parts as plain rows. A job with three
assemblies and eight loose parts reads as eleven lines, not forty.

## 7. Who sees what on the floor

**Loose parts: unchanged.** Every cutting stage lists its own machine's
lines with the per-item counts exactly as today; the stages after
cutting list them all. This is the loose-item check you said matters
for every cutting process, and nothing here touches it.

**Assembly parts: the hinge rule.** The stage that puts assemblies
together — on live it is called Assembly — is marked as such with one
tick under Job Process Types, *this stage puts assemblies together*,
so the rule survives a rename. Then:

- stages **before** the hinge (cutting, bending, welding) list **child
  lines**, filtered by machine like any line, and never the parent
- the hinge and every stage **after** it (assembly, packing, delivery,
  invoicing) list the **parent** and never the children

A Production card for a child line says which assembly it belongs to,
so the operator knows the twelve tubes are for the truss and not the
gate.

**The assembly's cap.** At the hinge, how many assemblies may be
counted is capped by the parts: the smallest of (child done at the
stage before ÷ part qty), rounded down. Same mechanism as the per-item
cap that already gates every Each stage.

A job that has children but no hinge stage is flagged in Edit
processes; until it has one, children are listed everywhere before
delivery and the parent only at delivery and invoicing, so nothing is
hidden and nothing counts twice.

## 8. Money and paper: parent and loose only

- **Invoicing** lists and invoices parent lines and loose lines. Child
  lines carry price 0 and are never invoiced. A hard rule in the
  invoicing code, and the invoice request shows "N part lines left
  out" so it is visibly deliberate.
- **Delivery notes** the same.
- **The process sheet** prints loose lines, then each assembly with its
  children indented beneath, each child with its cut method.
- **Totals** on cards count what the card lists.
- **Shortages** on a child line work as today; it is an ordinary line
  with a cut method.

## 9. Build order

Each step one commit, tested on practice, then live.

1. **Database.** `assembly_parts`; `parent_quote_item_id` on
   `job_quote_items`; the *puts assemblies together* tick on
   `process_type_settings`. Blank everywhere; nothing changes.
2. **Stock Codes.** Cut method column shown and editable per part, the
   untagged count and Guess, the Parts / Assemblies / Untagged filter.
   This is the setup tool and it is useful on its own, today, for the
   tag that is already live.
3. **The BOM tab.** Recipe editor. Assemblies can be defined; nothing
   loads them yet.
4. **The part-code rule** on New Job and the Items tab, strict or
   lenient per question 1.
5. **Loading.** Parent and children, quantity re-scale, removal, the
   grouped Items tab.
6. **The hinge rule** and the assembly's cap. The floor changes here.
7. **Parent and loose only** for invoicing, delivery notes, sheet and
   totals.
8. **Finishes.** Quantity-one lines as a single tick; Edit processes
   flags a job with children and no hinge; Copy job copies the parent
   link; the catalogue import keeps recipes.

Step 2 can go first and alone. It pays back immediately on the tag
that is live now.

## 10. Risks

1. **Double invoicing.** A child line reaching an invoice charges the
   customer for parts and assembly. Step 7 makes it a rule in code, and
   the request screen says how many lines it left out.
2. **Setup effort.** Every part needs a cut method before it earns
   anything. The untagged count and Guess in step 2 are there to make
   that a morning's work per customer, not a week's. Until a customer
   is done, their jobs behave as today.
3. **Quantity drift.** Child quantities are derived. They are read-only
   on the job; change the parent.
4. **The strict rule bites on SigmaNest quote imports**, which bring
   lines with descriptions and no codes. Lines that match a part
   number get linked; the rest are flagged, and under strict they must
   be created before the job saves. Decide in question 1.
5. **Recipe drift.** A recipe changed after jobs are loaded does not
   touch those jobs. Right, but worth knowing.
6. **Nested assemblies** are flattened on loading: one parent, every
   cut part beneath it. Sub-assemblies are not tracked as their own
   lines. Not blocked by this design; a later change if needed.
7. **Catalogue import.** Assemblies are customer parts, so the
   keep-the-row fix carries them. A part dropped from the file leaves a
   "part missing" line in any recipe that used it; it does not cascade.
8. **Four conversations.** Steps 2 to 5 are Stock Manager and Jobs-page
   work; 6 touches the Production helpers; 7 invoicing. The three new
   database items get announced before the SQL runs.

## 11. Questions to settle before step one

1. **Strict or lenient** part-code rule for loose lines on a job
   (section 3)? Recommended: strict.
2. Is **Assembly** the hinge stage on every job that has one, or do
   some jobs assemble at Welding? The tick covers either; it needs
   deciding which stage carries it.
3. Do assembly parts get **bent and welded before** the hinge? The
   rule assumes yes.
4. Is a child part **ever invoiced or delivered on its own**? The plan
   says never; a spare is its own loose line.
5. When an assembly's quantity changes **after cutting has started**:
   refuse, as planned, or allow with a warning?
6. On screen, keep the word **Made on** or rename it **Cut method**?
   The plan uses Cut method.
