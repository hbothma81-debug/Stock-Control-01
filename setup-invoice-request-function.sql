-- One invoice request is one save (Heinrich, 25 Sep 2026: "fix the gap").
--
-- Until this, sending a request was some sixty saves from the browser: the
-- document, the request row, then every line marked and logged one after
-- another (four seconds on JOB-0036). A page closed or a connection dropped
-- in those seconds left a request whose later lines still read "to send",
-- and the next Invoice Now sent them again in a second document.
--
-- Now the browser draws and stores the PDF, then makes one call:
-- send_invoice_request(job, file, who, lines). The database does the rest
-- as one all-or-nothing save:
--   1. locks the job's lines for that moment, so two devices cannot request
--      the same lines at once;
--   2. checks every line is on this job, is not a part under a line, is not
--      out with a supplier, still has that much left, and still has the
--      price the PDF printed -- anything off refuses the whole request and
--      saves nothing (the app is told which lines: JSON in the error's
--      detail, hint 'lines_changed');
--   3. saves the request, marks the lines and writes the log.
-- The worst case left is a stored PDF that nothing points to.
--
-- job_quote_item_invoices.request_id says which request each line went out
-- on. Nothing recorded that before: JOB-0036's two documents had to be
-- opened and added up by hand. Blank on rows from before this file.
--
-- The app keeps its old line-by-line save as the fallback on a database
-- without this function (markInvoiceRequestLineByLine in App.jsx mirrors
-- this file); where the function exists it has the final say.
--
-- Run on PRACTICE first. Select nothing before pressing Run. Safe to run
-- more than once.

alter table job_quote_item_invoices
  add column if not exists request_id uuid references job_invoice_requests(id) on delete set null;

create index if not exists job_quote_item_invoices_request_id_idx on job_quote_item_invoices (request_id);

-- p_lines: a JSON list of {"id": <line id>, "qty": <number>, "unit_price": <number>}.
-- Gives back the new request row as JSON.
create or replace function public.send_invoice_request(
  p_job_id uuid, p_storage_path text, p_file_name text, p_submitted_by text, p_lines jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_line record;
  v_row job_quote_items%rowtype;
  v_changed jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_request job_invoice_requests%rowtype;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'An invoice request needs a list of lines.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'An invoice request needs at least one line.' using errcode = 'P0001';
  end if;
  if (select count(*) from jsonb_array_elements(p_lines) e)
     <> (select count(distinct e->>'id') from jsonb_array_elements(p_lines) e) then
    raise exception 'A line is listed twice in the invoice request.' using errcode = 'P0001';
  end if;

  -- Every line of the job is held for the rest of this save.
  perform 1 from job_quote_items where job_id = p_job_id for update;

  for v_line in
    select (e->>'id')::uuid as id, (e->>'qty')::numeric as qty, (e->>'unit_price')::numeric as unit_price
      from jsonb_array_elements(p_lines) e
  loop
    select * into v_row from job_quote_items where id = v_line.id and job_id = p_job_id;
    if not found then
      v_changed := v_changed || jsonb_build_object('description', 'a line no longer on the job', 'asked', v_line.qty, 'left', 0);
    elsif v_row.parent_quote_item_id is not null
       or coalesce(v_row.item_status, 'on_floor') = 'out_external'
       or v_line.qty is null or v_line.qty <= 0
       or v_line.qty > coalesce(v_row.qty, 0) - coalesce(v_row.qty_invoiced, 0)
       or round(coalesce(v_row.unit_price, 0), 4) <> round(coalesce(v_line.unit_price, 0), 4) then
      v_changed := v_changed || jsonb_build_object('description', v_row.description, 'asked', v_line.qty,
        'left', greatest(coalesce(v_row.qty, 0) - coalesce(v_row.qty_invoiced, 0), 0));
    else
      v_total := v_total + v_line.qty * coalesce(v_row.unit_price, 0);
    end if;
  end loop;

  if jsonb_array_length(v_changed) > 0 then
    raise exception 'The lines changed before the invoice request was sent.'
      using errcode = 'P0001', detail = v_changed::text, hint = 'lines_changed';
  end if;

  insert into job_invoice_requests (job_id, storage_path, file_name, total_amount, submitted_by)
  values (p_job_id, p_storage_path, p_file_name, round(v_total, 2), p_submitted_by)
  returning * into v_request;

  for v_line in
    select (e->>'id')::uuid as id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e
  loop
    update job_quote_items
       set qty_invoiced = coalesce(qty_invoiced, 0) + v_line.qty, item_status = 'invoice_requested'
     where id = v_line.id;
    insert into job_quote_item_invoices (quote_item_id, job_id, qty_added, invoiced_by, request_id)
    values (v_line.id, p_job_id, v_line.qty, p_submitted_by, v_request.id);
  end loop;

  return to_jsonb(v_request);
end;
$fn$;

grant execute on function public.send_invoice_request(uuid, text, text, text, jsonb) to authenticated;

-- Check: the function is there, and how many log rows name their request
-- (none straight after this runs; every request from now on).
select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'send_invoice_request') as function_ready,
       (select count(*) from job_quote_item_invoices where request_id is not null) as log_rows_naming_their_request;
