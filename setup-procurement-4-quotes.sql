-- Suppliers page, step 4 of the SQL: saved supplier quotes.
--
-- Every PDF a supplier sends in a quote request's thread (a quote, a pro
-- forma, an invoice) is saved here when the page reads the mailbox, with
-- the file kept in the private "supplier-quotes" store. Claude then reads
-- each one once and fills in the figures (Heinrich, 19 Oct 2026: "auto").
-- If it cannot, read_status says so; the PDF is kept either way.
--
-- Who sees them: everyone with the Procurement tick, all quotes, Drawings@
-- ones included (Heinrich: "they can see all"). Nobody else. Only an admin
-- can remove one. No bank details are read or kept.
--
-- Needs setup-procurement-1-access.sql and -2 first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.supplier_quotes (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid references public.procurement_requests(id) on delete set null,
  pr_number       text,
  supplier_id     text references public.master_suppliers(id) on delete set null,
  supplier_name   text not null default '',
  mailbox         text not null default '',
  message_id      text not null,
  file_name       text not null,
  storage_path    text not null,
  file_size       integer,
  received_at     timestamptz,
  -- Filled by the Claude reader (setup-claude-reader-1-log.sql keeps the cost).
  read_status     text not null default 'waiting'
                  check (read_status in ('waiting', 'read', 'not read', 'over cap')),
  read_note       text not null default '',
  doc_type        text,
  quote_number    text,
  quote_date      date,
  total_ex_vat    numeric(14,2),
  total_incl_vat  numeric(14,2),
  lead_time       text,
  valid_until     date,
  lines           jsonb,
  created_at      timestamptz not null default now(),
  created_by      text
);

create unique index if not exists supplier_quotes_file_idx on public.supplier_quotes (message_id, file_name);
create index if not exists supplier_quotes_supplier_idx on public.supplier_quotes (supplier_id, received_at desc);
create index if not exists supplier_quotes_request_idx on public.supplier_quotes (request_id);
create index if not exists supplier_quotes_received_idx on public.supplier_quotes (received_at desc);

alter table public.supplier_quotes enable row level security;

drop policy if exists "Procurement people read quotes" on public.supplier_quotes;
create policy "Procurement people read quotes" on public.supplier_quotes
  for select to authenticated using (public.can_procure());

drop policy if exists "Procurement people save quotes" on public.supplier_quotes;
create policy "Procurement people save quotes" on public.supplier_quotes
  for insert to authenticated with check (public.can_procure());

drop policy if exists "Procurement people correct quotes" on public.supplier_quotes;
create policy "Procurement people correct quotes" on public.supplier_quotes
  for update to authenticated using (public.can_procure()) with check (public.can_procure());

drop policy if exists "Admins remove quotes" on public.supplier_quotes;
create policy "Admins remove quotes" on public.supplier_quotes
  for delete to authenticated using (public.can_procure() and public.is_admin());


-- ============ The PDFs ============

insert into storage.buckets (id, name, public)
values ('supplier-quotes', 'supplier-quotes', false)
on conflict (id) do nothing;

drop policy if exists "Procurement people read supplier quote files" on storage.objects;
create policy "Procurement people read supplier quote files" on storage.objects
  for select to authenticated using (bucket_id = 'supplier-quotes' and public.can_procure());

drop policy if exists "Procurement people save supplier quote files" on storage.objects;
create policy "Procurement people save supplier quote files" on storage.objects
  for insert to authenticated with check (bucket_id = 'supplier-quotes' and public.can_procure());

drop policy if exists "Admins remove supplier quote files" on storage.objects;
create policy "Admins remove supplier quote files" on storage.objects
  for delete to authenticated using (bucket_id = 'supplier-quotes' and public.can_procure() and public.is_admin());


-- ============ Check ============

select 'supplier quotes' as step,
       case when to_regclass('public.supplier_quotes') is not null
             and exists (select 1 from storage.buckets where id = 'supplier-quotes')
            then 'ready - ' || (select count(*) from public.supplier_quotes) || ' quotes saved'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
