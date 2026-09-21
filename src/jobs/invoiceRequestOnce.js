// An invoice request is sent once. Two rules, both from JOB-0036 (17 Sep
// 2026): "Invoice Now" was pressed again while the first request was still
// marking its lines, the second press's "OK?" box froze the first until it
// was answered, and both then ran side by side. The last seven lines went
// out in two documents and accounts read "(2 requests)" adding up to the
// wrong amount.
//
// 1. One request per job at a time on this device (makeOneAtATime). A press
//    while one is under way is refused and told so; nothing is queued.
// 2. What a press sends is checked against the lines as the database holds
//    them at that moment, not as the screen read them before the "OK?" box
//    (stillToSend). A press whose list went stale while it waited, on this
//    device or another, is refused whole: a request for "what is left of
//    what you meant" would be a document nobody asked for. Like the per-item
//    counts: saved only if the line still reads what the person saw.

export function makeOneAtATime() {
  const running = new Set();
  return {
    busy: (key) => running.has(key),
    async run(key, work) {
      if (running.has(key)) {
        const err = new Error("Already under way.");
        err.alreadyRunning = true;
        throw err;
      }
      running.add(key);
      try {
        return await work();
      } finally {
        running.delete(key);
      }
    },
  };
}

// itemsWithQty: [{ item, qty }] as the press gathered them. freshRows: the
// same job's lines read just now. Gives back the pairs on the fresh rows, so
// the new invoiced count is added to today's number, or the lines that no
// longer have that much left.
export function stillToSend(itemsWithQty, freshRows) {
  const fresh = new Map((freshRows || []).map((r) => [r.id, r]));
  const items = [];
  const changed = [];
  for (const { item, qty } of itemsWithQty || []) {
    const row = fresh.get(item.id);
    const left = row ? Number(row.qty) - Number(row.qty_invoiced) : 0;
    if (!row || row.item_status === "out_external" || Number(qty) > left) {
      changed.push({ description: (row || item).description, asked: Number(qty), left: Math.max(left, 0) });
    } else {
      items.push({ item: row, qty });
    }
  }
  return changed.length > 0 ? { ok: false, changed } : { ok: true, items };
}

// What the person is told, by whichever button they pressed.
export function invoiceRequestRefusal(err, jobNumber) {
  if (err?.alreadyRunning) {
    return `An invoice request for ${jobNumber} is already being sent. Wait for it to finish. Nothing was sent twice.`;
  }
  if (err?.linesChanged) {
    const names = err.linesChanged.slice(0, 5).map((c) => `${c.description} (${c.left} left)`);
    const more = err.linesChanged.length - names.length;
    return (
      `Nothing was sent for ${jobNumber}: some of these lines were requested a moment ago, here or on another device.\n\n` +
      names.join("\n") +
      (more > 0 ? `\nand ${more} more` : "") +
      `\n\nThe job has been reloaded. Look at what is left and send again if something still is.`
    );
  }
  return null;
}
