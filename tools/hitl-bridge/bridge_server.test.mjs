import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { isSafePath, isValidIdentifier } from "./bridge_server.mjs";

test("accepts Korean deck identifiers but rejects path syntax", () => {
  assert.equal(isValidIdentifier("제안서_테스트_abc123"), true);
  assert.equal(isValidIdentifier("bad/id"), false);
  assert.equal(isValidIdentifier("a".repeat(129)), false);
});

test("keeps sibling paths outside the protected directory", () => {
  const baseDir = path.resolve("storage");
  assert.equal(isSafePath(baseDir, path.join(baseDir, "sessions", "ok.json")), true);
  assert.equal(isSafePath(baseDir, `${baseDir}-sibling\u005csecret.json`), false);
});
