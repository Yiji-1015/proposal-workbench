import assert from "node:assert/strict";
import test from "node:test";
import { compileRenderModel } from "../src/compile-render-model.mjs";

function fixture() {
  const requirement = {
    requirement_id: "SEC-204",
    requirement_name: "접근통제",
    requirement_summary: "관리자 접근통제를 적용한다.",
  };
  const blueprint = {
    requirement_id: "SEC-204",
    slide_scope: "requirement",
    primary_requirement_id: "SEC-204",
    requirement_ids: ["SEC-204"],
    slide_title: "관리자 접근통제 수행 방안",
    layout_family: "block_pool_auto",
    orientation: "portrait",
    governing_message: "관리자 권한의 전 생애주기를 정책 기반으로 통제합니다.",
    density: "high",
    protected_metrics: [{ metric_id: "SEC-204-M1", label: "점검 주기", value_text: "분기 1회", source_refs: ["chunk-7"] }],
    blocks: [
      { block_id: "metrics", role: "metric", slot: "auto", visual_category: "metric_dashboard", content: { headline: "핵심 지표", metrics: [{ label: "점검", value_text: "분기 1회" }] } },
      { block_id: "mapping", role: "mapping", slot: "auto", visual_category: "scope_outcome_mapping", content: { headline: "범위와 효과", left: [{ label: "관리자" }], right: [{ label: "통제" }], links: [{ from: 0, to: 0 }] } },
      { block_id: "table", role: "table", slot: "auto", visual_category: "matrix_table", content: { headline: "통제 기준", columns: ["구분", "정책"], rows: [{ label: "권한", cells: ["분리"] }] } },
      { block_id: "flow", role: "flow", slot: "auto", visual_category: "blueprint_flow", content: { headline: "처리 흐름", inputs: ["신청"], steps: ["검토", "승인"], step_details: ["정책 대조", "책임자 승인"], outputs: ["권한"] } },
      { block_id: "gates", role: "gates", slot: "auto", visual_category: "quality_gate", content: { headline: "통제 게이트", diagram_labels: ["신청", "검토", "승인", "점검"] } },
    ],
  };
  return { requirement, blueprint };
}

test("compiles the native core without mapping, catalog, ingest, or search", () => {
  const model = compileRenderModel(fixture());
  assert.equal(model.requirementId, "SEC-204");
  assert.equal(model.referenceContext.mode, "none");
  assert.deepEqual(model.nativeDiagrams.map((item) => item.rendererKey), [
    "metric_dashboard",
    "scope_outcome_mapping",
    "matrix_table",
    "blueprint_flow",
    "quality_gate",
  ]);
  assert.deepEqual(model.protectedMetrics.map((metric) => metric.valueText), ["분기 1회"]);
});

test("records user-supplied references as metadata only", () => {
  const inputs = fixture();
  inputs.blueprint.reference_context = {
    mode: "user_provided",
    selected_slide_ids: ["deck-a_s003"],
    notes: [{ block_id: "flow", reference_id: "deck-a_s003", usage_note: "입력-처리-출력 배치만 참고" }],
  };
  const model = compileRenderModel(inputs);
  assert.deepEqual(model.referenceContext, {
    mode: "user_provided",
    selectedSlideIds: ["deck-a_s003"],
    notes: [{ blockId: "flow", referenceId: "deck-a_s003", usageNote: "입력-처리-출력 배치만 참고" }],
  });
});

test("rejects repeated native topology within one block-pool slide", () => {
  const inputs = fixture();
  inputs.blueprint.blocks[1] = { block_id: "metrics-2", role: "metric", slot: "auto", visual_category: "metric_dashboard", content: { headline: "추가 지표", metrics: [{ label: "처리", value_text: "100건" }] } };
  assert.throws(() => compileRenderModel(inputs), /visual_category values must be unique/i);
});

test("validates block content and layout slots", () => {
  const invalidContent = fixture();
  invalidContent.blueprint.blocks[2].content.rows[0].cells = [];
  assert.throws(() => compileRenderModel(invalidContent), /matrix_table.*cells.*columns/i);
  const invalidSlot = fixture();
  invalidSlot.blueprint.blocks[0].slot = "top";
  assert.throws(() => compileRenderModel(invalidSlot), /slot auto/i);
});

test("supports overview scope and landscape orientation", () => {
  const inputs = fixture();
  inputs.blueprint.slide_scope = "overview";
  inputs.blueprint.primary_requirement_id = null;
  inputs.blueprint.requirement_ids = ["SEC-204", "SEC-205"];
  inputs.blueprint.orientation = "landscape";
  delete inputs.blueprint.governing_message;
  const model = compileRenderModel(inputs);
  assert.equal(model.primaryRequirementId, null);
  assert.deepEqual(model.canvas, { width: 1280, height: 720, orientation: "landscape" });
});

test("keeps approval-critical blueprint validation", () => {
  const tooSmall = fixture();
  tooSmall.blueprint.blocks.pop();
  assert.throws(() => compileRenderModel(tooSmall), /at least 5 content boxes/i);
  const lowDensity = fixture();
  lowDensity.blueprint.density = "standard";
  assert.throws(() => compileRenderModel(lowDensity), /density must be high/i);
  const badMessage = fixture();
  badMessage.blueprint.governing_message = "관리자 권한 통제";
  assert.throws(() => compileRenderModel(badMessage), /must end in 니다\./i);
});

test("outline mode accepts headline and summary without detailed type fields", () => {
  const inputs = fixture();
  for (const block of inputs.blueprint.blocks) block.content = { headline: block.block_id, summary: "블록의 간단 내용" };
  assert.doesNotThrow(() => compileRenderModel({ ...inputs, outline: true }));
  assert.throws(() => compileRenderModel(inputs));
});
