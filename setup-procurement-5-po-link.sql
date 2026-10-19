-- Suppliers page, step 5 of the SQL: which purchase order a quote request
-- became.
--
-- "Raise PO from this quote" opens the usual PO window filled from the
-- quote. When the PO is saved, its request moves to Ordered and keeps the
-- PO's id and number here; when that PO is received in Receiving, the
-- request moves to Received (Heinrich, 19 Oct 2026: "yes" to both).
--
-- Two plain columns on procurement_requests; the row rules already there
-- cover them.
--
-- Needs setup-procurement-2-requests.sql first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.procurement_requests add column if not exists po_id text;
alter table public.procurement_requests add column if not exists po_number text;

create index if not exists procurement_requests_po_idx on public.procurement_requests (po_id);


-- ============ Check ============

select 'quote request PO link' as step,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'procurement_requests' and column_name = 'po_number')
            then 'ready - ' || (select count(*) from public.procurement_requests where po_id is not null) || ' requests on a PO'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
