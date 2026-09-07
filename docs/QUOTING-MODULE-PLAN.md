# Quoting module — plan

Written 6 September 2026. Planning only; nothing has been built.

This describes adding quoting to Stock Control so it replaces the Excel
costing workbook. It is written to be read by you, not by a programmer.

---

## 1. What already exists that quoting can reuse

Quite a lot, and more than expected.

**A material costing engine, already working.** The app does not merely
store prices — it works cost out from the size of a thing:

| Kind of stock | How cost is worked out | Where the rate is set |
|---|---|---|
| Plate & sheet | weight from length × width × thickness, then × R/kg | Stock Manager → Grades |
| Structural | metres × R/m | Stock Manager → Sections |
| CNC bar | weight from diameter and length, then × R/kg | Stock Manager → CNC Grades |
| Stores, fasteners, customer parts | price each, held on the item | the item itself |

This is the same maths your **KG PRICE** sheet does by hand. Quoting can
call it rather than repeat it.

**Customer parts with part numbers and prices.** The Stock Manager tab
still called "Stock Codes" now edits customer stock items — part number,
description, price, customer. This is what a quote line picks from.

**Jobs already have quote lines.** `job_quote_items` holds description,
quantity, unit price and a link to a stock item. It already drives
per-item production tracking and invoicing. An accepted quote's lines
land here, so nothing downstream has to change.

**The document machinery.** Purchase orders build a PDF, upload it,
record it in a documents table and show it on screen. Quotes use the same
path, unchanged.

**Numbering.** There is a counters table that issues the next PO number
and job number. Quote numbers join it.

**Permissions.** Every screen is already gated by a per-person tick list
in User Manager. Quoting adds ticks of its own.

**The screen pattern.** Compact list, tap a row, full detail opens. Jobs,
Production and Assets all work this way. Quoting follows it.

**One thing that is not there.** Nothing in the app knows about hours or
hourly rates. Laser cutting time, welding hours, CNC seconds and setup
charges are all new.

---

## 2. What the Excel workbook actually does

Read from `ERS QU226339`. Nine sheets, in three layers.

**The take-off sheets — where the work is measured**

- **STRUCTURAL-01 / -02** — one block per material. Each block holds the
  material cost, a selling factor, and the laser settings: **rate per
  metre (30), pierce charge (5), handling (8), price per hour (1500)**,
  and a **thickness-to-cutting-speed table** (1.2mm cuts at 18 m/min,
  3mm at 8, 6mm at 3.5, 12mm at 0.6). Each row is a part: drawing, size,
  offcut length, quantity, cut lengths, drilling and machining.
- **CNC** — three machine rates (**750, 500 and 350 per hour**) plus a
  **setup charge of 750**, converted to a cost per second. Each row is a
  turned part: billet diameter, finished length, parting blade, parts per
  metre, quantity.
- **KG PRICE** — cut-to-size plate priced by weight, at a rate per kg.

**The costing sheet — where it is priced**

- **QUO-01** — the quote broken into numbered items (1, 2, 3…), each with
  up to eleven cost lines beneath it (1.1, 1.2, 1.3…). The standard
  lines are **Laser, Structural and Welding**. Every line carries a unit
  (sum, ea, m, m², kg or hr), a quantity, a rate, an amount, a **cost**,
  a **markup %** and a resulting sell figure. Each item shows a subtotal,
  a total weight and a price per kg.

**The outputs**

- **ERS QUOTE** — the customer-facing page: bill-to details, quote
  number, date, valid-until, representative, the priced lines, terms and
  conditions, banking details, subtotal, VAT and total.
- **MAT ORDER** — what to buy, by quote number and project.
- **CUTTING LIST-01 / -02** — parts to cut, with stock lengths.

**The shape to keep:** a quote is a small number of things you sell, and
underneath each one a handful of cost lines that add up to it. That is
the structure the tables below follow.

---

## 3. Proposed tables

Eight new tables, all prefixed `quote_` so the module is obvious and can be
removed cleanly.

### `quotes` — one row per quote

| Field | Meaning |
|---|---|
| id | internal |
| quote_number | QU-0001, issued by the counters table |
| revision | A, B, C… |
| supersedes_id | the revision this replaces, if any |
| customer | from your customer list |
| contact_name, contact_email, contact_phone | who it goes to |
| project | free text, appears on the document |
| status | draft, sent, accepted, lost, expired |
| sales_rep_id | locked to whoever created it |
| quote_date, valid_until | dates on the document |
| delivery_lead_time | free text |
| custom_instructions | your own paragraph on the document |
| terms_text | terms, defaulted from company settings |
| vat_rate | normally 15 |
| notes | internal, never printed |
| approved_by, approved_at | only used if approval is switched on |
| converted_job_id | the job it became |
| created_by, created_at |  |

### `quote_items` — the things you are selling

Item 1, item 2, item 3 — what the customer sees as a line.

| Field | Meaning |
|---|---|
| quote_id, sort_order | which quote, and the order |
| description | what it is |
| unit | ea, m, m², kg, sum, hr |
| qty | how many |
| sell_rate | rate the customer sees |
| cost_total, sell_total | worked out from the cost lines below |
| linked_item_id | the stock item, if this is a catalogue part |

### `quote_cost_lines` — how each item was priced

The 1.1, 1.2, 1.3 beneath each item.

| Field | Meaning |
|---|---|
| quote_item_id, sort_order |  |
| quote_process_id | which of **your** processes this is — points at the master file below |
| process_name, calculator | copied in at the time, so an old quote still reads correctly after you rename or retire a process |
| description | what it reads as on the costing screen |
| inputs | **the numbers that process asked for** — see below |
| unit, qty, cost_rate | what it costs us |
| markup_percent | added to get the sell figure |
| cost_amount, sell_amount |  |
| linked_item_id | the stock item, when the line came from Stores |

**Why `inputs` is one field rather than many columns.** Each process asks
for different things — laser wants cut length, thickness and pierces; CNC
wants billet diameter, finished length and parts per metre; structural
wants section, length and quantity. Giving every process its own columns
would mean a table thirty columns wide, mostly empty, and a new column
every time a process is added. Instead each line keeps its own answers in
one field, shaped by whichever process it is.

The trade-off, stated plainly: it keeps the table simple and makes adding
a seventh process easy, but the database itself cannot check those
numbers — the app has to. For a quote, where the money figures are stored
separately as real columns, that is the right way round.

### `quote_processes` — your own list of processes

A master file in Stock Manager, separate from Job Process Types and
editable in the same way. This is what the **Add process** menu reads.

| Field | Meaning |
|---|---|
| name | what you call it — rename freely |
| calculator | which maths it uses, picked from the list below |
| sort_order | the order it appears in the menu |
| default_markup | optional, so a process can carry its usual margin |
| maps_to_job_process | which job stage it becomes, if a quote turns into a job |
| active | retire one without deleting history |

**The names are yours; the maths is chosen.** The calculators the code
knows are fixed:

| Calculator | Asks for |
|---|---|
| laser_build | cut length, thickness, pierces — uses the speed table |
| flat_price | just a price, quoted off SigmaNest or judgement |
| per_metre | metres × a rate |
| per_weight | kilograms × a rate |
| rate_times_count | a rate and a count — R20 across 20 connections |
| per_area | square metres × a rate |
| cnc_seconds | billet, length, parts per metre, machine |
| from_stores | pick a stock item, take its cost |
| supplier_price | a price quoted to you, marked up |

So you can add **Plasma Cutting** tomorrow, set it to *per metre*, give
it a rate, and use it — without anyone touching code. What you cannot do
is invent new maths, which is the right line to draw.

**This is also the fix for the naming problem.** The calculator is stored
on the row, not worked out from the name. Rename "Welding" to "Weld Shop"
and it keeps costing exactly as before. Nothing in quoting ever matches
on a name.

**Ships with your six** — Laser, Tube Laser, Welding, Structural, CNC,
Surface Finish — plus From Stores, already pointed at the right
calculators. You change them from there.

### `quote_rates` — the numbers that are yours to set

Everything currently buried in the spreadsheet.

| Field | Meaning |
|---|---|
| rate_key | laser_rate_per_m, laser_pierce, laser_handling, laser_price_per_hour, cnc_rate_a/b/c, cnc_setup, welding_per_hour |
| label | how it reads on screen |
| value | the number |
| unit | per m, per hour, per pierce |

### `quote_cutting_speeds` — thickness to speed

Your 1.2mm → 18 m/min table, one row each. Kept separate because it is a
lookup, not a rate.

### `assemblies` and `assembly_lines` — saved sets of parts

New, and worth its own explanation. An **assembly** is a quote item you
have saved to use again: a set of parts and the processes that go with
them, kept under a code so repeat work is picked rather than rebuilt.

`assemblies`: code, name, description, customer (or blank for anything),
notes, created_by, active.

`assembly_lines`: one row per part or process inside it — the same shape
as a quote cost line, so building an assembly and building a quote item
are the same job.

**Used on a quote, an assembly is copied in, not linked to.** Choosing an
assembly drops its parts and processes into the item as ordinary lines
you can then change. It does not stay tied to the assembly afterwards.

That matters more than it sounds. If quotes stayed linked, editing an
assembly next year would silently change what a customer was quoted last
year. Copying means an old quote always says what it said, and an
assembly is free to improve.

**Where it lives:** its own tab in Stock Manager beside Stock Codes, as
you asked.

### `quote_documents` — the PDFs issued

Which quote, which revision, when, by whom, where the file is. Mirrors
how purchase orders are recorded.

**How it links to what exists:** customer comes from your customer list;
`linked_item_id` points at real stock items; `sales_rep_id` points at a
real person; `converted_job_id` points at the job. Nothing existing is
altered.

---

## 4. Screens and flow

Compact list, tap to open. No expanding cards.

**Quotes list** — one line each: quote number, customer, project, total,
status, date. Search across all of it, filter by status and customer.

**Quote detail** — opens as a full screen, like a job. Four tabs across
the top, the same as Job Detail:

1. **Details** — customer, contact, project, dates, rep (fixed to you),
   validity, lead time, custom instructions.
2. **Items** — the things you are selling. **Add item** asks for a name
   and a quantity, nothing else. Each item shows its total and a
   **Build** button.
3. **Costing** — every cost line across the whole quote, with cost,
   markup and sell side by side, and the totals. This is your QUO-01.
4. **Document** — generate the PDF, see previous revisions.

**Build — the heart of it.** Pressing Build on an item opens that item's
working. It lists the processes already on it and offers **Add process**:

> Whatever is in your **Quote Processes** list — shipping with
> **Laser · Tube Laser · Welding · Structural · CNC · Surface Finish**
> and **From Stores**, and yours to add to.

**Each one opens its own screen**, because they do not ask the same
questions:

| Process | How it is priced |
|---|---|
| **Laser** | **Two ways.** Either *build it* — cut length, thickness and pierces, using the cutting speed table exactly as the spreadsheet does — or simply *enter a price*, quoted off SigmaNest. Charged as a sum or as each. |
| **Tube Laser** | Its own rate. Tube is not priced like flat. |
| **Structural** | Section, length and quantity → metres × R/m from your Sections list. |
| **Welding** | **Three ways**, whichever suits the part: per metre of weld, by weight, or a rate × a count — R20 a connection point across 20 points. |
| **CNC** | Billet diameter, finished length, parts per metre and machine → seconds × that machine's rate, plus setup. |
| **Surface Finish** | **Three ways**: per square metre, per kilogram, or a price straight from the supplier when it is bought in. |
| **From Stores** | Pick the stock item; it brings its cost. At quote stage that is all it does. |

Each screen ends the same way: a cost, **its own markup**, and a sell
figure that goes back onto the item. So the item's total is the sum of
its processes, and the quote total is the sum of its items — the same
walk-up your spreadsheet does, but each step on its own screen instead of
across nine tabs.

An item can carry the same process more than once — two laser lines for
two different thicknesses is normal.

**Where several pricing bases exist**, the screen asks which basis first,
then only the fields that basis needs. Welding by weight asks for kilos;
welding by connection asks for a rate and a count. Nothing irrelevant is
ever on screen.

**Stores lines do more later.** On the quote a stores line is only a
cost. When the quote becomes a job, those lines become the job's material
requirements — so the parts you priced are the parts the job expects,
without anyone re-entering them.

**Rates** — a Stock Manager section holding every rate and the cutting
speed table, so the numbers are yours to change without anyone editing
code.

**The flow**

Draft → add items → build each item → generate PDF → mark sent →
customer replies → **Accepted** creates a job, or **Lost** closes it. A
revision copies the quote to Rev B and links back.

---

## 5. Who can do what

Four new permissions in User Manager:

| Tick | Allows |
|---|---|
| Quoting | See the tab and all quotes |
| Create quotes | Raise and edit their own |
| Approve quotes | Sign off before sending — only checked if approval is on |
| Convert to job | Turn an accepted quote into a job |

You said sales people see everything, so **Quoting** shows every quote,
not just your own. The rep on a quote stays whoever created it and cannot
be changed, exactly as purchase orders work.

**Approval** is a per-person tick, as you asked: a rep without "Approve
quotes" must have someone else sign off before the quote can be sent. If
nobody has the tick, approval is effectively off.

**Editing after sending** is blocked. Change a sent quote by raising a
revision, so what the customer received still exists.

---

## 6. The quote document

Same machinery as the purchase order: build the PDF in the browser,
upload it, record it, show it on screen. No new mechanism.

Differences from the PO document:

- Bill-to block with the customer contact
- Quote number **and revision**, date, valid until, representative
- Lines showing item number, description, unit, quantity, rate, amount
- Subtotal, VAT and total
- **Terms and conditions**, banking details, validity, delivery lead
  time, and your **custom instructions** paragraph
- Your logo, from company details, as every document now does

Terms and banking come from company settings so they are typed once.

---

## 7. Feature toggle

A **deployment setting**, as you asked.

One setting, `VITE_QUOTING_ENABLED`, set per Vercel project. When it is
off:

- The Quotes tab does not appear
- The permission ticks do not appear in User Manager
- Nothing in the quoting folder is loaded by the browser at all

Because each customer has their own deployment, quoting is on for East
Rand Supplies and absent everywhere else. It cannot be switched on from
inside the app, which is the point of putting it there rather than in the
database.

The tables can exist unused in every project; empty tables cost nothing.

---

## 8. Build order

**Stage 1 — a quote you can send.** Quotes list, quote detail, add item
(name and quantity), a typed price per item, PDF with terms and totals,
statuses. No Build screen yet. You could raise and issue a quote without
Excel, but would still work the price out yourself.

**Stage 2 — Build, with the two easy processes.** The **Quote Processes**
master file in Stock Manager first, since Add process reads it. Then the
Build screen and the first two calculators: **From Stores** (pick a stock item,
take its price) and **Welding** (hours × rate). Both are simple, and
between them they prove the whole shape — item, processes underneath,
markup, totals rolling up. Everything after this is another module of the
same kind.

**Stage 3 — the real calculators.** **Structural** (metres × R/m, already
in the app), then **Laser** (cutting speed by thickness, rate per metre,
pierces, handling), then **CNC** (seconds by machine, plus setup), then
**Tube Laser** and **Surface Finish**. Rates and the cutting speed table
move into Stock Manager first, so you own the numbers before the
calculators use them. This is the stage that fully replaces the workbook,
and it is deliberately last because it is the one that has to be right.

**Stage 4 — quote to job.** Accepted quote creates a job: items become
job quote items, the process stages come from the processes used, and
**stores lines become the job's material requirements**. Job numbering
stays independent.

**Stage 5 — assemblies.** Save a built item as an assembly, a Stock
Manager tab to manage them, and pick-an-assembly when adding a quote
item. Deliberately after Stage 4: an assembly is a saved quote item, so
the thing being saved has to be right first. Building it earlier would
mean saving a shape still being changed.

**Stage 6 — the extras.** Revisions with history, material order list,
cutting list, quote-to-order reporting.

Each stage is usable on its own and tested on practice before going live.

---

## 9. Risks and what would need changing

**Nothing existing needs altering.** That is deliberate. New tables, new
folder, new tab. The only shared things are the customer list, stock
items, people and the counters table, and quoting only reads them.

**The risks worth naming:**

**This is a big module.** Stage 3 is where the real value is and it is
also the hardest. If it stalls, you would be running the app for issuing
quotes and Excel for costing, which is worse than either alone. Stage 1
is deliberately shaped to be useful on its own in case that happens.

**App.jsx is 16,713 lines.** Quoting must not go in it. Its own folder
from the first line of code, as the laser screens are.

**Two quote templates are in circulation.** The app's existing importer
expects the description header on row 21; the workbook I read has it on
row 12. Whichever way quoting goes, that importer will need checking
against real files.

**Rates change.** A quote priced last month used last month's rates. The
tables above store the resulting numbers on the quote, not a live link,
so an old quote keeps saying what it said. Re-pricing is deliberate.

**Your database rules are open.** Every table is readable by any
signed-in account, and quotes hold your margins. The new tables would
start with the same weakness. This is the security work already on your
list, and quoting makes it more pressing rather than less.

**Weight maths lives in App.jsx.** Quoting needs it, so it moves to a
shared file first. Small, mechanical, and worth doing anyway.

---

## 10. Decisions made

Settled on 6 September 2026.

| | Decision |
|---|---|
| Quote numbers | **Start fresh at QU-0001.** The old QU226339 series stays with the workbook. |
| PDF | Shows the **sell price only**. No cost or margin on the customer's copy. |
| Revisions | **Same quote number**, shown as "QU-0001 Rev B". |
| Expiry | Marks itself **expired automatically** once past valid-until. |
| Lost quotes | **A reason is recorded** — price, lead time, no reply. |
| Terms and banking | **One set**, from company settings, editable on an individual quote. |
| Seeing cost and margin | **A tick in User Manager, given to sales people only.** Others can open a quote and see the sell price, not what it cost or what it earns. |
| Converting to a job | **Any accepted quote.** Approval is not required first. |
| The old workbook | **The import stays permanently.** Not a changeover crutch — a way in that never goes away. |
| Assembly contents | Saving an assembly captures **the processes as well as the parts** — the whole build, not just a parts list. |
| Assemblies on jobs | **Yes**, usable directly on a job, not only through a quote. |
| Nested assemblies | **No.** One level to begin with. |
| Assembly price | **Carries a stored price.** It only changes when something inside it is deliberately changed — it does not drift as rates move. |
| Assembly scope | **Per customer.** |
| Markup | **Per line**, not once per item. |

**On the assembly price, since it is subtle.** An assembly holds the
price it was last costed at. Opening one and changing a part re-costs it
and stores the new figure. Rates moving in the background do not touch
it. So a repeat order quotes at the price you last agreed it at, and
nothing changes underneath you — but the screen will show when the parts
inside it would cost something different today, so you can choose to
re-cost rather than be surprised.

## 11. The two process lists

Settled: **two separate lists, both editable, neither hard-coded.**

| | Job Process Types | Quote Processes |
|---|---|---|
| Where | Stock Manager, as today | Stock Manager, new tab |
| What it drives | the factory flow and the Production tab | the Add process menu on a quote |
| Order matters | yes — it is the flow work moves through | only for the menu |
| Editable | yes, unchanged | yes |
| Linked | by an optional mapping on each quote process | |

Nothing about the existing job list changes. Quoting does not read it,
rename it, or depend on it.

**They meet in one place only:** when an accepted quote becomes a job,
each quote process looks at its `maps_to_job_process` field to decide
which stage the job should get. A quote process with nothing mapped
simply adds no stage. That mapping is a pointer you set once, not a name
match, so renaming either side leaves it working.

**Why this is safer than hard-coding.** The fault that bit us three times
today was code deciding what something *was* by reading its name. Storing
the calculator on the row removes that entirely — from quoting at least.
The job side keeps its existing name-matching, which is a known weakness
already on your list, and quoting neither makes it worse nor depends
on it.
