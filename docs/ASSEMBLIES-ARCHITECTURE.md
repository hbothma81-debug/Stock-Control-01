# Assemblies — architecture

Written 8 September 2026. Architecture only; nothing has been built.

Builds on the "made on" tag (docs/MADE-ON-TAG-PLAN.md), which is live.
That gave every job line a machine and every cutting stage a filter.
Assemblies are the next layer: a line that is not cut anywhere, but is
made up of lines that are.

---

## 1. What an assembly is, in this app

Two kinds, and they are different things:

**A one-off assembly.** Typed in on New Job, one line, tagged Assembly.
Nobody in the shop needs to know what is inside it. It skips every
cutting stage and counts as one thing everywhere else. This already
works today, because the tag is live. The only thing missing is a
nicety: a quantity of one should be a single tick, not a number box.

**A catalogue assembly.** A customer part in Stock Manager that is made
up of other customer parts, each with a quantity. Load it onto a job and
its parts come with it. The cutting stages see the parts; the shop sees
the assembly once it has been put together. This is the build.

## 2. Where it lives: two new things in the database, nothing else

**An assembly is a stock part.** Not a new table. It is a customer part
(`stock_items`, the Stock Codes tab) whose `made_on` is `assembly`.
That means it already has a part number, a customer, a price, a
drawing, a revision, and it already appears in the New Job picker, the
catalogue import, and the quoting plan. Setting a part's tag to
Assembly is what turns it into one.

**Its parts are one new table.**

    assembly_parts
      id                 uuid
      assembly_item_id   text   -> stock_items.id   the assembly
      part_item_id       text   -> stock_items.id   a part inside it
      qty                numeric                     how many per assembly
      sort_order         integer

No foreign keys, on purpose, the same reason the cut list has none: a
retired part must not take an assembly's recipe with it. A part that is
gone shows as "part missing" on the assembly rather than vanishing.
A part may itself be an assembly (a truss made of frames made of
brackets); loading walks down until it finds parts that are cut.

**A job line knows its parent.** One new column:

    job_quote_items.parent_quote_item_id   uuid, null for a normal line

A line with a parent is a *child line*: a part that exists on the job
only because its assembly does. Everything below follows from that one
column.

## 3. Loading an assembly onto a job

Pick the assembly in New Job or on the Items tab, give it a quantity,
and the app writes:

- **One parent line**: the assembly, tagged Assembly, with the price
  and the quantity. This is the line the customer is buying.
- **One child line per part**: description and tag from the part
  (its remembered `made_on`), quantity = part qty × assembly qty,
  price 0, `parent_quote_item_id` = the parent. Linked to the part, so
  its drawing shows on the Production card the way any linked line's
  does today.

Changing the parent's quantity later re-scales the children, as long as
nothing has been logged against them. Once cutting has started the
change is refused with a message, because the counts on the floor
would no longer add up. Removing the parent removes its children.

A part missing from the catalogue at load time is still written as a
child line, from the recipe's last known description, and flagged.

## 4. Who sees what: the one rule

The factory flow is a line. Somewhere on it is the stage where parts
become the assembly — on live that stage is called **Assembly**. It is
the hinge:

- **Stages before the hinge** (cutting, bending, welding) list the
  **child lines**, filtered by machine exactly as today. They never see
  the parent: nothing to cut.
- **The hinge and every stage after it** (assembly, packing, delivery,
  invoicing) list the **parent line** and never the children. The
  assembly is one thing from here on.
- **Lines with no parent and no children** are unaffected: listed
  wherever the machine filter says, as today.

This is one function, next to `stageTakesItem`, reading the flow rank
of the Assembly stage. A job with children but no Assembly stage gets a
warning in Edit processes; until it has one, children are treated as
"before the hinge" everywhere and the parent is listed only at delivery
and invoicing, so nothing is hidden and nothing double-counts.

**The assembly line's cap.** At the hinge, how many assemblies may be
put together is capped by the parts: the smallest of (child done at the
last stage before the hinge ÷ part qty), rounded down. Same idea as the
per-item cap that already gates every Each stage, so it is an extension
of `itemFlowLimit`, not a new mechanism.

## 5. Money and paper: parent only

- **Invoicing** lists and invoices parent and standalone lines only.
  Child lines carry price 0 and are never invoiced. This is the one
  place a mistake would cost real money, so it is a hard rule in the
  invoicing code, not just a filter on a screen.
- **Delivery notes** the same: what leaves the building is the assembly.
- **The process sheet** prints the parent, then its children indented
  under it with their machine, so the paper reads like the job does.
- **Job totals** (the "Qty: 20580" on cards, the quoted value) count
  what the screen lists, so a card before the hinge sums parts and a
  card after it sums assemblies.
- **Shortages** on a child line work as today: it is an ordinary line
  with a tag, and the re-cut runs back through its machine.

## 6. Stock Manager: parts and assemblies in one place

Under Stock Codes, the customer parts editor gains a filter: *Parts /
Assemblies / All*. An assembly row opens to show its recipe:

- the list of parts, each with its quantity and machine, and a remove
- a box to type a part number or description, with suggestions from
  the same customer's parts, then a quantity, then Add — the
  type-to-find pattern the app uses everywhere, not a wall of tick boxes
- a line saying what the parts add up to (count of lines per machine),
  so a truss reads "12 tube laser, 4 laser, 2 CNC" at a glance

Setting a part's Made on to Assembly is what gives it a recipe. Setting
it back to anything else hides the recipe but does not delete it, so a
slip is reversible.

## 7. The one-off assembly, finished off

Nothing new in the database. Two small things:

- a line with quantity 1 on an Each stage is a single tick, not a
  number box and Log — this helps every single-quantity line, not only
  assemblies
- a job with Assembly-tagged lines and no Assembly stage is flagged in
  Edit processes, the same way a cutting stage with nothing to cut is

## 8. Build order

Each step is one commit and one thing to test, the same as the tag.

1. **Database.** `assembly_parts`, and `parent_quote_item_id` on
   `job_quote_items`. Blank everywhere; nothing changes.
2. **Stock Codes.** The Parts / Assemblies filter and the recipe editor.
   Assemblies can be defined but nothing loads them yet.
3. **Loading.** New Job and the Items tab write parent and children.
   Quantity re-scale and removal.
4. **The hinge rule.** Who sees what, and the assembly line's cap.
   This is the step that changes the floor.
5. **Parent only** for invoicing, delivery notes, the process sheet and
   totals.
6. **The one-off finish**: the single tick, and the Edit processes flag.
7. **Copy job and the catalogue import** carry parents, children and
   recipes correctly. Copy job exists today and copies lines; it must
   copy the parent link too or the copy has orphaned children.

## 9. Risks

1. **Double invoicing.** If any invoicing path lists child lines, the
   customer is charged for the parts and the assembly. Step 5 makes it
   a rule in the code, and the invoice request screen should show a
   count of lines it deliberately left out.
2. **Quantity drift.** A child's quantity is derived. If someone edits
   a child's quantity by hand, the cap at the hinge goes wrong. Child
   quantities are read-only on the Items tab; change the parent instead.
3. **Line count.** A 294-set truss with ten parts is ten child lines,
   each with a large quantity. The screens cope, but a job with several
   assemblies gets long. The Items tab groups children under their
   parent, closed by default, the pills-and-rows pattern.
4. **The hinge stage's name.** The rule keys on a stage setting, not on
   the word "Assembly" — one more tick under Job Process Types, *this
   stage puts assemblies together* — so a rename does not break it.
   Only one stage may carry it.
5. **A recipe that changes after jobs are loaded.** Jobs keep the
   children they were loaded with. A recipe is a template, not a live
   link; changing it affects the next job, not the ones on the floor.
6. **Nested assemblies.** Allowed, but loading flattens them: a job gets
   one parent and every cut part beneath it, not a tree. The
   intermediate assemblies are not tracked as their own lines. If the
   shop needs to track sub-assemblies being built, that is a later
   change and this design does not block it.
7. **Catalogue import.** Assemblies are custom parts, so the keep-the-row
   fix from the tag plan carries them. A part removed from the file
   leaves a dangling recipe row, shown as "part missing"; it does not
   cascade.
8. **Four conversations.** Steps 2 and 3 are Jobs-page and Stock Manager
   work, step 4 touches the Production helpers, step 5 invoicing. The
   two new database items get announced before the SQL runs.

## 10. Questions to settle before step one

1. Is **Assembly** the stage where parts become the assembly on every
   job that has one, and is it always on the job? If some jobs assemble
   at Welding, the setting in risk 4 covers it, but it should be decided.
2. Do child parts get **bent and welded before** the hinge? The rule
   assumes yes: everything before the Assembly stage sees parts.
3. Is a child part **ever invoiced or delivered on its own** (a spare, a
   replacement)? The design says never; a spare is its own line on the
   job.
4. When the assembly quantity changes **after cutting has started**,
   refuse (the design), or allow and warn?
