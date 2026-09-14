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

Which conversation owns what, so far:

- **Jobs page** — the jobs list, job detail, quotes, invoicing
- **Laser production** — the cutting screen, nesting, shortages
- **Planning** — shifts, the time lockout, and whatever we are designing next
- **Quoting** — the new quoting module

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
- If app code needs a new column, either the SQL is on both databases before the push, or the code must still work without the column. A field in `PO_DB_FIELDS` or the stock field map without its column breaks every save of that table.
- The database caches its table list for about a minute after a paste. A "could not find the table" error straight afterwards is not proof the SQL failed.

## Checking what is live

- `node CHECK-what-is-live.cjs "text"` — pass text that exists only in the new build, each as its own argument (plain text, not a pattern). The build strips comments and renames code, so a comment-only or behaviour-only change has to be checked by reading the deployed code.
- `node CHECK-live-table.cjs table` — whether a table answers on live. A column can be checked the same way without signing in: selecting it answers 200 if it exists, 400 if not.
- `node CHECK-undefined-names.cjs` after every change — a missing name blanks the whole app even though the build passes.
- Run `git log --oneline origin/main..HEAD` as its own step and read the answer before pushing. Never chain the check and the push in one command.

## Loading data (Supabase egress)

- Free plan: 5 GB of downloads a month, billing cycle 25th to 25th. It went over in the cycle ending 25 Sep 2026. Projects are restricted from 14 Oct 2026 if the organisation is still over quota.
- Never add a fetch of a whole table on a timer. Background refreshes ask only for rows with `updated_at` at or after the newest one held, plus a row count to catch deletions (`loadAllData(false, { incremental: true })`, `loadTableRows`, `fetchNotifications({ incremental: true })`).
- Database triggers keep `updated_at` on stock_items, requisitions, purchase_orders, usage_log and job_notifications. A table that joins the incremental refresh needs the same trigger first.
- When refreshed rows are merged into a list that has a `lastSaved…Ref` autosave, move that ref too, or the autosave writes every arrived row back.
- `BACKGROUND_REFRESH_MS` is 5 minutes until the 25 Sep 2026 reset (normally 1 minute). Master lists refresh every 10 minutes. The shift check stays at 1 minute because the lockout warning counts down from it. Refreshing pauses after 10 minutes with nobody touching the screen.

## Decisions already made — do not undo without asking

- A job becomes Complete by itself when its last stage is ticked. It only goes back if a stage on a Complete job is un-ticked. Mark as Invoiced makes it Invoiced. Jobs page pills: Active, To invoice, Completed (meaning invoiced).
- A job can be invoiced without a customer PO number; the invoice request prints "not on the job".
- Invoice notes (`job_invoice_notes`) can be added and read, never edited or deleted.
- Who sees money: the header total stock value — admins only. Prices per item — "Can see Rand values". Purchase Orders totals — "Can see spend totals".
- Every new shortage must say plate or tube laser (`shortages.lane`). It shows only on that laser's nesting screen and turns red after one day outstanding. The tube laser tab should read `shortages.lane`.
- Buy-outs are cost only; the sell price column exists but nothing writes it. A buy-out's supplier must be on the supplier list. No importer ever reads quantity on hand from a file.

## Gotchas in App.jsx (each one passed a clean build)

- A component declared inside `App()` remounts on every render and throws the cursor out of text boxes. Render with a plain function instead.
- `isAdmin || cond && <x/>` shows nothing to admins. Bracket it: `(isAdmin || cond) && <x/>`.
- A helper handed to something declared higher up in the file must be a `function` declaration, not a `const`.
- Counting inside a state updater and reading the count on the next line gives 0.
- The PDF's standard fonts cannot print arrows such as `↳`; the whole line comes out letter-spaced.
