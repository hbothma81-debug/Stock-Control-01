-- CNC module, file 8: a program's price at its batch size.
-- The engine's costing block for the program as it stands: its current
-- revision, its batch quantity and the material price of the day
-- (Heinrich, 8 Oct 2026: keep the batch size; a change of quantity updates
-- the price). Written by the Costing tab and with every new revision; what
-- the Quoting module's CNC line will read. Needs file 2. Safe to run twice.

alter table public.cnc_programs add column if not exists costing jsonb;

select 'cnc costing' as step,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                          and table_name = 'cnc_programs' and column_name = 'costing')
            then 'ready - a program keeps its price'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
