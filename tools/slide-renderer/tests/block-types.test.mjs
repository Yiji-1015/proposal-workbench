import assert from "node:assert/strict";
import test from "node:test";
import {
  getBlockTypeDefinition,
  listBlockTypeDefinitions,
  validateBlockTypeContent,
} from "../src/block-types.mjs";

test("lists every selectable block type with a usable span and height", () => {
  const definitions = listBlockTypeDefinitions();
  assert.deepEqual(definitions.map((item) => item.id), [
    "matrix_table",
    "metric_dashboard",
    "scope_outcome_mapping",
    "blueprint_flow",
    "chevron_pipeline",
    "gantt_roadmap",
    "process_grid",
    "comparison",
    "mapping",
    "feedback_loop",
    "quality_gate",
    "swimlane",
    "hub_spoke",
    "architecture",
  ]);
  // block_pool_auto는 span과 방향별 높이가 있어야 블록을 배치할 수 있다.
  for (const definition of definitions) {
    assert.ok(["full", "half"].includes(definition.preferredSpan), `${definition.id} span`);
    for (const orientation of ["portrait", "landscape"]) {
      assert.ok(Number.isFinite(definition.minHeight[orientation]), `${definition.id} minHeight.${orientation}`);
      assert.ok(definition.preferredHeight[orientation] >= definition.minHeight[orientation], `${definition.id} preferredHeight.${orientation}`);
    }
  }
});

test("일정 근거가 없어도 다섯 블록을 서로 다른 타입으로 채울 수 있다", () => {
  // 로드맵을 제외한 선택지가 5개뿐이면 최소 5블록 규칙과 맞물려 타입 조합이 하나로
  // 고정된다. 확장 뒤에는 요구사항마다 다른 조합을 고를 수 있어야 한다.
  const selectable = listBlockTypeDefinitions().filter((item) => item.id !== "gantt_roadmap");
  assert.ok(selectable.length > 5, `일정 없는 장표의 타입 선택지가 ${selectable.length}개뿐이면 조합이 강제된다`);
});

test("validates a table row against its columns", () => {
  assert.throws(
    () => validateBlockTypeContent("matrix_table", { columns: ["구분", "제안"], rows: [{ label: "수집", cells: [] }] }),
    /matrix_table.*cells.*columns/i,
  );
});

test("returns null for legacy visual categories", () => {
  assert.equal(getBlockTypeDefinition("card_grid"), null);
});

test("preserves matched blueprint flow step details", () => {
  const content = validateBlockTypeContent("blueprint_flow", {
    inputs: ["로그"],
    steps: ["정제", "분석"],
    step_details: ["필드 정합성 확인", "실시간·Batch 분석"],
    outputs: ["알림"],
  });
  assert.deepEqual(content.step_details, ["필드 정합성 확인", "실시간·Batch 분석"]);
  assert.throws(
    () => validateBlockTypeContent("blueprint_flow", {
      inputs: ["로그"],
      steps: ["정제", "분석"],
      step_details: ["필드 정합성 확인"],
      outputs: ["알림"],
    }),
    /step_details.*steps/i,
  );
});
