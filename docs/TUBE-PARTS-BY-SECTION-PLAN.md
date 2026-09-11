# Tube parts: say which section each one is cut from

Planned 2026-09-11 by the Laser production conversation, from Heinrich's
ask. **Nothing is built.** Two halves: one on the job's Items tab (the
Jobs conversation), one in the nesting import (Laser production). The
Jobs half has to land first, because the laser half reads what it writes.

## What Heinrich asked for

> When made-on is Tube Laser I can set each part to the required section,
> so later the nesting will automatically pull those parts to the
> selected program/nesting.

In plain terms: a tube job's items are listed on the job with the section
each is cut from. When a nesting report is imported, each section's
programs pick up the job's items that are cut from that section, on their
own. Nobody is asked which line the parts hang under, and no duplicate
lines are created.

## Why it is worth doing

A tube nesting report is one section per program. The job's items are
already on the job. Today those two never meet:

- The import can only create **new child lines** from the file's own part
  list, under **one parent line chosen by hand** for the whole import.
- On a job with several lines that question has no good answer, which is
  why the parts tick now defaults off there (`ImportReportModal`,
  commit 697194e). That is a way round the problem, not a fix.
- A job with two sections gets both sections' parts under one line, even
  though they are cut off different material.

Tagging each item with its section makes the match automatic and the
duplicate lines unnecessary.

## The Jobs half (the Jobs conversation)

**One column.** On `job_quote_items`, which stock line this item is cut
from. Suggested name `cut_from_item_id text`, matching the shape of the
`linked_item_id` already there. Null on everything that exists, which
reads correctly as "not said".

Do **not** reuse `linked_item_id`. That says "this line *is* this stock
item" and feeds the drawing lookup. A tube part is not the section it is
cut from, so it needs its own field.

**One control on the Items tab.** On a line whose `made_on` is
`tube_laser`, a picker for the section it is cut from. Hidden on every
other line, so nothing changes for plate, CNC or bought-out work.

**Use the laser's own picker, please.** `src/laser/StockSectionPicker.jsx`
with options from `stockOptions(items, allocations, jobId, master.sections)`
— the same box the nester uses, already filtered to structural stock and
already narrowable by kind, grade and length. If both screens build their
own list they will drift, and the match below is exactly where that would
show up. It takes `options`, `value` (the stock line's id), `onChange`
(the option, or null) and optional `canRequisition` / `onRequisition`.

**What it stores** is the stock line's id, not its name. The name cannot
tell a 6m line from a 13m one, and the program stores an id too
(`laser_programs.stock_item_id`), so ids on both sides make the match
exact.

Worth having but not essential: setting it on a parent line offers to set
the same on its children, since parts under one line are usually one
section.

## The laser half (Laser production, mine)

Once the column exists, on import, for each section in the report:

1. Find the picked job's lines whose `cut_from_item_id` is the stock line
   chosen for that section.
2. If any are found, they are that program's parts. No new lines, no
   parent question, and the section shows what it matched: "3 lines on
   JOB-0042 are cut from this section".
3. If none are found, today's behaviour stands: the parts tick, and the
   parent picker when it is on.

So a properly tagged job imports with no questions at all, and an
untagged one behaves exactly as it does now.

## What we have to agree before either half starts

- **The column name.** `cut_from_item_id` unless the Jobs conversation
  has a better one. Both halves must use the same.
- **Who writes it.** The Jobs conversation owns `job_quote_items` and the
  Items tab. The laser only reads this column.
- **The picker is shared.** If it needs changing for the Items tab, change
  it in `src/laser/StockSectionPicker.jsx` so both screens move together,
  and tell Laser production.
- **Announce the column to Heinrich** so the SQL runs on practice and then
  live before either half ships. See CLAUDE.md on database changes.

## Open questions for Heinrich, not for us to decide

- **When the job says one section and the file says another**, which
  wins? My suggestion: the file wins for the program's material, because
  that is what was actually nested, and the mismatch is said on screen
  rather than silently ignored.
- **Part-way tagged jobs.** Some lines tagged, some not. My suggestion:
  the tagged ones attach, the rest fall back to the tick, and the import
  says how many of each.
- **The plate laser.** Same idea would work there, thickness and grade
  instead of a section. Not now.
