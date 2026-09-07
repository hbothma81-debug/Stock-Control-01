// Tells you what the live site is actually serving right now.
//
// Pushing does not mean deployed. Vercel takes a minute or two, and a
// failed build leaves the old version up with nothing on screen to say so.
// The only honest way to know a change is live is to fetch the real page
// and look inside the file the browser downloads.
//
// Run it with:
//
//     node CHECK-what-is-live.cjs
//     node CHECK-what-is-live.cjs "Done nesting" "Add another program"
//
// Give it wording that exists ONLY in the new version -- a button label you
// just added, a message you just changed. Wording that was already there
// will say "yes" against the OLD build and tell you nothing, which is a
// mistake worth avoiding: it looks exactly like success.

const SITE = "https://stock-control-01.vercel.app";
const want = process.argv.slice(2);

(async () => {
  try {
    const html = await (await fetch(SITE, { cache: "no-store" })).text();

    const entry = (html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0];
    if (!entry) {
      console.log("Could not find the app's starting file on the live page.");
      console.log("The site may be down, or showing an error page.");
      process.exit(1);
    }

    const entryJs = await (await fetch(SITE + entry)).text();
    // The starting file names the main chunk without its folder, so match
    // the file name and put the folder back on.
    const chunk = (entryJs.match(/App-[A-Za-z0-9_-]+\.js/) || [])[0];
    if (!chunk) {
      console.log("Found the starting file but not the main app file inside it.");
      process.exit(1);
    }

    const app = await (await fetch(SITE + "/assets/" + chunk)).text();

    console.log(`Live now: ${chunk}  (${Math.round(app.length / 1024)} kB)`);
    console.log(SITE);

    if (want.length === 0) {
      console.log("\nNo wording given, so nothing was checked.");
      console.log('Pass some, e.g.  node CHECK-what-is-live.cjs "Done nesting"');
      process.exit(0);
    }

    console.log("");
    let missing = 0;
    for (const w of want) {
      const there = app.includes(w);
      if (!there) missing++;
      console.log(`  ${there ? "yes " : "NO  "}  ${w}`);
    }

    console.log("");
    if (missing === 0) {
      console.log("All of it is live. The people using the app have this version.");
    } else {
      console.log(`${missing} of ${want.length} not there yet.`);
      console.log("Either the deploy is still building, or it failed and the old version is still up.");
      console.log("Check the Deployments list on Vercel.");
    }
    process.exit(missing === 0 ? 0 : 1);
  } catch (err) {
    console.log("Could not reach the live site: " + err.message);
    process.exit(1);
  }
})();
