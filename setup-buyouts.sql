-- Buy-outs: items we buy in, mark up, and resell.
--
-- Buy-outs are a stock division like Plate or Fasteners -- same table, told
-- apart by main_cat -- so the only thing missing was somewhere to keep the
-- second price.
--
-- value      = what we pay. Stock is valued at cost and a purchase order
--              prices itself from this, both of which were already true for
--              every other division, so neither changes.
-- sell_price = what we charge.
--
-- A buy-out may carry a part number that already exists in another division.
-- That is expected -- the same thing can be bought in or made in-house --
-- and nothing is keyed on part number, so the two never collide.
--
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.stock_items
  add column if not exists sell_price numeric not null default 0;


-- ============ Check ============

select 'buy-outs' as step,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'stock_items'
                           and column_name = 'sell_price')
            then 'the sell price has somewhere to live — value stays what you pay'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
