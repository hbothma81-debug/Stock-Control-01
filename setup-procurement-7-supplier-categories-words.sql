-- Supplier categories, corrected (Heinrich, 20 Oct 2026, after seeing the
-- pills live: "keep the supplier list the way it was, each supplier will
-- have their categories, more than one possible, and they are also
-- searchable with the bigger list of categories like we had"; then "Yes to
-- both": the 12 broad categories go entirely, and "Springs, wire forms" is
-- two categories).
--
-- A supplier's categories are now the detailed words from what we buy from
-- them, split at the commas: "Springs", "Wire forms", "Engineering steel
-- (EN8 bar)". There is no separate list: the type-to-find box in the app
-- suggests every category already on any supplier.
--
-- What this does, on a database where setup-procurement-6 ran:
--   * takes the 12 broad categories off every supplier, keeping anything
--     else typed on one, and adds that supplier's "buys" words, split at
--     the commas (each once, first letter a capital: "Wire forms")
--   * removes the 12 broad categories' list (master_string_lists
--     "supplierCategories")
-- The buys column stays as the record of the words as first loaded.
--
-- Needs setup-procurement-6-supplier-categories.sql first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

with broad(v) as (values
  ('Steel & sections'), ('Stainless & non-ferrous'), ('Cutting & machining (subcontract)'),
  ('Fasteners & hardware'), ('Tools & abrasives'), ('Welding, consumables & PPE'),
  ('Electrical & controls'), ('Pumps, hydraulics & piping'), ('Coatings & finishing'),
  ('Plastics, rubber & packaging'), ('Machine service & transport'), ('IT, security & office')
),
wanted as (
  select m.id,
         coalesce(array(
           select x from (
             select distinct on (lower(x)) x, ord
             from (
               select k as x, 1 as ord from unnest(m.categories) as k where k not in (select v from broad)
               union all
               select upper(left(trim(w), 1)) || substr(trim(w), 2), 2
               from unnest(string_to_array(m.buys, ',')) as w where trim(w) <> ''
             ) parts
             order by lower(x), ord
           ) d order by lower(x)
         ), '{}') as cats
  from public.master_suppliers m
)
update public.master_suppliers m
set categories = w.cats
from wanted w
where m.id = w.id and m.categories is distinct from w.cats;

delete from public.master_string_lists where list_name = 'supplierCategories';


-- ============ Check ============

select 'supplier categories as words' as step,
       'ready - ' || count(*) filter (where categories <> '{}') || ' suppliers with categories, '
       || (select count(distinct lower(c)) from public.master_suppliers, unnest(categories) c) || ' different categories, '
       || (select count(*) from public.master_string_lists where list_name = 'supplierCategories') || ' broad ones left'
       as result
from public.master_suppliers;
