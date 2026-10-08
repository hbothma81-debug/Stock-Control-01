-- CNC module, file 6: a revision's tool times are a list per tool.
-- The engine answers tool_s as seconds per tool ({"WNMG R0.8": 588.0, ...}),
-- not one number, so the column becomes jsonb (found on practice 8 Oct
-- 2026: the first revision was refused). Needs file 3. Safe to run twice.

alter table public.cnc_program_revisions
  alter column tool_s type jsonb using to_jsonb(tool_s);

select 'cnc tool times' as step,
       case when (select data_type from information_schema.columns where table_schema = 'public'
                   and table_name = 'cnc_program_revisions' and column_name = 'tool_s') = 'jsonb'
            then 'ready - tool times are kept per tool'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
