-- Quoting and the bill of materials: step one, the database.
--
-- The plan is docs/QUOTING-AND-BOM-PLAN.md. This file adds every table
-- and column the whole build needs, all at once and all blank, so the
-- steps after it are code only. Nothing on any screen changes when
-- this runs: no screen reads any of it yet.
--
-- What it adds, in plain words:
--
--   quotes and what is on them      quotes, quote_items, quote_cost_lines,
--                                   quote_parts
--   the lists quoting reads         quote_processes, quote_rates,
--                                   quote_cutting_speeds, and a quote
--                                   number counter
--   a recipe saved to Stock Manager bom_parts, bom_stages, bom_events, and
--                                   four recipe_* columns on stock_items
--   the history of a stock item     stock_item_events
--   a job made from a quote         columns on jobs, job_quote_items and
--                                   job_cut_items
--   the hinge                       one tick on process_type_settings
--   who may do what                 four permissions on profiles
--   where quote PDFs go             a private storage bucket, quotes
--
-- Two things it deliberately does NOT do:
--
--   * It does not blank the "assembly" cut method on any line or part.
--     Those rows get recipe_kind = 'fabrication' as well, but keep their
--     cut method until the app reads recipe_kind. Blanking it now would
--     put those lines onto every cutting stage tomorrow morning.
--   * It does not add a quote_documents table. Quote PDFs go through
--     generated_documents, the table purchase orders already use, with
--     document_type = 'quote'.
--
-- Select nothing before pressing Run. Safe to run more than once.
-- Run it on the PRACTICE database first, then on live.


-- ============ 1. Quotes ============
--
-- One row per quote. A revision is a new row with the same number and
-- the next letter, pointing back at the one it replaces, so what the
-- customer was sent always still exists.

create table if not exists quotes (
  id                 uuid primary key default gen_random_uuid(),
  quote_number       text not null,
  revision           text not null default 'A',
  supersedes_id      uuid references quotes(id) on delete set null,

  customer           text not null default '',
  contact_name       text not null default '',
  contact_email      text not null default '',
  contact_phone      text not null default '',
  project            text not null default '',

  -- draft -> sent -> accepted | lost | expired
  status             text not null default 'draft',
  lost_reason        text not null default '',

  sales_rep          text not null default '',
  sales_rep_id       uuid references profiles(id) on delete set null,

  quote_date         date not null default current_date,
  valid_until        date,
  delivery_lead_time text not null default '',
  custom_instructions text not null default '',
  terms_text         text not null default '',
  vat_rate           numeric not null default 15,
  notes              text not null default '',

  -- Set when the items were saved to Stock Manager as recipes.
  saved_to_stock_manager_at timestamptz,
  -- The job an accepted quote became.
  converted_job_id   uuid references jobs(id) on delete set null,

  created_by         text not null default '',
  created_by_id      uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (quote_number, revision)
);

alter table quotes drop constraint if exists quotes_status_check;
alter table quotes add constraint quotes_status_check
  check (status in ('draft', 'sent', 'accepted', 'lost', 'expired'));

create index if not exists quotes_customer_idx on quotes (customer);
create index if not exists quotes_status_idx   on quotes (status);


-- ============ 2. The things a quote sells ============
--
-- Item 1, item 2. Each is loose parts, a set, or a fabrication, and is
-- priced as a whole or per part.

create table if not exists quote_items (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references quotes(id) on delete cascade,
  sort_order      integer not null default 0,
  description     text not null,

  kind            text not null default 'loose',     -- loose | set | fabrication
  pricing         text not null default 'whole',     -- whole | per_part
  joined_at       text not null default '',          -- '' | welded | bolted

  unit            text not null default 'ea',
  qty             numeric not null default 1,
  -- A typed price per unit, used until the lines beneath are built.
  sell_rate       numeric not null default 0,
  cost_total      numeric not null default 0,
  sell_total      numeric not null default 0,
  weight_kg       numeric not null default 0,

  -- The stock_items row this item was saved as, or picked from. Text,
  -- no foreign key: stock ids are text, and a retired recipe must not
  -- take a quote with it.
  recipe_item_id  text,
  notes           text not null default ''
);

alter table quote_items drop constraint if exists quote_items_kind_check;
alter table quote_items add constraint quote_items_kind_check
  check (kind in ('loose', 'set', 'fabrication'));
alter table quote_items drop constraint if exists quote_items_pricing_check;
alter table quote_items add constraint quote_items_pricing_check
  check (pricing in ('whole', 'per_part'));
alter table quote_items drop constraint if exists quote_items_joined_at_check;
alter table quote_items add constraint quote_items_joined_at_check
  check (joined_at in ('', 'welded', 'bolted'));

create index if not exists quote_items_quote_idx on quote_items (quote_id);


-- ============ 3. The cost lines under an item ============
--
-- 1.1 Laser, 1.2 CNC, 1.3 Welding. The process name and calculator are
-- copied in, so an old quote still reads correctly after a process is
-- renamed or retired. `inputs` holds whatever that process asked for
-- (cut length, pierces, billet diameter, weld metres) as one field,
-- because every process asks different questions.

create table if not exists quote_cost_lines (
  id               uuid primary key default gen_random_uuid(),
  quote_item_id    uuid not null references quote_items(id) on delete cascade,
  sort_order       integer not null default 0,

  quote_process_id uuid,
  process_name     text not null default '',
  calculator       text not null default '',
  description      text not null default '',
  basis            text not null default '',   -- which pricing basis, where a process has several
  inputs           jsonb not null default '{}'::jsonb,

  unit             text not null default 'sum',
  qty              numeric not null default 1,
  cost_rate        numeric not null default 0,
  markup_percent   numeric not null default 0,
  cost_amount      numeric not null default 0,
  sell_amount      numeric not null default 0
);

create index if not exists quote_cost_lines_item_idx on quote_cost_lines (quote_item_id);


-- ============ 4. The parts under a cost line ============
--
-- The laser line holds the laser parts, the CNC line the turned parts,
-- and so on: which line a part sits under is its cut method. A part may
-- be linked to a Stock Code or simply typed; a typed one gets a Stock
-- Code only if the quote is saved to Stock Manager. Quantities are per
-- one item, because a quote is one set.

create table if not exists quote_parts (
  id                 uuid primary key default gen_random_uuid(),
  quote_cost_line_id uuid not null references quote_cost_lines(id) on delete cascade,
  sort_order         integer not null default 0,

  linked_item_id     text,                       -- stock_items.id, no foreign key
  part_number        text not null default '',
  description        text not null default '',
  qty                numeric not null default 1,
  material           text not null default '',
  thickness          text not null default '',
  unit_cost          numeric not null default 0,
  unit_sell          numeric not null default 0,

  -- Cut to size: the same fields the job's cut list uses.
  section            text not null default '',
  grade              text not null default '',
  cut_length_mm      numeric not null default 0,
  stock_length_m     numeric not null default 6,

  -- Buy-outs and stores.
  supplier           text not null default '',

  notes              text not null default ''
);

create index if not exists quote_parts_line_idx on quote_parts (quote_cost_line_id);


-- ============ 5. The lists quoting reads ============
--
-- Quote Processes: what the Add step dropdown offers. Separate from Job
-- Process Types by decision; job_stages says which stages a process
-- means on the job (a laser line means Nesting, Laser Operator and
-- Packer). Left empty here; set on screen once the list has a screen.
--
-- Seeded with the processes the workbook uses. "on conflict do nothing"
-- keeps whatever is already there on a second run.

create table if not exists quote_processes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  calculator   text not null default 'price',   -- laser | tube_laser | cnc | cut_to_size | stores | welding | rate_count | surface | price
  holds_parts  boolean not null default false,
  job_stages   text[] not null default '{}',
  sort_order   integer not null default 0,
  active       boolean not null default true
);

insert into quote_processes (name, calculator, holds_parts, sort_order) values
  ('Laser',          'laser',       true,  10),
  ('Tube laser',     'tube_laser',  true,  20),
  ('CNC',            'cnc',         true,  30),
  ('Cut to size',    'cut_to_size', true,  40),
  ('From stores',    'stores',      true,  50),
  ('Welding',        'welding',     false, 60),
  ('Bending',        'rate_count',  false, 70),
  ('Rolling',        'rate_count',  false, 80),
  ('Surface finish', 'surface',     false, 90),
  ('Galvanising',    'surface',     false, 100),
  ('Powder coating', 'surface',     false, 110),
  ('Plating',        'surface',     false, 120)
on conflict (name) do nothing;

-- Rates: the numbers that are Heinrich's to set. Seeded from the
-- workbook (ERS QU226339) so the first quote prices the way the last
-- one did.

create table if not exists quote_rates (
  name   text primary key,
  value  numeric not null default 0,
  unit   text not null default '',
  note   text not null default ''
);

insert into quote_rates (name, value, unit, note) values
  ('laser_rate_per_m',      30,   'R/m',   'laser cutting, per metre of cut'),
  ('laser_pierce',          5,    'R each','per pierce'),
  ('laser_handling',        8,    'R/kg',  'handling fee by weight'),
  ('laser_per_hour',        1500, 'R/hr',  'laser time'),
  ('cnc_machine_1_per_hour', 750, 'R/hr',  'CNC machine 1'),
  ('cnc_machine_2_per_hour', 500, 'R/hr',  'CNC machine 2'),
  ('cnc_machine_3_per_hour', 350, 'R/hr',  'CNC machine 3'),
  ('cnc_setup',             750,  'R',     'CNC setup, once off'),
  ('default_markup_percent', 60,  '%',     'the workbook''s selling factor')
on conflict (name) do nothing;

-- Thickness to cutting speed, the laser take-off table from the workbook.

create table if not exists quote_cutting_speeds (
  thickness_mm       numeric primary key,
  metres_per_minute  numeric not null
);

insert into quote_cutting_speeds (thickness_mm, metres_per_minute) values
  (1.2, 18), (1.6, 15), (2, 12), (2.5, 10), (3, 8), (4, 6), (4.5, 6),
  (5, 5), (5.5, 4.5), (6, 3.5), (8, 1.8), (10, 1.2), (12, 0.6)
on conflict (thickness_mm) do nothing;

-- The quote number counter, next to the job and PO counters. Starts at
-- QU-0001 by decision; the old QU2263xx series stays with the workbook.

insert into master_counters (counter_name, value) values ('nextQuoteNumber', 1)
on conflict (counter_name) do nothing;


-- ============ 6. A recipe saved to Stock Manager ============
--
-- A recipe is a stock_items row (the set or fabrication itself) plus the
-- rows below. recipe_kind says which; '' is a plain part.

alter table stock_items add column if not exists recipe_kind      text not null default '';
alter table stock_items add column if not exists recipe_pricing   text not null default '';
alter table stock_items add column if not exists recipe_joined_at text not null default '';
alter table stock_items add column if not exists recipe_revision  text not null default '';

alter table stock_items drop constraint if exists stock_items_recipe_kind_check;
alter table stock_items add constraint stock_items_recipe_kind_check
  check (recipe_kind in ('', 'set', 'fabrication'));
alter table stock_items drop constraint if exists stock_items_recipe_pricing_check;
alter table stock_items add constraint stock_items_recipe_pricing_check
  check (recipe_pricing in ('', 'whole', 'per_part'));
alter table stock_items drop constraint if exists stock_items_recipe_joined_at_check;
alter table stock_items add constraint stock_items_recipe_joined_at_check
  check (recipe_joined_at in ('', 'welded', 'bolted'));

-- Parts already tagged "assembly" are fabrications. They keep their cut
-- method for now (see the top of this file).
update stock_items
   set recipe_kind = 'fabrication'
 where made_on = 'assembly' and recipe_kind = '';

-- What is inside a recipe. No foreign keys on purpose: a retired part
-- shows as "part missing" on the recipe rather than taking it away.
-- Whether a line is cut here or bought in is read from the item it
-- points at, not stored twice.

create table if not exists bom_parts (
  id              uuid primary key default gen_random_uuid(),
  parent_item_id  text not null,      -- the set or fabrication, a stock_items row
  part_item_id    text not null,      -- what is inside it, also a stock_items row
  qty_per_set     numeric not null default 1,
  sort_order      integer not null default 0,

  -- For a sawn part, the same fields the job's cut list uses.
  section         text not null default '',
  grade           text not null default '',
  cut_length_mm   numeric not null default 0,
  stock_length_m  numeric not null default 6,

  notes           text not null default ''
);

create index if not exists bom_parts_parent_idx on bom_parts (parent_item_id);

-- The stages a recipe's parts go through, so a job that loads it gets
-- them without anyone ticking.

create table if not exists bom_stages (
  id              uuid primary key default gen_random_uuid(),
  parent_item_id  text not null,
  process_name    text not null,
  sort_order      integer not null default 0
);

create index if not exists bom_stages_parent_idx on bom_stages (parent_item_id);

-- The recipe's history: who changed what, when. Add-only, like the job
-- history. Nobody can edit or delete an entry.

create table if not exists bom_events (
  id              uuid primary key default gen_random_uuid(),
  parent_item_id  text not null,
  action          text not null,
  detail          text not null default '',
  acted_by        text not null default '',
  acted_by_id     uuid,
  acted_at        timestamptz not null default now()
);

create index if not exists bom_events_parent_idx on bom_events (parent_item_id, acted_at desc);


-- ============ 7. The history of a stock item ============
--
-- For the Stock Manager lock: every change made through Edit item is
-- written here, one row per field changed. Add-only.

create table if not exists stock_item_events (
  id           uuid primary key default gen_random_uuid(),
  item_id      text not null,
  field        text not null,
  old_value    text not null default '',
  new_value    text not null default '',
  acted_by     text not null default '',
  acted_by_id  uuid,
  acted_at     timestamptz not null default now()
);

create index if not exists stock_item_events_item_idx on stock_item_events (item_id, acted_at desc);


-- ============ 8. A job made from a quote or a recipe ============

-- The quote a job came from.
alter table jobs add column if not exists quote_id uuid references quotes(id) on delete set null;

-- On a job line: which parent it belongs to (a fabrication's child, or a
-- per-set BOM's part), which recipe it was loaded from and how many, and
-- the recipe and drawing revision at the moment it was loaded, so a job
-- says what it was built to even after the recipe or the drawing moves
-- on. A child goes with its parent when the parent is removed.
alter table job_quote_items add column if not exists parent_quote_item_id uuid references job_quote_items(id) on delete cascade;
alter table job_quote_items add column if not exists recipe_item_id   text;
alter table job_quote_items add column if not exists recipe_qty       numeric;
alter table job_quote_items add column if not exists recipe_revision  text not null default '';
alter table job_quote_items add column if not exists drawing_revision text not null default '';

create index if not exists job_quote_items_parent_idx on job_quote_items (parent_quote_item_id);

-- The cut list is one table for quotes and jobs, as the cut-to-size plan
-- asked: a nullable quote_id, and job_id no longer required, but one of
-- the two must be set. Every screen today selects by job_id, so a
-- quote's lines are invisible to them.
alter table job_cut_items add column if not exists quote_id uuid references quotes(id) on delete cascade;
alter table job_cut_items alter column job_id drop not null;
alter table job_cut_items drop constraint if exists job_cut_items_owner_check;
alter table job_cut_items add constraint job_cut_items_owner_check
  check (job_id is not null or quote_id is not null);

create index if not exists job_cut_items_quote_idx on job_cut_items (quote_id);


-- ============ 9. The hinge ============
--
-- The stage that puts fabrications together: Welding for a welded one,
-- Assembly for a bolted one. A tick on the stage, so a rename breaks
-- nothing. "if exists" for the same reason as setup-made-on-tag.sql.

alter table if exists process_type_settings
  add column if not exists puts_fabrications_together boolean not null default false;


-- ============ 10. Who may do what ============

alter table profiles add column if not exists can_quote               boolean not null default false;
alter table profiles add column if not exists can_see_quote_cost      boolean not null default false;
alter table profiles add column if not exists can_manage_quote_rates  boolean not null default false;
alter table profiles add column if not exists can_manage_recipes      boolean not null default false;


-- ============ 11. Where quote PDFs go ============
--
-- A private bucket of its own, the way drawings have one.

insert into storage.buckets (id, name, public)
values ('quotes', 'quotes', false)
on conflict (id) do nothing;

do $$ begin
  create policy "Signed-in users can read quote files"
    on storage.objects for select
    using (bucket_id = 'quotes' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can upload quote files"
    on storage.objects for insert
    with check (bucket_id = 'quotes' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete quote files"
    on storage.objects for delete
    using (bucket_id = 'quotes' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;


-- ============ 12. Access ============
--
-- Same as every other table in this app: signed-in staff can read and
-- write, and who may actually do what is decided by the app from the
-- permissions above. The two history tables are read and add only.

alter table quotes               enable row level security;
alter table quote_items          enable row level security;
alter table quote_cost_lines     enable row level security;
alter table quote_parts          enable row level security;
alter table quote_processes      enable row level security;
alter table quote_rates          enable row level security;
alter table quote_cutting_speeds enable row level security;
alter table bom_parts            enable row level security;
alter table bom_stages           enable row level security;
alter table bom_events           enable row level security;
alter table stock_item_events    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['quotes', 'quote_items', 'quote_cost_lines', 'quote_parts',
                           'quote_processes', 'quote_rates', 'quote_cutting_speeds',
                           'bom_parts', 'bom_stages']
  loop
    execute format('drop policy if exists "Signed-in users can read %s" on %I', t, t);
    execute format('create policy "Signed-in users can read %s" on %I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('drop policy if exists "Signed-in users can insert %s" on %I', t, t);
    execute format('create policy "Signed-in users can insert %s" on %I for insert with check (auth.role() = ''authenticated'')', t, t);
    execute format('drop policy if exists "Signed-in users can update %s" on %I', t, t);
    execute format('create policy "Signed-in users can update %s" on %I for update using (auth.role() = ''authenticated'')', t, t);
    execute format('drop policy if exists "Signed-in users can delete %s" on %I', t, t);
    execute format('create policy "Signed-in users can delete %s" on %I for delete using (auth.role() = ''authenticated'')', t, t);
  end loop;

  -- History: read and add, never change or delete.
  foreach t in array array['bom_events', 'stock_item_events']
  loop
    execute format('drop policy if exists "Signed-in users can read %s" on %I', t, t);
    execute format('create policy "Signed-in users can read %s" on %I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('drop policy if exists "Signed-in users can insert %s" on %I', t, t);
    execute format('create policy "Signed-in users can insert %s" on %I for insert with check (auth.role() = ''authenticated'')', t, t);
  end loop;
end $$;


-- ============ Check ============
--
-- Every row should say ready. A row saying MISSING means that part of
-- this file did not land; run it again and read the error.

with checks (thing, found) as (
  values
    ('table quotes',                exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quotes')),
    ('table quote_items',           exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_items')),
    ('table quote_cost_lines',      exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_cost_lines')),
    ('table quote_parts',           exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_parts')),
    ('table quote_processes',       exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_processes')),
    ('table quote_rates',           exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_rates')),
    ('table quote_cutting_speeds',  exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'quote_cutting_speeds')),
    ('table bom_parts',             exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'bom_parts')),
    ('table bom_stages',            exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'bom_stages')),
    ('table bom_events',            exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'bom_events')),
    ('table stock_item_events',     exists (select 1 from information_schema.tables  where table_schema = 'public' and table_name = 'stock_item_events')),
    ('column stock_items.recipe_kind',              exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_items'           and column_name = 'recipe_kind')),
    ('column jobs.quote_id',                        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'jobs'                  and column_name = 'quote_id')),
    ('column job_quote_items.parent_quote_item_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_quote_items'       and column_name = 'parent_quote_item_id')),
    ('column job_quote_items.drawing_revision',     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_quote_items'       and column_name = 'drawing_revision')),
    ('column job_cut_items.quote_id',               exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_cut_items'         and column_name = 'quote_id')),
    ('column process_type_settings.puts_fabrications_together', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'process_type_settings' and column_name = 'puts_fabrications_together')),
    ('column profiles.can_quote',                   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'              and column_name = 'can_quote')),
    ('bucket quotes',                               exists (select 1 from storage.buckets where id = 'quotes')),
    ('counter nextQuoteNumber',                     exists (select 1 from master_counters where counter_name = 'nextQuoteNumber'))
)
select thing, case when found then 'ready' else 'MISSING' end as status
from checks

union all

select 'seeded',
       (select count(*) from quote_processes)::text || ' quote processes, '
       || (select count(*) from quote_rates)::text || ' rates, '
       || (select count(*) from quote_cutting_speeds)::text || ' cutting speeds'

union all

select 'parts already marked as fabrications',
       (select count(*) from stock_items where recipe_kind = 'fabrication')::text

order by 1;
