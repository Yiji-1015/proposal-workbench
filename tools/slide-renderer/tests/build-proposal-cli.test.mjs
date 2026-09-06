import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const rendererRoot = path.resolve(import.meta.dirname, "..");

async function copyProject(t, fixtureName = "block-pool-project") {
  const source = path.join(rendererRoot, "tests", "fixtures", fixtureName);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "proposal-core-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const project = path.join(temp, "project");
  await fs.cp(source, project, { recursive: true });
  await fs.rm(path.join(project, "mapping"), { recursive: true, force: true });
  return { temp, project };
}

test("builds a native proposal without mapping or pattern-library", async (t) => {
  const { temp, project } = await copyProject(t);
  const output = path.join(temp, "POOL-001.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  const report = JSON.parse(await fs.readFile(path.join(temp, "verification-report.json"), "utf8"));
  assert.equal(report.layout_family, "block_pool_auto");
  assert.equal(report.orientation, "portrait");
  assert.equal(report.native_diagrams.length, 5);
  assert.equal(report.reference_context.mode, "none");
  assert.equal(report.picture_shape_count, 0);
  assert.equal((await fs.readFile(output)).subarray(0, 2).toString("hex"), "504b");
  assert.equal((await fs.readFile(path.join(temp, "final-slide.png"))).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

async function unapprovedProject(t) {
  const result = await copyProject(t);
  const blueprintPath = path.join(result.project, "blueprint", "slide-blueprint.json");
  const blueprint = JSON.parse(await fs.readFile(blueprintPath, "utf8"));
  delete blueprint.status;
  await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2), "utf8");
  return result;
}

test("refuses final rendering before approval", async (t) => {
  const { temp, project } = await unapprovedProject(t);
  const output = path.join(temp, "POOL-001.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /approved blueprint/i);
  await assert.rejects(fs.access(output));
});

test("renders an approval wireframe without producing a PPTX", async (t) => {
  const { temp, project } = await unapprovedProject(t);
  const output = path.join(temp, "POOL-001.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output, "--wireframe-only"], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  assert.equal(JSON.parse(result.stdout).approvalPending, true);
  assert.equal((await fs.readFile(path.join(temp, "wireframe.png"))).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  await assert.rejects(fs.access(output));
});

test("outline mode needs only headline and summary", async (t) => {
  const { temp, project } = await copyProject(t);
  const blueprintPath = path.join(project, "blueprint", "slide-blueprint.json");
  const blueprint = JSON.parse(await fs.readFile(blueprintPath, "utf8"));
  blueprint.status = "draft";
  for (const block of blueprint.blocks) block.content = { headline: `${block.block_id} 제목`, summary: `${block.block_id} 한 줄 요약입니다.` };
  await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2), "utf8");
  const output = path.join(temp, "POOL-001.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output, "--outline"], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  assert.equal(JSON.parse(result.stdout).mode, "outline");
  await assert.rejects(fs.access(output));
});
