// The app reloads itself when a newer build is live.
//
// A floor tablet keeps the app open for weeks and never picks up a new
// build. On 1 Oct 2026 one still ran a build from before 27 Sep, where a
// plain tick on Invoicing sent no invoice request, and JOB-0078 was closed
// that way. Heinrich, 13 Oct 2026: reload on its own, no banner, check
// every five minutes, never mid-typing and never mid-save.
//
// Vite names the main file after what is in it (/assets/index-XXXX.js), so
// a new build is a new name. The page knows the name it started with
// (newVersionIsOut in App.jsx compares the same two for the Refresh
// button). Here the server is asked every CHECK_MS, and on a return to
// Jobs or Production, and the page reloads at the next quiet moment:
// nobody in a box, no pop-up holding text, no save in flight. Never in
// the first minute after load, so a wrong answer cannot send a tablet
// round and round. No signal, or no built name (the dev server): nothing
// happens, nothing shows, and it is asked again next time.
//
// The rules are plain functions handed the page, so they run under
// npm test (buildWatch.test.js); useBuildWatch is what App.jsx calls.

import { useEffect, useRef } from "react";

export const CHECK_MS = 5 * 60000; // how often the server is asked
export const RETRY_MS = 30000; // a known new build looks for a quiet moment this often
export const FIRST_MINUTE_MS = 60000;

const BUILT_NAME = /\/assets\/index-[A-Za-z0-9_-]+\.js/;
const TYPING_IN = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const NOT_TEXT = new Set(["checkbox", "radio", "hidden", "button", "submit", "file"]);
// Every pop-up is a layer fixed over the page (S.modalOverlay,
// S.managerFullPage in theme.js): React writes that style out as text.
const POPUP_BOXES = '[style*="position: fixed"] input, [style*="position: fixed"] textarea';

// The built file the server's page asks for, or null (the dev server, an error page).
export const wantedBuild = (html) => (String(html || "").match(BUILT_NAME) || [null])[0];
// The files this page loaded.
export const runningBuilds = (doc, href) => [...doc.querySelectorAll('script[type="module"][src]')].map((el) => new URL(el.src, href).pathname);
export const newBuildOut = (running, wanted) => !!wanted && running.length > 0 && !running.includes(wanted);

export const typingNow = (doc) => {
  const el = doc.activeElement;
  return !!el && (TYPING_IN.has(el.tagName) || el.isContentEditable === true);
};
export const popupHoldsText = (doc) => [...doc.querySelectorAll(POPUP_BOXES)].some((box) => !NOT_TEXT.has(box.type) && String(box.value ?? "").trim() !== "");
export const quietMoment = ({ doc, busy, now, startedAt }) => now - startedAt >= FIRST_MINUTE_MS && !busy() && !typingNow(doc) && !popupHoldsText(doc);

// The watch itself, with the browser handed in so the tests can stand in
// for it: fetchPage() answers the server's page as text, or throws.
// check() is the timer's beat; check({ ask: true }) is a return to a page,
// which asks the server sooner. Answers in words, for the tests.
export function makeBuildWatch({ fetchPage, doc, href, busy, reload, now = Date.now, startedAt = now() }) {
  let seenNew = false; // a newer build is out; waiting for a quiet moment
  let lastAsked = -Infinity;
  let done = false;
  async function check({ ask = false } = {}) {
    if (done || now() - startedAt < FIRST_MINUTE_MS) return "too soon";
    if (!seenNew) {
      if (now() - lastAsked < (ask ? RETRY_MS : CHECK_MS)) return "not yet";
      lastAsked = now();
      try {
        seenNew = newBuildOut(runningBuilds(doc, href), wantedBuild(await fetchPage()));
      } catch {
        return "no answer";
      }
      if (!seenNew) return "same build";
    }
    if (!quietMoment({ doc, busy, now: now(), startedAt })) return "not quiet";
    done = true;
    reload();
    return "reloaded";
  }
  return { check };
}

async function fetchServedPage() {
  const res = await fetch(`/index.html?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`The page came back ${res.status}`);
  return res.text();
}

// `tab` is the open page; `busy()` says whether a save is in flight.
export function useBuildWatch(tab, busy) {
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const watchRef = useRef(null);
  if (watchRef.current === null) {
    watchRef.current = makeBuildWatch({
      fetchPage: fetchServedPage,
      doc: document,
      href: window.location.href,
      busy: () => busyRef.current(),
      reload: () => window.location.reload(),
    });
  }
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") watchRef.current.check();
    };
    const timer = setInterval(beat, RETRY_MS);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (tab === "jobs" || tab === "production") watchRef.current.check({ ask: true });
  }, [tab]);
}
