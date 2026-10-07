-- The customer's revision on a Customer Stock part (Heinrich, 7 Oct 2026).
--
-- The customer-stock importer has read a Revision column since August,
-- and the Stock Codes screen has a "Cust. rev" box, but no column ever
-- held the value: it lived in memory until the next reload. The 1,732
-- parts imported on 31 Aug 2026 lost theirs that way. This adds the
-- column; the revisions come back by re-importing the customer sheets
-- (update mode, which never touches quantity), or by typing them.
--
-- The app reads and writes it only once a loaded row shows the column
-- exists (stockHasCustomerRevision in src/App.jsx), so it works before
-- and after this is run. Run on PRACTICE first. Safe to run more than once.

alter table public.stock_items add column if not exists customer_revision text;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'stock_items' and column_name = 'customer_revision';
