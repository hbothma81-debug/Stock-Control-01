-- Email signatures: each person's own, under every email the app sends.
--
-- Heinrich, 20 Oct 2026: "should be on all depending on who is signed in,
-- each person can add there own signiture if that helps, but the font,
-- colour and company logo should be automatic". The app writes the text in
-- dark blue bold with the logo from Company Details under it
-- (src/email/signature.js); this table holds only the words, one row per
-- login. A login with no row signs with a signature the app makes from its
-- name, the company phone and the mailbox the email goes from.
--
-- A person reads and changes only their own row; an admin any row (setting
-- them up for the staff). Nobody deletes: an empty signature means "make
-- one for me".
--
-- Needs setup-lock-deleting.sql first (public.is_admin()).
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.email_signatures (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  signature   text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.email_signatures enable row level security;

drop policy if exists "Own or admin reads email signatures" on public.email_signatures;
create policy "Own or admin reads email signatures" on public.email_signatures
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Own or admin adds email signatures" on public.email_signatures;
create policy "Own or admin adds email signatures" on public.email_signatures
  for insert to authenticated with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "Own or admin changes email signatures" on public.email_signatures;
create policy "Own or admin changes email signatures" on public.email_signatures
  for update to authenticated using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());


-- ============ Check ============

select 'email signatures' as step,
       case when to_regclass('public.email_signatures') is not null
            then 'ready - ' || (select count(*) from public.email_signatures) || ' signatures saved'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
