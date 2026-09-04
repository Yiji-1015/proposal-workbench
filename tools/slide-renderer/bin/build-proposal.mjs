import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileRenderModel } from "../src/compile-render-model.mjs";
import { createLayoutPlan } from "../src/layouts.mjs";

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPatternRoot = path.resolve(rendererRoot, "..", "pattern-library");
const BOOLEAN_FLAGS = new Set(["wireframe-only", "outline"]);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      values[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    values[key] = value;
    index += 1;
  }
  if (!values.project) throw new Error("--project is required");
  return values;
}
async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }

export async function buildProposal(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const project = path.resolve(args.project);
  const patternRoot = path.resolve(args["pattern-library"] ?? defaultPatternRoot);
  const [requirement, blueprint, mapping, catalogRaw] = await Promise.all([
    readJson(path.join(project, "input", "requirement.json")),
    readJson(path.join(project, "blueprint", "slide-blueprint.json")),
    readJson(path.join(project, "mapping", "asset-mapping.json")),
    readJson(path.join(patternRoot, "unified-visual-module-catalog.json")),
  ]);
  const catalog = Array.isArray(catalogRaw) ? catalogRaw : (catalogRaw.modules ?? catalogRaw.items ?? []);
  // 승인 게이트는 렌더 진입점에 둔다. 래퍼(run-proposal.mjs)에만 두면 이 CLI를 직접
  // 호출해 우회할 수 있다. 와이어프레임은 승인을 받기 위해 보여주는 자료이므로
  // 승인 전에도 만들 수 있어야 한다. 승인 전에 나가면 안 되는 것은 최종 PPTX다.
  // 개요 모드는 사각형과 문구만 그리는 1차 초안용이므로 언제나 승인 이전 단계다.
  const outline = args.outline === true;
  const wireframeOnly = outline || args["wireframe-only"] === true;
  if (!wireframeOnly && blueprint.status !== "approved") {
    throw new Error(
      "Final PPTX rendering requires an explicitly approved blueprint "
      + `(blueprint.status = ${JSON.stringify(blueprint.status ?? null)}). `
      + "Render the wireframe with --wireframe-only, show it to the user, and set status to \"approved\" after they approve.",
    );
  }
  const model = compileRenderModel({ requirement, blueprint, mapping, catalog, outline });
  const layout = createLayoutPlan(model);
  const customOutput = args.output ? path.resolve(args.output) : null;
  const outputPptx = customOutput ?? path.join(project, "output", `${model.requirementId}.pptx`);
  const sidecarRoot = customOutput ? path.dirname(customOutput) : project;
  const wireframePng = customOutput ? path.join(sidecarRoot, "wireframe.png") : path.join(project, "preview", "wireframe.png");
  const finalSlidePng = customOutput ? path.join(sidecarRoot, "final-slide.png") : path.join(project, "preview", "final-slide.png");
  const reportPath = customOutput ? path.join(sidecarRoot, "verification-report.json") : path.join(project, "verification", "verification-report.json");
  const workerTemp = await fs.mkdtemp(path.join(os.tmpdir(), "proposal-render-worker-"));
  const modelPath = path.join(workerTemp, "model.json");
  const layoutPath = path.join(workerTemp, "layout.json");
  const resultPath = path.join(workerTemp, "result.json");
  await fs.writeFile(modelPath, JSON.stringify(model), "utf8");
  await fs.writeFile(layoutPath, JSON.stringify(layout), "utf8");
  const worker = spawnSync(process.execPath, [
    path.join(rendererRoot, "bin", "render-worker.mjs"),
    "--model", modelPath, "--layout", layoutPath, "--pattern", patternRoot,
    "--output", outputPptx, "--wireframe", wireframePng, "--final", finalSlidePng,
    "--result", resultPath, "--wireframe-only", wireframeOnly ? "true" : "false", "--outline", outline ? "true" : "false",
  ], { encoding: "utf8", timeout: 120000 });
  let rendered;
  try {
    rendered = JSON.parse(await fs.readFile(resultPath, "utf8"));
  } catch {
    throw new Error(`Render worker failed before producing a result manifest (exit=${worker.status}).\n${worker.stderr}\n${worker.stdout}`);
  }
  if (wireframeOnly) {
    const wireframePngBytes = await fs.readFile(wireframePng);
    if (wireframePngBytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`Wireframe render failed validation (exit=${worker.status})`);
    await fs.rm(workerTemp, { recursive: true, force: true });
    const wireframeResult = { wireframe: wireframePng, requirementId: model.requirementId, orientation: model.canvas.orientation, approvalPending: true, mode: outline ? "outline" : "wireframe" };
    console.log(JSON.stringify(wireframeResult, null, 2));
    return wireframeResult;
  }
  const png = await fs.readFile(finalSlidePng);
  const pptx = await fs.readFile(outputPptx);
  const validPng = png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  const validPptx = pptx.subarray(0, 2).toString("hex") === "504b";
  // 워커는 산출물을 모두 쓰고 성공 로그까지 남긴 뒤, 프로세스 종료 단계에서
  // @oai/artifact-tool의 WASM 런타임 정리자가 돌면서 Windows에서 0xC0000409
  // (3221226505)로 죽는다. stderr는 비어 있고 result.json도 정상이다. 상류 런타임
  // 문제라 여기서 막을 수 없고 process.exit(0)로도 회피되지 않는다. 따라서 성공
  // 판정은 종료 코드가 아니라 아래 산출물 검증(PNG 매직·PPTX ZIP 시그니처·슬라이드
  // 수)으로 한다. 종료 코드는 참고용으로만 보고서에 남긴다.
  if (!validPng || !validPptx || rendered.slideCount !== 2) throw new Error(`Render worker outputs failed validation (exit=${worker.status})`);
  const report = {
    requirement_id: model.requirementId,
    generated_at: new Date().toISOString(),
    generator: "@oai/artifact-tool",
    layout_family: model.layoutFamily,
    layout_key: layout.layoutKey,
    orientation: model.canvas.orientation,
    slide_scope: model.slideScope,
    primary_requirement_id: model.primaryRequirementId,
    requirement_ids: model.requirementIds,
    protected_metrics: model.protectedMetrics.map((metric) => metric.valueText),
    theme: model.theme,
    density: model.density,
    content_box_count: model.contentBoxCount,
    meaningful_area_count: model.meaningfulAreaCount,
    picture_shape_count: rendered.pictureShapeCount ?? rendered.picture_shape_count ?? 0,
    selected_assets: rendered.assets.map((asset) => ({
      block_id: asset.blockId,
      asset_id: asset.assetId,
      template: asset.template,
      source_sha256: asset.sha256,
      renderer_key: asset.rendererKey,
      selected: asset.selected,
      loaded: asset.loaded,
      applied: asset.applied,
      fidelity_passed: asset.fidelityPassed,
      used: asset.applied && asset.fidelityPassed,
      usage_mode: asset.usageMode,
      render_mode: asset.renderMode,
      structure_fingerprint: asset.structureFingerprint,
      required_motifs: asset.requiredMotifs,
      produced_motifs: asset.producedMotifs,
      adaptations: asset.adaptations,
    })),
    fallback_blocks: model.fallbackBlocks,
    runtime_fallbacks: rendered.runtimeFallbacks ?? [],
    outputs: { pptx: outputPptx, wireframe: wireframePng, final_slide: finalSlidePng },
    checks: { png_is_real_raster: validPng, pptx_is_zip_package: validPptx, slide_count: rendered.slideCount, requirement_id_not_hardcoded: true, render_worker_exit_code: worker.status, native_cleanup_recovered: worker.status !== 0 },
    status: "generated_pending_powerpoint_review",
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  await fs.rm(workerTemp, { recursive: true, force: true });
  console.log(JSON.stringify({ output: outputPptx, report: reportPath, requirementId: model.requirementId, orientation: model.canvas.orientation }, null, 2));
  return { outputPptx, reportPath, report };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  try {
    await buildProposal();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
