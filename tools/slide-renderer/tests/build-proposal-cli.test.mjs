import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("builds a non-DAR portrait proposal from project JSON without DAR leakage", async (t) => {
  const rendererRoot = path.resolve(import.meta.dirname, "..");
  const project = path.join(rendererRoot, "tests", "fixtures", "non-dar-project");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "proposal-renderer-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const output = path.join(temp, "SEC-204.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  const report = JSON.parse(await fs.readFile(path.join(temp, "verification-report.json"), "utf8"));
  const pptx = await fs.readFile(output);
  const wireframe = await fs.readFile(path.join(temp, "wireframe.png"));
  const finalSlide = await fs.readFile(path.join(temp, "final-slide.png"));
  assert.equal(report.requirement_id, "SEC-204");
  assert.equal(report.slide_scope, "requirement");
  assert.deepEqual(report.requirement_ids, ["SEC-204"]);
  assert.equal(report.orientation, "portrait");
  assert.deepEqual(report.protected_metrics, ["분기 1회"]);
  assert.equal(JSON.stringify(report).includes("DAR-010"), false);
  assert.equal(report.selected_assets.length, 0);
  assert.equal(report.fallback_blocks.length, 5);
  assert.equal(report.theme.primary, "#1769E0");
  assert.equal(report.density, "high");
  assert.ok(report.content_box_count >= 5);
  assert.ok(report.meaningful_area_count >= 5);
  assert.equal(pptx.subarray(0, 2).toString("hex"), "504b");
  assert.equal(wireframe.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(finalSlide.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("builds a portrait block-pool proposal with native pool renderers", async (t) => {
  const rendererRoot = path.resolve(import.meta.dirname, "..");
  const project = path.join(rendererRoot, "tests", "fixtures", "block-pool-project");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "proposal-pool-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const output = path.join(temp, "POOL-001.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  const report = JSON.parse(await fs.readFile(path.join(temp, "verification-report.json"), "utf8"));
  assert.equal(report.layout_family, "block_pool_auto");
  assert.equal(report.orientation, "portrait");
  assert.ok(report.content_box_count >= 5);
  assert.equal(report.picture_shape_count, 0);
  assert.equal(report.selected_assets.length, 0);
  assert.equal(report.fallback_blocks.length, 5);
  assert.equal((await fs.readFile(path.join(temp, "final-slide.png"))).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("builds approved responsive assets and counts only explicitly mapped photos", async (t) => {
  const rendererRoot = path.resolve(import.meta.dirname, "..");
  const project = path.join(rendererRoot, "tests", "fixtures", "block-pool-project");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "proposal-responsive-"));
  const patternRoot = path.join(temp, "pattern-library");
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  await fs.cp(project, path.join(temp, "project"), { recursive: true });
  const projectCopy = path.join(temp, "project");
  await fs.mkdir(path.join(patternRoot, "templates"), { recursive: true });
  await fs.mkdir(path.join(patternRoot, "photos"), { recursive: true });
  const template = {
    version: 1,
    module_id: "approved-process",
    asset_kind: "composite_block",
    module_type: "process_chain",
    renderer_key: "responsive_native_template",
    shell: { container: { kind: "roundRect", fill: "white", stroke: "line" }, header_zone: { x: 0.04, y: 0.03, w: 0.92, h: 0.12 }, body_zone: { x: 0.04, y: 0.2, w: 0.92, h: 0.72 } },
    diagram: { topology: { kind: "process_chain", repeat_source: "steps", nodes: [{ id: "step", kind: "roundRect", repeat: true, text_slot: "steps[]" }], edges: [{ from: "step[n]", to: "step[n+1]", kind: "connector" }] }, variants: { wide: { layout: "row", columns: "all" }, compact: { layout: "grid", columns: 2 }, tall: { layout: "column", columns: 1 } } },
    style: { node_fill: "pale", node_stroke: "primary", text_color: "navy" },
    constraints: { min_nodes: 2, max_nodes: 8, min_font_size: 9, padding_ratio: 0.05, gap_ratio: 0.03 },
    primitives: [],
  };
  await fs.writeFile(path.join(patternRoot, "templates", "approved-process.json"), JSON.stringify(template), "utf8");
  await fs.writeFile(path.join(patternRoot, "unified-visual-module-catalog.json"), JSON.stringify([{
    module_id: "approved-process", display_name: "승인 프로세스", asset_kind: "composite_block", module_type: "process_chain", description: "단계형 흐름", design_traits: ["라운드 카드"], use_cases: ["업무 흐름"], search_tags: ["프로세스"], renderer_key: "responsive_native_template", template: "templates/approved-process.json", usage_mode: "structural", render_mode: "native_powerpoint_shapes", provenance_ref: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", license: "user-provided", license_status: "user_confirmed", approved_at: "2026-09-01T00:00:00Z",
  }], null, 2), "utf8");
  const mappingPath = path.join(projectCopy, "mapping", "asset-mapping.json");
  const mapping = JSON.parse(await fs.readFile(mappingPath, "utf8"));
  mapping.mappings[3] = { block_id: "pool_flow", status: "selected_candidate", asset_id: "approved-process", renderer_key: "responsive_native_template" };
  await fs.writeFile(mappingPath, JSON.stringify(mapping), "utf8");
  const output = path.join(temp, "responsive.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", projectCopy, "--pattern-library", patternRoot, "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  let report = JSON.parse(await fs.readFile(path.join(temp, "verification-report.json"), "utf8"));
  assert.equal(report.selected_assets[0].renderer_key, "responsive_native_template");
  assert.equal(report.selected_assets[0].loaded, true);
  assert.equal(report.selected_assets[0].applied, true);
  assert.equal(report.selected_assets[0].fidelity_passed, true);
  assert.equal(report.picture_shape_count, 0);
  assert.deepEqual(report.runtime_fallbacks, []);

  const photoTemplate = { ...template, module_id: "approved-media", asset_kind: "media_frame", module_type: "media_frame", diagram: { topology: { kind: "media_frame", repeat_source: "items", nodes: [], edges: [] }, variants: { wide: {}, compact: {}, tall: {} } }, primitives: [{ kind: "media_slot", bounds: { x: 0.12, y: 0.28, w: 0.76, h: 0.58 }, crop_mode: "cover" }] };
  await fs.writeFile(path.join(patternRoot, "templates", "approved-media.json"), JSON.stringify(photoTemplate), "utf8");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await fs.writeFile(path.join(patternRoot, "photos", "approved.png"), png);
  const catalog = JSON.parse(await fs.readFile(path.join(patternRoot, "unified-visual-module-catalog.json"), "utf8"));
  catalog.push({ module_id: "approved-media", display_name: "승인 사진 프레임", asset_kind: "media_frame", module_type: "media_frame", description: "사진을 배치하는 프레임", design_traits: ["사진 프레임"], use_cases: ["사례"], search_tags: ["사진"], renderer_key: "responsive_native_template", template: "templates/approved-media.json", usage_mode: "decorative", render_mode: "native_powerpoint_shapes", provenance_ref: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", license: "user-provided", license_status: "user_confirmed", approved_at: "2026-09-01T00:00:00Z" });
  catalog.push({ module_id: "approved-photo", display_name: "승인 사진", asset_kind: "photo_asset", module_type: "photo", renderer_key: "photo_asset_reference", template: "photos/approved.png", usage_mode: "decorative", render_mode: "native_powerpoint_shapes", provenance_ref: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", license: "user-provided", license_status: "user_confirmed", approved_at: "2026-09-01T00:00:00Z", mime_type: "image/png", width_px: 1, height_px: 1, aspect_ratio: 1, transparent: false, content_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" });
  await fs.writeFile(path.join(patternRoot, "unified-visual-module-catalog.json"), JSON.stringify(catalog, null, 2), "utf8");
  mapping.mappings[3] = { block_id: "pool_flow", status: "selected_candidate", asset_id: "approved-media", renderer_key: "responsive_native_template", photo_id: "approved-photo" };
  await fs.writeFile(mappingPath, JSON.stringify(mapping), "utf8");
  const photoOutput = path.join(temp, "responsive-photo.pptx");
  const photoResult = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", projectCopy, "--pattern-library", patternRoot, "--output", photoOutput], { encoding: "utf8" });
  assert.equal(photoResult.status, 0, `stderr=${photoResult.stderr}\nstdout=${photoResult.stdout}`);
  report = JSON.parse(await fs.readFile(path.join(temp, "verification-report.json"), "utf8"));
  assert.equal(report.picture_shape_count, 1);
  assert.equal(report.selected_assets[0].applied, true);
});

// 승인 게이트는 래퍼가 아니라 렌더 진입점에 있어야 한다. 래퍼에만 두면 이 CLI를
// 직접 호출해 우회할 수 있고, 승인 자료인 와이어프레임까지 막히면 승인이 불가능해진다.
async function unapprovedProject(t) {
  const rendererRoot = path.resolve(import.meta.dirname, "..");
  const source = path.join(rendererRoot, "tests", "fixtures", "block-pool-project");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "proposal-gate-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const project = path.join(temp, "project");
  await fs.cp(source, project, { recursive: true });
  const blueprintPath = path.join(project, "blueprint", "slide-blueprint.json");
  const blueprint = JSON.parse(await fs.readFile(blueprintPath, "utf8"));
  delete blueprint.status;
  await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2), "utf8");
  return { rendererRoot, temp, project };
}

test("refuses to render a final PPTX from an unapproved blueprint", async (t) => {
  const { rendererRoot, temp, project } = await unapprovedProject(t);
  const output = path.join(temp, "POOL-001.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "미승인 청사진은 렌더가 실패해야 한다");
  assert.match(result.stderr, /approved blueprint/i);
  await assert.rejects(fs.access(output), "승인 전에는 PPTX가 만들어지면 안 된다");
});

test("renders a wireframe before approval without producing a PPTX", async (t) => {
  const { rendererRoot, temp, project } = await unapprovedProject(t);
  const output = path.join(temp, "POOL-001.pptx");
  const result = spawnSync(process.execPath, [path.join(rendererRoot, "bin", "build-proposal.mjs"), "--project", project, "--output", output, "--wireframe-only"], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  assert.equal(JSON.parse(result.stdout).approvalPending, true);
  const wireframe = await fs.readFile(path.join(temp, "wireframe.png"));
  assert.equal(wireframe.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  await assert.rejects(fs.access(output), "와이어프레임 단계에서 PPTX가 나오면 안 된다");
  await assert.rejects(fs.access(path.join(temp, "final-slide.png")), "와이어프레임 단계에서 최종 슬라이드가 나오면 안 된다");
});
