// composition → shape_plan 저작 CLI.
//
//   node tools/slide-renderer/bin/compose-shape-plan.mjs --project <dir> [--write] [--skeletons]
//
// 청사진의 composition을 컴파일해 배치 품질 게이트까지 통과하는지 확인하고 결과를
// 출력한다. --write를 주면 만들어진 shape_plan을 청사진에 저장한다(composition은 남긴다).
// --skeletons는 사용 가능한 골격과 슬롯 이름을 출력한다.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileRenderModel } from "../src/compile-render-model.mjs";
import { composeShapePlan, SKELETONS, summarizeComposition } from "../src/compose-shape-plan.mjs";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === "write" || key === "skeletons") { values[key] = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    values[key] = value;
    index += 1;
  }
  return values;
}

export async function composeProject(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.skeletons) {
    for (const [orientation, family] of Object.entries(SKELETONS)) {
      for (const [name, skeleton] of Object.entries(family)) {
        console.log(`${orientation} ${name}: ${skeleton.description}`);
        for (const [slot, rect] of Object.entries(skeleton.slots)) console.log(`  ${slot.padEnd(14)} ${rect.left},${rect.top} ${rect.width}x${rect.height}${rect.ellipse ? " (ellipse)" : ""}`);
      }
    }
    return { skeletons: SKELETONS };
  }
  if (!args.project) throw new Error("--project is required");
  const project = path.resolve(args.project);
  const blueprintPath = path.join(project, "blueprint", "slide-blueprint.json");
  const [requirement, blueprint] = await Promise.all([
    fs.readFile(path.join(project, "input", "requirement.json"), "utf8").then(JSON.parse),
    fs.readFile(blueprintPath, "utf8").then(JSON.parse),
  ]);
  if (!blueprint.composition) throw new Error("blueprint.composition is missing; describe skeleton, slots, and items first");
  const orientation = blueprint.orientation === "portrait" ? "portrait" : "landscape";
  const shapePlan = composeShapePlan(blueprint.composition, { blocks: blueprint.blocks, orientation });
  const model = compileRenderModel({ requirement, blueprint: { ...blueprint, shape_plan: shapePlan } });
  const result = {
    requirementId: model.requirementId,
    orientation,
    skeleton: blueprint.composition.skeleton ?? null,
    primitiveCount: shapePlan.primitives.length,
    layoutQuality: model.shapePlan.layoutQuality,
    structureFingerprint: model.shapePlan.structureFingerprint,
    // 블록별 요소 요약. 관계를 표현해야 할 블록이 칩 나열로 끝났는지 여기서 먼저 본다.
    blocks: summarizeComposition(blueprint.composition, blueprint.blocks),
    written: false,
  };
  if (args.write) {
    blueprint.shape_plan = shapePlan;
    await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2), "utf8");
    result.written = true;
    result.blueprint = blueprintPath;
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  try {
    await composeProject();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
