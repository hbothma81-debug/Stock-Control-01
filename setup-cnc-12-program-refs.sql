-- CNC module, file 12: a program's quote reference and project name.
-- Typed on New program and on the program's page, and found by the
-- Programs list's search (Heinrich, 8 Oct 2026: "a quote reference and a
-- project name to search later", in place of a job number). The sales rep
-- is the person who made the program (cnc_programs.created_by, from the
-- login), so it needs no column. The app works without this file: the
-- two boxes stay hidden until it is run. Needs file 2. Safe to run twice.

alter table public.cnc_programs add column if not exists quote_ref text not null default ''
  check (char_length(quote_ref) <= 100);
alter table public.cnc_programs add column if not exists project_name text not null default ''
  check (char_length(project_name) <= 200);

select 'cnc quote ref and project' as step,
       case when (select count(*) from information_schema.columns where table_schema = 'public'
                   and table_name = 'cnc_programs' and column_name in ('quote_ref', 'project_name')) = 2
            then 'ready - a program keeps its quote reference and project name'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
