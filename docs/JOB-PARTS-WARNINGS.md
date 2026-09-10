# Parts under a job line — how it works, and what bites

Written 10 September 2026, and kept up as this changes.

A job line can have **parts** under it. The line is the thing sold and
invoiced; the parts are the pieces cut to make it. On screen the parts
sit indented under their line on the Items tab.

Everything below has cost somebody time or nearly did. Read the
warnings before changing a stage setting or a cut method in bulk.

---

## 1. The one rule that explains most of the rest

**Money is counted on lines. Work is counted on parts.**

- Invoicing, delivery notes, the job's outstanding count and the total
  on the Jobs list all see lines only, never parts. In the code that is
  `billableLines`.
- A stage that has a machine set lists the parts for that machine. A
  stage left on **Every item** lists the job's own lines.

So the parts stop being parts, and the line takes over, at the first
stage left on Every item. That is usually Welding. Nothing needs
setting to make that happen.

## 2. Warnings

**A part with no cut method is listed by no stage at all.**
A part only reaches a stage whose machine matches it. Blank matches
nothing. Set the cut method on every part, or it will not appear
anywhere on the floor. The imports set it for you; a part typed by
hand does not.

**Never set a machine on the stage where parts come together.**
Setting Welding to "Cuts: Welding" makes Welding stop listing the
job's own lines and list only welding-tagged parts instead. That is
the opposite of what that stage is for. Leave it on Every item.

**A machine-tagged stage after that point goes back to listing parts.**
If a stage that carries a machine sits after the stage where parts
merge, the parts appear again on it. Check the order of your stages if
parts show up somewhere they should not.

**Removing a line removes its parts.**
The database takes them with it. The confirmation box says how many,
so read it.

**A part carries no price.**
Moving a line under another does not clear its price, so moving it back
out restores it. But while it is a part, its price is never counted.

**Practice stage lists are not real flows.**
The stage lists on the practice jobs are invented test data. Do not
work out what the shop does by looking at them. Get a real job.

## 3. What each thing on the Items tab does

| Control | What it does |
|---|---|
| **Add part** | One part by hand: quantity, part typed to find against that customer's stock codes, length in millimetres, cut method. |
| **SigmaNest parts** | Reads a SigmaNest quote PDF. Its lines come in as **Laser** parts, named as the quote names them, linked to a stock code where one matches so the drawing comes with them. |
| **Tube nest parts** | Reads the tube software's spreadsheet export. Its parts come in as **Tube laser** parts with their lengths. Only the Part Info sheet is read: programs are made on the Tube Laser tab, not here. |
| **Move under** | Makes this line a part of another line. Offered only on a line that has no parts of its own. |
| **Arrow on a part** | Takes the part back out and makes it a line of its own again. |

Both imports ask before writing, and both update a part of the same
name rather than adding it twice. Importing also fills in the cut
method on a part that was already there and had none, without undoing
anything set by hand.

## 4. What the app refuses, and why

- **A line with parts cannot be moved under another line.** Parts do
  not hold parts.
- **An invoiced line cannot become a part.** The money would disappear
  off the invoicing screen.
- **A line with a delivery note cannot become a part.** The note points
  at a line.
- **A part's quantity cannot be edited from a nesting report import
  and then re-imported away.** A re-import updates quantity and length
  from the file. Correct it in the file, not on the job.

## 5. The database behind it

Two setup files must both have been run, or the parts row fails on a
missing column:

| File | What it adds |
|---|---|
| `setup-quoting-and-bom.sql` | `job_quote_items.parent_quote_item_id`, the link from a part to its line |
| `setup-tube-laser-parts.sql` | `job_quote_items.length_mm`, the part's cut length |
| `setup-made-on-welding.sql` | Welding as a cut method. Until this is run, choosing Welding is refused and the app says which file to run. |

The rule itself is in `src/App.jsx`: `isChildLine`, `hasChildLines`,
`childLinesOf`, `billableLines`, `stageTakesItem`, `itemFlowLimit`.
Any new screen that lists a job's lines has to decide whether it wants
lines, parts or both, and use those helpers rather than the raw list.

## 6. Deliberately not built

**An explicit hinge tick on a stage.** The column exists
(`process_type_settings.puts_fabrications_together`) but nothing reads
it. It was proposed on 10 September 2026 and turned down: the merge
already happens at the first stage on Every item, and the case for the
tick came from a practice job's invented stage order. If a real job
ever shows parts reappearing after they should have merged, this is
the thing to build.
