-- Stock on hand is worth what was paid for it (Heinrich, 21 Sep 2026).
--
-- A plate, section or CNC bar row has never held a price: its value was
-- worked out from the price list every time, so a new list price revalued
-- the whole shelf. This adds the row's own price, in the list's units
-- (R/kg for plate and bar, R/m for sections), and stamps every such row
-- that has none with today's list price: the cheapest of the material's
-- supplier prices and its no-supplier price. A row whose material has no
-- price stays empty and goes on reading the list. Nothing else changes.
--
-- Needs setup-supplier-prices.sql first. Run on PRACTICE first. Select
-- nothing before pressing Run. Safe to run more than once: only rows with
-- no paid price are stamped.

alter table public.stock_items add column if not exists paid_price numeric;

with list as (
  select f.list_name, lower(trim(f.name)) as name, lower(trim(coalesce(f.short_name, ''))) as short_name,
         lower(trim(coalesce(f.grade, ''))) as grade,
         least(nullif(f.price, 0), (select min(p.price) from public.master_supplier_prices p
                                    where p.list_name = f.list_name and p.price > 0
                                      and lower(trim(p.name)) = lower(trim(f.name))
                                      and lower(trim(p.grade)) = lower(trim(coalesce(f.grade, ''))))) as price
  from public.master_factor_items f
)
update public.stock_items s
set paid_price = coalesce(
  (select l.price from list l where s.main_cat = 'structural' and l.list_name = 'sections'
     and l.name = lower(trim(s.name)) and l.grade = lower(trim(coalesce(s.grade, ''))) and l.price > 0 limit 1),
  (select l.price from list l where s.main_cat = 'structural' and l.list_name = 'sections'
     and l.name = lower(trim(s.name)) and l.grade = '' and l.price > 0 limit 1),
  (select l.price from list l where s.main_cat in ('plate', 'cncBar')
     and l.list_name = case s.main_cat when 'plate' then 'grades' else 'cncGrades' end
     and lower(trim(coalesce(s.grade, ''))) in (l.name, nullif(l.short_name, '')) and l.price > 0 limit 1))
where s.main_cat in ('plate', 'structural', 'cncBar') and s.paid_price is null;

-- ============ Check ============
select main_cat as division, count(*)::text as "rows",
       count(paid_price)::text as with_a_paid_price,
       (count(*) - count(paid_price))::text as still_reading_the_list
from public.stock_items where main_cat in ('plate', 'structural', 'cncBar')
group by main_cat order by 1;
