// Is a table really on the LIVE database?
//
//   node CHECK-live-table.cjs job_invoice_notes job_documents
//
// After a SQL paste on live there is no way to see from here whether it
// landed -- the SQL editor is Heinrich's screen, not ours. But the live
// site carries its own database address and public key in the built
// bundle (they are public by design; the browser has to hold them), so
// this reads them off the site and asks that database the same question
// the app asks. Read-only: one select of at most one row per table.
//
// A "NO" straight after a paste can be PostgREST's schema cache, which
// lags about a minute behind a new table. Run it again before concluding
// the SQL did not land.

const SITE = "https://stock-control-01.vercel.app";

async function get(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.text();
}

(async () => {
  const tables = process.argv.slice(2);
  if (tables.length === 0) {
    console.log("Name at least one table:  node CHECK-live-table.cjs job_invoice_notes");
    process.exit(2);
  }

  const html = await get(SITE + "/index.html?nocache=" + Date.now());
  const entry = (html.match(/src="(\/assets\/index-[^"]+\.js)"/) || [])[1];
  if (!entry) throw new Error("could not find the entry chunk in index.html");

  // The details could sit in the entry chunk or in the App chunk.
  const chunks = [entry];
  const entryJs = await get(SITE + entry);
  for (const m of entryJs.matchAll(/"(\/assets\/App-[^"]+\.js)"/g)) chunks.push(m[1]);
  for (const m of entryJs.matchAll(/from"(\.\/[^"]+\.js)"/g)) chunks.push("/assets/" + m[1].slice(2));

  let url = null;
  let key = null;
  for (const c of [...new Set(chunks)]) {
    let js;
    try {
      js = await get(SITE + c);
    } catch {
      continue;
    }
    url = url || (js.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
    key = key || (js.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/) || [])[0];
    if (url && key) break;
  }
  if (!url || !key) throw new Error("could not read the database details out of the live bundle");

  console.log("Live database: " + url);
  console.log("");

  let allThere = true;
  for (const t of tables) {
    const r = await fetch(url + "/rest/v1/" + t + "?select=*&limit=1", {
      headers: { apikey: key, Authorization: "Bearer " + key },
    });
    const body = await r.text();
    const there = r.status !== 404;
    if (!there) allThere = false;
    console.log("  " + (there ? "yes  " : "NO   ") + t + "   (" + r.status + ")" + (there ? "" : "  " + body.slice(0, 120)));
  }
  console.log("");
  console.log(
    allThere
      ? "On live. (An empty [] above is normal: the public key sees no rows, only whether the table answers.)"
      : "Not there yet. PostgREST can lag about a minute after the paste -- run this again. Still NO means the SQL did not land."
  );
  process.exit(allThere ? 0 : 1);
})().catch((e) => {
  console.log("FAILED: " + e.message);
  process.exit(2);
});
