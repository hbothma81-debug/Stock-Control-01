-- Which Stores items are on the shelf but not in the Stores Catalog.
--
-- READ ONLY. Changes nothing. Run it before anything else, so you can
-- see the size of it.
--
--
-- FIRST, THE REASSURING PART
--
-- Nothing has been lost. Every item an operator added under Stock is a
-- real row in stock_items with its quantity, location, supplier and
-- price. That is your stock, and it is all there.
--
-- The Stores Catalog is a separate list -- a catalogue of what store
-- items exist, used to fill in the form when someone adds one. Adding
-- stock reads from it and never writes back, so an item typed in by hand
-- never joined the catalogue.
--
-- What that costs you is not the stock. It is that the next person
-- cannot pick that item from the list, so they type it again, slightly
-- differently, and you end up with three spellings of the same thing.
--
--
-- Select nothing before pressing Run.


-- 1. The size of it.
select 'Stores items on the shelf' as counts,
       count(*)::text as total
from stock_items
where main_cat = 'stores'

union all

select 'Entries in the Stores Catalog',
       count(*)::text
from master_stores_catalog

union all

select 'On the shelf but NOT in the catalogue',
       count(*)::text
from stock_items si
where si.main_cat = 'stores'
  and not exists (
    select 1 from master_stores_catalog c
    where lower(trim(c.name)) = lower(trim(si.name))
  );


-- 2. Which ones, and what would go into the catalogue for each.
--    Grouped by name so the same item on three shelves is one entry.

select si.name,
       coalesce(nullif(max(si.customer), ''), '(no category)') as category,
       coalesce(nullif(max(si.supplier), ''), '')              as supplier,
       coalesce(nullif(max(si.part_number), ''), '')           as code,
       max(si.value)                                           as price,
       count(*)::text || ' row(s) on the shelf'                as found
from stock_items si
where si.main_cat = 'stores'
  and not exists (
    select 1 from master_stores_catalog c
    where lower(trim(c.name)) = lower(trim(si.name))
  )
group by si.name
order by si.name;
