// Catches the one mistake that makes the whole app go blank.
//
// A missing variable is not a build error. `npm run build` compiles it
// happily, the page loads, and then React hits the missing name and
// renders nothing at all -- a white screen with the fault only visible in
// the browser's console. It has happened to this app once already, after
// a block of code was deleted and left one name behind.
//
// This reads the code the way the browser does: it works out every name
// that has been declared, and every name that gets used, and reports any
// name that is used but never declared anywhere.
//
// Run it with:   node CHECK-undefined-names.cjs
//
// "0 problems" means no name is missing. It does not mean the screens
// look right -- only a person signed in can tell you that.

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

// Everything the browser itself provides, plus the handful of build-time
// names. A name here is never reported.
const KNOWN = new Set([
  "window", "document", "console", "navigator", "location", "history", "screen",
  "localStorage", "sessionStorage", "indexedDB", "fetch", "Headers", "Request", "Response",
  "URL", "URLSearchParams", "Blob", "File", "FileReader", "FormData", "AbortController",
  // Unzipping a PDF in the browser without shipping a library to do it.
  "DecompressionStream", "CompressionStream",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "queueMicrotask", "structuredClone", "alert", "confirm", "prompt",
  "Event", "CustomEvent", "FocusEvent", "MouseEvent", "KeyboardEvent", "Image", "Audio",
  "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt", "Math", "JSON",
  "Date", "RegExp", "Error", "TypeError", "RangeError", "SyntaxError", "Promise", "Map",
  "Set", "WeakMap", "WeakSet", "Proxy", "Reflect", "Intl", "ArrayBuffer", "Uint8Array",
  "isNaN", "isFinite", "parseInt", "parseFloat", "encodeURIComponent", "decodeURIComponent",
  "encodeURI", "decodeURI", "globalThis", "undefined", "NaN", "Infinity", "btoa", "atob",
  "crypto", "performance", "process", "require", "module", "exports", "__dirname", "import",
  "arguments", "this", "super",
]);

const root = path.join(__dirname, "src");

function jsxFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...jsxFiles(full));
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

let problems = 0;
let checked = 0;

for (const file of jsxFiles(root)) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "optionalChaining", "nullishCoalescingOperator", "classProperties"],
    });
  } catch (err) {
    console.log(`\n${path.relative(__dirname, file)}`);
    console.log(`  cannot read this file at all -- ${err.message}`);
    problems++;
    continue;
  }
  checked++;

  const seen = new Set();
  traverse(ast, {
    // A plain name being used: someValue, someFunction(), {someThing}
    ReferencedIdentifier(p) {
      const name = p.node.name;
      if (KNOWN.has(name)) return;
      // Object keys, property names after a dot, labels -- not references
      // to a variable at all.
      if (p.parentPath.isMemberExpression({ computed: false }) && p.parent.property === p.node) return;
      if (p.parentPath.isObjectProperty({ computed: false }) && p.parent.key === p.node) return;
      if (p.parentPath.isJSXAttribute()) return;
      // A lowercase JSX tag is an HTML element, not a variable.
      if (p.isJSXIdentifier() && /^[a-z]/.test(name)) return;
      if (p.scope.hasBinding(name, true)) return;

      const key = name + ":" + p.node.loc.start.line;
      if (seen.has(key)) return;
      seen.add(key);

      const line = code.split("\n")[p.node.loc.start.line - 1].trim();
      console.log(`\n${path.relative(__dirname, file)}:${p.node.loc.start.line}`);
      console.log(`  "${name}" is used here but never declared anywhere`);
      console.log(`  ${line.slice(0, 110)}`);
      problems++;
    },
  });
}

// ---- second pass: layout definitions that have gone missing ----
//
// A different kind of silent fault, and the name check above cannot see
// it. If a style is deleted from theme.js while something still uses it,
// nothing errors -- the style simply comes back as nothing, and that part
// of the screen loses its colour, spacing or size with no warning at all.
//
// Anything reached by a built-up name (S["reqStatus_" + status]) is
// counted as used, because searching for its name finds nothing even
// though it is used constantly.

const theme = fs.readFileSync(path.join(root, "theme.js"), "utf8");
const styleBlock = theme.slice(theme.indexOf("export const S ="));
const defined = new Set(
  (styleBlock.match(/^ {2}([a-zA-Z_0-9]+):/gm) || []).map((x) => x.trim().replace(":", ""))
);

let styleUses = 0;
let styleMissing = 0;
for (const file of jsxFiles(root)) {
  const code = fs.readFileSync(file, "utf8");
  // A file with its own local set of styles is not using the shared one.
  if (/^const S = \{/m.test(code)) continue;
  for (const m of code.matchAll(/\bS\.([a-zA-Z_0-9]+)/g)) {
    styleUses++;
    if (!defined.has(m[1])) {
      console.log(`\n${path.relative(__dirname, file)}`);
      console.log(`  "S.${m[1]}" is used here but no longer exists in theme.js`);
      console.log("  Nothing will break outright -- that part of the screen just loses its styling.");
      styleMissing++;
    }
  }
}

problems += styleMissing;

console.log(`\n${checked} file(s) checked for missing names.`);
console.log(`${defined.size} layout definitions, ${styleUses} uses checked.`);
console.log(`${problems} problem(s) found.`);
if (problems === 0) {
  console.log("\nNothing is missing. The app will not go blank, and no screen has lost its styling.");
  console.log("It does not tell you the screens look right -- only signing in does that.");
}
process.exit(problems === 0 ? 0 : 1);
