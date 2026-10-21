-- PR-043 was filed as Allpress; it went to Boxit (Heinrich, 21 Oct 2026).
-- The app matched suppliers by the part after the @, and Allpress's address
-- is marinapieterse@outlook.com, so boxitlibradenesunette@outlook.com read as
-- Allpress. The app is fixed (mailRules.js, matchKey); this mends the one
-- request already saved: adds Boxit to the supplier list, and moves PR-043,
-- its four quotes (old ones from the same thread stay, by his answer) and any
-- stock item linked to them from Allpress to Boxit. Touches only rows that
-- still read Allpress with Boxit's address; run twice, the second run does
-- nothing. The last part lists any OTHER request sent to a free email
-- address that is not on its supplier's addresses (the same fault).
-- LIVE. Select nothing before pressing Run.

begin;

insert into public.master_suppliers (id, name, email)
select 'pr' || left(md5('boxit'), 6), 'Boxit', 'boxitlibradenesunette@outlook.com'
where not exists (select 1 from public.master_suppliers where lower(trim(name)) = 'boxit')
on conflict (id) do nothing;

update public.stock_item_quotes l set supplier_name = 'Boxit'
from public.supplier_quotes q join public.procurement_requests r on r.id = q.request_id
where l.quote_id = q.id and l.supplier_name = 'Allpress'
  and r.pr_number = 'PR-043' and lower(r.contact_email) = 'boxitlibradenesunette@outlook.com';

update public.supplier_quotes q
set supplier_id = (select id from public.master_suppliers where lower(trim(name)) = 'boxit' limit 1), supplier_name = 'Boxit'
from public.procurement_requests r
where r.id = q.request_id and q.supplier_name = 'Allpress'
  and r.pr_number = 'PR-043' and lower(r.contact_email) = 'boxitlibradenesunette@outlook.com';

update public.procurement_requests
set supplier_id = (select id from public.master_suppliers where lower(trim(name)) = 'boxit' limit 1),
    supplier_name = 'Boxit', updated_at = now(), updated_by = 'FIX PR-043 Boxit'
where pr_number = 'PR-043' and supplier_name = 'Allpress' and lower(contact_email) = 'boxitlibradenesunette@outlook.com';

commit;

-- The result, and any other request with the same fault. The free email
-- list mirrors FREE_MAIL in src/procurement/mailRules.js.
select 'PR-043 now' as what, r.pr_number, r.supplier_name, r.contact_email,
       (select count(*) from public.supplier_quotes q where q.request_id = r.id and q.supplier_name = 'Boxit')::text || ' quotes on Boxit' as detail
from public.procurement_requests r where r.pr_number = 'PR-043'
union all
select 'CHECK other: free email not on its supplier', r.pr_number, r.supplier_name, r.contact_email, 'supplier list has ' || coalesce(nullif(s.email, ''), 'no email')
from public.procurement_requests r join public.master_suppliers s on s.id = r.supplier_id
where split_part(lower(r.contact_email), '@', 2) in ('gmail.com','googlemail.com','outlook.com','outlook.co.za','hotmail.com','hotmail.co.za','hotmail.co.uk','live.com','live.co.za','msn.com','yahoo.com','yahoo.co.za','yahoo.co.uk','ymail.com','icloud.com','me.com','mac.com','aol.com','protonmail.com','proton.me','gmx.com','gmx.net','mail.com','zoho.com','mweb.co.za','telkomsa.net','vodamail.co.za','webmail.co.za','iafrica.com','absamail.co.za','lantic.net','wol.co.za','polka.co.za','afrihost.co.za','cybersmart.co.za','global.co.za','netactive.co.za')
  and lower(r.contact_email) <> lower(s.email)
  and not exists (select 1 from public.master_supplier_contacts c where c.supplier_id = r.supplier_id and lower(c.email) = lower(r.contact_email))
order by 1 desc, 2;
