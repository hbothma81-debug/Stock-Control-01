# Handover

Newest entry at the bottom. Each entry is the state of play when a
session ended: what is done, what is half-done, what to pick up next.

---

## 14 Sep 2026 — Planning conversation

### Done and live

- **Supabase downloads (egress) cut.** Background refreshes ask only for
  what changed (stock, requisitions, purchase orders, usage log,
  notifications), pause after 10 minutes with nobody at the screen, and
  run every 5 minutes. The `updated_at` trigger SQL is on practice and
  live for all five tables. Measured on live: a stock refresh went from
  1,653 KB to 887 bytes. Commits 20405e9 and 1c6c149.
- **Shortages know their laser.** Plate or tube is chosen when flagging.
  Each shortage shows only on its own laser's nesting screen, with who
  flagged it and how long ago, turning red after a day.
  `setup-shortage-lane.sql` is on both databases.
- **Invoicing.** The request shows the customer PO, sales rep, SigmaNest
  number, description and delivery notes. Records → Invoicing cards show
  the submitted and invoiced dates, with an add-only notes thread. A job
  becomes Complete when its last stage is ticked. The Jobs page has
  Active, To invoice and Completed pills.
- **Buy-outs.** Import / Export on Buy-out Codes; the stock tab groups
  buy-outs by supplier.
- **Money visibility.** The header stock value is admins only. A new
  permission, "Can see spend totals", gates the Purchase Orders totals.
- **Checks.** `CHECK-live-table.cjs`, `CHECK-what-the-app-downloads.sql`,
  and a setup check that knows every new SQL file.

### Half-done or waiting on Heinrich

- **Egress.** Watch Usage → Egress. Weekdays should be about 100 MB or
  less, weekends near zero. Restriction from 14 Oct 2026 if the
  organisation is still over quota.
- **`BACKGROUND_REFRESH_MS` is 5 minutes temporarily.** Decide after the
  25 Sep reset whether to put it back to 1 minute (60000). A reminder for
  26 Sep was offered and not yet answered.
- **Tube line material.** The box is live but `setup-job-line-material-type.sql`
  (adds `job_quote_items.material_type`) has not been run on either
  database. Until it runs, the box explains that it cannot save yet. This
  is the Jobs / Laser conversations' feature.
- **Old shortage on live** flagged before lanes existed: it has catch-up
  stages for both lasers. Delete the wrong-lane nesting stage on that
  job by hand.
- **Permission ticks to set in User Management:** "Can see spend totals"
  for non-admins who should see the PO totals; "Can manage invoicing"
  for accounts.

### Not started, by decision

- Shift lockout stage four (the database enforcing it). Waiting for a
  week of real use with the lockout switched on.
- `src/lib/shiftWindow.js` does not know about holidays; the database
  rule does.
- The multi-month PO report has only been run against one month of
  practice data.
- Forgotten-password handling. Parked by Heinrich.

### Pick up next

1. Look at the egress chart with Heinrich; decide on the 1-minute
   refresh after 25 Sep.
2. Get `setup-job-line-material-type.sql` run on practice and live.
3. If egress is still high: take master lists off the timer entirely
   and fetch them only when they change.
