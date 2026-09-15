# Laser quoting — the brief

Written 15 Sep 2026 by the Planning conversation for the new **Laser
quoting** conversation, which builds it. Nothing is built yet. Read this,
then `CLAUDE.md`, then ask Heinrich the open questions at the bottom
before writing any code.

## What it is

A laser quoting module: drop in a customer's DXF files, see each part
drawn, and get its square size, cut length, pierce count, m², weight and
a price. Plate laser only (the tube laser has its own software).

## Decided by Heinrich (15 Sep 2026)

1. **Build it.** SigmaNest access is limited, and not every quote can
   go through it.
2. **Its own screen, looking like a separate app**: a laser quoting
   module, not a tab squeezed in beside the others.
3. **Priced its own way, in new tables.** Cutting speed per material,
   per thickness, per cut method, worked back to an hourly rate. Not the
   Quoting plan's `quote_cutting_speeds` / `quote_rates` (thickness only).
   When the Quoting module's laser line (its plan step 11) comes, it
   should call this module rather than build a second laser calculator.
4. **Material is charged by the square**: the rectangle the part fits in.
5. **A viewer where layers can be set** — which lines are cut, which are
   bend lines, and so on.
6. **A new conversation builds it.** Only Planning pushes (`CLAUDE.md`).

## What ERS's DXF files are really like (checked 15 Sep)

About 65,900 DXFs under `C:\ERS\OneDrive - East Rand Supplies`.

- **Most are drawing sheets**, not cut files: SolidWorks A4 exports
  (292 × 206), with a title block (MATERIAL GRADE, THICKNESS, QTY,
  WEIGHT), dimensions and several views. Reading one for cut length
  would add up the border and the dimension lines. They must be refused:
  DIMENSION entities, "DWG NO" / "DO NOT SCALE" in the text, A4 extents.
- **Cut files** are the part at 1:1: LINE, ARC, CIRCLE (some LWPOLYLINE),
  units mm (`$INSUNITS` 4). The thickness is often in the file name
  ("12mm", "16mm MS", "1.2mmGALV", "DOMEX 2.0MM"), often not.
- **Everything is on layer 0.** So the file cannot say what is cut:
  - `1.ERS Factory\2. STRUCTURES\MAIN STRUCTURE\ERS_ELECT-MAIN STR-01 P-003base plate special.DXF`
    has two lines across the plate (x = 51.567 and 148.433), apparently
    bend lines.
  - `1.ERS Factory\3.Electrical\IP68 PUMP PANEL\PP-01-INV-P-022.DXF`
    has four knockouts, each two arcs with a 1 mm bridge left uncut on
    purpose, and centre lines drawn over them.
  - Old library files can be broken: `...\COBRA REELING\78X23 4MM MSTL.DXF`
    holds six circles and no outline.
- The proper fix at the source is an ERS SolidWorks flat-pattern export
  setting that leaves bend and centre lines out or puts them on their
  own layers. Customer files still need the viewer.

## The maths, proven on real files

A throwaway probe (scratchpad, not app code) did this, and it worked:

- Read LINE, ARC, CIRCLE and LWPOLYLINE, including curved polyline
  segments (bulge). SPLINE and ELLIPSE still need doing: SolidWorks uses
  them on curved parts.
- Join the pieces into closed outlines where ends meet within 0.05 mm.
- Pierces = closed outlines, plus every open run that is really cut.
- The outline with the biggest area is the outside; the others are holes.
- Square size = the outside's width × length. Net area = outside less holes.
- Weight = area (m²) × thickness (mm) × density. The densities are the
  Grades factors the app already holds (Mild Steel 7.85, stainless 7.93),
  the same numbers `plateWeight` in `App.jsx` uses. If this module keeps
  its own copy of that sum, say so at the top of the file (`CLAUDE.md`:
  copies of the same rule drift).

What it read (mild steel). These make good first tests; check them
against SigmaNest's figures for the same files before trusting them:

| File (under `1.ERS Factory`) | Square | Cut length | Pierces | Net / square kg |
|---|---|---|---|---|
| `2. STRUCTURES\MAIN STRUCTURE\ERS_ELECT-MAIN STR-01 P-003 base plate 12mm.DXF` | 300 × 250 | 1371.9 mm | 5 | 6.90 / 7.06 |
| `7.Factory\BANDSAW\CLAMP\BNSW-CLMP-01 P-001 16mm MS.DXF` | 65 × 215 | 654.2 mm | 2 | 1.67 / 1.76 |
| `7.Factory\KITCHEN TABLE WORKERS\KT-P002.DXF` | 96 × 68 | 379.9 mm | 3 | (no thickness in name) |
| `7.Factory\KITCHEN TABLE WORKERS\KT-P003 -1700.DXF` | 1756.7 × 618.3 | 4813.2 mm | 5 | (no thickness in name) |
| `7.Factory\BANDSAW\CLAMP\BNSW-CLMP-01 P-004.dxf` | refused: a drawing sheet | | | |

The base plate special and the pump panel read wrongly until their bend
lines, centre lines and bridged arcs are sorted out: that is the viewer's
job.

## How it should be built (Planning's suggestion — confirm with Heinrich)

- **Files are read in the browser.** Nothing uploaded, nothing kept in
  Supabase storage, so nothing against the monthly download limit
  (`CLAUDE.md`, Loading data). Only the small rate and speed tables are
  loaded, once.
- **Its own folder** (`src/laserQuote/`), not `App.jsx`. `App.jsx` is
  where every conversation collides; this module should touch it with
  one import and one way in, nothing more.
- **The maths in plain `.js` files with tests** (`npm test` runs
  `src/**/*.test.js`), using small cut files from `1.ERS Factory`
  (ERS's own parts, not customer files) as test inputs.
- **Build order, one step at a time, Heinrich testing each:**
  1. The reader and the maths, with tests, checked against SigmaNest.
  2. The viewer: the part drawn, layers listed with a role each.
  3. The screen: drop files, a row per part, thickness and grade, qty,
     totals. No database change.
  4. The new tables (SQL, practice then live) and a screen to fill them.
  5. The price.
  6. Whatever Heinrich decides about saving and printing a quote.

## Open questions — ask these first

1. **"Looks like a separate app"**: its own full-screen page inside
   this app (same sign-in, same Grades and customers, its own look and
   its own way in), or a separate web address altogether? Planning
   suggests inside: a separate site means a second sign-in and a second
   copy of the Grades.
2. **Cut method**: is that the cutting gas (oxygen, nitrogen, air), or
   something else? One hourly rate for the machine, or one per cut
   method (nitrogen costs more to run)?
3. **What else goes in the price**: pierce time per material and
   thickness, handling or setup per part or per file, markup, a minimum
   charge? The workbook (`4.APPS/ERS DATA/ERS QU226339...xlsm`, sheets
   STRUCTURAL-01/-02) holds rate per metre, pierce charge, handling,
   price per hour and speeds (1.2 mm 18 m/min, 3 mm 8, 6 mm 3.5,
   12 mm 0.6) — a starting point, or replaced?
4. **By the square**: the exact rectangle, or with a gap added round
   each part? The rand value from the Grades price per kg?
5. **Layers**: roles Cut, Bend, Mark/etch, Ignore? ERS files are all on
   layer 0, so layer roles alone will not help them — also pick lines
   by clicking? Should the bend lines count (number of bends, bend
   length) towards a bending price?
6. **Saving**: does a laser quote get saved with a customer and a
   number, and printed as a PDF — or is it a calculator first?
7. **Who may open it**: a new permission tick, like "Can use laser
   quoting"?
