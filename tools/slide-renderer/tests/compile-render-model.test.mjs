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

function agentFixture() {
  const inputs = fixture();
  inputs.blueprint.layout_family = "agent_authored";
  inputs.blueprint.blocks = ["intent", "scope", "flow", "control", "outcome"].map((blockId) => ({
    block_id: blockId,
    role: blockId,
    content: { headline: `${blockId} headline` },
  }));
  inputs.blueprint.shape_plan = {
    design_rationale: "요구사항의 원인에서 효과로 이어지는 비대칭 세로 흐름을 사용한다.",
    composition_signature: "portrait-asymmetric-spine-v1",
    primitives: inputs.blueprint.blocks.flatMap((block, index) => {
      const top = 180 + index * 190;
      return [
        { kind: index === 2 ? "ellipse" : "roundRect", name: `${block.block_id}-surface`, block_id: block.block_id, position: { left: 48 + index * 12, top, width: 600 - index * 24, height: 142 }, fill: index === 2 ? "pale" : "white", stroke: "line" },
        { kind: "text", name: `${block.block_id}-text`, block_id: block.block_id, position: { left: 72 + index * 12, top: top + 34, width: 552 - index * 24, height: 56 }, text: `${block.content.headline}${index === 0 ? " · 분기 1회" : ""}`, color: "ink", font_size: 18, bold: true },
      ];
    }),
  };
  return inputs;
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

test("compiles an agent-authored native shape plan without fixed visual categories", () => {
  const model = compileRenderModel(agentFixture());
  assert.equal(model.layoutFamily, "agent_authored");
  assert.equal(model.blocks[0].visualCategory, "agent_authored");
  assert.equal(model.blocks[0].blockTypeDefinition, null);
  assert.equal(model.shapePlan.primitives.length, 10);
  assert.equal(model.shapePlan.compositionSignature, "portrait-asymmetric-spine-v1");
  assert.match(model.shapePlan.structureFingerprint, /^[0-9a-f]{16}$/);
  assert.deepEqual(model.nativeDiagrams, []);
});

test("rejects invalid agent-authored geometry before rendering", () => {
  const outside = agentFixture();
  outside.blueprint.shape_plan.primitives[0].position.left = -1;
  assert.throws(() => compileRenderModel(outside), /safe area/i);

  const image = agentFixture();
  image.blueprint.shape_plan.primitives[0].kind = "image";
  assert.throws(() => compileRenderModel(image), /unsupported.*kind/i);

  const duplicate = agentFixture();
  duplicate.blueprint.shape_plan.primitives[1].name = duplicate.blueprint.shape_plan.primitives[0].name;
  assert.throws(() => compileRenderModel(duplicate), /name must be unique/i);

  const missingMetric = agentFixture();
  missingMetric.blueprint.shape_plan.primitives[1].text = missingMetric.blueprint.blocks[0].content.headline;
  assert.throws(() => compileRenderModel(missingMetric), /protected metric.*분기 1회/i);

  const missingSummary = agentFixture();
  missingSummary.blueprint.blocks[0].content.summary = "승인된 상세 요약";
  assert.throws(() => compileRenderModel(missingSummary), /content\.summary.*intent/i);

  const missingVisual = agentFixture();
  missingVisual.blueprint.shape_plan.primitives[0].kind = "line";
  assert.throws(() => compileRenderModel(missingVisual), /non-text visual shape.*intent/i);

  const invalidConnector = agentFixture();
  invalidConnector.blueprint.shape_plan.primitives.push({
    kind: "connector", name: "invalid-connector", block_id: "flow",
    position: { left: 120, top: 700, width: 200, height: 10 },
    from: "intent-surface", to: "scope-surface", connector_kind: "curved",
  });
  assert.throws(() => compileRenderModel(invalidConnector), /unsupported connector_kind/i);
});

test("accepts an explicit empty reference selection", () => {
  const inputs = agentFixture();
  inputs.blueprint.reference_context = { mode: "none", selected_slide_ids: [], notes: [] };
  assert.deepEqual(compileRenderModel(inputs).referenceContext.selectedSlideIds, []);
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

test("agent-authored outline can precede detailed shape planning", () => {
  const inputs = agentFixture();
  delete inputs.blueprint.shape_plan;
  assert.doesNotThrow(() => compileRenderModel({ ...inputs, outline: true }));
  assert.throws(() => compileRenderModel(inputs), /shape_plan/);
});
