// The app reloading itself when a newer build is live: which name is new,
// and when a moment is quiet enough to reload.
//
// Run with:   npm test
//
// The page is a stand-in: which module scripts it loaded, which element
// has the focus, and which boxes sit in a pop-up.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_MS,
  RETRY_MS,
  FIRST_MINUTE_MS,
  wantedBuild,
  runningBuilds,
  newBuildOut,
  typingNow,
  popupHoldsText,
  quietMoment,
  makeBuildWatch,
} from "./buildWatch.js";

const SITE = "https://stock-control-01.vercel.app/";
const OLD = "/assets/index-AflmsRy5.js";
const NEW = "/assets/index-D7dWRvwi.js";
const served = (name) => `<!doctype html><html><head><script type="module" crossorigin src="${name}"></script></head><body></body></html>`;
const DEV_PAGE = '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>';

function page({ scripts = [OLD], active = null, popupBoxes = [] } = {}) {
  return {
    activeElement: active,
    querySelectorAll: (selector) => (selector.startsWith("script") ? scripts.map((src) => ({ src: new URL(src, SITE).href })) : popupBoxes),
  };
}

test("the served page names its built file; the dev server and an error page name none", () => {
  assert.equal(wantedBuild(served(NEW)), NEW);
  assert.equal(wantedBuild(DEV_PAGE), null);
  assert.equal(wantedBuild("<html><body>502 Bad Gateway</body></html>"), null);
  assert.equal(wantedBuild(null), null);
});

test("a new build is a different name; the same name, no name or no scripts is nothing", () => {
  assert.equal(runningBuilds(page(), SITE)[0], OLD);
  assert.equal(newBuildOut([OLD], NEW), true);
  assert.equal(newBuildOut([OLD], OLD), false, "the build just loaded: never a reload loop");
  assert.equal(newBuildOut([OLD], null), false, "no built name on the page: the dev server");
  assert.equal(newBuildOut([], NEW), false, "nothing loaded: nothing to compare");
  assert.equal(newBuildOut(["/src/main.jsx"], NEW), true, "the dev server can be faked a new build by hand");
});

test("typing is a focused box: input, textarea, select or editable text; a button is not", () => {
  assert.equal(typingNow(page()), false);
  assert.equal(typingNow(page({ active: { tagName: "INPUT" } })), true);
  assert.equal(typingNow(page({ active: { tagName: "TEXTAREA" } })), true);
  assert.equal(typingNow(page({ active: { tagName: "SELECT" } })), true);
  assert.equal(typingNow(page({ active: { tagName: "DIV", isContentEditable: true } })), true);
  assert.equal(typingNow(page({ active: { tagName: "BUTTON" } })), false);
  assert.equal(typingNow(page({ active: { tagName: "BODY" } })), false);
});

test("a pop-up holds text when one of its text boxes is not empty; ticks and spaces do not count", () => {
  assert.equal(popupHoldsText(page()), false);
  assert.equal(popupHoldsText(page({ popupBoxes: [{ type: "text", value: "" }] })), false);
  assert.equal(popupHoldsText(page({ popupBoxes: [{ type: "text", value: "   " }] })), false);
  assert.equal(popupHoldsText(page({ popupBoxes: [{ type: "checkbox", value: "on" }] })), false);
  assert.equal(popupHoldsText(page({ popupBoxes: [{ type: "text", value: "" }, { type: "textarea", value: "Rush job" }] })), true);
  assert.equal(popupHoldsText(page({ popupBoxes: [{ type: "number", value: "12" }] })), true);
});

test("a quiet moment: past the first minute, no save in flight, nobody typing, no pop-up with text", () => {
  const quiet = (over = {}) => quietMoment({ doc: page(), busy: () => false, now: FIRST_MINUTE_MS, startedAt: 0, ...over });
  assert.equal(quiet(), true);
  assert.equal(quiet({ now: FIRST_MINUTE_MS - 1 }), false, "the first minute");
  assert.equal(quiet({ busy: () => true }), false, "a save in flight");
  assert.equal(quiet({ doc: page({ active: { tagName: "INPUT" } }) }), false, "typing");
  assert.equal(quiet({ doc: page({ popupBoxes: [{ type: "text", value: "x" }] }) }), false, "a pop-up with text");
});

// A watch with a clock, a server and a page the test controls.
function watch({ html = served(OLD), doc = page(), busy = () => false, fail = false } = {}) {
  const clock = { t: 0 };
  const log = { fetches: 0, reloads: 0 };
  const w = makeBuildWatch({
    fetchPage: async () => {
      log.fetches += 1;
      if (fail) throw new TypeError("Failed to fetch");
      return html;
    },
    doc,
    href: SITE,
    busy,
    reload: () => (log.reloads += 1),
    now: () => clock.t,
    startedAt: 0,
  });
  return { w, clock, log };
}

test("nothing is asked in the first minute; then the server is asked, and again only after CHECK_MS", async () => {
  const { w, clock, log } = watch();
  assert.equal(await w.check(), "too soon");
  assert.equal(log.fetches, 0);
  clock.t = FIRST_MINUTE_MS;
  assert.equal(await w.check(), "same build");
  assert.equal(log.fetches, 1);
  clock.t += RETRY_MS;
  assert.equal(await w.check(), "not yet");
  assert.equal(log.fetches, 1, "the same beat does not ask again");
  clock.t = FIRST_MINUTE_MS + CHECK_MS;
  assert.equal(await w.check(), "same build");
  assert.equal(log.fetches, 2);
  assert.equal(log.reloads, 0);
});

test("a return to a page asks sooner, but not more than once in RETRY_MS", async () => {
  const { w, clock, log } = watch();
  clock.t = FIRST_MINUTE_MS;
  assert.equal(await w.check({ ask: true }), "same build");
  assert.equal(await w.check({ ask: true }), "not yet");
  clock.t += RETRY_MS;
  assert.equal(await w.check({ ask: true }), "same build");
  assert.equal(log.fetches, 2);
});

test("a new build at a quiet moment reloads once, and never again", async () => {
  const { w, clock, log } = watch({ html: served(NEW) });
  clock.t = FIRST_MINUTE_MS;
  assert.equal(await w.check(), "reloaded");
  assert.equal(log.reloads, 1);
  clock.t += CHECK_MS;
  assert.equal(await w.check(), "too soon", "done: nothing more happens on this page");
  assert.equal(log.reloads, 1);
  assert.equal(log.fetches, 1);
});

test("a new build while somebody types waits, then reloads at the next beat without asking the server again", async () => {
  const doc = page({ active: { tagName: "INPUT" } });
  const { w, clock, log } = watch({ html: served(NEW), doc });
  clock.t = FIRST_MINUTE_MS;
  assert.equal(await w.check(), "not quiet");
  assert.equal(log.reloads, 0);
  clock.t += RETRY_MS;
  assert.equal(await w.check(), "not quiet", "still typing");
  doc.activeElement = { tagName: "BUTTON" };
  clock.t += RETRY_MS;
  assert.equal(await w.check(), "reloaded");
  assert.equal(log.fetches, 1, "the new build was known; no second ask");
  assert.equal(log.reloads, 1);
});

test("a save in flight holds the reload until it is done", async () => {
  let saving = true;
  const { w, clock, log } = watch({ html: served(NEW), busy: () => saving });
  clock.t = FIRST_MINUTE_MS;
  assert.equal(await w.check(), "not quiet");
  saving = false;
  clock.t += RETRY_MS;
  assert.equal(await w.check(), "reloaded");
  assert.equal(log.reloads, 1);
});

test("no signal: no reload, nothing thrown, and the server is asked again next time", async () => {
  const { w, clock, log } = watch({ fail: true });
  clock.t = FIRST_MINUTE_MS;
  assert.equal(await w.check(), "no answer");
  clock.t += CHECK_MS;
  assert.equal(await w.check(), "no answer");
  assert.equal(log.fetches, 2);
  assert.equal(log.reloads, 0);
});

test("the dev server's page names no built file, so it never reloads", async () => {
  const { w, clock, log } = watch({ html: DEV_PAGE, doc: page({ scripts: ["/src/main.jsx"] }) });
  clock.t = FIRST_MINUTE_MS;
  assert.equal(await w.check(), "same build");
  assert.equal(log.reloads, 0);
});
