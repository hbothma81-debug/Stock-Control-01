-- Procurement page, step 2 of the SQL: the quote request register.
--
-- One row per quote request sent to a supplier, as the PR-001.. register
-- in the Procurement folder keeps it today.
--
-- Who sees a row:
--   * a request from a person's own mailbox (Drawings@ for Heinrich) is
--     theirs alone: owner_id is that person.
--   * a request from a shared mailbox (sales@) has no owner_id and is seen
--     by everyone with the Procurement tick.
-- Nobody without the tick sees any row. A row is never deleted: a mail
-- the page took for a request by mistake is marked "Not a request", so
-- the next mailbox refresh does not bring it back.
--
-- Needs setup-procurement-1-access.sql first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.procurement_requests (
  id                  uuid primary key default gen_random_uuid(),
  pr_number           text not null unique,
  mailbox             text not null,
  owner_id            uuid references auth.users(id) on delete set null,
  supplier_id         text references public.master_suppliers(id) on delete set null,
  supplier_name       text not null default '',
  contact_email       text not null default '',
  item                text not null default '',
  qty                 text not null default '',
  old_quote           text not null default '',
  status              text not null default 'Sent' check (status in ('Draft', 'Sent', 'Reply',
                        'Pro forma', 'Paid', 'Ordered', 'Received', 'Closed', 'Not a request')),
  requested_at        timestamptz,
  waiting_since       date,
  chases              integer not null default 0,
  notes               text not null default '',
  conversation_id     text,
  request_message_id  text,
  reply_message_id    text,
  reminder_message_id text,
  created_at          timestamptz not null default now(),
  created_by          text,
  updated_at          timestamptz not null default now(),
  updated_by          text
);

create unique index if not exists procurement_requests_message_idx
  on public.procurement_requests (mailbox, request_message_id);
create index if not exists procurement_requests_conversation_idx
  on public.procurement_requests (conversation_id);

-- A row is the person's own, or from a shared mailbox in app_settings.
create or replace function public.procurement_row_visible(p_owner uuid, p_mailbox text)
returns boolean
language sql
security definer
stable
set search_path = public
as $body$
  select public.can_procure() and (
    p_owner = auth.uid()
    or (p_owner is null and lower(p_mailbox) = any (
          select lower(m) from public.app_settings s, unnest(s.procurement_shared_mailboxes) m where s.id)));
$body$;

grant execute on function public.procurement_row_visible(uuid, text) to authenticated;

alter table public.procurement_requests enable row level security;

drop policy if exists "Procurement people read their requests" on public.procurement_requests;
create policy "Procurement people read their requests" on public.procurement_requests
  for select to authenticated using (public.procurement_row_visible(owner_id, mailbox));

drop policy if exists "Procurement people add requests" on public.procurement_requests;
create policy "Procurement people add requests" on public.procurement_requests
  for insert to authenticated with check (public.procurement_row_visible(owner_id, mailbox));

drop policy if exists "Procurement people update their requests" on public.procurement_requests;
create policy "Procurement people update their requests" on public.procurement_requests
  for update to authenticated
  using (public.procurement_row_visible(owner_id, mailbox))
  with check (public.procurement_row_visible(owner_id, mailbox));


-- ============ Check ============

select 'procurement requests' as step,
       case when exists (select 1 from pg_policies where schemaname = 'public'
                         and tablename = 'procurement_requests' and cmd = 'UPDATE')
            then 'ready - ' || (select count(*) from public.procurement_requests) || ' requests'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
