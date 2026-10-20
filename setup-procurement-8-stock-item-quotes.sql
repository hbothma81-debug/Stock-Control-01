-- Suppliers page, step 8 of the SQL: a quoted item linked to a stock item.
--
-- On Suppliers -> Items quoted, "Link to a stock item" ties one line of a
-- saved supplier quote to a Customer Stock item (Heinrich, 20 Oct 2026:
-- "b with a tick", "mainly for customer items"). The item then shows "Last
-- quoted: Neuc R 91,00, 9 Oct (QUO0001816)", which opens the quote. The
-- item's own price changes only when the person ticks "Also use this as
-- the item's price" (that is the stock item's own save, not this table).
--
-- Each line keeps the supplier, price, date and quote number itself, so the
-- stock screen shows it without reading supplier_quotes. Anyone signed in
-- may read the lines (the stock screen shows them only to people who may
-- see values); only people with the Procurement tick add or remove one.
--
-- Needs setup-procurement-4-quotes.sql first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.stock_item_quotes (
  id              uuid primary key default gen_random_uuid(),
  stock_item_id   text not null references public.stock_items(id) on delete cascade,
  quote_id        uuid not null references public.supplier_quotes(id) on delete cascade,
  line_index      integer not null,
  description     text not null default '',
  unit_price      numeric(14,2),
  supplier_name   text not null default '',
  quote_number    text,
  quote_date      date,
  used_as_price   boolean not null default false,
  linked_by       text,
  linked_at       timestamptz not null default now()
);

create unique index if not exists stock_item_quotes_line_idx
  on public.stock_item_quotes (stock_item_id, quote_id, line_index);
create index if not exists stock_item_quotes_item_idx
  on public.stock_item_quotes (stock_item_id, quote_date desc);

alter table public.stock_item_quotes enable row level security;

drop policy if exists "Signed-in users read stock item quotes" on public.stock_item_quotes;
create policy "Signed-in users read stock item quotes" on public.stock_item_quotes
  for select to authenticated using (true);

drop policy if exists "Procurement people link stock item quotes" on public.stock_item_quotes;
create policy "Procurement people link stock item quotes" on public.stock_item_quotes
  for insert to authenticated with check (public.can_procure());

drop policy if exists "Procurement people unlink stock item quotes" on public.stock_item_quotes;
create policy "Procurement people unlink stock item quotes" on public.stock_item_quotes
  for delete to authenticated using (public.can_procure());


-- ============ Check ============

select 'stock item quotes' as step,
       case when to_regclass('public.stock_item_quotes') is not null
            then 'ready - ' || (select count(*) from public.stock_item_quotes) || ' quoted items linked'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
