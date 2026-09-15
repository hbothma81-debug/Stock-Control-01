# Instructions for working with Heinrich

## My background
- I have no coding background at all. I'm a design engineer/draughtsman, not a programmer.
- I'm new to Claude Code, git, terminals, and technical tools generally.
- Explain everything in plain, everyday language — no jargon without a plain-English definition the first time you use a term.

## How to work with me
- Explain technical terms the first time you use them (e.g. "commit," "repo," "deploy," "npm").
- Walk me through steps one at a time, don't assume I know how to do something.
- If you see me doing something in an outdated, risky, or less efficient way, tell me directly and explain why — I'm still learning how you work and want to improve.
- Ask before doing anything irreversible or that goes live to real users.
- For every instruction: reply with a short plan and numbered questions, wait for my answers, then build. If there is a simpler way to get what I asked for, say so first. Push back on ideas that look wrong.
- I always want the proper fix. When the app blocks the floor, plan the real change; a workaround on the floor is a one-line footnote at most, and never "tick a stage done that is not done".
- Never type a password on my behalf. If something needs signing in, I do it myself in the browser pane.

## Working on this app
- This app (Stock Control — East Rand Supplies) is already live and in daily use by staff. Treat it like production — don't break it.
- Before making any change, create a git commit as a save point so we can undo it if something breaks.
- Make one small change at a time, then let me test it, before moving to the next change.
- Flag any security issues clearly and explain the real-world risk in plain language — don't just silently fix them.
- Small, low-risk changes can be merged and pushed live without asking first — but only after you have actually checked them, and you must tell me what you deployed afterwards. "Low-risk" means all of: no application code changed (or the change is trivial and you've tested it), a clean build from a fresh clone passes, and it's straightforward to undo.
- Everything else still needs my confirmation before going live. That includes anything that changes how the app behaves, touches the database structure, alters permissions or logins, or that you're not sure about. If in doubt, ask.
- When you spot a genuine opportunity to split up a very large file (like App.jsx) — normally while we're already working in that part of the app — tell me the possibility exists and what it would involve. We decide together each time. Never start a split on your own, and never do it as one big separate project: split as a by-product of work we're already doing, so the change gets tested by me using the feature anyway.

## Working alongside my other conversations

I run several conversations with you at once, each on a different part of the
app, all sharing this one folder and one branch. You cannot see the others, so
assume at any moment that somebody else is editing a file you have not looked
at for five minutes.

- **Never `git add -A` or `git add .`** Stage only the files you changed
  yourself, by name. Another conversation's half-finished work sitting in this
  folder is not yours to commit.
- **Only the Planning conversation (the main one) pushes.** Every other
  conversation commits its own work, staged by name, says in the commit
  message what still has to be run or tested, and stops. I bring the push
  to the main conversation, which goes through everything queued with me
  first. For every other conversation this overrides the low-risk push rule
  under "Working on this app". (Decided 14 Sep 2026: untested work kept
  going live whenever any conversation pushed.)
- **Before pushing, run `git log --oneline origin/main..HEAD`.** If there is a
  commit you did not make, stop and tell me what it is and what it does. Do not
  push somebody else's work live on my say-so about yours — I may not know it
  is queued.
- **If a file you need has changed under you, say so before writing to it.**
  Re-read it rather than working from what you remember.
- **Database changes get announced.** If you add a column, a table, or change a
  function, tell me in plain words what changed, so I can pass it to the others.
  Two conversations dropping and recreating the same function will undo each
  other silently.
- **Copies of the same rule drift.** If you write something in the app that
  redoes what the database already decides, say so in a comment at the top of
  the file, naming what it mirrors. Then whoever changes one knows to change
  the other.
- **If `App.jsx` holds another conversation's uncommitted work when you are
  ready to commit, stage only your own hunks.** `git diff src/App.jsx` into a
  patch, keep the hunks that carry your names, `git apply --cached` that
  patch, and check `git diff --cached --stat` before committing. Never
  `git add src/App.jsx` whole in that state, and never stash their work.
  Keep git's default context lines in that patch: a `-U0` patch applied with
  `--unidiff-zero` places an insertion by line number, and their uncommitted
  lines above it move it (on 14 Sep a section landed inside the next
  function). Before committing, parse the staged copy itself:
  `git show :src/App.jsx | node_modules/.bin/esbuild --loader=jsx > /dev/null`.
- **If anything is already staged when you start** (`git diff --cached
  --name-only`), it is somebody's commit in progress: wait for it, because
  `git commit` takes the whole index. An undo takes back only what you
  staged (`git reset HEAD -- <your files>`, `git apply --cached -R` your
  patch), never `git restore --staged` on a shared file, which unstages
  their hunks too. Stage, check and commit in one command.
- **Another conversation may push your queued commit** together with its own.
  Say in the commit message what still has to be run or tested, because the
  commit can go live before you have reported it.

Which conversation owns what, so far:

- **Jobs page** — the jobs list, job detail, quotes, invoicing
- **Laser production** — the cutting screen, nesting, shortages, for both lasers: the Laser 4kw tab and the Tube Laser tab, its nesting-report import and Tube Laser Status. (The Tube Laser conversation that built that tab was cleared on 14 Sep 2026; the parts-under-a-line rule is shared with Jobs.)
- **Planning (the main conversation)** — shifts, the time lockout, keeping the app's downloads down, every push, and whatever we are designing next
- **Quoting** — the quoting module and the bill of materials, one plan in `docs/QUOTING-AND-BOM-PLAN.md`; also built the Items tab's part controls (add, edit, import, move)
- **Stock Manager** — the Stock Manager settings: suppliers, sections, materials, fasteners and the other master lists
- **Dropdowns and the Production tab** — the shared `TypeToFind` box, keeping lists alphabetical, the Production tab's ready and waiting pills, and Info Request (`src/lib/infoRequests.js`)

`src/App.jsx` is the one file all of you have to touch, because it wires
everything together. That is the collision point. When your work naturally
takes you into a page's chunk of it, offer to lift that page out into its own
file — but only that page, only as part of work I am already testing, and only
after asking me.

## Database changes (SQL)

- Every SQL change is a `setup-*.sql` file in the repo, proven on a real Postgres (`@electric-sql/pglite`) before I paste it, and safe to run twice.
- I paste SQL into the Supabase SQL editor myself: practice (stock-control-TEST) first, then live. Give me the SQL itself in a code block — never a terminal command like `cat file.sql`, which the editor tries to run as SQL.
- Keep a paste under about 40 lines and name dollar quotes (`$body$`, `$do$`) rather than bare `$$`. If the editor offers to change the query ("Potential issues detected"), run it unchanged.
- Register every new setup file in `build-test-database.sh` and `CHECK-which-setup-files-are-run.sql`, then run `build-test-database.sh` to regenerate `setup-ALL.sql`.
- `make-policies-idempotent.cjs`, the last step of `build-test-database.sh`, treats any `do $tag$ … end $tag$;` block as already guarded. Until 14 Sep it knew only bare `$$` and wrapped policies inside named blocks a second time, which broke `setup-ALL.sql`. After regenerating, `git diff setup-ALL.sql` should hold only the new file. From Git Bash, pipe nothing into `head`: it can stop the script before that step.
- If app code needs a new column, either the SQL is on both databases before the push, or the code must still work without the column. A field in `PO_DB_FIELDS` or the stock field map without its column breaks every save of that table.
- The database caches its table list for about a minute after a paste. A "could not find the table" error straight afterwards is not proof the SQL failed.
- A table set up with read, add and delete rules and no update rule silently refuses every update: no error, zero rows changed, the screen looks frozen. Before the app's first update to any table, check `pg_policies` for an UPDATE rule (job_documents lacked one until `setup-job-documents-move.sql`). Ask for the changed row back with `.select()` and say so when none comes.
- A read-only `CHECK-*.sql` returns one table (`union all` with a label column): the Supabase editor shows only the last result of several. To prove one on pglite, load the files listed in `build-test-database.sh` and then the laser files it leaves out (`setup-laser-programs.sql`, `setup-program-repeats.sql`, `setup-laser-status.sql`, `setup-made-on-tag.sql`).

## Checking what is live

- `node CHECK-what-is-live.cjs "text"` — pass text that exists only in the new build, each as its own argument (plain text, not a pattern). The build strips comments and renames code, so a comment-only or behaviour-only change has to be checked by reading the deployed code. It matches capitals exactly: text a PDF prints in capitals is written in capitals in the code ("DRAW FROM STORES"). A style-only change is found by its style's name (`reqActionBtnAlertOn`): the keys of `S` survive the build.
- `node CHECK-live-table.cjs table` — whether a table answers on live. A column can be checked the same way without signing in: selecting it answers 200 if it exists, 400 if not.
- `node CHECK-undefined-names.cjs` after every change — a missing name blanks the whole app even though the build passes.
- Run `git log --oneline origin/main..HEAD` as its own step and read the answer before pushing. Never chain the check and the push in one command.
- `npm test` runs Node's own test runner over `src/**/*.test.js`: the shift-window and cutting-time sums, the nesting-report parser, the job sheet's stock grouping and more. No database, a second to run.
- `CHECK-job-stuck-on-packing.sql` (change the job number on its third line) shows a stuck job's stages, each line with whether the packing stage counts it and how many are packed, and its laser programs. A job with every part packed can still be held by one program never ticked cut: the Laser stage closes only when Nesting is ticked and every program is cut, and every stage after it waits.

## Loading data (Supabase egress)

- Free plan: 5 GB of downloads a month, billing cycle 25th to 25th. It went over in the cycle ending 25 Sep 2026. Projects are restricted from 14 Oct 2026 if the organisation is still over quota.
- Never add a fetch of a whole table on a timer. Background refreshes ask only for rows with `updated_at` at or after the newest one held, plus a row count to catch deletions (`loadAllData(false, { incremental: true })`, `loadTableRows`, `fetchNotifications({ incremental: true })`).
- Database triggers keep `updated_at` on stock_items, requisitions, purchase_orders, usage_log, job_notifications and job_info_requests. A table that joins the incremental refresh needs the same trigger first.
- When refreshed rows are merged into a list that has a `lastSaved…Ref` autosave, move that ref too, or the autosave writes every arrived row back.
- `BACKGROUND_REFRESH_MS` is 5 minutes until the 25 Sep 2026 reset (normally 1 minute). Master lists refresh every 10 minutes. The shift check stays at 1 minute because the lockout warning counts down from it. Refreshing pauses after 10 minutes with nobody touching the screen.

## Decisions already made — do not undo without asking

- A job becomes Complete by itself when its last stage is ticked. It only goes back if a stage on a Complete job is un-ticked. Mark as Invoiced makes it Invoiced. Jobs page pills: Active, To invoice, Completed (meaning invoiced).
- A job can be invoiced without a customer PO number; the invoice request prints "not on the job".
- Invoice notes (`job_invoice_notes`) can be added and read, never edited or deleted.
- Who sees money: the header total stock value — admins only. Prices per item — "Can see Rand values". Purchase Orders totals — "Can see spend totals".
- Every new shortage must say plate or tube laser (`shortages.lane`). It shows only on that laser's nesting screen and turns red after one day outstanding. The tube laser tab should read `shortages.lane`.
- The shortage flag form's "What happened?" box (`shortages.reason_note`) is required, beside the four fixed reasons; Flag Shortage stays off until it is filled. One form (`openShortageFlagModal`, one insert in `submitNewShortage`) sits behind every Flag shortage button.
- Mark urgent, Flag shortage and Info Request are amber (`S.reqActionBtnAlert`; `S.reqActionBtnAlertOn`, solid, for Unmark urgent) on the Production card, the nesting screen and Laser Status. Never green: green (`accentFinished`) means done in this app.
- Every PDF opened in the app is drawn by `src/PdfViewer.jsx` with PDF.js 4.10.38 (legacy build, pinned, no `^`), not shown in a frame. Open / Print and Download PDF show for admins and "Can print and download PDFs" (`profiles.can_print_pdfs`) only; delivery notes (`openToEveryone`) and a document made but not filed keep them for everyone; drawings follow the same tick. A browser older than 4.10.38 supports (Chrome 103, Safari 16.4; `src/lib/pdfSupport.js`, tested) gets the old frame. Do not upgrade PDF.js without trying the Huawei MatePad at Bending: Huawei's own browser on a Chrome 114 engine, no Chrome to install, and PDF.js 6 (Chrome 125+) drew it blank. PDF.js 4.x needs top-level await, allowed in `vite.config.js`.
- The Invoicing stage's Production card has "Request invoice" instead of a tick (`requestInvoiceFromProduction`, `isInvoicingStage`): the same request as the job page's "Invoice Now (all remaining)", then the stage ticks itself; with nothing left to request it just ticks and says so. `remainingToInvoice` is the one rule for "everything left" behind both. It never opens Mark as Invoiced. Records → Invoice Requests is the shut "All requests" pill on Records → Invoicing; the "Invoice Requests" view tick (in `EXTRA_SECTIONS`, not `NAV_TABS`, or it comes back as a button) opens Invoicing showing only that pill.
- The Production tab shows every person, admins included, only the stages ticked for them under User Management. Whoever should work a stage, Invoicing included, needs it ticked there.
- Buy-outs are cost only; the sell price column exists but nothing writes it. A buy-out's supplier must be on the supplier list. No importer ever reads quantity on hand from a file.
- Picking a tube section, in the nesting import or the New program form, says which stock line it is and never sets stock aside. Stock is reserved only on the job's Materials tab. The program keeps `stock_item_id`, and a change in its cut count moves that many lengths off or back onto the shelf.
- A stage that counts per item closes itself only at the moment a quantity is logged, so a job whose lines changed afterwards can reach full and never close. Admins always get a "Close this stage" button for it, on the packing screen and the Production card; nobody else does.
- Every job line carries a "made on" tag (`job_quote_items.made_on`: laser, tube_laser, cnc, cut_to_size, assembly, blank). Each stage says which tag it cuts (`process_type_settings.cuts_made_on`, set under Job Process Types). A cutting stage lists only its own machine's lines plus untagged ones, never an assembly, and never finishes itself when it has nothing to cut — it warns and keeps a single tick. The tag is remembered on the stock part (`stock_items.made_on`) and comes back on the next job; the catalogue "replace" import keeps a part's row and id so tags and job links survive it. Helpers: `cutsMadeOn`, `stageTakesItem`, `itemsForStage`, `stageHasNothingToCut`.
- The plate laser and the tube laser are separate lanes on the Production tab (`inOtherLaserLane`): neither waits for the other; everything after them waits for both. Tube parts are packed by the tube operator under the Tube Laser stage; Laser Status is the plate packer's screen and says "laser parts packed".
- A file uploaded onto a job is filed against a stage or the whole job (`job_documents.process_name`) and shows only on that stage's Production card. Every stage's card has its own documents block; the Files tab groups files by stage as pills with Upload on each and "Move to…" on each file.
- The Production tab carries the Jobs page's search, customer and sales rep filters; one matcher (`productionJobMatches`) drives the pill counts, the department lists, the nesting shortage block and Laser Status.
- Both lasers run one set of code (`src/laser`, `useLaserPrograms`). Anything that differs between them lives in `LASER_MACHINES` in `src/constants.js` — never an if-tube inside a screen. The hook is called once per laser and reads only its own machine's programs and its own lane's shortages.
- A tube program is one section, several jobs, numbered by the database (five digits, no prefix); the nester types that number when exporting the cut file. Programs come from the tube software's spreadsheet through Import nesting report; typing one by hand is the exception.
- Three stage settings — `hide_from_production`, `releases_on_start`, `worked_in_laser_status` — have no tick box in the app. They are set by SQL only (`setup-hide-from-production.sql`, `setup-laser-status.sql`, `setup-tube-laser-stages.sql`). The tube stages are shown on Production again (`UNDO-tube-laser-stages-hide.sql`) until the jobs started the old way are through.
- Job lines can be parent and child. Money sees parents only; a stage with a machine sees the children; see `docs/JOB-PARTS-WARNINGS.md` before touching anything that lists job lines.
- Every picker over a list of names (customers, suppliers, materials, sections, people, jobs, shifts, departments) is the shared `src/TypeToFind.jsx` box, never a `<select>`. Options are strings or `{ value, label, hint }`; `allowNew` on form fields only, never on filters. Plain `<select>` stays for a fixed handful of choices (status, theme, batch/each, direction, shortage reason, made-on) and the numeric size filters.
- Master lists and the people list are held alphabetical in memory (`sortMaster`, and the `setMaster` / `setPeople` wrappers), case ignored, numbers read as numbers. Job Process Types and Laser Thicknesses keep their stored order; both have reorder controls in the Manager. Nothing may assume "the last entry is the newest".
- Production tab: each department shows a "Ready now" pill (open) and a "Waiting on earlier stages" pill (shut). `blockingStages(process, jobProcesses)` is the one rule for whether a stage may start and what it waits for; `isProcessActionable` sits on it. A per-item stage with pieces already let through counts as ready ("Partly ready: x of y"). The overview card number is the ready count. A stage with an open Info Request sits in a red "Standing — waiting on office" pill above both (`Section` with `danger`), counted in neither; the overview card adds "n standing".
- On the New stock item form for Customer Stock, the Part number and Description boxes both search the same known parts (stock for that customer, then drawings) and fill each other in.
- Supplier logos are gone from the app and the Purchase Order PDF. The `master_suppliers.logo` column is left in place and nothing reads it.
- Structural stock picks its section type, section and material from Stock Manager's lists (`LibraryField` with `pickOnly`); the add-stock form never adds to them. Anyone who can open Stock Manager adds new ones there.
- Section names are shop shorthand with no "mm" (SHS 50x50x3, CHS 38.1x2), to be written by the app from fixed boxes per section type, and every existing name is to be converted. One material per real material: MS and Mild Steel are one row. Only the pick-only stock form is built so far.
- Parts merge back into their line at the first stage left on Every item, usually Welding. There is no hinge tick: it was proposed and turned down, because a practice job's invented stage order had misled the analysis. Never set a machine on that stage: a stage with a machine stops listing the job's own lines. A line that has parts is never asked for a cut method (`wantsCutMethod`).
- Work done by an outside supplier as the first cut is a cut method, not an extra stage: `laser_external` and `machining_external` (decided 15 Sep for JOB-0068; SQL `setup-made-on-external.sql`, built by the Jobs page conversation). Their stages, Laser - External and Machining - External, are set to "Cuts:" them. Left on every item, such a stage takes every line and holds each one at 0 on every per-item stage after it, in-house work included. One of the packers logs external laser parts back on Laser - External's card.
- Ticking Nesting or Laser on a job ticks its packing stage too, found by `worked_in_laser_status`, not by name (`stagesImpliedBy`). Unticking the laser leaves packing on. The tube laser needs nothing: its cutting stage is its packing stage.
- On both lasers a job reaches the packing screen on its first sheet or length cut, not when a whole program is finished (`laserStatusRows`).
- A SigmaNest quote is always one set, by standing instruction to sales, so its quantities are per set.
- A job line's stock code is its identity (`job_quote_items.stock_code`), not its description. Matching goes code first, description only when exactly one part carries it (`findCustomerStockMatch`); a typed code not in Customer Stock stays on the line, unlinked. Never read a code back out of a description.
- New Job asks only customer, description and due date, then opens the job. Stages, lines, cut list, materials and buy-outs are all set on the job itself.
- A tube job line says what it is cut from in `job_quote_items.material_type`, in the words `materialText` (`src/laser/stockOptions.js`) makes, e.g. "SHS 50x50x3mm 304". The tube import is to match on those exact words, so any rename of a section or material must rewrite this column in the same pass.
- The printed job sheet lists the job's reservations as "Stock from stores": Reserved, Taken, Outstanding and an empty Pulled box, grouped as the Materials tab groups them (no stage yet, stages in flow order, a stage since removed). Handed-back ones are left off. Drawn by `src/jobs/stockFromStores.js`, which mirrors `Materials.jsx`. The stock item's shelf location (`loc`) is left off by decision, for now.
- Info Request (`job_info_requests`; rules and database calls in `src/lib/infoRequests.js`, tested): the floor flags from a stage's Production card that the job is standing until the office answers. A warning only: it never feeds `blockingStages`, and the stage can still be ticked. Raising one tells the job's sales rep, matched by name (or email) to a profile; no rep, or a rep not on the app, tells every admin. A red banner under the header on every screen shows a rep their own open requests and an admin every one; it cannot be dismissed. It closes by the office's Answer (attached files are filed on that stage's card) or the operator's "Got it / sorted", whichever comes first; neither overwrites the other. Never deleted: a closed one stays on its card for 3 days, the job page lists them all, and the printed Job History adds up how long the job stood. No colour change with age. Loads open ones and those closed in 3 days, then only rows changed since.

## Gotchas in App.jsx (each one passed a clean build)

- A component declared inside `App()` remounts on every render and throws the cursor out of text boxes. Render with a plain function instead.
- `isAdmin || cond && <x/>` shows nothing to admins. Bracket it: `(isAdmin || cond) && <x/>`.
- A helper handed to something declared higher up in the file must be a `function` declaration, not a `const`.
- Counting inside a state updater and reading the count on the next line gives 0.
- The PDF's standard fonts cannot print arrows such as `↳`; the whole line comes out letter-spaced.
- `stageIsCleared` is the one test for "this stage no longer holds the next one back", shared by `blockingStages` and `itemFlowLimit`. They used to disagree. Never write the condition out a second time.
- The packing screen passes no `limitFor` on purpose. Capping the packer by `itemFlowLimit` would zero his counts for jobs whose sheets are still being cut, which the first-sheet rule exists to give him. Change the two together or not at all.
- Two `setForm({ ...form, x })` calls in one handler keep only the last: both spread the same stale `form`. Use `setForm((f) => ...)`, or queue the second change through an effect as `LibraryField` does.
- A suggestion list positioned inside its parent is cut off by any scrolling pop-up around it (`S.modal` scrolls). `TypeToFind` pins its list to the viewport for this reason; do not hand-roll another one.
- Tapping a suggestion fires mousedown, then the input blurs. The blur handler must not act on the typed text again, or the tap is overwritten.
- Mixing `padding` from `S.input` with a `paddingRight` override makes React drop one of them with a console warning. Override the whole `padding`.
- A PDF table with no `styles` prints at 10pt, bigger than the sheet's body text. Take every size from one scale at the top of the function, as `printJobSheet` does.
- A script that patches App.jsx must demand exactly one match per edit and refuse to write otherwise. A shorter indent is a substring of a longer one, so a loose pattern edits the wrong place.
- `consumeProgramStock` (a tube cut moving stock) repeats `useAllocation`'s steps: the shelf, the reservation, the usage log. Change one, change the other.
- When a form's fields move to another screen, move its checks with them. New Job kept "select at least one process" after the stage ticks left it, and blocked every new job on live.

## Checking a screen without signing in

- `http://localhost:5173/ui-preview.html` on the dev server shows the shared pieces (`Section`, `RecordRow`, `TypeToFind`) with made-up data and no login. Add a demo there when a shared piece changes.
- The preview tool will not start a second dev server in this folder while another conversation's is running, on any port. Navigate the Browser pane to that server instead: it serves this folder's files, yours included.
- The Browser pane's clicks and key presses can stop reaching the page while the pane is hidden; typing still arrives. A script-dispatched `mousedown` on a suggestion, or `.focus()` on a box, exercises the same handlers. Its `type` action does not replace selected text the way a keyboard does.
- A hidden Browser pane barely draws: every PDF.js version renders a blank page there, and on 14 Sep that passed for "PDF.js 4 is broken" for an hour. Check `document.visibilityState` before trusting a blank.
- A value set on a number box by script (native setter plus an `input` event) did not reach React on the shortage form; clicking the box and using the pane's `type` did.
- To read a PDF the app opens in a new tab, replace `window.open` in the page with one that records the address and returns `{}` (a falsy return makes it save a file instead), then read the text with `pdfjs-dist`'s `getTextContent`. Reload afterwards.
- A PDF is checked by looking at it. Draw it with `jspdf` from a node script (keep a new PDF piece in its own module so the script draws the real code), turn page 1 into a PNG in the scratchpad with `pdfjs-dist` and `@napi-rs/canvas`, and read the PNG. The Read tool cannot open a PDF here (no `pdftoppm`), and the Browser pane cannot screenshot a local file.
