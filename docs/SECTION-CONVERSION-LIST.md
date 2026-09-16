# Sections step 5 — conversion list (DRAFT, for Heinrich to approve)

From `CHECK-section-names-in-use.sql`, run on live 16 Sep 2026. Every old
name on the left becomes the new name on the right, in Stock Manager and
in every copy: stock lines, requisitions, cut lists, reservations, tube
aliases (which add the material: "SHS 50x50x2 SS304"), laser programs and
tube job lines. "MERGE" means two rows become one; the kg/m and R/m kept
are the non-zero ones, the larger if both are set.

Marked **?** = needs Heinrich's answer (questions at the bottom).

## Square tube — SHS

| Old name | Material | New name | Note |
|---|---|---|---|
| SHS 25X25X1.9 | – | SHS 25x25x1.9 | had no type |
| SHS 30x30x3mm | – | SHS 30x30x3 | |
| SHS 32x32x2mm | – | SHS 32x32x2 | |
| SHS 32x32x3mm | – | SHS 32x32x3 | |
| SHS 38.1x38.1x1.6 (two rows) | – | SHS 38.1x38.1x1.6 | MERGE the duplicate |
| 38.10\*1.60\*3250mm | MS | SHS 38.1x38.1x1.6 | MERGE **?** Q3 length |
| 38.10\*1.60\*3300mm | MS | SHS 38.1x38.1x1.6 | MERGE **?** Q3 length |
| SHS 38.1x38.1x2mm | – | SHS 38.1x38.1x2 | laser program, alias |
| SHS 40x40x3mm | – | SHS 40x40x3 | |
| 50x50x1.5 / stock "SHS 50x50x1.5mm" | – | SHS 50x50x1.5 | stock line was off the list |
| 50x50x2 / stock "SHS 50x50x2mm" | SS304 | SHS 50x50x2 | stock line was off the list |
| SHS 50x50x3mm | – | SHS 50x50x3 | |
| SHS 76x76x2mm + SHS 76.2x76.2x2mm | – | SHS 76.2x76.2x2 | MERGE (confirmed 14 Sep) |
| SHS 100x100x2mm | – | SHS 100x100x2 | |

## Rectangular tube — RHS

| Old name | Material | New name | Note |
|---|---|---|---|
| RHS 50x25x2mm | – | RHS 50x25x2 | |
| RHS 60x30x3mm | – | RHS 60x30x3 | |
| RHS 76x38x1.9mm | MS | RHS 76.2x38.1x1.9 | **?** Q1 |
| RHS 76x50x1.9mm + 76X50X1.9mm | MS | RHS 76.2x50.8x1.9 | MERGE; first had no type **?** Q1 |
| RHS 76.2x50.8x2mm | – | RHS 76.2x50.8x2 | |
| RHS 76x50x4.5mm | – | RHS 76.2x50.8x4.5 | **?** Q1 |
| RHS 80x40x3.6mm | MS | RHS 80x40x3.6 | laser program, alias |
| 100x50x2 / stock "RHS 100x50x2mm" | SS304 | RHS 100x50x2 | stock line was off the list |
| RHS 150x50x2mm | MS | RHS 150x50x2 | |

## Round tube — CHS

| Old name | Material | New name | Note |
|---|---|---|---|
| Round Tube 19mm x 2mm wall (two rows) | –, MS | CHS 19.05x2 | 19 = 19.05 (confirmed 14 Sep) |
| Round Tube 19.05mm x 1.5mm wall (two rows) | –, SS304 | CHS 19.05x1.5 | |
| Round Tube 22.2mm x 1.2mm wall | – | CHS 22.2x1.2 | |
| Round Tube 25mm x 2mm wall | – | CHS 25x2 | |
| Round Tube 34mm x1.5mm wall | – | CHS 34x1.5 | |
| Round Tube 38.1mm X 1.2mm wall | SS304 | CHS 38.1x1.2 | laser program, alias |
| Round Tube 38.1mm x 1.5mm wall | – | CHS 38.1x1.5 | |
| Round Tube 38.1mm x 1.6mm wall | – | CHS 38.1x1.6 | |
| Round Tube 38.1mm x 2mm wall | – | CHS 38.1x2 | |
| Round Tube 38.1mm x 3.18mm wall | – | CHS 38.1x3.18 | |
| Round Tube 41.27mm x 1.2mm wall | – | CHS 41.27x1.2 | |
| Round Tube 42mm x1.5mm wall | – | CHS 42x1.5 | |
| Round Tube 42mm x 1. | – | (delete) | cut-off name, used nowhere |
| Round Tube 48.4 X 3.5mm wall + Round Bar "48.4x3.5" | – | CHS 48.4x3.5 | MERGE (confirmed 14 Sep) |
| GRIT ROUND TUBE 50.8mm x 1.2mm | – | CHS 50.8x1.2 | **?** Q2 grit |
| Round Tube 57mm x 1.5mm wall | – | CHS 57x1.5 | |
| Round Tube 57mm x 1.9mm wall | – | CHS 57x1.9 | |
| Round Tube 63.5mm x 4mm wall | – | CHS 63.5x4 | |
| Round Tube 76.2mm x 2mm wall | – | CHS 76.2x2 | |
| 88.9 X 2.5mm / stock + requisitions "Round Tube 88.9 X 2.5mm wall" | MS | CHS 88.9x2.5 | stock line was off the list |
| Round Tube 88.9mm x 2mm wall | – | CHS 88.9x2 | |
| Round Tube 152mm x 3mm wall | – | CHS 152x3 | |

## Round bar — RB

| Old name | New name |
|---|---|
| Round Bar 5mm / 6mm / 8mm / 10mm / 12mm / 16mm / 20mm / 30mm | RB 5 / RB 6 / RB 8 / RB 10 / RB 12 / RB 16 / RB 20 / RB 30 |

## Equal angle — EA

| Old name | New name |
|---|---|
| Equal Angle 40x40x3mm | EA 40x40x3 |
| Equal Angle 50x50x5mm | EA 50x50x5 (laser programs, alias) |
| Equal Angle 80x80x6mm | EA 80x80x6 |
| Equal Angle 100x100x8mm | EA 100x100x8 |

## Beams — UB, UC

| Old name | New name | Note |
|---|---|---|
| 152x152x37 (H-Beam) | UC 152x152x37 | |
| 203x203x46 (H-Beam) | UC 203x203x46 | |
| 254x146x37KG + stock "254x146x37" | UB 254x146x37 | MERGE (confirmed 14 Sep) |
| 406x178x54 | UB 406x178x54 | |
| 406x178x60 | UB 406x178x60 | |

## Pipe

| Old name | New name | Note |
|---|---|---|
| Seamless Pipe NB20 SCH160 26.7 x 5.56 + stock "(26.7 x 5.56mm)" | PIPE NB20 SCH160 | MERGE |
| Seamless Pipe NB25 SCH40 (33.4x4.55mm) | PIPE NB25 SCH80? | **?** Q4 |
| Seamless Pipe NB40 SCH80 (48.26x5.08mm) | PIPE NB40 SCH80 | |
| Welded Pipe NB15 Medium (21.7x2.3mm) | PIPE NB15 SANS62 Medium | table says 21.3x2.65 **?** Q5 |

## Not converted by this list

| Name | Where | Note |
|---|---|---|
| 80x42x6 Channel BPW | section, 4 laser programs, 3 reservations, stock, alias | **?** Q6 which type |
| 120x55 | 1 cut list line | **?** Q7 |

## Questions

1. **76 and 50 in RHS.** 76x76 = 76.2x76.2 was confirmed. Do RHS 76x50 and 76x38 likewise become 76.2x50.8 and 76.2x38.1?
2. **GRIT ROUND TUBE 50.8x1.2.** Is "grit" a finish on stainless tube (so the material should say it), or can the word go?
3. **38.10\*1.60\*3250mm and 3300mm.** Two stock lines with the stock length in the name. Merge into SHS 38.1x38.1x1.6 and put 3.25 m and 3.3 m in each stock line's length?
4. **NB25 SCH40 (33.4x4.55).** 4.55 is the SCH80 wall. SCH40 or SCH80?
5. **NB15 Medium (21.7x2.3).** SANS 62 Medium NB15 is 21.3x2.65 in the table. Is this that pipe?
6. **80x42x6 Channel BPW.** Which of the 17 types, or a new one? (It is on the tube laser: programs, an alias, reservations.)
7. **120x55** on one cut list line. What is it, and which section should it point at?
