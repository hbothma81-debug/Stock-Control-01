-- Suppliers page, step 6 of the SQL: what we buy from each supplier.
--
-- Two new things on every supplier (Heinrich, 19 Oct 2026):
--   * categories: one or more broad categories from a short list (Steel &
--     sections, Electrical & controls, ...). The Supplier list shows a pill
--     per category. The list itself is editable in the app, kept with the
--     app's other lists in master_string_lists as "supplierCategories".
--   * buys: the detailed words, as the Procurement folder's suppliers.md
--     has them ("Engineering steel (EN8 bar)").
-- Decided with the Stock Manager conversation on 10 Sep 2026 (several per
-- supplier, a type-to-find box, for finding and grouping suppliers only).
--
-- This file makes the columns and the starting list only; which supplier
-- is in which category is loaded by SEED-supplier-categories.sql.
--
-- 20 Oct 2026: the 12 broad categories were dropped again on Heinrich's
-- word; setup-procurement-7-supplier-categories-words.sql takes them off
-- and makes a supplier's categories its detailed words. This file still
-- adds the starting list (it ran on both databases as it is), and file 7,
-- always run after it, removes it.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once: the starting list is added only while the
-- app has no supplier categories at all, so later edits are never undone.

alter table public.master_suppliers add column if not exists categories text[] not null default '{}';
alter table public.master_suppliers add column if not exists buys text not null default '';

insert into public.master_string_lists (id, list_name, value)
select 'supcat-' || md5(v), 'supplierCategories', v
from unnest(array[
  'Steel & sections',
  'Stainless & non-ferrous',
  'Cutting & machining (subcontract)',
  'Fasteners & hardware',
  'Tools & abrasives',
  'Welding, consumables & PPE',
  'Electrical & controls',
  'Pumps, hydraulics & piping',
  'Coatings & finishing',
  'Plastics, rubber & packaging',
  'Machine service & transport',
  'IT, security & office'
]) as v
where not exists (select 1 from public.master_string_lists where list_name = 'supplierCategories')
on conflict (id) do nothing;


-- ============ Check ============

select 'supplier categories' as step,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'master_suppliers' and column_name = 'categories')
            then 'ready - ' || (select count(*) from public.master_string_lists where list_name = 'supplierCategories')
                 || ' categories on the list, ' || (select count(*) from public.master_suppliers where categories <> '{}')
                 || ' suppliers with one'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
