# Tube parts: say which material each one is cut from

Planned 2026-09-11 by the Laser production conversation, from Heinrich's
ask. **Revised the same day** with Heinrich and the Jobs conversation, and
simplified: the first draft tagged each part with one stock line's id,
which would not have matched (see "Dropped" below). **The Jobs half is
built. The laser half is not.**

## What Heinrich asked for

> When made-on is Tube Laser I can set each part to the required section,
> so later the nesting will automatically pull those parts to the
> selected program/nesting.

And after the first draft, in his words:

> All I want is to give an identifier to the tube item line when loaded,
> so when I need to nest the program knows what material type to match to
> the excel import.

## The design, as agreed

**One field on each job line: its material type, as words.** Section and
grade, e.g. `SHS 50x50x3mm 304`. Column `job_quote_items.material_type`,
text, blank by default, which reads as "not said".

**Words, not a stock line's id.** A part is cut from a material. Which
length the nester takes it from is his decision on the day. An id names
one shelf row of one length, so a part tagged with the 6 m line would not
match a program cut from the 13 m line of the same section. The words
match whatever length is used.

**One source for the words.** `materialText(item)` in
`src/laser/stockOptions.js` joins a stock line's section name and grade.
It already writes `laser_programs.material` and
`tube_section_aliases.section_name`. The job line's material now comes
from the same function, so all three are the same words by construction.
Change that function and everything moves together.

The program still keeps `laser_programs.stock_item_id` for which bar it
takes off the rack. That is a different question, "which bar was eaten",
and the id is right for it. Material type answers "what is this part made
of".

## The Jobs half (Jobs conversation) — built

- **The column**, from `setup-job-line-material-type.sql`. Adds the column
  and an index; changes no row. Needs running on practice, then live.
- **A box on the Items tab**, only on a line or a part whose made-on is
  Tube laser. Type-to-find over every section and grade on the Structural
  Steel shelf, once each however many lengths it comes in, in
  `materialText` words. Saved as the words.
- **Shown read-only** beside the made-on label for anyone who cannot edit
  the job.
- **Copying a job** carries it across.

It uses `TypeToFind`, not `StockSectionPicker`. That picker lists shelf
rows with their lengths and what is available, which is the right question
when picking what to cut from and the wrong one when saying what a part is
made of. What the first draft wanted from sharing the picker, the same
words on both screens, comes from sharing `materialText` instead.

## The laser half (Laser production) — to build

On import, for each section in the report:

1. Its material is `materialText` of the stock line chosen in "In stock it
   is", which is what the import already passes on as `s.material`.
2. Find the picked job's lines whose `material_type` equals it, compared
   trimmed and ignoring case.
3. **What a match does — decided by Laser production, 2026-09-11.** The
   parts tick in the import already decides it, so there is no new
   question:
   - **Tick off** (its default on a job with several lines): the matched
     lines *are* that section's parts. The section adds nothing, so no
     duplicates. This is Heinrich's current case: "I now have a job with
     items, so I will not use the items from the import."
   - **Tick on** (its default on a job with no lines, or one): the matched
     line is that section's **parent**, and the file's parts for that
     section go under it. Each section finds its own, so two materials go
     under two lines instead of one picked for the whole import. This is
     his later case: "I will have a parent loaded, then when importing it
     will load the items as child parts for that parent line."
     - One match: used automatically, nothing asked.
     - Several matches: pick one, from those lines only — not the whole
       job's list, which is what the picker asks today.
   - The screen says what matched, per section: "3 lines on JOB-0042 are
     this material".
4. No match: today's behaviour stands.

Matching skips blank material types. The column defaults to an empty
string, not null, so an untagged line holds `''` and must never be read
as a match for anything.

The laser half does nothing until the column exists and lines are
tagged, so it waits for `setup-job-line-material-type.sql` to be run and
is built then, against real tagged lines, rather than tested blind.

A job with no material types set imports exactly as it does now.

## Dropped from the first draft, and why

- **`cut_from_item_id`, a stock line's id.** Replaced by material words,
  for the length reason above. It would also have drifted: offcuts put
  back into stock appear as their own lines, and the import's remembered
  section resolves to whichever length sorts first.
- **"They are that program's parts."** Nothing in the database links a
  program to a job line: `laser_program_jobs` links a program to whole
  jobs, and `laser_programs.parts` is a copy of the spreadsheet's list.
  So what a match does has to be decided, as in step 3.
- **Using `StockSectionPicker` on the Items tab.** See the Jobs half.

## Watch for

- **Spelling in stock.** The match is only as good as the stock list. If
  two stock lines of the same real material are spelt differently, their
  words differ and will not match. `CHECK-sections-and-materials.sql`
  finds exactly that (checks 2, 10 and 11). Fixing the spelling in stock
  fixes the match.
- **A section renamed** in Stock Manager leaves material types already set
  on job lines in the old words. The program's material and the import's
  remembered aliases go stale the same way, so all three stay in step.

## Open questions for Heinrich

- **When the job says one material and the file another**, which wins?
  Laser production's earlier suggestion: the file wins for the program's
  material, because that is what was nested, and the mismatch is said on
  screen rather than ignored.
- **Part-way tagged jobs.** Suggestion: tagged lines match, the rest fall
  back to today's behaviour, and the import says how many of each.
- **The plate laser.** The same idea works with thickness and grade. Not
  now.
