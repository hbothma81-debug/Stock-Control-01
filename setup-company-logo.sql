-- Somewhere to keep the company logo.
--
-- The logo was never saved, for anyone, ever. Choosing one showed it on
-- the screen straight away, so it looked like it had worked -- but the
-- column it needed did not exist, and the app never wrote it or read it
-- back either. It lived in memory until the next reload and then went.
--
-- That is why no purchase order, delivery note, process sheet, invoice
-- request or spend report has ever carried a logo.
--
-- One column. Nothing existing is touched.
--
-- Run on PRACTICE and on LIVE. Select nothing before pressing Run.
-- Safe to run more than once.

alter table public.master_company_details
  add column if not exists logo text;


-- ============ Check ============
--
-- Expect one row saying the column is ready. It will say "no logo saved
-- yet" until you upload one on the Company Details screen -- which will
-- now stick.

select 'logo column' as finding,
       case
         when exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = 'master_company_details'
             and column_name = 'logo'
         ) then 'ready'
         else 'MISSING - the statement above did not run'
       end as status,
       coalesce(
         (select case when logo is null or logo = '' then 'no logo saved yet'
                      else 'logo saved, ' || length(logo) || ' characters' end
          from public.master_company_details limit 1),
         'no company details row yet'
       ) as detail;
