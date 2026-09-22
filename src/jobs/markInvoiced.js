// What stops a job being marked Invoiced (Heinrich, 22 Sep 2026, JOB-0014:
// marked Invoiced with eight lines partly invoiced and five stages open,
// so it vanished from the floor with its work unfinished).
//
// Marking Invoiced means the whole job is billed and done. It is refused,
// for everyone, admins included, while any line still has quantity to
// invoice or any of the job's own stages is open. A re-cut's catch-up run
// does not count. Tested in markInvoiced.test.js.
//
// Several Sage invoices for one job (one per request) are a separate
// plan: this file only says when the one mark may be made.

// Mirrors remainingToInvoice's idea of "left" in App.jsx: billable lines
// (no parent) with quantity not yet invoiced. A line out with a supplier
// still counts here: it is not billed, so the job is not fully invoiced.
export function linesLeftToInvoice(quoteItems) {
  return (quoteItems || []).filter(
    (it) => it && !it.parent_quote_item_id && Number(it.qty) - Number(it.qty_invoiced || 0) > 0
  );
}

export function stagesStillOpen(processes) {
  return (processes || []).filter((p) => p && !p.is_complete && !p.shortage_id);
}

// Null when the job may be marked Invoiced; otherwise the message to show.
export function markInvoicedRefusal(jobNumber, quoteItems, processes) {
  const lines = linesLeftToInvoice(quoteItems);
  const open = stagesStillOpen(processes);
  if (lines.length === 0 && open.length === 0) return null;
  const parts = [];
  if (lines.length) {
    const shown = lines.slice(0, 5).map((it) => `  • ${it.description || "Item"}: ${Number(it.qty_invoiced || 0)} of ${Number(it.qty)} invoiced`);
    if (lines.length > 5) shown.push(`  • and ${lines.length - 5} more`);
    parts.push(`${lines.length} line${lines.length === 1 ? " is" : "s are"} not fully invoiced:\n${shown.join("\n")}`);
  }
  if (open.length) {
    parts.push(`${open.length} stage${open.length === 1 ? " is" : "s are"} still open: ${open.map((p) => p.process_name).join(", ")}.`);
  }
  return (
    `${jobNumber || "This job"} cannot be marked Invoiced yet.\n\n${parts.join("\n\n")}\n\n` +
    `Marking Invoiced means the whole job is billed and done. Invoice the rest first, and close or force the open stages.`
  );
}
