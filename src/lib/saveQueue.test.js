import test from "node:test";
import assert from "node:assert/strict";
import { makeSaveQueue } from "./saveQueue.js";

// A save that stays in flight until the test lets it go.
function heldSaves() {
  const calls = [];
  return {
    calls,
    save(prev, next) {
      return new Promise((resolve, reject) => calls.push({ prev, next, resolve, reject }));
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test("the first state is the starting point, nothing is sent", () => {
  const h = heldSaves();
  const q = makeSaveQueue({ save: h.save });
  q.request({ v: 0 });
  assert.equal(h.calls.length, 0);
  assert.equal(q.busy(), false);
});

test("one save at a time; changes made meanwhile go out as one catch-up", async () => {
  const h = heldSaves();
  let savedCalls = 0;
  const q = makeSaveQueue({ save: h.save, onSaved: () => (savedCalls += 1) });
  const s0 = { v: 0 }, s1 = { v: 1 }, s2 = { v: 2 }, s3 = { v: 3 };
  q.reset(s0);
  q.request(s1);
  q.request(s2);
  q.request(s3);
  assert.equal(h.calls.length, 1, "only the first is in flight");
  assert.deepEqual([h.calls[0].prev, h.calls[0].next], [s0, s1]);
  h.calls[0].resolve();
  await settle();
  assert.equal(h.calls.length, 2);
  assert.deepEqual([h.calls[1].prev, h.calls[1].next], [s1, s3], "from what was stored to the newest, skipping s2");
  assert.equal(savedCalls, 0, "not saved while something is owed");
  assert.equal(q.busy(), true);
  h.calls[1].resolve();
  await settle();
  assert.equal(savedCalls, 1);
  assert.equal(q.busy(), false);
});

test("a failed save stays owed and is sent again from the same starting point", async () => {
  const h = heldSaves();
  const timers = [];
  const errors = [];
  const q = makeSaveQueue({
    save: h.save,
    onError: (e) => errors.push(e.message),
    setTimer: (fn) => timers.push(fn) - 1,
    clearTimer: (i) => (timers[i] = null),
  });
  const s0 = { v: 0 }, s1 = { v: 1 };
  q.reset(s0);
  q.request(s1);
  h.calls[0].reject(new Error("offline"));
  await settle();
  assert.deepEqual(errors, ["offline"]);
  assert.equal(q.busy(), true, "still owed");
  assert.equal(timers.length, 1, "a retry is booked");
  timers[0]();
  assert.equal(h.calls.length, 2);
  assert.deepEqual([h.calls[1].prev, h.calls[1].next], [s0, s1], "the same difference again");
  h.calls[1].resolve();
  await settle();
  assert.equal(q.busy(), false);
});

test("a change after a failure retries at once and cancels the booked retry", async () => {
  const h = heldSaves();
  const timers = [];
  const q = makeSaveQueue({
    save: h.save,
    onError: () => {},
    setTimer: (fn) => timers.push(fn) - 1,
    clearTimer: (i) => (timers[i] = null),
  });
  const s0 = { v: 0 }, s1 = { v: 1 }, s2 = { v: 2 };
  q.reset(s0);
  q.request(s1);
  h.calls[0].reject(new Error("offline"));
  await settle();
  q.request(s2);
  assert.equal(h.calls.length, 2);
  assert.deepEqual([h.calls[1].prev, h.calls[1].next], [s0, s2], "both changes, from what is really stored");
  assert.equal(timers[0], null, "the booked retry was cancelled");
});

test("asking again with the same state sends nothing new, but retries what is owed", async () => {
  const h = heldSaves();
  const q = makeSaveQueue({ save: h.save, onError: () => {}, setTimer: () => 0, clearTimer: () => {} });
  const s0 = { v: 0 }, s1 = { v: 1 };
  q.reset(s0);
  q.request(s0);
  assert.equal(h.calls.length, 0);
  q.request(s1);
  q.request(s1);
  assert.equal(h.calls.length, 1, "in flight already");
  h.calls[0].reject(new Error("x"));
  await settle();
  q.request(s1);
  assert.equal(h.calls.length, 2, "page hide or a flush retries the owed save");
});

test("changes() moves with every new state, so a refresh can tell its answer is old", () => {
  const h = heldSaves();
  const q = makeSaveQueue({ save: h.save });
  q.reset({ v: 0 });
  const before = q.changes();
  q.request({ v: 1 });
  assert.notEqual(q.changes(), before);
});
