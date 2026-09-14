-- Adds the "Can print and download PDFs" permission: profiles.can_print_pdfs.
--
-- Everyone who can open a PDF in the app can look at it. Only admins and
-- people with this tick get the Open / Print and Download PDF buttons under
-- it. Delivery notes are the one exception: everyone can print those.
--
-- Nobody has the tick until it is set in User Management.
-- Safe to run twice: it does nothing if the column is already there.

alter table profiles add column if not exists can_print_pdfs boolean not null default false;
