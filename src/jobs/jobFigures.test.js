// The Jobs list's money figures: on order, and invoiced in a month.
//
// Run with:   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthKeySA,
  jobWorth,
  requestedTotalFor,
  suggestedInvoiceAmount,
  readInvoiceAmount,
  onOrderFigure,
  invoicedInMonthFigure,
  requestedInMonthFigure,
} from "./jobFigures.js";

test("a month is a South African month, not a UTC one", () => {
  // 23:30 UTC on 31 August is 01:30 on 1 September in South Africa.
  assert.equal(monthKeySA("2026-08-31T23:30:00.000Z"), "2026-09");
  // 21:59 UTC is 23:59 the same evening: still August.
  assert.equal(monthKeySA("2026-08-31T21:59:00.000Z"), "2026-08");
  // The last two hours of the year.
  assert.equal(monthKeySA("2026-12-31T22:00:00.000Z"), "2027-01");
  assert.equal(monthKeySA(new Date("2026-09-17T10:00:00.000Z")), "2026-09");
});

test("no date, or one that cannot be read, is no month", () => {
  assert.equal(monthKeySA(null), "");
  assert.equal(monthKeySA(""), "");
  assert.equal(monthKeySA("not a date"), "");
});

test("a job is worth its lines, and failing that its Quoted value box", () => {
  assert.equal(jobWorth({ id: "a", quoted_value: 500 }, { a: 1200 }), 1200);
  assert.equal(jobWorth({ id: "a", quoted_value: 500 }, {}), 500);
  assert.equal(jobWorth({ id: "a", quoted_value: "750.5" }, null), 750.5);
  assert.equal(jobWorth({ id: "a", quoted_value: null }, {}), 0);
});

test("requests on a job add up; other jobs' requests are left out", () => {
  const requests = [
    { job_id: "a", total_amount: 100 },
    { job_id: "b", total_amount: 999 },
    { job_id: "a", total_amount: "250.50" },
    { job_id: "a", total_amount: null },
  ];
  assert.equal(requestedTotalFor("a", requests), 350.5);
  assert.equal(requestedTotalFor("c", requests), 0);
  assert.equal(requestedTotalFor("a", null), 0);
});

test("the amount box offers what was requested, then what the job is worth", () => {
  const job = { id: "a", quoted_value: 800 };
  assert.equal(suggestedInvoiceAmount(job, [{ job_id: "a", total_amount: 1234.5 }], { a: 5000 }), "1234.50");
  assert.equal(suggestedInvoiceAmount(job, [], { a: 5000 }), "5000.00");
  assert.equal(suggestedInvoiceAmount(job, [{ job_id: "a", total_amount: 0 }], {}), "800.00");
  assert.equal(suggestedInvoiceAmount({ id: "z" }, [], {}), "");
  // Marked before and moved back: the amount typed then, nought included.
  assert.equal(suggestedInvoiceAmount({ id: "a", invoiced_amount: 990 }, [{ job_id: "a", total_amount: 1234.5 }], {}), "990.00");
  assert.equal(suggestedInvoiceAmount({ id: "a", invoiced_amount: 0 }, [{ job_id: "a", total_amount: 1234.5 }], {}), "0.00");
});

test("a typed amount: nought counts, blank and nonsense do not", () => {
  assert.equal(readInvoiceAmount("1234.567"), 1234.57);
  assert.equal(readInvoiceAmount(" 0 "), 0);
  assert.equal(readInvoiceAmount(""), null);
  assert.equal(readInvoiceAmount(null), null);
  assert.equal(readInvoiceAmount("-5"), null);
  assert.equal(readInvoiceAmount("abc"), null);
});

test("on order: In Progress and Complete only, unpriced jobs counted apart", () => {
  const jobs = [
    { id: "a", status: "in_progress" },
    { id: "b", status: "complete", quoted_value: 300 },
    { id: "c", status: "in_progress" },
    { id: "d", status: "invoiced" },
    { id: "e", status: "cancelled" },
  ];
  const fig = onOrderFigure(jobs, { a: 1000, d: 7000, e: 9000 });
  assert.deepEqual(fig, { total: 1300, count: 3, unpriced: 1 });
  assert.deepEqual(onOrderFigure([], {}), { total: 0, count: 0, unpriced: 0 });
});

test("invoiced in a month: the typed amount, else what the job was quoted at", () => {
  const jobs = [
    // Typed amount wins over the lines.
    { id: "a", status: "invoiced", invoiced_at: "2026-09-03T08:00:00Z", invoiced_amount: 1500 },
    // Invoiced before the box existed: counts at its worth, and is counted.
    { id: "b", status: "invoiced", invoiced_at: "2026-09-10T08:00:00Z", invoiced_amount: null },
    // A database without the column yet: no key at all.
    { id: "c", status: "invoiced", invoiced_at: "2026-09-11T08:00:00Z" },
    // Nought is a real amount, not a missing one.
    { id: "d", status: "invoiced", invoiced_at: "2026-09-12T08:00:00Z", invoiced_amount: 0 },
    // Last month.
    { id: "e", status: "invoiced", invoiced_at: "2026-08-20T08:00:00Z", invoiced_amount: 9999 },
    // Moved back off Invoiced: the date stays on the row, the job does not count.
    { id: "f", status: "complete", invoiced_at: "2026-09-05T08:00:00Z", invoiced_amount: 4000 },
    // 01:30 on 1 September in South Africa.
    { id: "g", status: "invoiced", invoiced_at: "2026-08-31T23:30:00Z", invoiced_amount: 200 },
    // Invoiced with no date cannot be put in any month.
    { id: "h", status: "invoiced", invoiced_at: null, invoiced_amount: 50 },
  ];
  const fig = invoicedInMonthFigure(jobs, "2026-09", { b: 600, c: 400, d: 8000 });
  assert.deepEqual(fig, { total: 1500 + 600 + 400 + 0 + 200, count: 5, atQuotedValue: 2 });
});

test("requested in a month: every request sent in it, by the day it was sent", () => {
  const requests = [
    { job_id: "a", total_amount: 100, submitted_at: "2026-09-02T08:00:00Z" },
    // A second request on the same job: counted, and the job counted once.
    { job_id: "a", total_amount: "50.25", submitted_at: "2026-09-20T08:00:00Z" },
    { job_id: "b", total_amount: 0, submitted_at: "2026-09-21T08:00:00Z" },
    // 01:30 on 1 October in South Africa.
    { job_id: "c", total_amount: 999, submitted_at: "2026-09-30T23:30:00Z" },
    // 01:30 on 1 September in South Africa.
    { job_id: "d", total_amount: 10, submitted_at: "2026-08-31T23:30:00Z" },
    { job_id: "e", total_amount: 5000, submitted_at: "2026-08-15T08:00:00Z" },
    { job_id: "f", total_amount: 7, submitted_at: null },
  ];
  assert.deepEqual(requestedInMonthFigure(requests, "2026-09"), { total: 160.25, count: 4, jobs: 3 });
  assert.deepEqual(requestedInMonthFigure(null, "2026-09"), { total: 0, count: 0, jobs: 0 });
  assert.deepEqual(requestedInMonthFigure(requests, ""), { total: 0, count: 0, jobs: 0 });
});

test("no month asked for counts nothing", () => {
  const jobs = [{ id: "h", status: "invoiced", invoiced_at: null, invoiced_amount: 50 }];
  assert.deepEqual(invoicedInMonthFigure(jobs, "", {}), { total: 0, count: 0, atQuotedValue: 0 });
});
