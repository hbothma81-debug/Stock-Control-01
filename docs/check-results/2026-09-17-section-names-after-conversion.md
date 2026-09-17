# CHECK-section-names-in-use.sql — live, 17 Sep 2026, after setup-section-names.sql

Run by Heinrich on LIVE after all six parts of `setup-section-names.sql`
(practice first, same day). Read-only.

- **68 sections, every one on the new shorthand and built from boxes**
  (`from_boxes` true): SHS, RHS, CHS, RB, EA, UB, UC, PIPE (with OD, ID and
  wall), CC 80x42x6, CH 120x55. Was 71 before the merges.
- **Merges held:** SHS 76/76.2 (stock 2), RHS 76x50x1.9 spellings (cut lists
  2), CHS 48.4x3.5 with the Round Bar mistake (stock 2), SHS 38.1x38.1x1.6
  (stock 6, reservations 3, requisitions 2, in blank and Mild Steel),
  UB 254x146x37 with its stock line, PIPE NB20 with its stock line.
- **Every copied name now finds a section.** The only "not a section" rows
  are the 8 tube aliases, which carry section then material by design:
  CC 80x42x6 Mild Steel, CHS 38.1x1.2 SS304, EA 50x50x5 Mild Steel,
  RHS 100x50x2 SS304, RHS 80x40x3.6 Mild Steel, SHS 38.1x38.1x2 Mild Steel,
  SHS 50x50x1.5 SS304, SHS 50x50x2 SS304.
- **Laser programs now counted against their sections** (they were not
  before, because the old names had "mm"): CC 80x42x6 4, EA 50x50x5 2, and
  one each on RHS 100x50x2, RHS 80x40x3.6, CHS 38.1x1.2, SHS 38.1x38.1x2,
  SHS 50x50x1.5, SHS 50x50x2.
- **Still zero kg/m** on several sizes (CC 80x42x6, RHS 150x50x2, RHS
  76.2x50.8x1.9, RHS 80x40x3.6, CHS 34x1.5, 42x1.5, 48.4x3.5, 50.8x1.2, 57x1.5,
  57x1.9, SHS 25x25x1.9, both SHS 38.1x38.1x1.6): step 6 (kg/m from the
  numbers) fills these.
- Some stored kg/m look wrong, e.g. CHS 38.1x1.6 at 0.5 against CHS 38.1x1.5
  at 1.36. Step 6 to compare.
