import assert from "node:assert/strict";
import test from "node:test";
import {
  getBlockTypeDefinition,
  listBlockTypeDefinitions,
  validateBlockTypeContent,
} from "../src/block-types.mjs";

test("lists the six selectable block types", () => {
  assert.deepEqual(listBlockTypeDefinitions().map((item) => item.id), [
    "matrix_table",
    "metric_dashboard",
    "scope_outcome_mapping",
    "blueprint_flow",
    "chevron_pipeline",
    "gantt_roadmap",
  ]);
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
