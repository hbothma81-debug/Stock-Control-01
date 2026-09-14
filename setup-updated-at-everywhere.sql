-- Four more tables learn when they were last changed.
--
-- The app's background refresh downloads requisitions, purchase orders,
-- the usage log and your notifications whole, every time, changed or
-- not. That is most of what a refresh still costs after stock was fixed
-- on 11 Sep. Asking only for "what changed since last time" needs a
-- column the database bumps on every write -- the same thing
-- setup-stock-items-updated-at.sql did for stock.
--
-- None of these four had an updated_at at all, only created_at. This
-- adds it (every existing row starts at now, which is what the first
-- incremental refresh needs as a floor), and one trigger that keeps it
-- honest on every update from any screen.
--
-- Notifications get it too, rather than "only fetch new ones": marking
-- one read is an update, and a new-only fetch would never see you read
-- it on another PC.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $body$
begin
  new.updated_at = now();
  return new;
end;
$body$;


-- ============ requisitions ============
alter table public.requisitions
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists requisitions_set_updated_at on public.requisitions;
create trigger requisitions_set_updated_at
  before update on public.requisitions
  for each row execute function public.touch_updated_at();
create index if not exists requisitions_updated_at_idx on public.requisitions (updated_at);


-- ============ purchase_orders ============
alter table public.purchase_orders
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.touch_updated_at();
create index if not exists purchase_orders_updated_at_idx on public.purchase_orders (updated_at);


-- ============ usage_log ============
alter table public.usage_log
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists usage_log_set_updated_at on public.usage_log;
create trigger usage_log_set_updated_at
  before update on public.usage_log
  for each row execute function public.touch_updated_at();
create index if not exists usage_log_updated_at_idx on public.usage_log (updated_at);


-- ============ job_notifications ============
alter table public.job_notifications
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists job_notifications_set_updated_at on public.job_notifications;
create trigger job_notifications_set_updated_at
  before update on public.job_notifications
  for each row execute function public.touch_updated_at();
create index if not exists job_notifications_updated_at_idx on public.job_notifications (updated_at);


-- ============ Check ============
-- Four rows, all "ready".

select t.table_name,
       case when exists (select 1 from information_schema.columns c
                         where c.table_schema = 'public' and c.table_name = t.table_name
                           and c.column_name = 'updated_at')
             and exists (select 1 from pg_trigger g
                         where g.tgname = t.table_name || '_set_updated_at' and not g.tgisinternal)
            then 'ready'
            else 'SOMETHING IS MISSING - tell Claude' end as result
from (values ('requisitions'), ('purchase_orders'), ('usage_log'), ('job_notifications')) as t(table_name)
order by 1;
