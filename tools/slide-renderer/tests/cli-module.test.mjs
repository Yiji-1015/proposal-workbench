import assert from "node:assert/strict";
import test from "node:test";

test("exports the generic builder without executing the CLI during import", async () => {
  const module = await import("../bin/build-proposal.mjs");
  assert.equal(typeof module.buildProposal, "function");
});
