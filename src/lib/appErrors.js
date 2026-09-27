// The record of crashes: what the crash screen (src/ErrorBoundary.jsx)
// writes down, and what Stock Manager -> App errors reads back.
//
// One row per crash in app_errors (setup-app-errors.sql). Anybody signed
// in adds a line, for themselves; only admins read them; nobody edits or
// deletes one; the table clears lines older than 90 days by itself.
// (Heinrich, 27 Sep 2026: the list on its own button in Stock Manager,
// admins only, 90 days kept.)
//
// Writing a crash down must never make things worse: every call here
// swallows its own failure, and on a database without the table nothing
// happens at all.
//
// The database calls take the client as their first argument, so the
// rules below can be tested with no database: npm test.

// The same number the table's own clearing uses (setup-app-errors.sql).
// Change one, change the other.
export const KEEP_DAYS = 90;
// What the list calls recent: its open pill.
export const RECENT_DAYS = 7;
// The list asks for this many, newest first, and says so when it is full.
export const LIST_LIMIT = 200;
// A screen that crashes every time it is drawn would write a line per
// redraw. The same crash on the same device is written down once in this
// long.
export const SAME_CRASH_MINUTES = 10;

const DAY_MS = 86400000;
const TABLE = "app_errors";

// The table's own limits (setup-app-errors.sql), one short of each so the
// cut mark fits.
const cut = (text, max) => {
  const t = String(text ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

// One crash as the row the table takes. `user_id` and `happened_at` are
// left to the database, which knows who is signed in and what time it is.
export function crashRow({ heading, error, componentStack, build, device, site, userEmail }) {
  const message = error?.message ? `${error.name || "Error"}: ${error.message}` : String(error ?? "Unknown error");
  const where = String(componentStack || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return {
    heading: cut(heading || "Something went wrong on this screen", 300),
    message: cut(message, 2000),
    details: cut(where, 8000) || null,
    app_build: cut(build, 200) || null,
    device: cut(device, 500) || null,
    site: cut(site, 200) || null,
    user_email: cut(userEmail, 320) || null,
  };
}

// Whether this crash was written down a moment ago. `seen` maps a crash to
// when it was last written; the answer no also notes it as written now.
export function seenLately(seen, row, now, minutes = SAME_CRASH_MINUTES) {
  const key = `${row.heading}|${row.message}`;
  const last = seen.get(key);
  if (last != null && now - last < minutes * 60000) return true;
  seen.set(key, now);
  return false;
}

// The database saying "there is no such table": the SQL has not been run
// on this database yet. PostgREST's own code, then Postgres's.
export const isNoTable = (error) => ["PGRST205", "42P01"].includes(error?.code) || /could not find the table/i.test(error?.message || "");

// What this device remembers between crashes, until the page is reloaded:
// which crashes it wrote a moment ago, and whether the database has
// already said it has no such table (then it is not asked again).
const SEEN = new Map();
const MEMO = { tableMissing: false };

// What the browser can say about itself. Nothing here exists in a test.
function thisDevice() {
  if (typeof window === "undefined") return {};
  const entry = typeof document === "undefined" ? null : document.querySelector('script[type="module"][src]');
  return {
    build: entry ? entry.getAttribute("src").split("/").pop() : "",
    device: window.navigator?.userAgent || "",
    site: window.location?.host || "",
  };
}

// Writes one crash down. Answers with what happened, for the tests and
// the console; nothing on screen waits for it. Never throws.
export async function recordCrash(client, { heading, error, componentStack }, { now = Date.now(), seen = SEEN, memo = MEMO, device = thisDevice() } = {}) {
  try {
    if (!client || memo.tableMissing) return "off";
    const row = crashRow({ heading, error, componentStack, ...device });
    if (seenLately(seen, row, now)) return "written a moment ago";
    const { data } = await client.auth.getSession();
    const user = data?.session?.user;
    // Nobody signed in: the database would refuse the line.
    if (!user) return "nobody signed in";
    const { error: failed } = await client.from(TABLE).insert({ ...row, user_email: cut(user.email, 320) || null });
    if (!failed) return "written";
    if (isNoTable(failed)) {
      memo.tableMissing = true;
      return "off";
    }
    console.warn("The crash could not be written down:", failed.message || failed);
    return "failed";
  } catch (err) {
    console.warn("The crash could not be written down:", err?.message || err);
    return "failed";
  }
}

// The list: everything kept, newest first, LIST_LIMIT at most. Asked when
// the screen is opened and when its Refresh is pressed, never on a timer.
export async function loadCrashes(client, { now = Date.now() } = {}) {
  if (!client) return { rows: [], notSetUp: true };
  const { data, error } = await client
    .from(TABLE)
    .select("id, happened_at, user_id, user_email, heading, message, details, app_build, device, site")
    .gte("happened_at", new Date(now - KEEP_DAYS * DAY_MS).toISOString())
    .order("happened_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) return isNoTable(error) ? { rows: [], notSetUp: true } : { rows: [], failed: error.message || String(error) };
  return { rows: data || [], full: (data || []).length >= LIST_LIMIT };
}

// How many crashes the last week holds: the red number on the Stock
// Manager button, for admins (Heinrich, 27 Sep 2026). The same week as the
// list's open pill, so the two numbers agree. One request that brings a
// number and no rows; asked when an admin's app starts and on Refresh,
// never on a timer. Nothing to say, or no table yet, is no number at all.
export async function countRecentCrashes(client, { now = Date.now() } = {}) {
  try {
    if (!client) return null;
    const { count, error } = await client
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .gte("happened_at", new Date(now - RECENT_DAYS * DAY_MS).toISOString());
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

// Who it happened to, in the words the list shows: the person's name where
// the people list has them, else the address they sign in with.
export function crashWho(row, people) {
  const person = (people || []).find((p) => p.id && p.id === row.user_id);
  return (person?.name || "").trim() || (row.user_email || "").trim() || "Unknown";
}

// The list's two pills: this week, and the rest.
export function splitByAge(rows, now, days = RECENT_DAYS) {
  const edge = now - days * DAY_MS;
  const recent = [];
  const older = [];
  for (const r of rows || []) (Date.parse(r.happened_at) >= edge ? recent : older).push(r);
  return { recent, older };
}

// The search box: every word typed must be somewhere in the line, in what
// failed, the error's words, who it was, or the address or build.
export function crashMatchesSearch(row, typed, who) {
  const words = String(typed || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [row.heading, row.message, who, row.user_email, row.site, row.app_build].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// "Chrome on Android", from the browser's own long description of itself.
// Rough on purpose: enough to tell a floor tablet from an office PC.
export function deviceInWords(device) {
  const d = String(device || "");
  if (!d) return "";
  const system = /Android/.test(d) ? "Android" : /iPhone|iPad|iPod/.test(d) ? "iPhone or iPad" : /Windows/.test(d) ? "Windows" : /Mac OS X/.test(d) ? "Mac" : /Linux/.test(d) ? "Linux" : "";
  const browser = /HuaweiBrowser/.test(d) ? "Huawei Browser" : /Edg\//.test(d) ? "Edge" : /SamsungBrowser/.test(d) ? "Samsung Internet" : /Firefox\//.test(d) ? "Firefox" : /Chrome\//.test(d) ? "Chrome" : /Safari\//.test(d) ? "Safari" : "";
  return [browser, system].filter(Boolean).join(" on ") || "Unknown device";
}
