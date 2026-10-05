# Moving Purchasing out of App.jsx: plan

Written 5 Oct 2026. **Built and tested on practice the same day; see "How it went" at the end.** The first of about eight department moves (see the split notes in memory). The app should look and behave **exactly** the same afterwards; this is a move, not a change.

## What moves

About **2,700 lines** leave App.jsx (28,686 → about 26,000).

| What | Where in App.jsx today | Lines |
|---|---|---|
| Purchasing screen state (search boxes, filters, open pop-ups, PO builder, receiving form, PO report boxes) | ~33 `useState` lines, 1722–2080 | ~35 |
| Requisitions, purchase orders, receiving, PO report, PO PDF, pricing a PO line | `openRequisition` (13849) to `resolvePoLineUnitPrice` (to 15175) | ~1,330 |
| Requisitions, Purchase Orders and Receiving tabs | 17513–18205 | ~690 |
| PO Reports tab | 20268–20311 | ~45 |
| Pop-ups: Receive, Cancel PO, PO report, PO builder | 28027–28484 | ~460 |
| Pop-ups: requisition picker, Request stock | 28543–28680 | ~140 |

## The new files: three, not ten

- `src/purchasing/usePurchasing.jsx` holds the functions (~1,330 lines), lifted word for word into a hook that takes one `deps` object, the same way `src/laser/useLaserPrograms.js` was done. `.jsx` because `renderRequisitionCard` draws a card.
- `src/purchasing/PurchasingTabs.jsx` holds the four tabs (~740 lines).
- `src/purchasing/PurchasingPopups.jsx` holds the six pop-ups (~600 lines).

The screen state sits in a small `usePurchasingState()` in the hook file, called where the state is declared today. It can't move down with the functions, because two things near the top of App.jsx read it while the page is drawing:

- the "is any pop-up open" check reads `requisitionTarget` and `showRequisitionPicker`
- the tab-change reset clears the PO and receiving searches

## How tangled it is (measured with a parser, not guessed)

- **The code reaches into the rest of the app 58 times.** That covers stock items, the material lists and prices, the permissions, jobs (for allocating received stock), the usage log and the document store. All of these go in through `deps`.
- **The rest of the app reaches into purchasing 21 times.** All of these come back out of the hook:
  - **Stock rows:** the coloured requisition flag and the Request button (`openRequisition`, `handleFlagClick`)
  - **Cut list:** order bars (`openRequisition`)
  - **Buy-outs tab:** raise a PO (`openPoBuilder`, `setPoBuilder`)
  - **Job editor:** view a PO's PDF (`viewPoPdf`)
  - **Jobs money boxes:** month names (`poMonthLabel`)
  - **Add-stock form:** "add an item for this request" (`addingItemForRequisition`)
  - **Escape key and close-all:** `closeRequisition`, `closeRequisitionPicker`

## What stays in App.jsx on purpose

- **Loading and saving requisitions and purchase orders** (`saveRequisitionsToDb`, `savePurchaseOrdersToDb`, the refs, the autosave). They belong with the rest of the loading and saving and are shared by every table. Moving them is a separate job.
- **`activeRequisitionForItem`, `closeOutRequisitionsForItem`, `openUsageModal`.** The stock list calls the first while the page draws, above where the hook runs, which is trap 10 in app-jsx-traps. The other two are stock actions.
- **The Low stock pop-up.** It belongs to Stock.
- **Supplier price helpers** (`supplierPriceChips`, `materialSupplierLines`, `supplierNameOf`). They belong to the Stock Manager move; purchasing borrows them through `deps`.

## How it's done

1. **Check nobody else has App.jsx open.** Run `git status`. If another conversation has uncommitted App.jsx work, wait. The move rewrites big blocks and would collide.
2. **Copy the blocks with a throwaway script, not by hand.** It finds each block by a unique anchor line, not line numbers, and refuses to write unless every removed line is found in a new file.
3. **Build the `deps` list and the hook's return** from the parser's lists above, re-run on the day.
4. **Run the checks.** `node CHECK-undefined-names.cjs` must report 0 problems, then `npm run build`, then `npm test`.
5. **Test on practice (stock-control-TEST), signed in.** After each save, read the database to prove it saved.
   - Open all four tabs and the PO report.
   - Request stock from a stock row's flag, from the picker, and from a cut list.
   - Raise a PO from selected requests and from a supplier group. Raise one from Buy-outs too.
   - View the PO PDF from the PO tab and from the job editor. Copy a PO, then cancel one with a reason.
   - Receive a PO partly with a delivery note number. Check stock went up, the received price was recorded, and stock was allocated to the job.
   - Edit and cancel a request. Check Escape closes the pop-ups.
6. **Commit it as one commit, then push on Heinrich's word only.** After the push, check it's live with a string the move removed.

## How it went (5 Oct 2026)

- **Size.** App.jsx went from 28,687 to 26,070 lines. The new files are `usePurchasing.jsx` (1,426 lines), `PurchasingTabs.jsx` (785) and `PurchasingPopups.jsx` (632).
- **What moved.** 37 pieces of screen state; 77 names in (70 from the component, plus `emptyForm`, `uid`, `stockHasPaidPrice`, `getPdf`, `byText`, `byName` and `formatPoNumber` from the top of App.jsx); 36 names out. The screens read 119 names through `purchasingCtx`.
- **Checks.** The copy script found all 2,581 removed lines in the new files. The names check found 0 problems, the build passed, and all 395 tests passed.
- **Done on practice, each save read back from the database:**
  - A request from the picker, with a supplier and a note. A request from the Stock page's Request button, where the supplier and price filled themselves in.
  - PO-0003 raised from the supplier group, with lines priced and its PDF stored.
  - PO-0004 copied from it with a price typed in (the total updated), then cancelled with a reason.
  - PO-0003 received with a delivery note, one line short (2 of 4). The usage log was written and both requests went to fulfilled. The stock went into the supplier's own rows, which is the 21 Sep rule in `receiving.js`.
  - A PO report generated and listed.
  - A request edited (2 → 5), then cancelled.
  - The Request button on a stock row's detail. The Back button closing the request pop-up.
  - View PO from a job's Buy-outs tab. The Jobs money boxes, which use `poMonthLabel`.
  - Typing in the pop-ups kept the cursor.
- **Not clicked.** Raise PO from a job's buy-out line (the practice job had none), and ordering bars from a cut list. Both call functions that were tested by other routes.
- **The plan was wrong on one point.** It said to check Escape. The app has no Escape key handling and never had; pop-ups close with Back.
- **Noticed but not fixed, by design. Both are in code the move did not touch:**
  - The ON ORDER flag on a stock row is a button inside another button. React warns about this, and clicking the flag opens the row.
  - The Low stock list's jump button lands on "Nothing matches" for an item at 0, because the stock list hides empty items with no open request.

## Not in this move

- **No new behaviour, no fixes and no renames,** even where something looks wrong. Note it down and fix it afterwards in its own commit, so a fault is never a puzzle about which change caused it.
- **Tests for the PO maths** (`poExclusive`, `resolvePoLineUnitPrice`). Worth writing afterwards, once the code sits in its own file.
