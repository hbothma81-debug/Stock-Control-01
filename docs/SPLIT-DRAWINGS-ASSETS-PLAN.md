# Moving Drawings and Assets out of App.jsx: plan

Written 7 Oct 2026. Nothing built yet. This is the second department move, after Purchasing (`docs/SPLIT-PURCHASING-PLAN.md`, live 7 Oct). Same rule as before: **a move, not a change.** The app should look and behave exactly the same afterwards.

## Why these two next

All figures below were measured with the parser on 7 Oct, App.jsx at 26,069 lines.

| Candidate | Lines | Names it reads from App | Names App reads back | Verdict |
|---|---|---|---|---|
| **Drawings** | ~545 | 31 | 7 | Next: clean, small |
| **Assets** | ~830 | 61 | 8 | Next: clean, mid-size |
| Invoicing and delivery notes | ~2,400 | 73+ | many | Later, with Jobs |
| Stock | ~5,000 | everything | everything | Later: it's the core |

- **Invoicing and delivery notes look like one area, but aren't yet.** The code sits in four places (around lines 7780, 9410–10700, 11200 and 12480). The job editor and the Production tab call it all the time. It is also money: the send-once lock and requests to accounts. It should move with Jobs or just before it, once that part is understood.
- **Stock is the biggest prize but the most tangled.** Every other area reads stock items. It goes after the smaller areas have thinned the file out.

**One session, two separate commits:** Drawings first, tested, committed; then Assets, tested, committed. If something breaks later, we know which move caused it, and either can be undone alone.

## Drawings

| What | Where in App.jsx today | Lines |
|---|---|---|
| Drawing lookup, signed links, revisions, upload, records | 3614–3784 | ~170 |
| Delete, delete-for-customer, preview, the upload pop-up's functions | 11626–11775 | ~150 |
| Drawings tab | 18436–18565 | ~130 |
| Drawing upload pop-up | 23045–23138 | ~95 |

- **New files:** `src/drawings/useDrawings.jsx` and `src/drawings/DrawingsScreens.jsx` (the tab and the upload pop-up). Two files, not three, because the screens are small.
- **The rest of the app uses 7 drawing functions**, for example opening a drawing by part number from a job or from Production. Those come back out of the hook.

## Assets

| What | Where in App.jsx today | Lines |
|---|---|---|
| Asset history, repair list, Service now | 3785–4078 | ~295 |
| Service status, open/close history, notes, readings, attachments | 11511–11625 | ~115 |
| Remove an asset | 13756–13783 | ~30 |
| Pop-ups: Remove asset, Asset history, Service now, Repair list | 22180–22574 | ~395 |

- **New files:** `src/assets/useAssets.jsx` and `src/assets/AssetPopups.jsx`.
- **What stays in App.jsx for now:** the asset rows in the stock list, and the manufacturer and asset-detail views. They are part of the stock list's own drawing code, so they move with Stock.
- **The rest of the app uses 8 asset functions,** for example opening Service now from a stock row and the Back-button close-all. Those come back out of the hook.

## The one difference from Purchasing

Both areas' code is split between two or three places. Each piece also reads two values declared further down the file: `isAdmin` (line 12342) and `canEditQty` (12388).

- So each hook runs **just below the permissions block** (around line 12500), not where its code sits now. That avoids the blank-app trap: something used before it has been set up. It is trap 10 in the app-jsx-traps notes.
- The script checks that nothing above that point uses an area's functions while the page is drawing. Uses inside button handlers are fine. It refuses to write if any are found.
- **One to check by hand:** `getServiceStatus` drives the overdue marks on asset rows. If the page header or a count works it out while drawing above line 12500, it has to stay in App.jsx.

## A missed rule from the Purchasing move, put right here

`CLAUDE.md` says a page lifted out of App.jsx gets its own crash net (`ErrorBoundary`) as part of that work, so a fault in it shows a small red box instead of taking the whole page. The Purchasing move did not add one.

This move adds nets to:
- the Drawings tab and the drawing upload pop-up
- each of the four asset pop-ups
- the four purchasing tabs and the six purchasing pop-ups, in their own small commit

A net changes nothing unless something crashes.

## How it's done

This is the Purchasing method, reused:

1. `git status` must show no one else's work in App.jsx.
2. **The copy script:**
   - finds each block by an anchor line
   - copies it word for word
   - works out what goes in and out of the hook
   - refuses on a blank-app risk or a missing line, and proves every removed line is in a new file
3. **The checks:** names check, build, tests.
4. **Test on practice, reading each save back from the database.**
   - **Drawings:**
     - open the tab
     - search
     - upload a drawing, with a revision
     - preview it
     - open it from a job by part number
     - delete one
   - **Assets:**
     - open an asset's history
     - add a note
     - add a reading
     - attach a file
     - record a service with a Stores part (check the Stores stock goes down)
     - open the repair list, add an item and resolve it
     - remove an asset with a reason
     - the overdue marks still show
     - Back closes each pop-up
5. **One commit per area.** Push on Heinrich's word only, then check it's live by comparing the live App file with the local build.

## Not in this move

- No fixes, no renames and no tidying.
- The two problems noted in the Purchasing run stay as they are until they get their own small fix: the ON ORDER flag as a button inside a button, and the Low stock jump to an empty item.

## How it went (7 Oct 2026)

- **Drawings: commit e680916.** App.jsx 26,069 -> 25,548. Tried on practice: upload, a second revision (rev 1 went to superseded), search, preview, delete both revisions (rows and files gone). Not clicked: opening a drawing by part number from a job.
- **Assets: commit 22be579.** App.jsx 25,548 -> 24,773. Tried on practice with a test asset and Stores part, both removed afterwards: the overdue mark, a reading, a note with a file (opened, then deleted), Service now with a Stores part (5 -> 4, a usage-log line, a history entry), a repair item added and fixed, Back closing the repair list, removing the asset.
- **The purchasing crash nets: NOT done.** The requisitions conversation was editing App.jsx and every purchasing file while this ran (a request basket, a job on each requisition). The script `nets-purchasing` stopped before writing. Do it once that work is committed: four tab nets in App.jsx (with `key`), six pop-up nets inside their conditions in PurchasingPopups.jsx.
- **Found, not changed (they were so before the move):**
  - Deleting a drawing's current revision leaves the older one "superseded", with no current revision.
  - The asset history window is not on the Back button's list (`anyModalOpen` / `closeAllModals`).
  - **An asset's removal reason, date and who are never saved to the database**: `removedReason`, `removedDate` and `removedBy` are not in `ITEM_DB_FIELDS`, so they vanish on the next load.
