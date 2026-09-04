-- Put the Stores items that are on the shelf into the Stores Catalog.
--
-- Adding stock reads from the catalogue and never wrote back, so
-- everything an operator typed by hand stayed out of it. This puts them
-- in, using what is already on the shelf: the category, supplier, code
-- and price the operator entered.
--
-- Nothing on the shelf is touched. This only adds catalogue entries, so
-- the worst it can do is give you a catalogue row you did not want, which
-- you can delete in Stock Manager.
--
--
-- ONE PER NAME
--
-- The same item on three shelves becomes one catalogue entry. Where the
-- shelf rows disagree -- two different suppliers for the same name --
-- it takes the one with a price on it, then the most recently added, so
-- the newest correction wins rather than the oldest guess.
--
--
-- WHAT IT WILL NOT FIX
--
-- Two spellings of the same item are two different names, so they become
-- two catalogue entries. Yours has at least one pair:
--
--   "16ER 1.75ISO IC908"           code 5901953
--   "16ER 1.75ISO IC908 Insert"    code 5901953
--
-- Same code, same insert, typed twice. That is exactly what an empty
-- catalogue causes and what a filled one prevents from here on. Merge
-- them by hand afterwards -- delete the wrong one in Stock Manager, and
-- fix the shelf row to match the one you keep.
--
--
-- Select nothing before pressing Run. Safe to run more than once: an
-- item already in the catalogue is skipped, not duplicated.


insert into master_stores_catalog (id, code, name, category, supplier, price)
select
  gen_random_uuid()::text,
  coalesce(pick.part_number, ''),
  pick.name,
  coalesce(pick.customer, ''),
  coalesce(pick.supplier, ''),
  coalesce(pick.value, 0)
from (
  select distinct on (lower(trim(si.name)))
         si.name,
         si.customer,
         si.supplier,
         si.part_number,
         si.value
  from stock_items si
  where si.main_cat = 'stores'
    and trim(coalesce(si.name, '')) <> ''
    and not exists (
      select 1 from master_stores_catalog c
      where lower(trim(c.name)) = lower(trim(si.name))
    )
  -- Of several shelf rows with the same name: one with a price first,
  -- then one with a supplier, then whichever was added most recently.
  order by lower(trim(si.name)),
           (coalesce(si.value, 0) > 0) desc,
           (coalesce(si.supplier, '') <> '') desc,
           si.created_at desc
) as pick;


-- ============ Check ============
--
-- The third row should now be 0. If it is not, those names are blank on
-- the shelf, which the catalogue cannot hold.

select 'Stores items on the shelf' as counts, count(*)::text as total
from stock_items where main_cat = 'stores'

union all

select 'Entries in the Stores Catalog', count(*)::text
from master_stores_catalog

union all

select 'Still on the shelf but NOT in the catalogue', count(*)::text
from stock_items si
where si.main_cat = 'stores'
  and not exists (
    select 1 from master_stores_catalog c
    where lower(trim(c.name)) = lower(trim(si.name))
  );
