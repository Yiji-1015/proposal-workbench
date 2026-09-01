import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileRenderModel } from "../src/compile-render-model.mjs";
import { createLayoutPlan } from "../src/layouts.mjs";

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPatternRoot = path.resolve(rendererRoot, "..", "pattern-library");
function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    values[arg.slice(2)] = value;
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
  const model = compileRenderModel({ requirement, blueprint, mapping, catalog });
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
    "--result", resultPath,
  ], { encoding: "utf8", timeout: 120000 });
  let rendered;
  try {
    rendered = JSON.parse(await fs.readFile(resultPath, "utf8"));
  } catch {
    throw new Error(`Render worker failed before producing a result manifest (exit=${worker.status}).\n${worker.stderr}\n${worker.stdout}`);
  }
  const png = await fs.readFile(finalSlidePng);
  const pptx = await fs.readFile(outputPptx);
  const validPng = png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  const validPptx = pptx.subarray(0, 2).toString("hex") === "504b";
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
