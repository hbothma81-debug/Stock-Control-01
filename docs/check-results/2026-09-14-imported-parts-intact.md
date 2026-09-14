# CHECK-imported-parts-intact.sql — live, 14 Sep 2026

Run by Heinrich on the LIVE database and pasted into the main (Planning)
conversation, exactly as it came back. For the Jobs page conversation.
Read-only check; nothing was changed.

Kept in a code block because some cells run over several lines (a job
line's notes), which would break a table.

```
| job_number | parent_line                                                                                 | part_code | part_description                   | qty | length_mm |
| ---------- | ------------------------------------------------------------------------------------------- | --------- | ---------------------------------- | --- | --------- |
| JOB-0093   | F31 - LEP VT Cage APD — Notes:
H.D.G
Drawings to be supplied upon order for final approval. |           | B&W_VTCLOS URE_P-001.1             | 24  | null      |
| JOB-0093   | F31 - LEP VT Cage APD — Notes:
H.D.G
Drawings to be supplied upon order for final approval. |           | B&W_VTCLOS URE_P-001.2             | 12  | null      |
| JOB-0093   | F31 - LEP VT Cage APD — Notes:
H.D.G
Drawings to be supplied upon order for final approval. |           | B&W_VTCLOS URE_P-001.3             | 24  | null      |
| JOB-0093   | F31 - LEP VT Cage APD — Notes:
H.D.G
Drawings to be supplied upon order for final approval. |           | B&W_VTCLOS URE_P-001.4             | 12  | null      |
| JOB-0079   | parent                                                                                      |           | 03.163.99.38.9                     | 22  | 80.79     |
| JOB-0079   | parent                                                                                      |           | 03.163.99.38.9 Copy                | 22  | 80.79     |
| JOB-0078   | Ranger Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-001 LH        | 1   | null      |
| JOB-0078   | Ranger Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-001 RH        | 1   | null      |
| JOB-0078   | Ranger Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-003 SINGLE    | 2   | null      |
| JOB-0078   | Ranger Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-004           | 2   | null      |
| JOB-0078   | Ranger Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-005 SINGLE    | 1   | null      |
| JOB-0078   | Ranger Double Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-001 LH        | 1   | null      |
| JOB-0078   | Ranger Double Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-001 RH        | 1   | null      |
| JOB-0078   | Ranger Double Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-003 DOUBLE    | 2   | null      |
| JOB-0078   | Ranger Double Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-004           | 2   | null      |
| JOB-0078   | Ranger Double Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-005 DOUBLE    | 1   | null      |
| JOB-0078   | Raptor Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-001 LH Raptor | 1   | null      |
| JOB-0078   | Raptor Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-001 RH Raptor | 1   | null      |
| JOB-0078   | Raptor Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-003 SINGLE    | 2   | null      |
| JOB-0078   | Raptor Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-004           | 2   | null      |
| JOB-0078   | Raptor Single Recovery Bumper                                                               |           | BRLG-RANG- BRKT-01 P-005 SINGLE    | 1   | null      |
| JOB-0056   | Angle Trtessel                                                                              |           | Tressel P-001.1 950mm              | 20  | null      |
| JOB-0056   | Angle Trtessel                                                                              |           | Tressel P-001.2 210mm              | 40  | null      |
| JOB-0056   | Angle Trtessel                                                                              |           | Tressel P-001.3 500mm              | 40  | null      |
| JOB-0056   | Angle Trtessel                                                                              |           | Tressel P-002 A                    | 60  | null      |
| JOB-0056   | Angle Trtessel                                                                              |           | Tressel P-002 B                    | 60  | null      |
| JOB-0056   | Angle Trtessel                                                                              |           | Tressel P-003                      | 20  | null      |
| JOB-0047   | PLATE - 80x70x30                                                                            |           | 03.163.99.38.9                     | 44  | 80.79     |
```

## Results 1 to 4

The Supabase SQL editor shows only the last result of a script, so the
table above is result 5 alone. Results 1 to 4 were run again as one table
(the query below) and came back:

| what | how_many |
| --- | --- |
| 1. all job lines | 763 |
| 1. parts (under another line) | 28 |
| 1. own lines | 735 |
| 2. lines with no description (MUST BE 0) | 0 |
| 3. parts whose parent line is missing (MUST BE 0) | 0 |
| 4. parts with no quantity | 0 |
| 4. parts with a length | 3 |

The one-table query, read-only:

```sql
select '1. all job lines' as what, count(*) as how_many from job_quote_items
union all
select '1. parts (under another line)', count(*) from job_quote_items where parent_quote_item_id is not null
union all
select '1. own lines', count(*) from job_quote_items where parent_quote_item_id is null
union all
select '2. lines with no description (MUST BE 0)', count(*) from job_quote_items
  where coalesce(trim(description), '') = ''
union all
select '3. parts whose parent line is missing (MUST BE 0)', count(*) from job_quote_items c
  where c.parent_quote_item_id is not null
    and not exists (select 1 from job_quote_items p where p.id = c.parent_quote_item_id)
union all
select '4. parts with no quantity', count(*) from job_quote_items
  where parent_quote_item_id is not null and coalesce(qty, 0) = 0
union all
select '4. parts with a length', count(*) from job_quote_items
  where parent_quote_item_id is not null and coalesce(length_mm, 0) > 0;
```
