-- The staff's email signatures on LIVE, from their Outlook ones (Heinrich,
-- 20 Oct 2026: "you add"). Run setup-email-signatures.sql first.
--
-- Each person is found by their login's name or email. A signature is
-- saved only when exactly ONE login matches and that login has none saved
-- yet, so running it twice changes nothing and a person who already
-- changed their own keeps it. The table at the end shows who was found.
-- Anyone "NOT FOUND" or "SEVERAL LOGINS" gets no signature: tell Claude
-- which login is theirs.

with wanted(who, pattern, signature) as (values
  ('Heinrich Bothma', '%drawings@ersupplies%',
   E'Regards\n\nHeinrich Bothma\n\nTel: (010) 880 5268\nCell:   072 422 3092\nEmail : drawings@ersupplies.co.za\nEmail: sales@ersupplies.co.za\n\nEastrand Engineering and Transmission Supplies'),
  ('Mark Bezuidenhout', '%mark%',
   E'Kind Regards\nMark Bezuidenhout\n\nTel:  +27 10 880 5268\nCell:  +27 72 190 1246\nEmail : sales@ersupplies.co.za\n\nEastrand Engineering and Transmission Supplies'),
  ('Andries de Klerk', '%andries%',
   E'Kind Regards\nAndries de Klerk\n\nTel:  +27 10 880 5268\nCell:  +27 79 555 6537\nEmail : sales@ersupplies.co.za\n\nEastrand Engineering and Transmission Supplies'),
  ('Gawie Labuschagne', '%gawie%',
   E'Kind Regards,\nGawie Labuschagne\n\nTel:  +27 10 880 5268\nCell:  +27 84 308 0063\nEmail :  sales@ersupplies.co.za\n\nEastrand Engineering and Transmission Supplies')
),
found as (
  select w.who, w.signature, array_agg(p.id) filter (where p.id is not null) as ids,
         string_agg(coalesce(p.name, '') || ' <' || coalesce(p.email, '') || '>', ', ') as logins
  from wanted w
  left join public.profiles p on p.name ilike w.pattern or p.email ilike w.pattern
  group by w.who, w.signature
),
saved as (
  insert into public.email_signatures (user_id, signature, updated_by)
  select f.ids[1], f.signature, 'set up by Heinrich'
  from found f
  where cardinality(f.ids) = 1
  on conflict (user_id) do nothing
  returning user_id
)
select f.who,
       case when f.ids is null then 'NOT FOUND - no login matches'
            when cardinality(f.ids) > 1 then 'SEVERAL LOGINS - nothing saved: ' || f.logins
            when exists (select 1 from saved s where s.user_id = f.ids[1]) then 'saved for ' || f.logins
            else 'already had one - left as it is: ' || f.logins end as result
from found f
order by f.who;
