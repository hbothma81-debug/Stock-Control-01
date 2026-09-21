-- A record of every email sent from the app.
--
-- The email itself leaves through the sender's own Outlook mailbox and
-- sits in their Sent Items. This table is the app's side of it: which
-- document went, to whom, when and from whose mailbox, so a purchase
-- order can say "Emailed 21 Sep 14:05 to orders@supplier.co.za by ...".
--
-- Anybody signed in can read it and add to it. Nobody can edit or delete
-- a line: there is deliberately no update or delete policy, so the record
-- of what was sent cannot be changed afterwards.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.sent_emails (
  id            uuid primary key default gen_random_uuid(),
  sent_at       timestamptz not null default now(),
  sent_by       text,
  sent_by_user  uuid default auth.uid(),
  from_address  text,
  to_addresses  text[] not null default '{}',
  cc_addresses  text[] not null default '{}',
  subject       text,
  document_type text not null,
  related_id    text,
  job_id        uuid,
  file_name     text,
  test_mode     boolean not null default false
);

create index if not exists sent_emails_document_idx
  on public.sent_emails (document_type, related_id, sent_at desc);

alter table public.sent_emails enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sent_emails'
                 and policyname = 'Signed-in users can read sent emails') then
    create policy "Signed-in users can read sent emails"
      on public.sent_emails for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sent_emails'
                 and policyname = 'Signed-in users can record a sent email') then
    create policy "Signed-in users can record a sent email"
      on public.sent_emails for insert
      with check (auth.role() = 'authenticated');
  end if;
end $do$;


-- ============ Check ============

select 'sent emails' as step,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'sent_emails')
            then 'ready — every email sent from the app is recorded, add only'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
