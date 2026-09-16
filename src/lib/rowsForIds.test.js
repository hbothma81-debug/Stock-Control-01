// Loading rows for a long list of ids without losing any.
//
// Run with:   npm test
//
// The fake database below behaves like the real one in the two ways that
// matter: it refuses a request whose id list is too long, and it returns
// at most PAGE rows per request. fakeFetchAll pages the way fetchAllRows
// in App.jsx does, in id order.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rowsForIds, idBatches, ID_BATCH_SIZE } from "./rowsForIds.js";

const PAGE = 3;

function fakeDatabase(rows, { longestList = Infinity } = {}) {
  const requests = [];
  async function fetchAll(table, { filter }) {
    let out = [];
    for (let from = 0; ; from += PAGE) {
      const conditions = [];
      const q = {
        in(column, values) {
          if (values.length > longestList) throw new Error("request too long: " + values.length + " ids");
          conditions.push((r) => values.includes(r[column]));
          return q;
        },
        eq(column, value) {
          conditions.push((r) => r[column] === value);
          return q;
        },
      };
      filter(q);
      requests.push(table);
      const page = rows
        .filter((r) => conditions.every((c) => c(r)))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(from, from + PAGE);
      out = out.concat(page);
      if (page.length < PAGE) break;
    }
    return out;
  }
  return { fetchAll, requests };
}

// 23 jobs, most with several stages, so both batches and pages run over.
const jobs = Array.from({ length: 23 }, (_, i) => "job-" + String(i).padStart(2, "0"));
const stages = jobs.flatMap((job, i) =>
  Array.from({ length: (i % 4) + 1 }, (_, n) => ({ id: job + "-stage-" + n, job_id: job, kind: n === 0 ? "cut" : "other" }))
);

const ids = (rows) => rows.map((r) => r.id).sort();

test("every row comes back exactly once across batches and pages", async () => {
  const db = fakeDatabase(stages);
  const rows = await rowsForIds(db.fetchAll, "job_processes", "job_id", jobs, { batchSize: 4 });
  assert.deepEqual(ids(rows), ids(stages));
  assert.ok(db.requests.length > 6, "more than one request per batch was needed");
});

test("no request carries more ids than the batch size", async () => {
  const db = fakeDatabase(stages, { longestList: 5 });
  await assert.doesNotReject(rowsForIds(db.fetchAll, "job_processes", "job_id", jobs, { batchSize: 5 }));
  await assert.rejects(rowsForIds(db.fetchAll, "job_processes", "job_id", jobs, { batchSize: 6 }));
});

test("only rows for the ids asked for", async () => {
  const db = fakeDatabase(stages);
  const rows = await rowsForIds(db.fetchAll, "job_processes", "job_id", ["job-01", "job-05"], { batchSize: 1 });
  assert.deepEqual(ids(rows), ids(stages.filter((s) => s.job_id === "job-01" || s.job_id === "job-05")));
});

test("the extra filter applies to every batch", async () => {
  const db = fakeDatabase(stages);
  const rows = await rowsForIds(db.fetchAll, "job_processes", "job_id", jobs, {
    batchSize: 4,
    filter: (q) => q.eq("kind", "cut"),
  });
  assert.equal(rows.length, jobs.length);
  assert.ok(rows.every((r) => r.kind === "cut"));
});

test("an empty list asks for nothing", async () => {
  const db = fakeDatabase(stages);
  assert.deepEqual(await rowsForIds(db.fetchAll, "job_processes", "job_id", []), []);
  assert.deepEqual(await rowsForIds(db.fetchAll, "job_processes", "job_id", null), []);
  assert.equal(db.requests.length, 0);
});

test("blanks and repeats are left out of the batches", () => {
  assert.deepEqual(idBatches(["a", "b", null, "a", "", undefined, "c"], 2), [["a", "b"], ["c"]]);
});

test("a failed batch fails the whole load, so the caller sees the error", async () => {
  let calls = 0;
  const fetchAll = async () => {
    calls += 1;
    if (calls === 2) throw new Error("connection dropped");
    return [];
  };
  await assert.rejects(rowsForIds(fetchAll, "job_processes", "job_id", jobs, { batchSize: 5 }), /connection dropped/);
});

// The database refused about 25,000 characters on 16 Sep 2026 (640 ids
// through, 650 not). A full batch's address, written the way supabase-js
// writes it, has to stay well under that, with room for the headers.
test("a full batch of real ids stays under half the measured limit", () => {
  const batch = Array.from({ length: ID_BATCH_SIZE }, () => randomUUID());
  const address = new URLSearchParams({ select: "*", job_process_id: "in.(" + batch.join(",") + ")" }).toString();
  assert.ok(address.length < 12500, "a batch's address is " + address.length + " characters");
});
