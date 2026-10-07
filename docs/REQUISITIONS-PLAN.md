# Requesting stock: one system, every page

Planned 7 Oct 2026 with Heinrich. Status: steps 1 and 2 built and
committed (search fix 52ebd05; the basket on the Requisitions tab, with
`setup-requisitions-job.sql` still to paste on practice and live), neither
tried signed in. Customer Stock gets its own review (below).

## Why

Heinrich, 7 Oct: "requesting stock is an important system and it is
complicated at the moment, then no one wants to use it. All requisition
pages should run from the same manager." Also: the Request stock pop-up
misses items, it only takes one item per request, and Customer Stock
cannot be requested at all.

## What the app does today (read 7 Oct)

Seven places raise a request, through three different doors:

| Where | What happens | Code |
|---|---|---|
| Requisitions tab → New requisition | pick-an-item pop-up, then the one-item form | `PurchasingTabs.jsx` RequisitionsTab, `PurchasingPopups.jsx` RequestStockPopups |
| Stock tabs → Request stock chip at the top | same pop-up; hidden on Customer Stock | `App.jsx` ~18618 |
| Stock row → clipboard icon | the one-item form for that row; hidden on Customer Stock | `App.jsx` ~19298 |
| New stock item saved at quantity 0 | jumps into the one-item form by itself (his 18 Sep note calls this a waste of time) | `App.jsx` ~14305 |
| Pick-an-item pop-up → "Not in Stock yet? Create" | add-item form, then the one-item form | `usePurchasing.jsx` createItemForRequisition |
| Job → Cut list → "Requisition N" | the one-item form, qty and a "For job …" note filled | `App.jsx` requisitionBarsForCutList, `jobs/CutToSize.jsx` |
| Tube laser nesting → section with nothing on the shelf | the one-item form | `laser/LaserTab.jsx`, NestingView, ImportReportModal |

Buy-outs on a job go straight to a purchase order per supplier and never
touch requisitions (`jobs/BuyOuts.jsx`). The job Materials tab reserves or
takes from stores and has no request button. Shortages are a floor-to-nester
flag, not purchasing; left alone.

Every door ends in `openRequisition(item)` and `submitRequisition`, which
write ONE `requisitions` row. The list, Raise PO, Mark ordered, Receiving and
the archive all work per row. That is worth keeping: one row per item per
request means none of the downstream screens change.

### The search faults

- Not case sensitive (everything is lowercased). The misses come from
  elsewhere.
- The pop-up looks only at name, grade, customer and part number. The Stock
  tab's own search (`haystack`, `App.jsx` ~1514) also looks at size,
  thickness, length, diameter, supplier, location, comment and section type.
  An item findable under Stock can be invisible here.
- The pop-up matches the whole typed phrase against one field at a time, so
  "mild steel 6mm" finds nothing. The Stock tab splits the phrase into words
  and each word may land in a different field.
- Customer Stock is excluded; the list stops at 50; nothing shows until you
  type.
- The Requisitions list search (item, supplier, who) has the same
  whole-phrase problem and skips the notes.

## The plan

### One pop-up: "Request stock"

A single component, `src/purchasing/RequestStock.jsx`, with its state and
functions in `usePurchasing.jsx`. Every door above opens it with
`openRequest({ lines, job })`; nothing else opens a request form any more.
The old pick-an-item pop-up and the one-item form go.

What it shows, top to bottom:

1. **A search box.** Same word-by-word, every-field search as the Stock tab
   (the `haystack` moves to a shared helper so the two can never drift).
   All divisions including Customer Stock, assets left out. Up to 60
   matches, then "type more". Each match: name, division, in-stock count,
   a tap adds it to the basket.
2. **"Not in stock yet? Create …"** opens the add-item form; on save the new
   item lands in the basket and the pop-up comes back. Replaces today's
   jump-into-the-form at quantity 0.
3. **The basket.** One line per item: name, quantity box (focused when the
   line is added), supplier (type-to-find, the cheapest filled in as today,
   with the price chips), a job box, a short note, and a remove cross.
   The job box is type-to-find over open jobs; empty means Stores (his
   answer 1: no extra button, an empty job box is the Stores choice).
   Opened from a job, every line starts with that job filled in.
   Customer Stock lines take the item's own supplier, fixed (answer 4,
   see the open question).
4. **Send request** writes one `requisitions` row per basket line, as
   today. Requested-by, date and pending status as today.

Clicks on the common path from the Requisitions tab: New requisition, type,
tap, type a quantity, Send. Five, for any number of items (two more per
extra item). Today: five per item, starting over each time.

### Every door opens the same pop-up

| Door | Opens with |
|---|---|
| Requisitions tab → New requisition | empty basket |
| Stock tabs → Request stock chip | empty basket, shown on Customer Stock too |
| Stock row → clipboard icon | basket with that row already in it |
| Add-item form | the Create button above; the quantity-0 auto-jump is removed |
| Job page → Cut list → one "Request all outstanding" button | basket preloaded with every short bar group, qty and job filled, to add to, change or create from (answer 3) |
| Tube laser nesting | basket with the section in it, job filled when known |

Edit of an existing pending request stays as it is (`openEditRequisition`:
qty, supplier, notes on the row).

### The Requisitions list

- Search fixed the same way (words, every field, notes included).
- Each pending line shows its supplier and, when it has one, its job number.
- Nothing else moves: pills, supplier groups, Raise PO, Mark ordered,
  archive all stay.

### Database

`requisitions.job_id text` and `requisitions.job_number text default ''`
(answer 1: yes). A request raised from a job shows the job in the list and
the PO builder carries it onto the PO's job box, which Receiving already
reads to set the delivery aside for that job. Empty is Stores.
`setup-requisitions-job.sql`, to run on practice and live.

### Purchase orders on the job page (answer 3, later step)

A PO linked to a job (`purchase_orders.job_id`, already there) shows on the
job page in its own pill, "Purchase orders", one line per PO, opening the
same PO view as the Purchase Orders tab, and sent (emailed) from there.
The Buy-outs tab's own Raise PO stays as it is for now (answer 2); that tab
gets its own review later: files linked to a PO, and whether the PO lives
only inside the job.

### Order of work

1. Search fix in the existing pop-up and list. Own commit, tested on
   practice. Small and safe; goes first so he has it even if the rest waits.
2. The new pop-up with the basket, wired to the Requisitions tab only.
   Old pop-up and form still there for the other doors. Tested.
3. Switch the other doors over one at a time: Stock chip and row, add-item,
   cut list, tube laser, job page. Each its own commit, the old code removed
   as the last door closes.
4. List changes and the job column.
5. The Purchase orders pill on the job page.

### Files

- new `src/purchasing/RequestStock.jsx`, `src/lib/stockSearch.js` (the
  shared haystack)
- `src/purchasing/usePurchasing.jsx`, `PurchasingPopups.jsx`,
  `PurchasingTabs.jsx`
- `src/App.jsx` (the doors), `src/jobs/CutToSize.jsx`,
  `src/laser/LaserTab.jsx`, `NestingView.jsx`, `ImportReportModal.jsx`
- `setup-requisitions-job.sql` if question 1 is yes

## Customer Stock review (separate, his word 7 Oct)

"All customer items should have an optional supplier, so that we don't
need two databases. Some items I buy and sell directly." The second
database he means is the Buy-outs division. What the code has: every stock
row already has a `supplier` column; the Customer Stock add and edit form
simply never shows the Supplier box (`formSupplierField` is drawn on the
plate, structural and CNC bar forms only). So the first step is a form
change, no SQL. The bigger question, whether Buy-outs folds into Customer
Stock with a supplier, is a review of its own, not started. For the basket:
a Customer Stock line takes the item's supplier when it has one, else the
supplier is picked like any other line.

## His answers (7 Oct)

1. Job number per item; some items are for stores and have no job. Settled
   as: a job box per line, empty = Stores.
2. Buy-outs: leave as it is, contained in the job. That page needs a review
   later (files linked to the PO; the PO living inside the job, or reached
   only from the job).
3. Cut to size: ONE button to request all outstanding, opening this basket
   to add, change or create. POs linked to a job must show on the job page
   in their own main pill, and be sent from there.
4. Customer Stock: no customer details on the PO. The supplier is fixed per
   item, because it was costed from that supplier; set when the item is
   created in Stock Manager. OPEN: whether "fixed per item" means Customer
   Stock lines only, or every basket line (which would reverse answer 3 of
   the first round, "can be for different suppliers").
5. Yes, drop the quantity-0 auto-jump.

## Questions for Heinrich (7 Oct, first round)

1. Store the job number on each request line (one new column, SQL on both
   databases), so it shows in the list and flows onto the PO? Or keep it as
   words in the note?
2. Buy-outs on a job: leave "Raise PO per supplier" as the direct route, or
   must buy-outs also go through the request basket first?
3. On the job page, where does the Request stock button sit: on the
   Materials tab, beside the cut list, or both?
4. Customer Stock: request it like any other item, supplier optional? Or
   does a customer-stock request need something extra (the customer named
   on the PO)?
5. Drop the quantity-0 auto-jump into the request form when adding a new
   item (your 18 Sep note), now that the basket has its own Create button?
