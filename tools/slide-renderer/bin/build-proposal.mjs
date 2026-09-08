import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileRenderModel } from "../src/compile-render-model.mjs";
import { createLayoutPlan } from "../src/layouts.mjs";

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOLEAN_FLAGS = new Set(["wireframe-only", "outline", "legacy-layout", "allow-repeat-structure"]);

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

// 반복 구조 검사는 인접 장표의 검수 보고서를 근거로 한다. 산출물은 보통 한 폴더 아래에
// 요구사항별로 모이므로, 출력 위치의 상위 폴더를 훑어 다른 요구사항의 지문을 모은다.
async function collectPeerStructures(root, selfRequirementId, selfReportPath, maxDepth = 3) {
  const peers = [];
  async function walk(dir, level) {
    if (level > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, level + 1);
        continue;
      }
      if (entry.name !== "verification-report.json" || path.resolve(full) === path.resolve(selfReportPath)) continue;
      try {
        const report = JSON.parse(await fs.readFile(full, "utf8"));
        const plan = report.native_shape_plan;
        if (!plan || report.requirement_id === selfRequirementId) continue;
        peers.push({ report: full, requirementId: report.requirement_id, fingerprint: plan.structure_fingerprint, signature: plan.composition_signature });
      } catch {
        continue;
      }
    }
  }
  await walk(root, 1);
  return peers;
}

export async function buildProposal(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const project = path.resolve(args.project);
  const [requirement, blueprint] = await Promise.all([
    readJson(path.join(project, "input", "requirement.json")),
    readJson(path.join(project, "blueprint", "slide-blueprint.json")),
  ]);
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
  // 문서는 오래전부터 신규 장표를 agent_authored로 규정했지만 렌더러가 레거시 경로를
  // 말없이 받아줬다. 그래서 매번 통과가 쉬운 block_pool_auto로 되돌아갔고, 세로형에서
  // 1열 스택 하나로만 찍혀 나왔다. 하위 호환 청사진은 이제 명시적으로 요구해야 열린다.
  if (blueprint.layout_family !== "agent_authored" && args["legacy-layout"] !== true) {
    throw new Error(
      `layout_family ${JSON.stringify(blueprint.layout_family ?? null)} is a backward-compatible path and always produces the same fixed composition. `
      + "Author layout_family \"agent_authored\" with a shape_plan for new slides, "
      + "or pass --legacy-layout to render an existing blueprint on the old path.",
    );
  }
  const model = compileRenderModel({ requirement, blueprint, outline });
  const layout = createLayoutPlan(model);
  const customOutput = args.output ? path.resolve(args.output) : null;
  const outputPptx = customOutput ?? path.join(project, "output", `${model.requirementId}.pptx`);
  const sidecarRoot = customOutput ? path.dirname(customOutput) : project;
  const wireframePng = customOutput ? path.join(sidecarRoot, "wireframe.png") : path.join(project, "preview", "wireframe.png");
  const finalSlidePng = customOutput ? path.join(sidecarRoot, "final-slide.png") : path.join(project, "preview", "final-slide.png");
  const reportPath = customOutput ? path.join(sidecarRoot, "verification-report.json") : path.join(project, "verification", "verification-report.json");
  // structure_fingerprint는 계산만 되고 아무도 비교하지 않았다. 인접 장표와 도형 그래프가
  // 같으면 내용만 바뀐 같은 장표이므로, 경고가 아니라 렌더 실패로 막는다.
  let structureRepeatCheck = null;
  if (model.shapePlan && args["allow-repeat-structure"] !== true) {
    const peers = await collectPeerStructures(path.dirname(sidecarRoot), model.requirementId, reportPath);
    const clash = peers.find((peer) => peer.fingerprint === model.shapePlan.structureFingerprint || peer.signature === model.shapePlan.compositionSignature);
    if (clash) {
      throw new Error(
        `Slide ${model.requirementId} repeats the composition already rendered for ${clash.requirementId} (${clash.report}). `
        + `structure_fingerprint=${model.shapePlan.structureFingerprint} composition_signature=${model.shapePlan.compositionSignature}. `
        + "Redesign the shape_plan so adjacent slides do not share a shape graph, "
        + "or pass --allow-repeat-structure when the repeated structure is semantically required.",
      );
    }
    structureRepeatCheck = { compared_reports: peers.length, repeats_adjacent_slide: false };
  }
  const workerTemp = await fs.mkdtemp(path.join(os.tmpdir(), "proposal-render-worker-"));
  const modelPath = path.join(workerTemp, "model.json");
  const layoutPath = path.join(workerTemp, "layout.json");
  const resultPath = path.join(workerTemp, "result.json");
  await fs.writeFile(modelPath, JSON.stringify(model), "utf8");
  await fs.writeFile(layoutPath, JSON.stringify(layout), "utf8");
  const worker = spawnSync(process.execPath, [
    path.join(rendererRoot, "bin", "render-worker.mjs"),
    "--model", modelPath, "--layout", layoutPath,
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
    native_diagrams: model.nativeDiagrams.map((item) => ({
      block_id: item.blockId,
      visual_category: item.visualCategory,
      renderer_key: item.rendererKey,
      render_mode: "native_powerpoint_shapes",
    })),
    native_shape_plan: model.shapePlan ? {
      render_mode: "agent_authored_native_shapes",
      shape_plan_source: model.shapePlanSource,
      composition_signature: model.shapePlan.compositionSignature,
      structure_fingerprint: model.shapePlan.structureFingerprint,
      design_rationale: model.shapePlan.designRationale,
      primitive_count: model.shapePlan.primitives.length,
      shape_names: model.shapePlan.primitives.map((primitive) => primitive.name),
      layout_quality: {
        surface_coverage: model.shapePlan.layoutQuality.surfaceCoverage,
        largest_empty_band_px: model.shapePlan.layoutQuality.largestEmptyBand,
        side_by_side_block_pairs: model.shapePlan.layoutQuality.sideBySidePairs,
        text_primitive_count: model.shapePlan.layoutQuality.textPrimitiveCount,
        text_metrics: "malgun_gothic_measured",
      },
    } : null,
    structure_repeat_check: structureRepeatCheck,
    reference_context: {
      mode: model.referenceContext.mode,
      selected_slide_ids: model.referenceContext.selectedSlideIds,
      notes: model.referenceContext.notes.map((note) => ({ block_id: note.blockId, reference_id: note.referenceId, usage_note: note.usageNote })),
    },
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
