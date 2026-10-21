# The Customers tab, and a customer's order sheet

Planning only. Heinrich, 21 October 2026, in the Customer Stock conversation.
Nothing in here is built. He wants it built on **Saturday 24 October 2026**,
"when we reset".

> "we need better layouts and managing made easier"

---

## 1. Why

A customer is in four places today, and three of them show the same rows:

| Where | What it holds |
|---|---|
| Stock → **Customer Stock** | the customer's parts, as the sheet built 21 Oct 2026 |
| Stock Manager → **Stock Codes** | the same parts again, as rows, plus Add item, Import / Export and "Delete for customer". Draws all 1,732 rows at once, which is why it is slow |
| Stock Manager → **Customers** | the name, rename, delete, contact people |
| ERS OneDrive → `ER DOCS/SHEETS` | the order books and price sheets the office actually runs on |

His decision: **one place**. A new top-level **Customers** tab beside Suppliers,
built the way Suppliers is built — a list, tap one, and that customer is a page
of his own with tabs.

## 2. What comes off

- Stock Manager → **Customers** (moves to the new tab's Details)
- Stock Manager → **Stock Codes** (moves to the new tab's Parts; its Import /
  Export and Delete for customer go with it)
- The Stock menu's **Customer Stock** entry. His word: "remove".

What does **not** change: the parts stay a stock division (`mainCat: "custom"`)
underneath. Requisitions, reservations, the usage log, the exports and the
job's "Add to Customer Stock" all read them that way. Only the screen moves.

## 3. The Customers tab

Who may open it: **its own tick** under User Management (his answer).

### A customer's page

Tabs, in this order:

**Details** — the name (rename carries parts, jobs, shortages, drawings and
contacts with it), the counts (parts, with stock, value on hand), and the
contact people: exactly what Stock Manager → Customers holds today, plus room
for address, account number and terms later.

**Parts** — the sheet built on 21 Oct 2026 (`src/stock/CustomerStock.jsx`),
with Add item, Import / Export and Delete for customer moved onto it.

**Orders** — the customer's own order sheet. Section 5.

**Drawings** — nearly free: drawings are already filed per customer.

Common path, anywhere to editing a contact: Customers → the customer →
Details → type. **3 taps**, against 4 today, with no hunting through a
22-button Stock Manager.

## 4. Reading customer POs from email

The machinery exists on the supplier side and is reused, not rebuilt:

- **Reading the mailbox**: `src/procurement/mailSweep.js` — Microsoft Graph,
  read only, runs when the page opens and on Refresh, never on a timer, never
  sends, deletes or moves mail.
- **Reading the PDF**: the `read-document` edge function and the Claude API,
  under the same **$15 a month** cap as the supplier quotes. Every PO read
  spends from that same cap.

Mailbox: **sales@** (his answer).

The run:

1. Mail from one of that customer's contact addresses, with a PDF attached.
2. Claude reads it: their PO number, the date, and the lines — code,
   description, quantity, price, date wanted.
3. Each line's code is looked up in **that customer's own parts**, so the
   description and the price come through. A code we do not know stays as the
   text that was read, with "Add to Customer Stock" beside it.
4. The order sits on the Orders tab as a draft. **Nothing is ever created by
   itself.**
5. One button: **Make job** (his answer). It opens a job with those lines and
   the customer's PO already filled in.

## 5. The order sheet, per customer

Changed on his correction, 21 Oct 2026:

> "this will be split per customer, I dont think the whole orderbook on one
> sheet is the best idea, some of the smaller customers sheet wont be managed
> well so I dont want to clutter anything"

So: **one order sheet per customer, on that customer's Orders tab.** No
all-customers order book.

### What the office uses today

Taken from the real files, not from memory (`ER DOCS/SHEETS`, three of them
edited the morning of 21 Oct 2026):

| Sheet | Columns |
|---|---|
| **ERS PRODUCTION.xlsx** (R 745,446 open) | Order No, Customer, Description, Order date, QTY, QTY Complete, QTY Outstanding, ER Job No, Note, Status, Inv No, Value, Total, Date To Complete |
| **Laser Production-01.xlsx** (HPE ORDERS) | Order No, Stock Code, Version, Description, Qty Req, ER Job No, Process, Status, Recommended Stock, Nest, Notes |
| **SMALL JOBS.xlsx** | Order Nr, Client, Qty, Qty complete, Qty outstanding, ER Job Nr, Status, Value, Total, Quote, Inv Nr |
| **FER-ORDER-01.xlsx** | WO, four PO columns, Description, Drawing No, Product Code, Quote (sig / fab), PDF, Note, Status, Price |

`HPE.xlsx`, `BPW PRODUCTION.xlsx`, `HYDRAFORM11.xlsx` and `FSS PRODUCTION.xlsx`
are price and stock sheets, not order books: that is Customer Stock, already in
the app.

### The screen

One line per ordered item on that customer's open jobs, in the sheet layout of
21 Oct 2026 (headings once, lines between the columns, one row per item):

> Their PO · Order date · Code · Description · Qty · Complete · Outstanding ·
> Job · Where it is now · Due · Value · Invoice no · Note

- One search box. Filters: status, and open / everything.
- Sorted by date wanted, soonest first.
- **Export to Excel**, so the sheet can still be sent around or kept.
- Finished lines start shut, open work starts open, the house rule.

### What "Complete" means

His answer, 21 Oct 2026: **only when marked invoiced.**

> "only when marked invoice, then when account do sage there invoice number
> goes in the line"

So Complete = the quantity that has gone onto an invoice request and been
marked invoiced; Outstanding = ordered less that. The **Invoice no** column
fills in by itself when accounts records the Sage invoice.

**No new column is needed for that number.** The chain already exists:
`job_quote_item_invoices.request_id` → `job_invoice_requests.sage_invoice_id` →
`job_sage_invoices.invoice_number`. A line can carry more than one, because a
job can be billed on several Sage invoices.

Worth saying out loud: the app's numbers are the floor's ticks and accounts'
marks, where the spreadsheet is whatever the office knows. Where the two
disagree, the answer will nearly always be a stage nobody ticked — not the
screen.

### What the database still needs

Only two things, both small:

1. **A note per line** — `job_quote_items.order_note`. The sheets all have a
   Notes column and the app has nowhere to put it.
2. **An order date**, if it must be separate from the date the job was booked
   in. Probably not: the job's own date is the order date in practice.

## 6. Open, still to answer

1. **Can one job carry lines from two of the customer's POs?** Today the PO
   sits on the job (`jobs.customer_po`), one per job, while HPE's own book has
   an Order No per line. If two POs can share a job, the PO has to move onto
   the line, which is a column and a change to every screen that prints it.
   *Recommendation: leave it on the job for now, and only move it if the
   office says it happens.*
**Answered 21 Oct 2026:**

2. **Who owns it.** A conversation of its own, started fresh for it. The
   Claude API conversation built the Suppliers page and the document reader,
   so step 3 (reading POs from sales@) is written with it, not twice.
3. **Finished orders stay**, in a filtered tab of their own: *"need data to
   plan next year production, I want to use all available data for planning,
   can we filter it like we do now on excel."* So the Orders tab is Open and
   Finished, and the sheet filters like a spreadsheet does — a filter box
   under each heading (their PO, code, description, status), a date from / to,
   and the totals of whatever is showing. Export to Excel on both.

   The load has to be bounded even so: open work always, finished work only
   for the date window asked for, paged by id. Never the whole table.

## 7. Order of building

1. The Customers tab with **Details** and **Parts**, and the three old screens
   taken off. No database change. Testable on its own.
2. The **Orders** sheet, reading jobs that already exist, plus the per-line
   note. One small SQL file.
3. **Reading POs from sales@** and the Make job button. The biggest piece, and
   the one that spends API money.
