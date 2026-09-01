import assert from "node:assert/strict";
import test from "node:test";
import { compileRenderModel } from "../src/compile-render-model.mjs";

function fixture(overrides = {}) {
  const requirement = {
    requirement_id: "SEC-204",
    requirement_name: "접근통제",
    requirement_summary: "관리자 접근통제를 적용한다.",
    rfp_facts: { quantitative_metrics: [{ id: "SEC-204-M1", name: "점검 주기", value_text: "분기 1회", source_refs: ["chunk-7"] }] },
  };
  const blueprint = {
    requirement_id: "SEC-204",
    slide_scope: "requirement",
    primary_requirement_id: "SEC-204",
    requirement_ids: ["SEC-204"],
    slide_title: "관리자 접근통제 수행 방안",
    layout_family: "three_column_with_bottom_band",
    orientation: "portrait",
    governing_message: "관리자 권한의 전 생애주기를 정책 기반으로 통제합니다.",
    density: "high",
    protected_metrics: [{ metric_id: "SEC-204-M1", label: "점검 주기", value_text: "분기 1회", source_refs: ["chunk-7"] }],
    blocks: [
      { block_id: "requirement_summary", role: "requirement_summary", slot: "left", visual_category: "summary_cards", importance: "mandatory", content: { headline: "권한 통제", bullets: ["관리자 권한 분리"] }, source_refs: ["SEC-204-A1"] },
      { block_id: "main_process", role: "main_process", slot: "center", visual_category: "horizontal_process", direction: "left_to_right", step_count: 4, importance: "mandatory", content: { steps: ["신청", "검토", "승인", "점검"] }, source_refs: ["SEC-204-A2"] },
      { block_id: "metric_highlight", role: "metric_highlight", slot: "top_left", visual_category: "quantitative_metric", importance: "mandatory", content: { label: "점검 주기", value_text: "분기 1회" }, source_refs: ["SEC-204-M1"] },
      { block_id: "control_policy", role: "operation_quality", slot: "right", visual_category: "control_nodes", importance: "mandatory", content: { headline: "통제 정책", bullets: ["권한 분리", "접근 이력"] }, source_refs: ["SEC-204-A3"] },
      { block_id: "expected_effect", role: "expected_effect", slot: "bottom_center", visual_category: "outcome_band", importance: "mandatory", content: { headline: "기대효과", bullets: ["감사 대응력 확보"] }, source_refs: ["SEC-204-A4"] },
    ],
  };
  const mapping = {
    requirement_id: "SEC-204",
    mappings: [
      { block_id: "main_process", status: "selected_candidate", asset_id: "process-four-step", template: "templates/process-four.svg", usage_mode: "structural" },
      { block_id: "requirement_summary", status: "fallback_native_shapes", fallback: "native_shapes" },
      { block_id: "metric_highlight", status: "no_suitable_asset", fallback: "native_shapes" },
      { block_id: "control_policy", status: "fallback_native_shapes", fallback: "native_shapes" },
      { block_id: "expected_effect", status: "fallback_native_shapes", fallback: "native_shapes" },
    ],
  };
  const catalog = [{ module_id: "process-four-step", module_type: "four_step_process", template: "templates/process-four.svg" }];
  return { requirement, blueprint, mapping, catalog, ...overrides };
}

function poolFixture() {
  const inputs = fixture();
  inputs.blueprint.layout_family = "block_pool_auto";
  inputs.blueprint.blocks = [
    {
      block_id: "pool_metrics",
      role: "pool_block",
      slot: "auto",
      visual_category: "metric_dashboard",
      importance: "mandatory",
      content: { headline: "핵심 지표", metrics: [{ label: "응답시간", value_text: "30초" }, { label: "수집범위", value_text: "3개 접점" }] },
    },
    {
      block_id: "pool_mapping",
      role: "pool_block",
      slot: "auto",
      visual_category: "scope_outcome_mapping",
      importance: "mandatory",
      content: { headline: "범위와 효과", left: [{ label: "웹 로그" }], right: [{ label: "운영 대시보드" }], links: [{ from: 0, to: 0 }] },
    },
    {
      block_id: "pool_table",
      role: "pool_block",
      slot: "auto",
      visual_category: "matrix_table",
      importance: "mandatory",
      content: { headline: "대응 기준", columns: ["구분", "제안", "검증"], rows: [{ label: "수집", cells: ["표준화", "로그 확인"] }] },
    },
    {
      block_id: "pool_flow",
      role: "pool_block",
      slot: "auto",
      visual_category: "blueprint_flow",
      importance: "mandatory",
      content: { headline: "처리 흐름", inputs: ["접점 로그"], steps: ["정제", "분석"], outputs: ["알림"], tools: ["분석 엔진"] },
    },
    {
      block_id: "pool_chevron",
      role: "pool_block",
      slot: "auto",
      visual_category: "chevron_pipeline",
      importance: "mandatory",
      content: { headline: "추진 단계", steps: ["구축", "검증"], criteria: ["단위 테스트", "인수 테스트"] },
    },
  ];
  inputs.mapping.mappings = inputs.blueprint.blocks.map((block) => ({ block_id: block.block_id, status: "fallback_native_shapes", fallback: "native_shapes" }));
  return inputs;
}

test("compiles an arbitrary requirement without DAR-specific defaults", () => {
  const model = compileRenderModel(fixture());
  assert.equal(model.requirementId, "SEC-204");
  assert.equal(model.slideScope, "requirement");
  assert.equal(model.primaryRequirementId, "SEC-204");
  assert.deepEqual(model.requirementIds, ["SEC-204"]);
  assert.equal(model.title, "관리자 접근통제 수행 방안");
  assert.deepEqual(model.canvas, { width: 720, height: 1280, orientation: "portrait" });
  assert.equal(model.governingMessage, "관리자 권한의 전 생애주기를 정책 기반으로 통제합니다.");
  assert.deepEqual(model.blocks.find((block) => block.blockId === "main_process").steps, ["신청", "검토", "승인", "점검"]);
  assert.deepEqual(model.protectedMetrics.map((metric) => metric.valueText), ["분기 1회"]);
  assert.deepEqual(model.selectedAssets.map((asset) => asset.assetId), ["process-four-step"]);
  assert.equal(model.selectedAssets[0].usageMode, "structural");
  assert.equal(model.selectedAssets[0].rendererKey, "process_grid");
  assert.equal(model.theme.primary, "#1769E0");
  assert.equal(model.theme.navy, "#123B78");
  assert.deepEqual(model.fallbackBlocks.map((block) => block.blockId), ["requirement_summary", "metric_highlight", "control_policy", "expected_effect"]);
  assert.equal(JSON.stringify(model).includes("DAR-010"), false);
});

test("normalizes block pool types and their content contracts", () => {
  const model = compileRenderModel(poolFixture());
  assert.deepEqual(model.blocks.map((block) => block.blockType), [
    "metric_dashboard",
    "scope_outcome_mapping",
    "matrix_table",
    "blueprint_flow",
    "chevron_pipeline",
  ]);
  assert.equal(model.blocks[0].blockTypeDefinition.rendererKey, "metric_dashboard");
  assert.deepEqual(model.blocks[2].content.rows[0].cells, ["표준화", "로그 확인"]);
});

test("rejects invalid block pool content, type, and slot", () => {
  const invalidContent = poolFixture();
  invalidContent.blueprint.blocks[2].content.rows[0].cells = [];
  assert.throws(() => compileRenderModel(invalidContent), /matrix_table.*cells.*columns/i);

  const invalidType = poolFixture();
  invalidType.blueprint.blocks[0].visual_category = "card_grid";
  assert.throws(() => compileRenderModel(invalidType), /block_pool_auto does not support visual_category card_grid/i);

  const invalidSlot = poolFixture();
  invalidSlot.blueprint.blocks[0].slot = "top";
  assert.throws(() => compileRenderModel(invalidSlot), /block_pool_auto requires slot auto.*pool_metrics/i);
});

test("allows an overview blueprint to group multiple requirements", () => {
  const inputs = fixture();
  inputs.blueprint.slide_scope = "overview";
  delete inputs.blueprint.primary_requirement_id;
  inputs.blueprint.requirement_ids = ["SFR-001", "SER-003"];
  const model = compileRenderModel(inputs);
  assert.equal(model.slideScope, "overview");
  assert.equal(model.primaryRequirementId, null);
  assert.deepEqual(model.requirementIds, ["SFR-001", "SER-003"]);
});

test("rejects a requirement blueprint that groups multiple requirements", () => {
  const inputs = fixture();
  inputs.blueprint.requirement_ids = ["SEC-204", "SER-003"];
  assert.throws(() => compileRenderModel(inputs), /exactly one requirement_ids/i);
});

test("rejects an overview blueprint with one requirement", () => {
  const inputs = fixture();
  inputs.blueprint.slide_scope = "overview";
  delete inputs.blueprint.primary_requirement_id;
  inputs.blueprint.requirement_ids = ["SEC-204"];
  assert.throws(() => compileRenderModel(inputs), /at least two requirement_ids/i);
});

test("requires detailed explanation for a non-native architecture treatment", () => {
  const inputs = fixture();
  inputs.blueprint.blocks[4].architecture_treatment = "text_explainer";
  assert.throws(() => compileRenderModel(inputs), /requires content\.explanation/i);
});

test("normalizes a text explainer with ordered flow steps", () => {
  const inputs = fixture();
  inputs.blueprint.blocks[4].architecture_treatment = "text_explainer";
  inputs.blueprint.blocks[4].content.explanation = "접점 데이터가 표준화와 통제를 거쳐 운영 결과로 전달된다.";
  inputs.blueprint.blocks[4].content.flow_steps = ["접점 수집", "표준화·통제", "운영 반영"];
  const model = compileRenderModel(inputs);
  const block = model.blocks.find((candidate) => candidate.blockId === "expected_effect");
  assert.equal(block.architectureTreatment, "text_explainer");
  assert.deepEqual(block.flowSteps, ["접점 수집", "표준화·통제", "운영 반영"]);
});

test("uses a landscape canvas without changing proposal content", () => {
  const inputs = fixture();
  inputs.blueprint.orientation = "landscape";
  const model = compileRenderModel(inputs);
  assert.deepEqual(model.canvas, { width: 1280, height: 720, orientation: "landscape" });
  assert.equal(model.protectedMetrics[0].valueText, "분기 1회");
});

test("rejects a portrait blueprint without a governing message", () => {
  const inputs = fixture();
  delete inputs.blueprint.governing_message;
  assert.throws(() => compileRenderModel(inputs), /governing_message.*non-empty/i);
});

test("rejects a slide blueprint with fewer than five content boxes", () => {
  const inputs = fixture();
  inputs.blueprint.blocks = inputs.blueprint.blocks.slice(0, 4);
  inputs.mapping.mappings = inputs.mapping.mappings.filter((item) => inputs.blueprint.blocks.some((block) => block.block_id === item.block_id));
  assert.throws(() => compileRenderModel(inputs), /at least 5 content boxes/i);
});

test("rejects proposal blueprints that are not high density", () => {
  const inputs = fixture();
  inputs.blueprint.density = "standard";
  assert.throws(() => compileRenderModel(inputs), /density must be high/i);
});

test("normalizes an explicitly approved blue palette", () => {
  const inputs = fixture();
  inputs.blueprint.theme = {
    primary: "#2868B2",
    navy: "#0B2038",
    accent: "#4A8CF0",
    pale: "#E7EFF9",
    surface: "#F5F8FC",
  };
  const model = compileRenderModel(inputs);
  assert.deepEqual(model.theme, {
    primary: "#2868B2",
    navy: "#0B2038",
    accent: "#4A8CF0",
    pale: "#E7EFF9",
    surface: "#F5F8FC",
    ink: "#172033",
    gray: "#5F6B7A",
    line: "#C8D2DF",
    white: "#FFFFFF",
  });
});

test("rejects an unsupported selected asset instead of flattening it to a generic grid", () => {
  const inputs = fixture();
  inputs.catalog[0].module_type = "unknown_visual_system";
  assert.throws(() => compileRenderModel(inputs), /unsupported renderer.*process-four-step/i);
});

test("rejects a portrait governing message that does not end in 니다.", () => {
  const inputs = fixture();
  inputs.blueprint.governing_message = "관리자 권한의 전 생애주기 통제";
  assert.throws(() => compileRenderModel(inputs), /must end in 니다\./i);
});

test("allows a landscape blueprint to omit a governing message", () => {
  const inputs = fixture();
  inputs.blueprint.orientation = "landscape";
  delete inputs.blueprint.governing_message;
  const model = compileRenderModel(inputs);
  assert.equal(model.governingMessage, "");
});

test("rejects a comparison block without an implementation conclusion", () => {
  const inputs = fixture();
  inputs.blueprint.blocks.push({
    block_id: "technology_comparison",
    role: "technology_comparison",
    slot: "bottom_center",
    visual_category: "two_option_comparison",
    step_count: 2,
    content: { options: [{ label: "A" }, { label: "B" }] },
  });
  assert.throws(() => compileRenderModel(inputs), /technology_comparison.*content\.conclusion/i);
});

test("rejects an unresolved architecture placeholder during final rendering", () => {
  const inputs = fixture();
  inputs.mapping.mappings[0].status = "architecture_required";
  assert.throws(() => compileRenderModel(inputs), /상세 아키텍처 필요.*cannot be rendered/i);
});

test("rejects requirement IDs that disagree across inputs", () => {
  const inputs = fixture();
  inputs.mapping.requirement_id = "OTHER-001";
  assert.throws(() => compileRenderModel(inputs), /requirement IDs must match/i);
});

test("rejects selected assets that are absent from the catalog", () => {
  const inputs = fixture({ catalog: [] });
  assert.throws(() => compileRenderModel(inputs), /unknown asset.*process-four-step/i);
});

test("rejects a declared step count that differs from actual steps", () => {
  const inputs = fixture();
  inputs.blueprint.blocks.find((block) => block.block_id === "main_process").step_count = 5;
  assert.throws(() => compileRenderModel(inputs), /step_count.*4/i);
});

test("reflows a selected process asset when the content has a different supported step count", () => {
  const inputs = fixture();
  inputs.catalog[0].module_type = "six_step_process_grid";
  const model = compileRenderModel(inputs);
  assert.equal(model.selectedAssets[0].assetId, "process-four-step");
  assert.deepEqual(model.selectedAssets[0].adaptations, [{ type: "node_count_reflow", from: 6, to: 4 }]);
  assert.equal(model.fallbackBlocks.some((block) => block.blockId === "main_process"), false);
});
