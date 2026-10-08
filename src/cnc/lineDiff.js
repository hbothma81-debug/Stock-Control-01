// What changed between two program texts, line by line, for Update
// program (and Import machine copy next): the screen lists only these, so
// nobody sends a program to the machine without seeing what moved.
// No React; tested in lineDiff.test.js.

// Lines of a program, without the line endings (a machine copy comes back
// with CR LF, the engine writes LF; neither counts as a change).
function linesOf(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Every line in order, each "same", "del" (only in the old) or "add"
// (only in the new): the longest run of lines the two share is kept.
export function lineDiff(oldText, newText) {
  const a = linesOf(oldText);
  const b = linesOf(newText);
  const n = a.length;
  const m = b.length;
  const keep = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      keep[i][j] = a[i] === b[j] ? keep[i + 1][j + 1] + 1 : Math.max(keep[i + 1][j], keep[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i], oldNo: i + 1, newNo: j + 1 });
      i++;
      j++;
    } else if (keep[i + 1][j] >= keep[i][j + 1]) {
      out.push({ kind: "del", text: a[i], oldNo: i + 1 });
      i++;
    } else {
      out.push({ kind: "add", text: b[j], newNo: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i], oldNo: ++i });
  while (j < m) out.push({ kind: "add", text: b[j], newNo: ++j });
  return out;
}

// The changes in pieces, each with a few unchanged lines either side so a
// change can be found in the program, and how many lines were skipped
// between them.
export function changeHunks(diff, context = 2) {
  const changed = diff.map((d, k) => (d.kind !== "same" ? k : -1)).filter((k) => k >= 0);
  if (!changed.length) return [];
  const hunks = [];
  let start = Math.max(0, changed[0] - context);
  let end = Math.min(diff.length - 1, changed[0] + context);
  for (const k of changed.slice(1)) {
    if (k - context <= end + 1) end = Math.min(diff.length - 1, k + context);
    else {
      hunks.push({ start, end });
      start = Math.max(0, k - context);
      end = Math.min(diff.length - 1, k + context);
    }
  }
  hunks.push({ start, end });
  return hunks.map((h, x) => ({
    skippedBefore: h.start - (x === 0 ? 0 : hunks[x - 1].end + 1),
    lines: diff.slice(h.start, h.end + 1),
  }));
}

// How many lines went and came, for the heading.
export function changeCount(diff) {
  return {
    removed: diff.filter((d) => d.kind === "del").length,
    added: diff.filter((d) => d.kind === "add").length,
  };
}

// The old and new programs paired by number (side 1 with side 1). A part
// that split into two programs, or joined into one, shows the program that
// came or went whole.
export function pairPrograms(oldProgs = [], newProgs = []) {
  const numbers = [...new Set([...oldProgs.map((p) => p.number), ...newProgs.map((p) => p.number)])].sort((x, y) => x - y);
  return numbers.map((number) => {
    const before = oldProgs.find((p) => p.number === number) || null;
    const after = newProgs.find((p) => p.number === number) || null;
    return { number, before, after, diff: lineDiff(before?.text ?? "", after?.text ?? "") };
  });
}
