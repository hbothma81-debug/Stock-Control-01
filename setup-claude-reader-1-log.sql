-- Claude document reader: the record of every read, and the limits check.
--
-- Every PDF sent to Claude (a supplier quote, a customer PO, a supplier
-- invoice) gets one row here: who, when, which file, how many pages, what
-- it cost. The Procurement page, New Job and the supplier invoice reader
-- all use the same record and the same limits.
--
-- Nobody writes these rows from the browser. Only the server function that
-- holds the Claude key can, through the two functions below. That stops
-- anyone from wiping their own count. A person reads their own rows; an
-- admin reads everyone's.
--
-- The limits, checked before every read, inside the database, so two reads
-- at the same moment cannot both slip under the cap:
--   * the whole app's spend this calendar month (South African time) stays
--     under app_settings.ai_monthly_cap_usd
--   * the person's reads this month stay under profiles.ai_docs_per_month
--     (0 = not allowed)
--
-- Needs setup-procurement-1-access.sql first.
-- Run on PRACTICE first. Select nothing before pressing Run.
-- Safe to run more than once.

create table if not exists public.ai_document_reads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('supplier_quote', 'customer_po', 'supplier_invoice')),
  file_name     text not null default '',
  pages         integer,
  status        text not null default 'started' check (status in ('started', 'done', 'failed')),
  reserved_usd  numeric(10,4) not null default 0,
  cost_usd      numeric(10,4),
  model         text,
  input_tokens  integer,
  output_tokens integer,
  error         text,
  related_id    text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists ai_document_reads_month_idx on public.ai_document_reads (created_at desc);
create index if not exists ai_document_reads_user_idx on public.ai_document_reads (user_id, created_at desc);

alter table public.ai_document_reads enable row level security;

drop policy if exists "People read their own Claude reads" on public.ai_document_reads;
create policy "People read their own Claude reads" on public.ai_document_reads
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Spend this month: finished reads at what they cost, reads still running
-- at what was set aside for them (a read stuck for 15 minutes stops counting).
create or replace function public.ai_month_spend()
returns numeric
language sql
security definer
stable
set search_path = public
as $body$
  select coalesce(sum(case when r.status = 'started'
                            then case when r.created_at > now() - interval '15 minutes' then r.reserved_usd else 0 end
                            else coalesce(r.cost_usd, 0) end), 0)
  from public.ai_document_reads r
  where r.created_at >= date_trunc('month', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg';
$body$;

grant execute on function public.ai_month_spend() to authenticated;

-- Called by the server function before it sends a PDF to Claude. Refuses
-- with a hint the app can show ('ai_app_cap', 'ai_person_off',
-- 'ai_person_cap'), or records the read as started and returns its id.
create or replace function public.ai_start_read(p_user uuid, p_kind text, p_file text,
                                                p_pages integer, p_reserve_usd numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_cap numeric;
  v_allowed integer;
  v_used integer;
  v_id uuid;
begin
  -- One read at a time passes this point, so the totals below stay true.
  perform pg_advisory_xact_lock(hashtext('ai_document_reads'));

  select ai_monthly_cap_usd into v_cap from public.app_settings where id;
  if public.ai_month_spend() + p_reserve_usd > coalesce(v_cap, 0) then
    raise exception 'The app''s Claude budget for this month is used up.'
      using errcode = 'P0001', hint = 'ai_app_cap';
  end if;

  select ai_docs_per_month into v_allowed from public.profiles where id = p_user;
  if coalesce(v_allowed, 0) <= 0 then
    raise exception 'Claude reading is not switched on for you. Ask an admin.'
      using errcode = 'P0001', hint = 'ai_person_off';
  end if;

  select count(*) into v_used from public.ai_document_reads
  where user_id = p_user and status <> 'failed'
    and created_at >= date_trunc('month', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg';
  if v_used >= v_allowed then
    raise exception 'You have used your % Claude documents for this month.', v_allowed
      using errcode = 'P0001', hint = 'ai_person_cap';
  end if;

  insert into public.ai_document_reads (user_id, kind, file_name, pages, reserved_usd)
  values (p_user, p_kind, coalesce(p_file, ''), p_pages, p_reserve_usd)
  returning id into v_id;
  return v_id;
end;
$body$;

-- Called by the server function when Claude has answered or failed.
create or replace function public.ai_finish_read(p_id uuid, p_status text, p_cost_usd numeric,
                                                 p_model text, p_input integer, p_output integer,
                                                 p_error text)
returns void
language sql
security definer
set search_path = public
as $body$
  update public.ai_document_reads
  set status = p_status, cost_usd = p_cost_usd, model = p_model, input_tokens = p_input,
      output_tokens = p_output, error = p_error, finished_at = now()
  where id = p_id and status = 'started';
$body$;

-- Only the server function (which signs in as service_role) may call these
-- two. Supabase lets anybody call a public function unless told otherwise.
revoke execute on function public.ai_start_read(uuid, text, text, integer, numeric) from public, anon, authenticated;
revoke execute on function public.ai_finish_read(uuid, text, numeric, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.ai_start_read(uuid, text, text, integer, numeric) to service_role;
grant execute on function public.ai_finish_read(uuid, text, numeric, text, integer, integer, text) to service_role;


-- ============ Check ============

select 'Claude reader log' as step,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = 'ai_start_read')
            then 'ready - spent this month US$' || public.ai_month_spend()
                 || ' of US$' || (select ai_monthly_cap_usd from public.app_settings where id)
            else 'SOMETHING IS MISSING - tell Claude' end as result;
