// Whether the engine's answer (its data_source) says it read a screen's
// list from the cnc_ tables. Tested in engineSource.test.js.

// needs: what else the engine's answer must say for this screen's list to
// count as read. The answer names each part it took from its own files
// ("live cnc_ tables, version 3 (cutting data from the engine file, 44
// tools)"), so a screen checks its own part.
export const NEEDS = {
  cutting: (s) => /\d+ sheets/i.test(s) && !/cutting data from the engine file/i.test(s),
  tools: (s) => /\d+ tools/i.test(s) && !/tools from the engine file/i.test(s),
};

export function readsTables(source, needs = null) {
  return typeof source === "string" && /cnc_ tables/i.test(source) && (!needs || needs(source));
}

