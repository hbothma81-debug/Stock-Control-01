# Customer Stock: the page rebuilt, a supplier on each part, one list not two

Planned 7 Oct 2026 with Heinrich. Status: PLAN, waiting on his answers.
Nothing built. Owner: the Requisitions conversation.

## Why

Heinrich, 7 Oct: "all customer items should have an option to add a
supplier so that we don't need two databases. Some items I buy and sell
directly, so I don't want two databases. All current customer stock items
should have a supplier, optional, that is set." The second database is the
Buy-outs division.

## What the app has today (read 7 Oct)

**Customer Stock** (`main_cat = "custom"`): customer (required), the
customer's own part number (required; the line's identity on a job, see
[stock code beats description]), description, quantity, cost (shown with
Rand values), drawing link, made-on tag and extra stages. **No Supplier
box on its form**, although every stock row has the `supplier` column.
Left out on purpose from the PO form's part-number and description
lookups ("the customer's own parts, not things we buy") and from the
requisition card's price row. Grouped by customer on the Stock tab.
Imported per customer from the customer's sheet; a re-import keeps a
part's row and id.

**Buy-outs** (`main_cat = "buyouts"`): part number, description, supplier
(required), cost. Identity is part number within supplier. Grouped by
supplier on the Stock tab; Stock Manager has Buy-out Codes with import
and export. The PO form finds them by part number or description. A job's
Buy-outs tab (`src/jobs/BuyOuts.jsx`) types-to-find against this
division and raises one PO per supplier. See docs and memory: the
buy-outs division and buy-outs on a job.

The Request stock basket already takes a Customer Stock item's supplier
when the row has one (7 Oct).

## What he saw on live, 7 Oct, and why (read through his signed-in tab)

- **"All customers mixed", only a handful of parts.** Live holds 1,732
  Customer Stock parts (HPE 835, BPW 144, FSS 17, Stainless Steel Design
  3, Factory 1, plus the few with stock). 1,724 are at quantity 0, and the
  Stock tab hides every zero row unless a request tracks it (`tabItems`),
  so the page shows 8 parts in four customer pills. The catalogue he
  loaded on 31 Aug is in the database and invisible.
- **"No revision numbers."** The importer reads a Revision column
  (`revIdx`) into `customerRevision`, and the detail has a "Cust. rev"
  box, but `customerRevision` is not in `ITEM_DB_FIELDS` and
  `stock_items` has no such column (live checked: not there). Every
  revision imported or typed was kept in memory only and gone at the
  next reload. Nothing was ever saved; nothing was deleted.
- **"Price, not cost."** The detail's box says "Price (R)" and the row
  says "R… ea · R… total"; `value` is what we pay.
- **Pills not alphabetical.** The "All customers" chips come from the
  master customers list; the groups come in the order the rows arrived.
- **A tap opens a new page.** A row tap sets `selectedItemDetail`, a
  full page with a Back button, the old three-level pattern.
- **Stock code cut off, no borders.** `S.partTag` is a small mono chip;
  the name beside it has no box.

## The rebuild (step 0, before the supplier work)

One screen, `src/stock/CustomerStock.jsx`, lifted out of App.jsx as a
by-product of this work (his say-so, question 3), the pills-and-rows
pattern the rest of the app uses:

- A search box over everything on the row (stockSearch.js).
- **One pill per customer, A to Z, shut**, with its count. Every part is
  listed, zero included: it is the catalogue. A "Has stock" tick narrows
  to parts on hand.
- **One row per part, A to Z** (question 4: by stock code or by
  description), reading: stock code in a bordered box wide enough for
  the whole code, description in its own bordered box, revision, quantity,
  cost (Rand values only), supplier.
- **A tap opens the row in place** (no new page): Qty, Cost, Low at,
  Customer revision, Supplier, Customer, the drawing link, and the same
  buttons the detail page has (Request stock, Use stock, Edit, Remove).
- **Revisions saved:** `customer_revision text` on `stock_items`
  (`setup-stock-customer-revision.sql`), read and written outside
  `ITEM_DB_FIELDS` like `paid_price`, only once a loaded row shows it. The
  importer then keeps them. To get the lost ones back he re-imports the
  customer sheets (a re-import updates in place, keeps ids, never reads
  quantity from a file), or types them.
- "Cost" everywhere the page says Price.

## The plan, in steps

### Step 1: a supplier on a customer item (no SQL)

- The Customer Stock add and edit form gets the same **Supplier
  (optional)** box the plate and section forms have (`formSupplierField`:
  the supplier list, a new name allowed). The row shows the supplier
  beside the part number. The customer export gets a Supplier column; the
  importer reads one, known names only, like the buy-outs importer.
- A customer item **with a supplier** counts as something we buy: it joins
  the PO form's part-number and description lookups, and its requisition
  card gets the price row (R/ea from the item's cost). Without a supplier
  it stays as today.

### Step 2: the job orders it (his call, question 3)

The job's Buy-outs tab also finds the job's customer's items that have a
supplier, so a resold item is ordered from the job without being typed
into Buy-out Codes as well. One PO per supplier as now; receiving sets it
aside for the job as now.

### Step 3: what becomes of Buy-outs (his call, question 4)

Buy-out rows have a supplier and no customer. Either they stay as a
division for parts that belong to no customer (bearings, seals), or they
move into Customer Stock under a customer of his choosing ("Stock" or the
customer they are usually resold to), and the Buy-outs tab and Buy-out
Codes go. Moving is one SQL update of `main_cat` and `customer` plus the
job's Buy-outs picker reading Customer Stock; nothing else keys on the
division.

## Questions for Heinrich (7 Oct, second round, the page)

1. Show every part, zero included, with a "Has stock" tick to narrow?
   (Recommended: it is the catalogue, and 1,724 of 1,732 are at zero.)
2. The lost revisions: do you still have the HPE and BPW sheets to
   re-import once the column exists, or do they get typed?
3. Lift Customer Stock out of App.jsx into its own file as part of this
   rebuild? (Recommended; the page is rewritten anyway, and it gets its
   own crash net.)
4. Parts A to Z by stock code, or by description?

## Questions for Heinrich (7 Oct, first round, the supplier)

1. One cost on the item, as now, or a price per supplier like plate and
   sections have? (Per supplier means the supplier-prices table and chips;
   one cost is what Buy-outs do today.)
2. A customer item with a supplier: may the PO form find it by part number
   and description, like a buy-out? Today Customer Stock is kept out.
3. Should the job's Buy-outs tab offer the job's customer's items that
   have a supplier, beside Buy-out Codes?
4. Buy-outs that belong to no customer (bearings, seals resold to anyone):
   stay in the Buy-outs division, or move into Customer Stock under which
   customer?
5. Who may set the supplier on a customer item: anyone who can edit stock,
   or only those who can raise POs?
