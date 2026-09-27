// No source file may hold a hidden control character.
//
// App.jsx held four literal NUL characters until 27 Sep 2026 (the
// separators in saveMasterToTables' idFor keys). The app ran, but search
// tools took the file for binary from the first one and silently reported
// nothing after it: every search of App.jsx past line 2950 came back
// empty, and read as "not there". They are written as \0 now, which is
// the same character to the app and plain text to everything else.
//
// A separator that must never appear in a name is written as an escape
// (\0, \u001f), never typed or pasted in as the character itself.
import { test } from "node:test";
import assert from "node:assert/strict";
// Named, not taken as a global: CHECK-undefined-names.cjs knows the
// browser's globals, not Node's.
import { Buffer } from "node:buffer";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) found.push(full);
  }
  return found;
}

// Tab, line feed and carriage return are the only ones a source file needs.
const ALLOWED = new Set([9, 10, 13]);

// Where the hidden characters of one file are, as "line 2950: NUL (2)".
export function hiddenCharacters(bytes) {
  const byLine = new Map();
  let line = 1;
  for (const b of bytes) {
    if (b === 10) line++;
    if ((b < 32 && !ALLOWED.has(b)) || b === 127) {
      const name = b === 0 ? "NUL" : `character ${b}`;
      const key = `line ${line}: ${name}`;
      byLine.set(key, (byLine.get(key) || 0) + 1);
    }
  }
  return [...byLine].map(([where, n]) => `${where} (${n})`);
}

test("the check itself: finds a NUL, says which line, leaves ordinary text alone", () => {
  assert.deepEqual(hiddenCharacters(Buffer.from("one\ntwo\tthree\r\n")), []);
  assert.deepEqual(hiddenCharacters(Buffer.from("one\nt\0w\0o\nthree")), ["line 2: NUL (2)"]);
  assert.deepEqual(hiddenCharacters(Buffer.from("a\u001fb")), ["line 1: character 31 (1)"]);
  // Written as an escape it is ordinary text, which is the point.
  assert.deepEqual(hiddenCharacters(Buffer.from("idFor(`s\\0${listName}`)")), []);
});

test("no source file holds a hidden control character", () => {
  const files = sourceFiles(SRC);
  assert.ok(files.length > 50, `only ${files.length} source files found: the check is looking in the wrong place`);
  const faults = [];
  for (const file of files) {
    const found = hiddenCharacters(readFileSync(file));
    if (found.length) faults.push(`${path.relative(SRC, file)}: ${found.join(", ")}`);
  }
  assert.deepEqual(faults, [], "Write each as an escape such as \\0. Search tools stop reading a file at the first one.");
});
