import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crashRow, seenLately, isNoTable, recordCrash, loadCrashes, countRecentCrashes, crashWho, splitByAge, crashMatchesSearch, deviceInWords,
  KEEP_DAYS, RECENT_DAYS, LIST_LIMIT,
} from "./appErrors.js";

const DAY = 86400000;

// A stand-in for the database client: answers what it is told to, and
// keeps what it was asked.
function fakeClient({ user = { id: "u1", email: "floor@x" }, insertError = null, rows = [], selectError = null, count = null } = {}) {
  const asked = { inserts: [], selects: [] };
  const client = {
    asked,
    auth: { getSession: async () => ({ data: { session: user ? { user } : null } }) },
    from(table) {
      return {
        insert: async (row) => {
          asked.inserts.push({ table, row });
          return { error: insertError };
        },
        select(columns, options) {
          const q = { table, columns, options };
          asked.selects.push(q);
          const chain = {
            gte(col, value) { q.gte = [col, value]; return chain; },
            order(col, how) { q.order = [col, how]; return chain; },
            limit(n) { q.limit = n; return Promise.resolve({ data: selectError ? null : rows, error: selectError }); },
            // A count is awaited straight after its filter, with no limit.
            then(done) { return done({ data: null, count: selectError ? null : count, error: selectError }); },
          };
          return chain;
        },
      };
    },
  };
  return client;
}

test("row: the error's own words, where it happened, and nothing the database fills in", () => {
  const row = crashRow({
    heading: "JOB-0068, Bending: the count box could not be shown",
    error: new TypeError("x is null"),
    componentStack: "\n    at QtyProgressControl\n    at div\n",
    build: "index-abc.js", device: "Mozilla/5.0", site: "stock-control-01.vercel.app", userEmail: "floor@x",
  });
  assert.deepEqual(row, {
    heading: "JOB-0068, Bending: the count box could not be shown",
    message: "TypeError: x is null",
    details: "at QtyProgressControl\nat div",
    app_build: "index-abc.js", device: "Mozilla/5.0", site: "stock-control-01.vercel.app", user_email: "floor@x",
  });
  assert.equal("user_id" in row, false);
  assert.equal("happened_at" in row, false);
});

test("row: nothing given still makes a line the table takes", () => {
  const row = crashRow({});
  assert.equal(row.heading, "Something went wrong on this screen");
  assert.equal(row.message, "Unknown error");
  assert.equal(row.details, null);
  assert.equal(row.user_email, null);
});

test("row: everything is cut to what the table allows", () => {
  const row = crashRow({ heading: "h".repeat(400), error: new Error("m".repeat(3000)), componentStack: "s".repeat(9000), device: "d".repeat(600) });
  assert.equal(row.heading.length, 300);
  assert.equal(row.message.length, 2000);
  assert.equal(row.details.length, 8000);
  assert.equal(row.device.length, 500);
  assert.equal(row.heading.endsWith("…"), true);
});

test("the same crash is written once in ten minutes, a different one straight away", () => {
  const seen = new Map();
  const a = { heading: "A", message: "x" };
  const b = { heading: "B", message: "x" };
  assert.equal(seenLately(seen, a, 0), false);
  assert.equal(seenLately(seen, a, 9 * 60000), true);
  assert.equal(seenLately(seen, b, 9 * 60000), false);
  assert.equal(seenLately(seen, a, 10 * 60000), false);
});

test("no such table, in the database's two ways of saying it", () => {
  assert.equal(isNoTable({ code: "PGRST205", message: "Could not find the table 'public.app_errors' in the schema cache" }), true);
  assert.equal(isNoTable({ code: "42P01", message: 'relation "public.app_errors" does not exist' }), true);
  assert.equal(isNoTable({ code: "42501", message: "new row violates row-level security policy" }), false);
  assert.equal(isNoTable(null), false);
});

test("record: written, with the signed-in person's address and no id of our own", async () => {
  const client = fakeClient();
  const answer = await recordCrash(client, { heading: "H", error: new Error("boom"), componentStack: "at X" }, { now: 0, seen: new Map(), device: { build: "b", device: "d", site: "s" } });
  assert.equal(answer, "written");
  assert.equal(client.asked.inserts.length, 1);
  assert.equal(client.asked.inserts[0].table, "app_errors");
  assert.deepEqual(client.asked.inserts[0].row, { heading: "H", message: "Error: boom", details: "at X", app_build: "b", device: "d", site: "s", user_email: "floor@x" });
});

test("record: a second time within ten minutes writes nothing", async () => {
  const client = fakeClient();
  const seen = new Map();
  await recordCrash(client, { heading: "H", error: new Error("boom") }, { now: 0, seen, device: {} });
  const answer = await recordCrash(client, { heading: "H", error: new Error("boom") }, { now: 60000, seen, device: {} });
  assert.equal(answer, "written a moment ago");
  assert.equal(client.asked.inserts.length, 1);
});

test("record: nobody signed in, nothing is asked of the table", async () => {
  const client = fakeClient({ user: null });
  assert.equal(await recordCrash(client, { heading: "H", error: new Error("boom") }, { now: 0, seen: new Map(), device: {} }), "nobody signed in");
  assert.equal(client.asked.inserts.length, 0);
});

test("record: a failure is swallowed, never thrown", async () => {
  const fresh = () => ({ now: 0, seen: new Map(), memo: { tableMissing: false }, device: {} });
  const refused = fakeClient({ insertError: { code: "42501", message: "refused" } });
  assert.equal(await recordCrash(refused, { heading: "H1", error: new Error("boom") }, fresh()), "failed");
  const broken = { auth: { getSession: async () => { throw new Error("no network"); } }, from() { throw new Error("no"); } };
  assert.equal(await recordCrash(broken, { heading: "H2", error: new Error("boom") }, fresh()), "failed");
  assert.equal(await recordCrash(null, { heading: "H3", error: new Error("boom") }, fresh()), "off");
});

test("record: a database without the table is asked once, then left alone", async () => {
  const client = fakeClient({ insertError: { code: "PGRST205", message: "Could not find the table 'public.app_errors' in the schema cache" } });
  const memo = { tableMissing: false };
  const seen = new Map();
  assert.equal(await recordCrash(client, { heading: "H1", error: new Error("boom") }, { now: 0, seen, memo, device: {} }), "off");
  assert.equal(await recordCrash(client, { heading: "H2", error: new Error("other") }, { now: 0, seen, memo, device: {} }), "off");
  assert.equal(client.asked.inserts.length, 1);
});

test("list: newest first, the kept days only, a limit, and it says when it is full", async () => {
  const now = Date.parse("2026-09-27T10:00:00Z");
  const client = fakeClient({ rows: [{ id: 1 }, { id: 2 }] });
  const got = await loadCrashes(client, { now });
  assert.deepEqual(got, { rows: [{ id: 1 }, { id: 2 }], full: false });
  const q = client.asked.selects[0];
  assert.equal(q.table, "app_errors");
  assert.deepEqual(q.gte, ["happened_at", new Date(now - KEEP_DAYS * DAY).toISOString()]);
  assert.deepEqual(q.order, ["happened_at", { ascending: false }]);
  assert.equal(q.limit, LIST_LIMIT);
  const full = await loadCrashes(fakeClient({ rows: Array.from({ length: LIST_LIMIT }, (_, i) => ({ id: i })) }), { now });
  assert.equal(full.full, true);
});

test("list: a database without the table reads as not set up, any other failure says what", async () => {
  assert.deepEqual(await loadCrashes(fakeClient({ selectError: { code: "PGRST205", message: "Could not find the table" } })), { rows: [], notSetUp: true });
  assert.deepEqual(await loadCrashes(fakeClient({ selectError: { code: "500", message: "down" } })), { rows: [], failed: "down" });
  assert.deepEqual(await loadCrashes(null), { rows: [], notSetUp: true });
});

test("the red number: the last seven days, a number and no rows", async () => {
  const now = Date.parse("2026-09-27T10:00:00Z");
  const client = fakeClient({ count: 3 });
  assert.equal(await countRecentCrashes(client, { now }), 3);
  const q = client.asked.selects[0];
  assert.equal(q.table, "app_errors");
  assert.deepEqual(q.options, { count: "exact", head: true });
  assert.deepEqual(q.gte, ["happened_at", new Date(now - RECENT_DAYS * DAY).toISOString()]);
  assert.equal(q.limit, undefined);
});

test("the red number: none is 0; no table, a failure or no database is no number", async () => {
  assert.equal(await countRecentCrashes(fakeClient({ count: 0 })), 0);
  assert.equal(await countRecentCrashes(fakeClient({ count: null })), 0);
  assert.equal(await countRecentCrashes(fakeClient({ selectError: { code: "PGRST205", message: "Could not find the table" } })), null);
  assert.equal(await countRecentCrashes(fakeClient({ selectError: { code: "500", message: "down" } })), null);
  assert.equal(await countRecentCrashes(null), null);
  assert.equal(await countRecentCrashes({ from() { throw new Error("no network"); } }), null);
});

test("who: the name from the people list, else the address, else Unknown", () => {
  const people = [{ id: "u1", name: "Prince" }, { id: "u2", name: " " }];
  assert.equal(crashWho({ user_id: "u1", user_email: "p@x" }, people), "Prince");
  assert.equal(crashWho({ user_id: "u2", user_email: "q@x" }, people), "q@x");
  assert.equal(crashWho({ user_id: "u9", user_email: "" }, people), "Unknown");
  assert.equal(crashWho({ user_id: null, user_email: null }, null), "Unknown");
});

test("the two pills: this week and the rest", () => {
  const now = Date.parse("2026-09-27T10:00:00Z");
  const rows = [
    { id: "today", happened_at: "2026-09-27T09:00:00Z" },
    { id: "six days", happened_at: "2026-09-21T11:00:00Z" },
    { id: "eight days", happened_at: "2026-09-19T09:00:00Z" },
  ];
  const { recent, older } = splitByAge(rows, now);
  assert.deepEqual(recent.map((r) => r.id), ["today", "six days"]);
  assert.deepEqual(older.map((r) => r.id), ["eight days"]);
  assert.deepEqual(splitByAge(null, now), { recent: [], older: [] });
});

test("search: every word typed, anywhere in the line, capitals ignored", () => {
  const row = { heading: "JOB-0068, Bending: the count box could not be shown", message: "TypeError: x is null", user_email: "floor@x", site: "stock-control-01.vercel.app", app_build: "index-abc.js" };
  assert.equal(crashMatchesSearch(row, "", "Prince"), true);
  assert.equal(crashMatchesSearch(row, "job-0068", "Prince"), true);
  assert.equal(crashMatchesSearch(row, "bending prince", "Prince"), true);
  assert.equal(crashMatchesSearch(row, "typeerror", "Prince"), true);
  assert.equal(crashMatchesSearch(row, "bending welding", "Prince"), false);
});

test("device: a floor tablet told from an office PC", () => {
  assert.equal(deviceInWords("Mozilla/5.0 (Linux; Android 12; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) HuaweiBrowser/14.0 Chrome/114.0 Safari/537.36"), "Huawei Browser on Android");
  assert.equal(deviceInWords("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0"), "Edge on Windows");
  assert.equal(deviceInWords("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"), "Chrome on Windows");
  assert.equal(deviceInWords("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone or iPad");
  assert.equal(deviceInWords(""), "");
  assert.equal(deviceInWords("something else"), "Unknown device");
});
