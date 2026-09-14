# CHECK-material-spellings.sql — live, 14 Sep 2026

Run by Heinrich on the LIVE database and pasted into the Stock Manager
conversation. Read-only; nothing was changed.

## What it showed

- **Only two of the 12 materials have a short name:** Stainless 304 (SS304)
  and Stainless 304 2B (SS304 2B). Mild Steel has none, so the app has been
  writing "Mild Steel" in full, and that is by far the commonest spelling
  (53 structural lines, 16 plate lines, most laser programs).
- **Empty on live:** `job_quote_items.material_type`, `quote_parts`,
  `bom_parts`. A rename touches none of them, so the tube import's exact-word
  match is not affected yet.
- **Two spellings of Stainless 304:** full name on 6 structural lines,
  2 sections, 1 requisition and 1 CNC bar line; short name on 9 structural
  lines, 1 section, 3 requisitions and 7 laser programs.
- **Stainless 304 2B:** 2 plate lines full, 2 plate lines short.
- **"MS", not on the list:** 1 cut-list line, 3 laser programs (1.2mm MS x2,
  1.6mm MS), 3 fastener lines.
- **"3mm GALV":** 1 laser program; the list says "galvanised".
- **"80x42x6 Channel BPW":** 1 laser program with no material; 3 others of
  the same channel say Mild Steel.

## Result as it came back (rows with a count)

| place | value | how_many | reads_as |
| --- | --- | --- | --- |
| job_cut_items.grade | Mild Steel | 5 | full = short |
| job_cut_items.grade | ms | 1 | NOT on list |
| laser_programs.material | 0.9mm SS304 | 1 | short, Stainless 304 |
| laser_programs.material | 0.9mm SS304 2B | 1 | short, Stainless 304 2B |
| laser_programs.material | 0.9mm Stainless 430 BA PVC | 2 | full = short |
| laser_programs.material | 1.2mm Mild Steel | 5 | full = short |
| laser_programs.material | 1.2mm MS | 2 | NOT on list |
| laser_programs.material | 1.6mm 3CR12 | 2 | full = short |
| laser_programs.material | 1.6mm Mild Steel | 6 | full = short |
| laser_programs.material | 1.6mm MS | 1 | NOT on list |
| laser_programs.material | 1.6mm SS304 | 3 | short, Stainless 304 |
| laser_programs.material | 1.6mm Stainless 430 BA PVC | 8 | full = short |
| laser_programs.material | 10mm HARDOX 450 | 2 | full = short |
| laser_programs.material | 10mm, 12mm, 16mm, 20mm Mild Steel | 4, 3, 3, 2 | full = short |
| laser_programs.material | 2mm 3CR12 | 1 | full = short |
| laser_programs.material | 2mm Aluminium | 7 | full = short |
| laser_programs.material | 2mm galvanised | 7 | full = short |
| laser_programs.material | 2mm Mild Steel | 29 | full = short |
| laser_programs.material | 3mm GALV | 1 | NOT on list |
| laser_programs.material | 3mm Mild Steel | 12 | full = short |
| laser_programs.material | 3mm SS304 | 3 | short, Stainless 304 |
| laser_programs.material | 3mm SS304 2B | 1 | short, Stainless 304 2B |
| laser_programs.material | 4mm, 5mm, 6mm, 8mm Mild Steel | 5, 6, 25, 8 | full = short |
| laser_programs.material | 80x42x6 Channel BPW | 1 | NOT on list |
| laser_programs.material | 80x42x6 Channel BPW Mild Steel | 3 | full = short |
| laser_programs.material | Equal Angle 50x50x5mm Mild Steel | 1 | full = short |
| laser_programs.material | Round Tube 38.1mm X 1.2mm wall SS304 | 1 | short, Stainless 304 |
| requisitions.item_grade | Aluminium / Mild Steel / S355 | 1 / 6 / 5 | full = short |
| requisitions.item_grade | SS304 | 3 | short, Stainless 304 |
| requisitions.item_grade | SS304 2B | 2 | short, Stainless 304 2B |
| requisitions.item_grade | Stainless 304 | 1 | FULL, Stainless 304 |
| sections (Stock Manager) | Mild Steel | 9 | full = short |
| sections (Stock Manager) | SS304 | 1 | short, Stainless 304 |
| sections (Stock Manager) | Stainless 304 | 2 | FULL, Stainless 304 |
| stock_items.grade (cncBar) | Stainless 304 | 1 | FULL, Stainless 304 |
| stock_items.grade (fasteners) | MS | 3 | NOT on list |
| stock_items.grade (plate) | 3CR12 / Aluminium / Mild Steel | 2 / 1 / 16 | full = short |
| stock_items.grade (plate) | SS304 2B | 2 | short, Stainless 304 2B |
| stock_items.grade (plate) | Stainless 304 2B | 2 | FULL, Stainless 304 2B |
| stock_items.grade (plate) | Stainless 316 2B, 316 N4 PVC, 430 BA PVC, STRENX 700 | 2, 1, 1, 1 | full = short |
| stock_items.grade (structural) | Aluminium / Mild Steel / S355 | 2 / 53 / 5 | full = short |
| stock_items.grade (structural) | SS304 | 9 | short, Stainless 304 |
| stock_items.grade (structural) | Stainless 304 | 6 | FULL, Stainless 304 |

The Material Types list itself: 3CR12, Aluminium, galvanised, HARDOX 450,
Mild Steel, S355, Stainless 304 (SS304), Stainless 304 2B (SS304 2B),
Stainless 316 2B, Stainless 316 N4 PVC, Stainless 430 BA PVC, STRENX 700.
