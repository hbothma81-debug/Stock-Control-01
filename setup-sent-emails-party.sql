-- Who an email was for: the customer or the supplier, by name.
--
-- The app does not know which of a customer's contacts gets the invoices
-- (often a creditors address, not the buyer). With the name kept on each
-- sent email, the invoice window can open with wherever that customer's
-- last invoice went, instead of making somebody look it up every time.
--
-- The app works without this column: it then saves the record without the
-- name, and the To box simply starts empty.
--
-- Needs setup-sent-emails.sql first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.sent_emails add column if not exists party_name text;

create index if not exists sent_emails_party_idx
  on public.sent_emails (document_type, party_name, sent_at desc);


-- ============ Check ============

select 'sent emails: who it was for' as step,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'sent_emails'
                           and column_name = 'party_name')
            then 'ready — the invoice window can remember where a customer''s last invoice went'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
