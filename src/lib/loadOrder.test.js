// Reloads landing out of order never put an older answer over a newer one.
//
// Run with:   npm test
//
// fakeScreen below reloads the way fetchProductionQueue in App.jsx does:
// take a number, wait for the answer, show it only if the order allows,
// take "Loading…" down only for the newest. Each reload's answer is handed
// over by the test, so the test decides which one lands first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLoadOrder } from "./loadOrder.js";

function fakeScreen() {
  const order = makeLoadOrder();
  const screen = { showing: null, loading: false };
  function reload() {
    const loadNo = order.start();
    screen.loading = true;
    let land;
    let fail;
    const answer = new Promise((resolve, reject) => {
      land = resolve;
      fail = reject;
    });
    const done = answer
      .then(
        (data) => {
          if (order.mayShow(loadNo)) screen.showing = data;
        },
        () => {
          if (order.mayShow(loadNo)) screen.showing = "empty";
        }
      )
      .then(() => {
        if (order.isNewest(loadNo)) screen.loading = false;
      });
    return { land, fail, done };
  }
  return { screen, reload };
}

test("answers landing in order each go on screen", async () => {
  const { screen, reload } = fakeScreen();
  const first = reload();
  const second = reload();
  first.land("count 1");
  await first.done;
  assert.equal(screen.showing, "count 1");
  assert.equal(screen.loading, true, "the second reload is still out");
  second.land("count 2");
  await second.done;
  assert.equal(screen.showing, "count 2");
  assert.equal(screen.loading, false);
});

test("an older answer landing last is dropped", async () => {
  const { screen, reload } = fakeScreen();
  const first = reload();
  const second = reload();
  second.land("count 2");
  await second.done;
  assert.equal(screen.showing, "count 2");
  assert.equal(screen.loading, false);
  first.land("count 1");
  await first.done;
  assert.equal(screen.showing, "count 2", "the old answer must not cover the new one");
  assert.equal(screen.loading, false);
});

test("a save's own reload shows even though another has started", async () => {
  // Log waits for this reload. It must not be thrown away just because a
  // second one is on its way, or Log comes back over the old number.
  const { screen, reload } = fakeScreen();
  screen.showing = "count 0";
  const first = reload();
  reload();
  first.land("count 1");
  await first.done;
  assert.equal(screen.showing, "count 1");
});

test("an old reload failing late does not blank a newer good screen", async () => {
  const { screen, reload } = fakeScreen();
  const first = reload();
  const second = reload();
  second.land("count 2");
  await second.done;
  first.fail(new Error("no signal"));
  await first.done;
  assert.equal(screen.showing, "count 2");
});

test("the newest reload failing still shows as it did before", async () => {
  const { screen, reload } = fakeScreen();
  const first = reload();
  const second = reload();
  first.land("count 1");
  await first.done;
  second.fail(new Error("no signal"));
  await second.done;
  assert.equal(screen.showing, "empty");
  assert.equal(screen.loading, false);
});

test("three reloads, the middle one last", async () => {
  const { screen, reload } = fakeScreen();
  const a = reload();
  const b = reload();
  const c = reload();
  a.land("a");
  await a.done;
  c.land("c");
  await c.done;
  b.land("b");
  await b.done;
  assert.equal(screen.showing, "c");
  assert.equal(screen.loading, false);
});

test("each screen keeps its own order", () => {
  const one = makeLoadOrder();
  const two = makeLoadOrder();
  assert.equal(one.start(), 1);
  assert.equal(one.start(), 2);
  assert.equal(two.start(), 1);
  assert.equal(two.mayShow(1), true);
  assert.equal(one.mayShow(2), true);
  assert.equal(one.mayShow(1), false);
});
