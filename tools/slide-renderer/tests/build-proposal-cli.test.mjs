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

async function convertToAgentAuthored(project) {
  const blueprintPath = path.join(project, "blueprint", "slide-blueprint.json");
  const blueprint = JSON.parse(await fs.readFile(blueprintPath, "utf8"));
  blueprint.layout_family = "agent_authored";
  blueprint.blocks = blueprint.blocks.map(({ block_id, role, content, source_refs }) => ({ block_id, role, content: { headline: content.headline }, source_refs }));
  blueprint.shape_plan = {
    design_rationale: "핵심 범위에서 분석 흐름과 검증 결과로 이어지는 세로 리듬을 구성한다.",
    composition_signature: "portrait-staggered-ribbon-v1",
    primitives: blueprint.blocks.flatMap((block, index) => {
      const top = 180 + index * 190;
      return [
        { kind: index === 3 ? "diamond" : "roundRect", name: `${block.block_id}-surface`, block_id: block.block_id, position: { left: 48 + index * 16, top, width: 624 - index * 32, height: 140 }, fill: index % 2 ? "pale" : "white", stroke: "line" },
        { kind: "text", name: `${block.block_id}-text`, block_id: block.block_id, position: { left: 76 + index * 16, top: top + 42, width: 568 - index * 32, height: 48 }, text: `${block.content.headline}${index === 0 ? " · 30초 이내 · 3개 채널" : ""}`, font_size: 17, color: "navy", bold: true, alignment: "center" },
      ];
    }),
  };
  await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2), "utf8");
}

test("renders a backward-compatible blueprint only when legacy layout is requested", async (t) => {
  const { temp, project } = await copyProject(t);
  const output = path.join(temp, "POOL-001.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output, "--legacy-layout"], { encoding: "utf8" });
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

test("builds an agent-authored proposal without fixed recipes", async (t) => {
  const { temp, project } = await copyProject(t);
  await convertToAgentAuthored(project);
  const output = path.join(temp, "POOL-001-agent.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  const report = JSON.parse(await fs.readFile(path.join(temp, "verification-report.json"), "utf8"));
  assert.equal(report.layout_family, "agent_authored");
  assert.equal(report.layout_key, "agent_authored:portrait");
  assert.equal(report.native_shape_plan.render_mode, "agent_authored_native_shapes");
  assert.equal(report.native_shape_plan.primitive_count, 10);
  assert.equal(report.native_shape_plan.composition_signature, "portrait-staggered-ribbon-v1");
  assert.match(report.native_shape_plan.structure_fingerprint, /^[0-9a-f]{16}$/);
  assert.deepEqual(report.runtime_fallbacks, []);
  assert.equal(report.picture_shape_count, 0);
  assert.equal((await fs.readFile(output)).subarray(0, 2).toString("hex"), "504b");
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
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output, "--wireframe-only", "--legacy-layout"], { encoding: "utf8" });
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
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output, "--outline", "--legacy-layout"], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  assert.equal(JSON.parse(result.stdout).mode, "outline");
  await assert.rejects(fs.access(output));
});

async function renameRequirement(project, requirementId) {
  for (const relative of [["input", "requirement.json"], ["blueprint", "slide-blueprint.json"]]) {
    const file = path.join(project, ...relative);
    const json = JSON.parse(await fs.readFile(file, "utf8"));
    json.requirement_id = requirementId;
    if (json.primary_requirement_id) json.primary_requirement_id = requirementId;
    if (Array.isArray(json.requirement_ids)) json.requirement_ids = [requirementId];
    await fs.writeFile(file, JSON.stringify(json, null, 2), "utf8");
  }
}

async function reshapePlan(project, signature, shift) {
  const blueprintPath = path.join(project, "blueprint", "slide-blueprint.json");
  const blueprint = JSON.parse(await fs.readFile(blueprintPath, "utf8"));
  blueprint.shape_plan.composition_signature = signature;
  blueprint.shape_plan.primitives = blueprint.shape_plan.primitives.map((primitive) => ({
    ...primitive,
    position: { ...primitive.position, left: primitive.position.left + shift, width: primitive.position.width - shift },
  }));
  await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2), "utf8");
}

function build(project, output, ...flags) {
  return spawnSync(
    process.execPath,
    [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output, ...flags],
    { encoding: "utf8" },
  );
}

test("refuses a backward-compatible layout family unless it is asked for", async (t) => {
  const { temp, project } = await copyProject(t);
  const result = build(project, path.join(temp, "POOL-001.pptx"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backward-compatible path/);
  assert.match(result.stderr, /agent_authored/);
  await assert.rejects(fs.access(path.join(temp, "POOL-001.pptx")));
});

test("refuses a slide that repeats an adjacent slide's composition", async (t) => {
  const first = await copyProject(t);
  await convertToAgentAuthored(first.project);
  const deliverables = path.join(first.temp, "deliverables");
  const firstResult = build(first.project, path.join(deliverables, "POOL-001", "slide.pptx"));
  assert.equal(firstResult.status, 0, `stderr=${firstResult.stderr}`);

  const second = await copyProject(t);
  await convertToAgentAuthored(second.project);
  await renameRequirement(second.project, "POOL-002");
  const repeat = build(second.project, path.join(deliverables, "POOL-002", "slide.pptx"));
  assert.notEqual(repeat.status, 0);
  assert.match(repeat.stderr, /repeats the composition already rendered for POOL-001/);
  await assert.rejects(fs.access(path.join(deliverables, "POOL-002", "slide.pptx")));
});

test("accepts an adjacent slide that is composed differently", async (t) => {
  const first = await copyProject(t);
  await convertToAgentAuthored(first.project);
  const deliverables = path.join(first.temp, "deliverables");
  assert.equal(build(first.project, path.join(deliverables, "POOL-001", "slide.pptx")).status, 0);

  const second = await copyProject(t);
  await convertToAgentAuthored(second.project);
  await renameRequirement(second.project, "POOL-002");
  await reshapePlan(second.project, "portrait-control-rail-v2", 40);
  const distinct = build(second.project, path.join(deliverables, "POOL-002", "slide.pptx"));
  assert.equal(distinct.status, 0, `stderr=${distinct.stderr}`);
  const report = JSON.parse(await fs.readFile(path.join(deliverables, "POOL-002", "verification-report.json"), "utf8"));
  assert.equal(report.structure_repeat_check.repeats_adjacent_slide, false);
  assert.equal(report.structure_repeat_check.compared_reports, 1);
});

test("lets an intentional structural repeat through when it is declared", async (t) => {
  const first = await copyProject(t);
  await convertToAgentAuthored(first.project);
  const deliverables = path.join(first.temp, "deliverables");
  assert.equal(build(first.project, path.join(deliverables, "POOL-001", "slide.pptx")).status, 0);

  const second = await copyProject(t);
  await convertToAgentAuthored(second.project);
  await renameRequirement(second.project, "POOL-002");
  const allowed = build(second.project, path.join(deliverables, "POOL-002", "slide.pptx"), "--allow-repeat-structure");
  assert.equal(allowed.status, 0, `stderr=${allowed.stderr}`);
  const report = JSON.parse(await fs.readFile(path.join(deliverables, "POOL-002", "verification-report.json"), "utf8"));
  assert.equal(report.structure_repeat_check, null);
});
