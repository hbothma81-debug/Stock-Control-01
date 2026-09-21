-- A material's price, per supplier.
--
-- Until now a material (a plate grade, a CNC bar grade, a section in a
-- material) had one price, on its own row in master_factor_items, with no
-- supplier. This table holds one row per material per supplier, with when
-- the price was set and by whom. The old price stays where it is and is
-- used when a material has no supplier price yet. Nothing is changed or
-- deleted. Removing a supplier removes that supplier's prices.
--
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.master_supplier_prices (
  id text primary key,
  list_name text not null,
  name text not null,
  grade text not null default '',
  supplier_id text not null references public.master_suppliers(id) on delete cascade,
  price numeric not null default 0,
  set_by text not null default '',
  set_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint master_supplier_prices_one_per_supplier unique (list_name, name, grade, supplier_id)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $body$
begin
  new.updated_at = now();
  return new;
end;
$body$;

drop trigger if exists master_supplier_prices_set_updated_at on public.master_supplier_prices;
create trigger master_supplier_prices_set_updated_at
  before update on public.master_supplier_prices
  for each row execute function public.touch_updated_at();

alter table public.master_supplier_prices enable row level security;

do $do$
declare a text;
begin
  foreach a in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists "Signed-in users can %s master_supplier_prices" on public.master_supplier_prices', a);
    execute format('create policy "Signed-in users can %s master_supplier_prices" on public.master_supplier_prices for %s %s (auth.role() = ''authenticated'')',
      a, a, case when a = 'insert' then 'with check' else 'using' end);
  end loop;
end $do$;

-- ============ Check ============
select 'table master_supplier_prices' as thing,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'master_supplier_prices')
            then 'ready' else 'MISSING' end as status
union all
select 'read, add, change and delete rules',
       (select count(*)::text || ' of 4' from pg_policies
        where schemaname = 'public' and tablename = 'master_supplier_prices');
