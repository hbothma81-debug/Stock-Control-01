-- Run this once in Supabase → SQL Editor → New query, then Run.
-- Adds real item-level tracking to a job: status per quoted item (on the
-- floor, sent out to an external supplier, ready to invoice, invoiced),
-- and links a delivery note to the specific item it's carrying.

alter table job_quote_items add column if not exists item_status text not null default 'on_floor';
-- item_status values: on_floor | out_external | ready_to_invoice | invoiced

alter table delivery_notes add column if not exists quote_item_id uuid references job_quote_items(id) on delete set null;
alter table delivery_notes add column if not exists direction text not null default 'to_supplier';
-- direction values: to_supplier | to_customer

alter table delivery_notes add column if not exists checked_back_in_at timestamptz;
alter table delivery_notes add column if not exists checked_back_in_by text;
