import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workbenchRoot = path.resolve(rendererRoot, "..", "..");
const skillRoot = path.join(workbenchRoot, "skills", "proposal-asset-curator");

test("proposal-asset-curator keeps selection separate from explicit promotion", async () => {
  const skill = await fs.readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const playbook = await fs.readFile(path.join(skillRoot, "references", "selection-playbook.md"), "utf8");
  assert.match(skill, /^---\s+name: proposal-asset-curator\s+description: [^]*?---/);
  assert.match(skill, /골라줘.*선별 전용/s);
  assert.match(skill, /tools\/pattern-library.*변경하지 않는다/s);
  assert.match(skill, /승인.*promote/s);
  for (const kind of ["block_shell", "diagram_recipe", "composite_block", "icon_asset", "media_frame", "photo_asset"]) {
    assert.ok(skill.includes(`\`${kind}\``), `missing asset kind ${kind}`);
  }
  for (const verdict of ["selected", "deferred", "rejected"]) assert.ok(playbook.includes(`\`${verdict}\``), `missing verdict ${verdict}`);
  for (const rule of ["p:grpSp", "icon_slot", "media_slot", "duplicate_of", "warning", "partial"]) assert.ok(playbook.includes(rule), `missing playbook rule ${rule}`);
});
