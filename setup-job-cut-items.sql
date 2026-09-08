-- Run this once in Supabase → SQL Editor → New query, then Run.
--
-- The cut-to-size list on a job: one row per part that has to be cut from
-- structural stock. Two readers: the saw operator, who sees what to cut
-- and from which bar, and the sales person, who sees how many bars the
-- job needs so they can set stock aside or order it.
--
-- Only the raw entries live here -- section, length, quantity, stock
-- length. Bars needed, offcut per bar and the cutting order are worked
-- out by the app from these numbers (src/jobs/cutToSize.js), and the
-- allowances it uses are: 1mm lost to the blade on every cut, and an
-- optional 10mm trim off the front of each bar to square it up.
--
-- Same shape as job_quote_items on purpose. The quoting module will want
-- the same list on a quote; adding a nullable quote_id later is all it
-- should take, so please do not fork this table -- extend it.
--
-- Safe to run more than once.

create table if not exists job_cut_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  sort_order integer not null default 0,

  -- The customer's drawing or part number. Free text, but when it matches
  -- one of that customer's stock items the link is kept so the drawing
  -- can be shown to the operator. stock_items.id is text, not uuid, and
  -- there is no foreign key on purpose: a retired stock item should not
  -- take a job's cut list with it.
  drawing_no text not null default '',
  linked_item_id text,

  -- What to cut. Section names match the Sections list in Stock Manager.
  -- Grade is kept per line because the operator has to know mild steel
  -- from stainless, and a section can exist in both.
  section text not null default '',
  grade text not null default '',

  -- Millimetres for the piece, metres for the bar it comes off. That is
  -- how the shop talks about them and how structural stock already stores
  -- its lengths (metres).
  cut_length_mm numeric not null default 0,
  qty numeric not null default 0,
  stock_length_m numeric not null default 6,

  -- Whether this line's bars get the 10mm front trim. On by default.
  trim_front boolean not null default true,

  -- The operator's running count, the same idea as "each" tracking on a
  -- process. Never above qty.
  qty_cut numeric not null default 0,

  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists job_cut_items_job_id_idx on job_cut_items (job_id);

alter table job_cut_items enable row level security;

do $$ begin
  create policy "Signed-in users can read cut items" on job_cut_items for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can add cut items" on job_cut_items for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can update cut items" on job_cut_items for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Signed-in users can delete cut items" on job_cut_items for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

select 'job_cut_items ready' as result;
