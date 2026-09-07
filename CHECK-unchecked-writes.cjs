// Finds writes to the database whose result nobody looks at.
//
// Supabase does not throw when a write fails. It hands back an error you
// have to read. So this:
//
//     await supabase.from("job_notifications").insert(rows);
//
// fails in complete silence — the screen looks right, nothing is logged,
// and the row simply never existed. That is exactly how stop reports
// were reaching nobody.
//
// A checked write looks like one of these:
//
//     const { error } = await supabase.from("x").insert(rows);
//     if (error) throw error;
//
//     ops.push(supabase.from("x").insert(rows));   // checked in a batch
//
// Run it with:   node CHECK-unchecked-writes.cjs

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const WRITES = ["insert", "update", "upsert", "delete", "rpc"];
const root = path.join(__dirname, "src");

function jsFiles(dir) {
  return fs.readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return fs.statSync(f).isDirectory() ? jsFiles(f) : /\.(jsx?|mjs)$/.test(n) ? [f] : [];
  });
}

// Walk back up the member chain to find the supabase.from(...) this
// write belongs to, and the table it names.
function tableOf(node) {
  let n = node;
  while (n && n.type === "CallExpression") {
    const callee = n.callee;
    if (callee && callee.type === "MemberExpression") {
      if (
        callee.object &&
        callee.object.type === "CallExpression" &&
        callee.object.callee &&
        callee.object.callee.property &&
        callee.object.callee.property.name === "from"
      ) {
        const arg = callee.object.arguments[0];
        return arg && arg.type === "StringLiteral" ? arg.value : "(unknown)";
      }
      n = callee.object;
    } else break;
  }
  return null;
}

let unchecked = 0;
let checked = 0;
let unread = 0;

for (const file of jsFiles(root)) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parser.parse(code, { sourceType: "module", plugins: ["jsx", "optionalChaining", "nullishCoalescingOperator"] });
  } catch {
    continue;
  }

  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      if (!callee || callee.type !== "MemberExpression" || !callee.property) return;
      if (!WRITES.includes(callee.property.name)) return;

      // Only supabase writes, not array .delete or similar.
      const src = code.slice(p.node.start, p.node.end);
      if (!/supabase[\s\S]*\.(from|rpc)\(/.test(src) && !/^supabase\.rpc/.test(src)) return;

      const table = tableOf(p.node) || (callee.property.name === "rpc" ? "(rpc)" : null);
      if (table === null) return;

      // Walk outwards: is the result read, or pushed somewhere to be
      // read later?
      let cursor = p;
      let looksChecked = false;
      // Each .eq() in a chain costs two steps outward, not one -- the
      // property and then the call -- so six was only ever enough for the
      // chains that happened to exist when this was written. One more .eq()
      // than its neighbour and a perfectly checked write was reported as
      // unchecked. The break on a statement boundary below is what actually
      // stops the walk running somewhere it should not.
      for (let i = 0; i < 20 && cursor.parentPath; i++) {
        cursor = cursor.parentPath;
        const t = cursor.node.type;
        // const { error } = await ...   /   const { data, error } = ...
        if (t === "VariableDeclarator" && cursor.node.id && cursor.node.id.type === "ObjectPattern") {
          const names = cursor.node.id.properties.map((pr) => pr.key && pr.key.name);
          if (names.includes("error")) looksChecked = true;
          break;
        }
        // let q = supabase.from("x").delete();  then more .eq() added, and
        // awaited with its error read further down. A query being built in
        // stages, not a write being fired and forgotten — so follow the
        // name and see whether its result is ever read.
        if (t === "VariableDeclarator" && cursor.node.id && cursor.node.id.type === "Identifier") {
          const name = cursor.node.id.name;
          const after = code.slice(cursor.node.end);
          if (new RegExp("\\{[^}]*error[^}]*\\}\\s*=\\s*await\\s+" + name + "\\b").test(after)) {
            looksChecked = true;
          }
          break;
        }
        // ops.push(supabase...) / Promise.all([...]) — read together later
        if (t === "CallExpression" || t === "ArrayExpression") {
          const outer = code.slice(cursor.node.start, Math.min(cursor.node.end, cursor.node.start + 40));
          if (/push\(|all\(|allSettled\(/.test(outer)) {
            looksChecked = true;
            break;
          }
        }
        // return supabase.from(...).insert(...)  — the caller's problem
        if (t === "ReturnStatement" || t === "ArrowFunctionExpression") {
          looksChecked = true;
          break;
        }
        if (t === "ExpressionStatement") break;
      }

      if (looksChecked) {
        checked++;
        return;
      }
      unchecked++;
      const line = code.slice(0, p.node.start).split("\n").length;
      console.log(`\n${path.relative(__dirname, file)}:${line}`);
      console.log(`  ${callee.property.name} into "${table}" — nobody reads the result`);
      console.log(`  ${code.split("\n")[line - 1].trim().slice(0, 100)}`);
    },

    // A captured error that nobody ever reads is the same silent failure
    // as one never captured at all:
    //
    //     const { error: itemError } = await supabase...insert(rows);
    //     // ...and itemError is never mentioned again
    //
    // The pass above sees the name and calls the write checked. This one
    // follows the name and asks whether anything ever reads it. That gap
    // is what let a copied job lose all its items in silence.
    VariableDeclarator(p) {
      const id = p.node.id;
      if (!id || id.type !== "ObjectPattern" || !p.node.init) return;
      if (!/\bsupabase\b/.test(code.slice(p.node.init.start, p.node.init.end))) return;

      for (const prop of id.properties) {
        if (!prop.key || prop.key.name !== "error") continue;
        const local = prop.value && prop.value.name ? prop.value.name : "error";
        const binding = p.scope.getBinding(local);
        if (!binding || binding.references > 0) continue;
        unread++;
        const line = code.slice(0, p.node.start).split("\n").length;
        console.log(`\n${path.relative(__dirname, file)}:${line}`);
        console.log(`  "${local}" is captured and then never read — it can still fail in silence`);
        console.log(`  ${code.split("\n")[line - 1].trim().slice(0, 100)}`);
      }
    },
  });
}

console.log(`\n${checked} write(s) capture their result, ${unchecked} do not.`);
if (unread) console.log(`${unread} captured error(s) are never read afterwards.`);
if (unchecked + unread === 0) {
  console.log("Every write reads its result. None can fail in silence.");
} else {
  console.log("Each one above can fail with nothing on screen and nothing in the log.");
}
process.exit(unchecked + unread === 0 ? 0 : 1);
