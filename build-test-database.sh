#!/usr/bin/env bash
# Regenerates setup-ALL.sql — every setup script joined in dependency order,
# so a blank Supabase project can be brought up to match production in one
# paste. Re-run this whenever a new setup-*.sql is added to the project.
#
#   bash build-test-database.sh
#
# Diagnostic scripts are deliberately excluded: they only inspect data and
# are not part of creating the schema.

set -euo pipefail
cd "$(dirname "$0")"

ORDER=(
  # --- foundation: logins and the profiles table everything else hangs off
  supabase-setup.sql
  setup-backfill-missing-profiles.sql

  # --- core data
  setup-stock-items-table.sql
  setup-master-data-tables.sql
  setup-master-factor-short-name.sql
  setup-string-list-order.sql

  # --- jobs (COMBINED is the complete jobs system and is safe after the rest)
  setup-jobs.sql
  setup-jobs-COMBINED.sql
  setup-jobs-quote-items.sql
  setup-jobs-item-linking.sql
  setup-jobs-item-tracking.sql
  setup-jobs-qty.sql
  setup-jobs-qty-tracking.sql
  setup-jobs-invoice-number.sql
  setup-jobs-customer-po.sql

  # --- processes (need jobs and job_quote_items to exist first)
  setup-process-assignment.sql
  setup-process-documents.sql
  setup-process-notes.sql
  setup-process-tracking-mode.sql
  setup-process-item-progress.sql
  setup-production-priority-shortage.sql

  # --- modules that reference jobs
  setup-invoicing-delivery.sql
  setup-job-invoice-requests.sql
  setup-generated-documents.sql
  setup-shortages-table.sql
  setup-requisitions-table.sql
  setup-purchase-orders-table.sql
  setup-drawings.sql
  setup-asset-history.sql
  setup-asset-service-and-repairs.sql
  setup-usage-log-table.sql
  setup-job-allocations.sql

  # --- extra columns and permissions on profiles
  setup-production-access.sql
  setup-profiles-sales-department.sql
  add-purchase-order-permission.sql
  add-usage-log-permission.sql
  setup-theme-preference.sql
)

OUT=setup-ALL.sql

{
  echo "-- ============================================================"
  echo "-- setup-ALL.sql — complete database setup, generated file"
  echo "--"
  echo "-- Created by build-test-database.sh on $(date +%Y-%m-%d)."
  echo "-- Do not edit by hand; edit the individual setup-*.sql files"
  echo "-- and re-run the script instead."
  echo "--"
  echo "-- Paste the whole thing into Supabase -> SQL Editor -> Run."
  echo "-- Every statement uses \"if not exists\", so running it twice is safe."
  echo "-- ============================================================"
  echo

  for f in "${ORDER[@]}"; do
    if [ ! -f "$f" ]; then
      echo "MISSING FILE: $f" >&2
      exit 1
    fi
    echo
    echo "-- ============================================================"
    echo "-- $f"
    echo "-- ============================================================"
    cat "$f"
    echo
  done
} > "$OUT"

echo "Wrote $OUT ($(wc -l < "$OUT") lines) from ${#ORDER[@]} files."

# Anything not included is either a diagnostic or newly added — worth knowing.
echo
echo "Not included (check these are meant to be left out):"
for f in *.sql; do
  [ "$f" = "$OUT" ] && continue
  printf '%s\n' "${ORDER[@]}" | grep -qx "$f" || echo "  $f"
done

# Several scripts declare the same policy, which Postgres rejects on the
# second attempt (42710) and which aborts the entire run. Make every policy
# statement tolerate already existing, so order stops mattering.
#
# Git Bash on Windows does not pick up the installer's PATH entry, so fall
# back to the standard install location before giving up.
NODE=node
command -v node >/dev/null 2>&1 || NODE="/c/Program Files/nodejs/node.exe"
if [ ! -x "$NODE" ] && ! command -v node >/dev/null 2>&1; then
  echo "Could not find node — setup-ALL.sql is generated but NOT de-duplicated." >&2
  exit 1
fi
"$NODE" make-policies-idempotent.cjs "$OUT"
