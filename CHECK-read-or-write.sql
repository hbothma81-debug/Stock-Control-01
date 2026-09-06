-- Can a signed-in account only READ your data, or change and delete it too?
--
-- The first check showed every table is open to anyone with an account.
-- This says what they are allowed to DO with it.
--
-- "ALL" means read, add, change and delete -- everything.
-- "SELECT" means read only.
--
-- Grouped so it is a short answer rather than another long list.
--
-- Select nothing before pressing Run. Read-only. Safe to run any time.

select cmd                                    as allowed_to,
       count(*)                               as how_many_tables,
       case
         when cmd = 'ALL'    then 'read, add, change AND delete'
         when cmd = 'SELECT' then 'read only'
         when cmd = 'INSERT' then 'add new rows'
         when cmd = 'UPDATE' then 'change existing rows'
         when cmd = 'DELETE' then 'delete rows'
         else cmd
       end                                    as in_plain_words,
       count(*) filter (where permissive = 'PERMISSIVE')  as permissive_rules,
       string_agg(distinct tablename, ', ' order by tablename) as tables

from pg_policies
where schemaname = 'public'
group by cmd, permissive
order by cmd;
