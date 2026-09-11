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

**The counter above the items does not count parts.**
It counts the job's own lines only. So a part left with no cut method
is not nagged about and Guess the rest cannot be reached to fix it,
because the button only appears when a line is untagged. Check the
parts by eye after adding any by hand.

**Leave the cut method blank on a line that has parts.**
Its parts carry the machines. The line's own cut method is ignored
entirely while they are there, so there is nothing to set it to. It is
not counted as untagged and Guess the rest leaves it alone, and the
box says so if you hover it.

**A line the tube import created carries Tube laser.**
When the tube nesting import makes a new line to hang its parts on, it
tags that line Tube laser. Harmless while the parts are on it, because
the tag is ignored. Not harmless the day somebody takes the parts off:
it becomes an ordinary line again and that tag starts sending it to
the tube stages. Clear it then.

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

## 5. On the printed job sheet

Parts print under their line, indented, each with its cut method and the
drawing revision it was built to. Two things about that page, both
fixed on 11 September 2026 and both worth knowing if it is changed
again:

- **Every size on the sheet comes from one place**, a scale at the top
  of `printJobSheet`. Change it there and the whole page stays in
  proportion. Tables are 7.5pt; left to itself the table library uses
  10pt, which is bigger than the sheet's own body text.
- **A part is marked with a bullet, not the arrow used on screen.** The
  PDF's standard font has no such arrow: it printed as a stray glyph
  and spaced out every letter of its line, so every part read as
  gapped text. Do not put an arrow, a dash of the long kind, or any
  other non-Latin character into a PDF string. The bullet and the
  middot are safe.

## 6. The database behind it

The first two must both have been run, or the parts row fails on a
missing column. The welding one was run on practice and live on 11
September 2026. To see which of these a database actually has, run
`CHECK-which-setup-files-are-run.sql` on it; every one of them has a
row in there.

| File | What it adds |
|---|---|
| `setup-quoting-and-bom.sql` | `job_quote_items.parent_quote_item_id`, the link from a part to its line |
| `setup-tube-laser-parts.sql` | `job_quote_items.length_mm`, the part's cut length |
| `setup-made-on-welding.sql` | Welding as a cut method. Until this is run, choosing Welding is refused and the app says which file to run. |

The rule itself is in `src/App.jsx`: `isChildLine`, `hasChildLines`,
`childLinesOf`, `billableLines`, `stageTakesItem`, `itemFlowLimit`.
Any new screen that lists a job's lines has to decide whether it wants
lines, parts or both, and use those helpers rather than the raw list.

## 7. Deliberately not built

**An explicit hinge tick on a stage.** The column exists
(`process_type_settings.puts_fabrications_together`) but nothing reads
it. It was proposed on 10 September 2026 and turned down: the merge
already happens at the first stage on Every item, and the case for the
tick came from a practice job's invented stage order. If a real job
ever shows parts reappearing after they should have merged, this is
the thing to build.
