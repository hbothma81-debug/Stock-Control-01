-- CNC module, file 5 of 5: where a program's STEP files are kept.
-- A private store of its own, "cnc-files", read only by people with the
-- CNC tick (file 1). The app files each revision's model under
-- <program id>/<revision letter>/<file name> and saves that path on the
-- revision (cnc_program_revisions.step_path). A file is downloaded only
-- when a program is opened, never for a list (CLAUDE.md, Loading data).
-- Safe to run twice.

insert into storage.buckets (id, name, public)
values ('cnc-files', 'cnc-files', false)
on conflict (id) do nothing;

do $do$ begin
  create policy "CNC people can read CNC files" on storage.objects for select
    using (bucket_id = 'cnc-files' and public.cnc_may('view'));
exception when duplicate_object then null; end $do$;
do $do$ begin
  create policy "CNC editors can add CNC files" on storage.objects for insert
    with check (bucket_id = 'cnc-files' and public.cnc_may('edit'));
exception when duplicate_object then null; end $do$;
do $do$ begin
  create policy "CNC editors can replace CNC files" on storage.objects for update
    using (bucket_id = 'cnc-files' and public.cnc_may('edit'));
exception when duplicate_object then null; end $do$;
do $do$ begin
  create policy "CNC deleters can delete CNC files" on storage.objects for delete
    using (bucket_id = 'cnc-files' and public.cnc_may('delete'));
exception when duplicate_object then null; end $do$;

-- ============ Check ============

select 'cnc files' as step,
       case when exists (select 1 from storage.buckets where id = 'cnc-files' and public = false)
             and (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname like '%CNC files') = 4
            then 'ready - STEP files have a private home'
            else 'SOMETHING IS MISSING - tell Claude' end as result;
