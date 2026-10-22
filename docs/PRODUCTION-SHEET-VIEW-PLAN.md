# Production tab: Cards or Sheet

Planning only. Heinrich, 22 October 2026, in the Production tab conversation.
Nothing built. To go live **Saturday 24 October 2026, morning**, in the same
push as the Customers tab (`docs/CUSTOMERS-TAB-PLAN.md`).

> "2 different views, the one we have but with changes, and a excel type
> view, the same we have for the new Jobs page, where all the items are on
> one list with the icon/picture of the pdf drawing linked to the item."

---

## 1. What changes on screen

At the top of the Production page, under the search and filter row, one
switch: **Cards | Sheet**. It is remembered on the device, so a floor tablet
stays on Cards and an office PC on Sheet.

- **Cards** is today's screen with its 21 Oct changes (the ⋮ menu, days
  waiting, the job number link, the Count box). Nothing else moves.
- **Sheet** is the Jobs page's sheet (`stk-sheet`): headings once, lines
  between the columns, one row per item, the drawing's picture in the row.

On both, once a view is picked the pills sit on top: **Standing**, **Ready
now**, **Waiting on earlier stages**, with their counts, the same rule as
today (`stageReadiness`, so the two views can never disagree).

## 2. The sheet

One row per item at a stage: a line, or a part where the stage cuts parts
(`itemsForStage`, the rule the cards already use).

Columns, proposed (question 4):

| Drawing | Job | Customer | Code | Description | Stage | Qty | Done | To go | Days waiting | Due | Sales rep | Status |

- **Drawing:** the 60 px picture the Items sheet already makes and keeps
  (`DrawingThumb`, pictures under `thumbs/` in the drawings bucket). Click
  opens the PDF. No drawing, no picture, and the row keeps its height.
- **Job:** the job number, a link into the job for sales and admins, with
  Back to Production, as on the cards.
- **Status:** Ready, Partly ready 3 of 5, Waiting on Laser, Standing; red
  for a shortage re-cut or Urgent, as the cards show it.
- **Filters on top:** a filter box under each heading (Job, Customer, Code,
  Description, Stage, Sales rep), the way the Customers tab's Orders sheet is
  planned, so both sheets filter alike. The page's one search box stays.
- Sorted as the cards are (urgent, ready before waiting, due date); a click
  on a heading sorts by it.
- A wide sheet scrolls sideways on a phone, never wraps.

## 3. Loads and growth

Nothing new is loaded. The sheet draws from the Production queue already in
memory (`fetchProductionQueue`, paged and batched). The pictures are the
Items sheet's stored PNGs, a few kB each, made once per drawing. At ten times
today's work the sheet is a long list, not a heavier load; the pills keep
finished work out of it.

## 4. Built so it can wait for Saturday

Built and tried on practice Thursday and Friday. Committed behind a switch
that is off (`PRODUCTION_SHEET_VIEW_ON = false`), so the commits are safe to
push with anyone else's and change nothing on live until Saturday. Saturday
morning: one commit turns the switch on and goes through the gate with the
Customers tab work.

## 5. Order of building

1. The Cards | Sheet switch and the pills moved on top (switch off on live).
2. The sheet: columns, pictures, status, job link.
3. Filters under the headings, and sorting by heading.
4. Saturday: switch on, push with the Customers tab, check live.

## 6. Questions for Heinrich

1. Where is the switch: on the **department list** (one sheet with every
   department, a Stage column to filter), or **inside a department** (one
   sheet per department, like the cards)?
2. In a sheet row, does the operator **log the count or tick it right there**,
   or does a tap on the row open today's card to do it?
3. Who gets the Sheet: everyone, or office people (sales, admins) with the
   floor kept on Cards?
4. The columns in section 2: anything to add or drop?
