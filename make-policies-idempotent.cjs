// Wraps every unguarded "create policy" in setup-ALL.sql so re-creating an
// existing policy is a no-op instead of a hard error.
//
// Several setup scripts define the same policy (setup-jobs-COMBINED.sql
// repeats what the individual jobs files declare, and setup-jobs-qty.sql
// duplicates setup-jobs-qty-tracking.sql). Postgres raises 42710 on the
// second attempt, which aborts the whole run. COMBINED already guards its
// own statements with a do-block that swallows duplicate_object; this
// applies the same treatment to the rest, so the file can be run in any
// order and re-run safely.
//
//   node make-policies-idempotent.cjs setup-ALL.sql

const fs = require("fs");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node make-policies-idempotent.cjs <file.sql>");
  process.exit(1);
}

const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
const out = [];
let inDoBlock = false;
let wrapped = 0;
let alreadyGuarded = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Track do $$ ... end $$; blocks — statements inside are already guarded.
  if (/do\s+\$\$/.test(line)) inDoBlock = true;
  if (inDoBlock) {
    if (/^\s*create\s+policy/i.test(line)) alreadyGuarded++;
    out.push(line);
    if (/end\s+\$\$\s*;/.test(line)) inDoBlock = false;
    continue;
  }

  if (!/^\s*create\s+policy/i.test(line)) {
    out.push(line);
    continue;
  }

  // Collect the whole statement, which may span lines, up to its semicolon.
  // Verified beforehand that no policy body contains a semicolon.
  const stmt = [line];
  while (!/;\s*$/.test(stmt[stmt.length - 1]) && i + 1 < lines.length) {
    stmt.push(lines[++i]);
  }
  if (!/;\s*$/.test(stmt[stmt.length - 1])) {
    console.error("Unterminated create policy near line " + (i + 1) + " — aborting.");
    process.exit(1);
  }

  out.push("do $$ begin");
  for (const s of stmt) out.push("  " + s.trim());
  out.push("exception when duplicate_object then null; end $$;");
  wrapped++;
}

fs.writeFileSync(file, out.join("\n"));
console.log(
  "Wrapped " + wrapped + " unguarded policies; left " +
  alreadyGuarded + " already-guarded ones untouched."
);
