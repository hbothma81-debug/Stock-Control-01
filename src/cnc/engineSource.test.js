import { test } from "node:test";
import assert from "node:assert/strict";
import { readsTables, NEEDS } from "./engineSourceRules.js";

test("each screen reads only its own part of the engine's answer", () => {
  const practice = "test cnc_ tables, version 750 (10 sheets, 44 tools)";
  const live = "live cnc_ tables, version 3 (cutting data from the engine file, 44 tools)";
  assert.equal(readsTables(practice, NEEDS.cutting), true);
  assert.equal(readsTables(practice, NEEDS.tools), true);
  assert.equal(readsTables(live, NEEDS.cutting), false);
  assert.equal(readsTables(live, NEEDS.tools), true);
  assert.equal(readsTables("test cnc_ tables, version 9 (10 sheets, tools from the engine file)", NEEDS.tools), false);
  assert.equal(readsTables("engine files (no sign-in)", null), false);
  assert.equal(readsTables(null, NEEDS.tools), false);
});
