# Production tab: ready work first

Planned 2026-09-09. Not built. Owner to be agreed (the Production tab sits in
App.jsx among the Jobs page code).

## What Heinrich asked for

Under the Production tab, inside each process, the stages that are ready to
be worked should sit at the top, so nobody scrolls through a long list to
find what is next.

## What the code does today

The data already knows the answer. When the queue loads, every outstanding
stage is marked ready or waiting by `isProcessActionable` (ready = every
earlier stage in the factory flow is complete, or has been started when that
stage releases on start), and each department's list is sorted urgent first,
then priority shortages, then ready before waiting, then earliest due date.

Then the department screen sorts the same list again, by ownership: yours,
then unassigned, then other people's. That second sort keeps the first order
only inside each ownership band. So a person sees their own waiting jobs
above everyone's ready ones, and other people's ready work sits at the very
bottom under all the waiting work. That is the scrolling.

Two more things worth knowing:

- The department list deliberately shows every outstanding stage, not only
  the ready ones, so a department can see its upcoming workload. Hiding the
  waiting work outright would remove that on purpose. (Comment at the top of
  `fetchProductionQueue`.)
- The number on each department card on the overview is the count of
  everything outstanding, though the variable is called `readyCount`. It does
  not tell anyone how much is actually workable.
- Readiness is per stage. A stage tracked per item ("Each") may have some
  items that could move on while the stage as a whole still reads Waiting,
  because `itemFlowLimit` lets pieces through one at a time. Those stages
  would land in the waiting group unless we account for them.

## Design

Follow the pills-and-rows pattern the app already uses (the `Section`
component: a pill heading with a count that opens and shuts).

### Department screen

Three blocks, in this order:

1. **Shortages needing attention** — unchanged, stays on top for nesting.
2. **Ready now (n)** — open by default. Order inside: urgent, then priority
   shortage re-cuts, then yours, then unassigned, then other people's, then
   earliest due date. Ownership still matters, but only among work that can
   actually start.
3. **Waiting on earlier stages (n)** — shut by default. Same order inside.
   Each row also says what it is waiting for, for example "Waiting: Bending",
   taken from the first incomplete earlier stage. That answers the next
   question without opening the job.

Search and the customer and sales rep filters narrow both groups, and the
counts on the pills follow the filter.

### Overview cards

The count on each department card becomes the ready count, with the waiting
count beside it in muted text: "3 ready · 12 waiting". A department with
nothing ready but work on the way stays on the overview, muted, rather than
disappearing. Today it would show a misleading 12.

### Partly ready stages (decision needed)

For a stage tracked per item where some pieces can move on, either:

- (a) treat it as ready when at least one item can go through, and label the
  row "Partly ready: 5 of 20", or
- (b) leave it in waiting.

Recommendation: (a). The point of per-item tracking was that big jobs walk
through piece by piece, so a stage with pieces available is real work.

## What it takes

One file, `src/App.jsx`, in two places: the department screen (the block
starting at `const procType = productionSelectedDept`) and the overview
cards (the `visibleDepts` block). About 60 to 80 lines changed. No database
change. No new permission.

Steps, each small enough to test on its own:

1. Split the department list into the two pills and drop the ownership
   re-sort in favour of the order above. Test: open a department with mixed
   work, ready sits on top, waiting is shut.
2. Add "Waiting: <stage>" to waiting rows. Test: matches what the job shows.
3. Change the overview card counts. Test: numbers agree with the pills.
4. Partly ready, if (a) is chosen. Test: a per-item job with some pieces
   nested shows in Ready with the "x of y" label at the laser.

Roughly one working session for steps 1 to 3, plus a short one for step 4.

## Risks and coordination

- App.jsx is the shared file. At the time of writing another conversation has
  uncommitted edits in it (invoice notes). Start only from a clean tree, and
  stage App.jsx hunks by name.
- Removing the ownership sort changes what a person sees first. Their own
  ready work still comes before unassigned ready work, so nobody loses their
  place, but say so when it goes live.
- The "waiting on" label leans on `isProcessActionable`'s rules (other laser
  lane, releases-on-start). Reuse that function rather than copy its logic,
  or the two will drift.
