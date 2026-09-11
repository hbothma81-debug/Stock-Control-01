-- Make stock_items.updated_at tell the truth.
--
-- The app refreshes itself every minute. Until now that meant pulling
-- every column of every stock item down again -- about 1.4 MB a minute,
-- per screen, whether anything had changed or not. Four machines left on
-- over a weekend is gigabytes of nothing.
--
-- The fix is to ask only for what changed since last time. That needs a
-- column that is reliably bumped on every write. stock_items HAS an
-- updated_at, but it is only ever set by its default on insert -- an
-- update leaves it at the old value, so an edit would be invisible to a
-- "what changed" query and the shop would see stale prices and counts.
--
-- A trigger, not app code: rows are written from several places and
-- anything that forgets would silently hide that change from everyone
-- else's screen. The database cannot forget.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create or replace function public.stock_items_touch_updated_at()
returns trigger
language plpgsql
as $body$
begin
  new.updated_at = now();
  return new;
end;
$body$;

drop trigger if exists stock_items_set_updated_at on public.stock_items;

create trigger stock_items_set_updated_at
  before update on public.stock_items
  for each row
  execute function public.stock_items_touch_updated_at();

-- Every existing row gets a timestamp from now, so the first incremental
-- refresh after this has a floor to work from rather than a column full
-- of original insert dates.
update public.stock_items set updated_at = now();

create index if not exists stock_items_updated_at_idx
  on public.stock_items (updated_at);


-- ============ Check ============

select 'stock item timestamps' as step,
       case when exists (select 1 from pg_trigger
                         where tgname = 'stock_items_set_updated_at'
                           and not tgisinternal)
            then 'ready — an edit now bumps updated_at, so refreshes can ask only for what changed'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
