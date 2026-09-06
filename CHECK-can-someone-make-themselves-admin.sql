-- The one question that decides how serious this is.
--
-- profiles is the table holding is_admin. If the rule for changing that
-- table is the same "are you signed in?" condition as everything else,
-- then any of the ten accounts can promote itself to admin -- and an
-- admin can do anything, to live stock and live jobs.
--
-- Also shown: the rules for deleting your stock and erasing the usage
-- log, which is the record of who did what.
--
-- "using_condition"  is who may touch a row that already exists.
-- "with_check"       is what they are allowed to write.
-- Either one reading "auth.role() = 'authenticated'" means the only test
-- is having an account.
--
-- Select nothing before pressing Run. Read-only. Safe to run any time.

select tablename                                as which_table,
       cmd                                      as allowed_to,
       coalesce(qual, '(none)')                 as using_condition,
       coalesce(with_check, '(none)')           as with_check,
       case
         when coalesce(qual, with_check, '') like '%auth.role()%'
              and coalesce(qual, with_check, '') not like '%auth.uid()%'
           then 'ANY SIGNED-IN ACCOUNT'
         when coalesce(qual, with_check, '') like '%auth.uid()%'
           then 'only their own row'
         when coalesce(qual, with_check, '') in ('true', '')
           then 'ANYONE AT ALL'
         else 'something else - read the condition'
       end                                      as in_plain_words

from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'stock_items', 'usage_log', 'jobs', 'purchase_orders')

order by tablename, cmd;
