// Rows whose column is one of a list of ids, however long the list.
// Tested in rowsForIds.test.js.
//
// A filter on a list of ids travels inside the request's web address, and
// the database refuses a request longer than about 25,000 characters,
// headers included. Measured on practice on 16 Sep 2026: 640 ids went
// through and 650 did not, and more headers brought that lower. A refused
// request is an error, not a shorter answer, and on the Production tab one
// error blanks the whole tab for everyone. Live had 562 stages on the tab
// that day, sent as one list.
//
// So the ids go in batches of ID_BATCH_SIZE, and each batch is handed to
// the pager (fetchAllRows in App.jsx), which pages 1000 rows at a time in
// id order, so the 1000-row cap cannot quietly cut a batch short either.
// Rows come back in no particular order: a caller that needs one sorts
// them afterwards.
//
// Downloads: the same rows as one plain request would bring. The only
// extra is one request per batch or page past the first.

export const ID_BATCH_SIZE = 200;

// The ids split into batches, blanks and repeats left out.
export function idBatches(ids, size = ID_BATCH_SIZE) {
  const unique = [...new Set((ids || []).filter((id) => id != null && id !== ""))];
  const batches = [];
  for (let i = 0; i < unique.length; i += size) batches.push(unique.slice(i, i + size));
  return batches;
}

// fetchAll(table, { select, filter }) returns every row the filter lets
// through, paged. `filter` here adds conditions beyond the id list, e.g.
// (q) => q.eq("document_type", "cutting_list").
export async function rowsForIds(fetchAll, table, column, ids, { select = "*", filter = null, batchSize = ID_BATCH_SIZE } = {}) {
  const batches = idBatches(ids, batchSize);
  const results = await Promise.all(
    batches.map((batch) =>
      fetchAll(table, {
        select,
        filter: (q) => (filter ? filter(q.in(column, batch)) : q.in(column, batch)),
      })
    )
  );
  return results.flat();
}
