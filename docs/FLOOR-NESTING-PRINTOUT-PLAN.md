# Floor nesting printout

Planned 2026-09-12 by the Laser production conversation. **A draft for
discussion with Heinrich. Nothing is built.**

## What Heinrich asked for

A printed sheet the floor can actually read. The tube software's report
has too much on it, the text is too small, five nests share one page with
no room to mark anything off, and its material names are not South
African shop names. The floor is largely unskilled, so it has to be
simple:

- the right program number, big;
- the parts and quantities, grouped under the material they are cut from;
- the material and the amount to draw, in the words the stock manager
  uses, so the floor learns the same names;
- a first page with the whole item list, then one nest per page (or two
  when they fit);
- text big enough to read at the machine, and space to tick off and
  write notes;
- tube pages portrait or landscape; plate pages landscape, one sheet per
  page.

## What the app already has, and what it does not

**Tube, per nest: known on import, then thrown away.** The spreadsheet's
Nesting List gives, for every nest, how many tubes to cut it on and which
parts come off each tube with their lengths. `parseNestingList` in
`src/laser/nestingReport.js` already reads all of it. The import then
keeps only a one-line note ("Nest 1 × 8 tubes, Nest 2 × 1 tube") and
drops the rest. Printing a page per nest needs that detail kept: one new
column on `laser_programs`, the nests as they came out of the file.

**Material in the stock manager's words: already there.** The import maps
the software's wording ("Square tube Width50.", "Round tube R19.05mm") to
a Stock Manager line and stores `materialText` of it on the program. The
Stock Manager conversation is converting section names to shop shorthand
(SHS 50x50x3, CHS 38.1x2), so the printout inherits that for free.

**Part names repeat.** In BOOTH DOORS WS five different parts are all
called "MRSB_BOOTH-01 GATES TUBING_0", told apart only by length (2 525,
2 859, 2 884, 2 802.4, 2 500). A floor sheet must lead with a short mark
number and the length, large, not the software's name.

**Plate: the app does not know the parts on a sheet.** A plate program
carries its number, material, sheet name, how many sheets, the jobs on it
and its planned minutes. The parts live in SigmaNest only. No SigmaNest
per-sheet export was found on disk (`4.DOCS/SIGMANEST.xlsx` is a list of
keyboard shortcuts). So a plate page can list the parts only if SigmaNest
can export them; otherwise it is a cover sheet to staple to SigmaNest's
own picture.

**The PDF engine is already in the app** (jsPDF: the job sheet, purchase
orders). Its house rules from `app-jsx-traps` apply: one type scale set at
the top and used by every table; no arrow characters, which wreck a whole
line; check a PDF by opening it, never by measuring.

## The document, per program

**Page 1 — the whole job at a glance** (portrait)
- Program number, very large. Nesting name, job number(s), customer,
  date printed.
- **Draw from stores:** "25 lengths of CHS 19.05 x 1.5 304, 6.01 m".
  Stock manager's words and the amount, nothing else.
- **Parts**, grouped under their material: mark, length (large), how many,
  which job, a tick box, a notes column.

**One page per nest** (tube, portrait; two to a page when a nest has only
a part or two)
- "NEST 1 — cut 8 tubes", large.
- Eight boxes to tick, one per tube cut.
- What comes off **each** tube: mark, length, how many per tube.
- What the nest makes in total: per tube × tubes.
- Offcut left per tube, so it can go back into stock.
- Space for notes.

**Plate, one sheet per page** (landscape)
- Program number, material, sheet name, number of sheets, jobs, planned
  minutes.
- A box per sheet to tick.
- Space for notes, and room for SigmaNest's picture if it is printed
  alongside.

### Worked example: MARCH

Round tube R19.05mm in the file, CHS 19.05 on the sheet. 25 tubes of
6 010 mm, 150 parts.

- Page 1: draw 25 lengths; parts SSD-5 × 100 at 1 000 mm, SSD-7 × 50 at
  1 000 mm.
- Nest 1 — cut 8 tubes: each gives 6 × SSD-7. Makes 48.
- Nest 2 — cut 1 tube: gives 4 × SSD-5 and 2 × SSD-7. Makes 4 and 2.
- Nest 3 — cut 16 tubes: each gives 6 × SSD-5. Makes 96.

Nests 2 and 3 would share a page; each is short.

## Questions for Heinrich

1. **One nest per page, or two when they are short?** Suggest one, and two
   only when both fit without shrinking the text.
2. **Where is it printed from?** Suggest a Print button on the program,
   on both the Nesting and Cutting screens, and one on the job that
   prints every program for it.
3. **Plate: can SigmaNest export a part list per sheet** (a report, CSV or
   spreadsheet)? If yes, plate pages list their parts. If no, plate pages
   are cover sheets stapled to SigmaNest's picture.
4. **Pictures.** The tube file has a Thumbnail column but no images come
   through in the export. Is the mark number and length enough, or does
   the floor need the part's drawing number too? The app has a drawings
   library it could name.
5. **Mark numbers.** The software's own part ID (1, 2, 3 in the file), or
   the app's own sequence per job so they never repeat?

## Build order, once agreed

1. Keep the nest detail on import: one column on `laser_programs`, SQL on
   practice then live. Programs made before it print page 1 and no nest
   pages.
2. The tube printout and its Print button. Everything it needs exists.
3. The plate printout, after question 3.

## Not tonight

- Drawing the nest itself. The tube software and SigmaNest draw the
  picture; the app would only be guessing at it.
