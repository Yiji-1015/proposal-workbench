import assert from "node:assert/strict";
import test from "node:test";
import { AssetLayoutError, createAssetRecipe, resolveRendererKey } from "../src/asset-recipes.mjs";

const frame = { left: 20, top: 40, width: 600, height: 300 };
const theme = {
  primary: "#1769E0",
  navy: "#123B78",
  accent: "#4A8CF0",
  pale: "#EEF5FF",
  surface: "#F3F6FA",
  ink: "#172033",
  gray: "#5F6B7A",
  line: "#C8D2DF",
  white: "#FFFFFF",
};
const block = {
  blockId: "main",
  // hub_spoke는 라벨 6개를 요구한다. 부족하면 렌더러가 자리표시자를 만들지 않고 실패한다.
  content: { headline: "품질 검증", bullets: ["설계", "검증", "개선", "재검증", "배포", "안정화"] },
  steps: ["설계", "검증", "개선", "재검증", "배포", "안정화"],
  options: [],
};

test("different renderer keys create different native structure fingerprints", () => {
  const feedback = createAssetRecipe({ rendererKey: "feedback_loop", block, frame, theme });
  const gates = createAssetRecipe({ rendererKey: "quality_gate", block, frame, theme });
  const hub = createAssetRecipe({ rendererKey: "hub_spoke", block, frame, theme });
  assert.equal(new Set([feedback.structureFingerprint, gates.structureFingerprint, hub.structureFingerprint]).size, 3);
  assert.ok(feedback.producedMotifs.includes("return_connector"));
  assert.ok(gates.producedMotifs.includes("stage_gate"));
  assert.ok(hub.producedMotifs.includes("radial_spokes"));
});
test("asset recipes use only the approved palette", () => {
  const recipe = createAssetRecipe({ rendererKey: "comparison", block, frame, theme });
  const colors = recipe.primitives.flatMap((primitive) => [primitive.fill, primitive.stroke, primitive.color]).filter(Boolean);
  assert.equal(colors.includes("#009C9C"), false);
  assert.equal(colors.includes("#007A7A"), false);
  assert.ok(colors.every((color) => Object.values(theme).includes(color) || color === "none"));
});

test("unsupported renderer keys fail closed", () => {
  assert.throws(() => createAssetRecipe({ rendererKey: "generic_grid", block, frame, theme }), /unsupported asset renderer/i);
});

test("creates distinct native recipes for the six pool types", () => {
  const blocks = {
    matrix_table: { blockId: "table", content: { headline: "표", columns: ["구분", "제안"], rows: [{ label: "수집", cells: ["표준화"] }] } },
    metric_dashboard: { blockId: "metric", content: { headline: "지표", metrics: [{ label: "응답", value_text: "30초" }] } },
    scope_outcome_mapping: { blockId: "mapping", content: { headline: "범위", left: [{ label: "수집" }], right: [{ label: "대시보드" }] } },
    blueprint_flow: { blockId: "blueprint", content: { headline: "흐름", inputs: ["로그"], steps: ["파싱", "분석"], outputs: ["알림"] } },
    chevron_pipeline: { blockId: "chevron", content: { headline: "단계", steps: ["설계", "검증"] } },
    gantt_roadmap: { blockId: "gantt", content: { headline: "일정", time_units: ["M1", "M2"], rows: [{ label: "구축", start: 0, end: 2 }] } },
  };
  const recipes = Object.entries(blocks).map(([rendererKey, currentBlock]) => createAssetRecipe({ rendererKey, block: { ...currentBlock, steps: [], options: [] }, frame, theme }));
  assert.equal(new Set(recipes.map((recipe) => recipe.structureFingerprint)).size, 6);
  for (const recipe of recipes) assert.ok(recipe.requiredMotifs.every((motif) => recipe.producedMotifs.includes(motif)));
});

test("chevron step labels sit below the shape instead of inside it", () => {
  // 셰브론은 두꺼운 ">" 획이라 상자 전체가 채워지는 높이가 없다. 도형 안에 라벨을 두면
  // 흰 글자가 빈 배경에 걸쳐 사라진다. 라벨은 도형 아래, 대비가 보장된 색이어야 한다.
  const recipe = createAssetRecipe({
    rendererKey: "chevron_pipeline",
    block: { blockId: "chevron", content: { headline: "단계", steps: ["설계", "검증"] }, steps: [], options: [] },
    frame,
    theme,
  });
  const byName = (name) => recipe.primitives.find((item) => item.name === name);
  for (const index of [1, 2]) {
    const shape = byName(`chevron-step:${index}`);
    const label = byName(`chevron-step-label:${index}`);
    assert.ok(shape && label, `chevron ${index} 도형과 라벨이 모두 있어야 한다`);
    assert.ok(
      label.position.top >= shape.position.top + shape.position.height,
      `chevron ${index} 라벨이 도형 아래에 있어야 한다`,
    );
    assert.notEqual(label.color, theme.white, `chevron ${index} 라벨은 흰 배경에 놓이므로 흰색이면 안 된다`);
  }
  const last = byName("chevron-step-label:2");
  assert.ok(last.position.top + last.position.height <= frame.top + frame.height, "라벨이 블록 프레임을 넘지 않아야 한다");
});

test("maps catalog visual modules to pool renderer keys", () => {
  const mappings = {
    metric_bars: "metric_dashboard",
    before_after_metric_table: "matrix_table",
    parallel_rows: "scope_outcome_mapping",
    comparison_flow: "scope_outcome_mapping",
    system_flow: "blueprint_flow",
    chevron_process: "chevron_pipeline",
    gantt: "gantt_roadmap",
  };
  for (const [module_type, expected] of Object.entries(mappings)) assert.equal(resolveRendererKey({}, { module_type }), expected);
});

test("adds an editable explanation area without replacing the native diagram", () => {
  const recipe = createAssetRecipe({
    rendererKey: "blueprint_flow",
    block: {
      blockId: "explained-flow",
      content: { headline: "흐름", inputs: ["로그"], steps: ["정제", "분석"], outputs: ["알림"], explanation: "접점 로그를 정제·분석해 운영 알림으로 전달합니다." },
      steps: [],
      options: [],
    },
    frame,
    theme,
  });
  assert.ok(recipe.primitives.some((item) => item.name === "explanation:explained-flow" && item.text.includes("접점 로그")));
  assert.ok(recipe.primitives.some((item) => item.name === "process-step:1"));
});

test("expands the editable explanation area for detailed native-diagram copy", () => {
  const recipe = createAssetRecipe({
    rendererKey: "blueprint_flow",
    block: {
      blockId: "detailed-flow",
      content: { headline: "흐름", inputs: ["로그"], steps: ["정제", "분석"], outputs: ["알림"], explanation: "상세 설명을 보존합니다. ".repeat(20) },
      steps: [],
      options: [],
    },
    frame,
    theme,
  });
  const explanation = recipe.primitives.find((item) => item.name === "explanation:detailed-flow");
  assert.ok(explanation.position.height > 30);
});

test("renders detailed copy inside blueprint flow nodes and bands", () => {
  const recipe = createAssetRecipe({
    rendererKey: "blueprint_flow",
    block: {
      blockId: "dense-flow",
      content: {
        headline: "분석 처리 흐름",
        inputs: ["웹 로그", "앱 행동 데이터"],
        steps: ["표준화·비식별", "실시간·Batch 분석"],
        step_details: ["공통 스키마 정리\n개인정보 비식별 처리", "행동모델링·통계 생성\nJob 결과를 운영에 반영"],
        tools: ["행동모델링", "통계·AI 분석"],
        outputs: ["대시보드", "운영 알림"],
      },
      steps: [],
      options: [],
    },
    frame,
    theme,
  });
  const firstDetail = recipe.primitives.find((item) => item.name === "process-step-detail:1");
  const inputBand = recipe.primitives.find((item) => item.name === "input-band-value");
  assert.equal(firstDetail.text, "· 공통 스키마 정리\n· 개인정보 비식별 처리");
  assert.equal(inputBand.text, "· 웹 로그\n· 앱 행동 데이터");
  assert.ok(inputBand.position.height > 22);
});

function responsiveTemplate(overrides = {}) {
  return {
    version: 1,
    module_id: "responsive-process",
    asset_kind: "composite_block",
    module_type: "process_chain",
    renderer_key: "responsive_native_template",
    shell: {
      container: { kind: "roundRect", fill: "white", stroke: "line" },
      header_zone: { x: 0.04, y: 0.03, w: 0.92, h: 0.12, text_slot: "title" },
      body_zone: { x: 0.04, y: 0.2, w: 0.92, h: 0.72 },
    },
    diagram: {
      topology: {
        kind: "process_chain",
        repeat_source: "steps",
        nodes: [{ id: "step", kind: "roundRect", repeat: true, text_slot: "steps[]" }],
        edges: [{ from: "step[n]", to: "step[n+1]", kind: "connector", arrow: "end" }],
      },
      variants: {
        wide: { layout: "row", columns: "all" },
        compact: { layout: "grid", columns: 2 },
        tall: { layout: "column", columns: 1 },
      },
    },
    style: { node_fill: "pale", node_stroke: "primary", text_color: "navy" },
    constraints: { padding_ratio: 0.05, gap_ratio: 0.03, min_font_size: 9, min_nodes: 2, max_nodes: 8 },
    primitives: [
      { kind: "shape", bounds: { x: 0.08, y: 0.28, w: 0.18, h: 0.16 }, fill: "pale", stroke: "primary", text_slot: "steps[]", text: "원본 문구" },
      { kind: "shape", bounds: { x: 0.82, y: 0.04, w: 0.06, h: 0.06 }, fill: "accent", stroke: "accent", custom_geometry: [{ width: 20, height: 20, commands: [{ moveTo: { x: 0, y: 0 } }, { lineTo: { x: 20, y: 20 } }, { close: {} }] }] },
    ],
    ...overrides,
  };
}

test("responsive native templates select variants and reflow 2-8 steps", () => {
  const currentBlock = { blockId: "responsive", content: { headline: "현재 제목" }, steps: ["수집", "표준화", "분석", "검증", "알림", "개선", "운영", "확장"], options: [] };
  const wide = createAssetRecipe({ rendererKey: "responsive_native_template", block: { ...currentBlock, steps: currentBlock.steps.slice(0, 2) }, frame: { left: 10, top: 20, width: 600, height: 300 }, theme, template: responsiveTemplate() });
  const compact = createAssetRecipe({ rendererKey: "responsive_native_template", block: { ...currentBlock, steps: currentBlock.steps.slice(0, 8) }, frame: { left: 10, top: 20, width: 400, height: 400 }, theme, template: responsiveTemplate() });
  const tall = createAssetRecipe({ rendererKey: "responsive_native_template", block: currentBlock, frame: { left: 10, top: 20, width: 300, height: 600 }, theme, template: responsiveTemplate() });
  assert.equal(wide.variant, "wide");
  assert.equal(compact.variant, "compact");
  assert.equal(tall.variant, "tall");
  assert.equal(wide.primitives.filter((item) => item.kind === "connector").length, 1);
  assert.equal(compact.primitives.filter((item) => item.kind === "connector").length, 7);
  assert.equal(tall.primitives.filter((item) => item.kind === "connector").length, 7);
  assert.deepEqual(compact.primitives.filter((item) => item.kind === "connector").map((item) => item.name), [
    "asset-connector:1", "asset-connector:2", "asset-connector:3", "asset-connector:4", "asset-connector:5", "asset-connector:6", "asset-connector:7",
  ]);
  for (const [recipe, currentFrame] of [[wide, { left: 10, top: 20, width: 600, height: 300 }], [compact, { left: 10, top: 20, width: 400, height: 400 }], [tall, { left: 10, top: 20, width: 300, height: 600 }]]) {
    assert.ok(recipe.primitives.some((item) => item.custom_geometry));
    assert.ok(recipe.primitives.filter((item) => item.kind === "text").every((item) => item.fontSize >= 9));
    for (const item of recipe.primitives) {
      assert.ok(item.position.left >= currentFrame.left - 0.01);
      assert.ok(item.position.top >= currentFrame.top - 0.01);
      assert.ok(item.position.left + item.position.width <= currentFrame.left + currentFrame.width + 0.01);
      assert.ok(item.position.top + item.position.height <= currentFrame.top + currentFrame.height + 0.01);
    }
  }
  assert.equal(JSON.stringify(compact).includes("원본 문구"), false);
});

test("responsive templates try another variant and fail typed when none fits", () => {
  const currentBlock = { blockId: "responsive", content: { headline: "제목" }, steps: ["1", "2", "3", "4", "5", "6", "7", "8"], options: [] };
  const alternate = createAssetRecipe({
    rendererKey: "responsive_native_template",
    block: currentBlock,
    frame,
    theme,
    template: responsiveTemplate({ constraints: { min_node_width: 160, min_nodes: 2, max_nodes: 8 } }),
  });
  assert.equal(alternate.variant, "compact");
  assert.throws(() => createAssetRecipe({
    rendererKey: "responsive_native_template",
    block: currentBlock,
    frame: { left: 0, top: 0, width: 120, height: 80 },
    theme,
    template: responsiveTemplate({ constraints: { min_node_width: 200, min_node_height: 100, min_nodes: 2, max_nodes: 8 } }),
  }), (error) => error instanceof AssetLayoutError);
});

test("라벨이 모자라면 자리표시자를 만들지 않고 실패한다", () => {
  // 렌더러가 "영역 4" 같은 문구를 채워 넣으면 작성자가 쓰지 않은 내용이 제안 장표에 실린다.
  assert.throws(
    () => createAssetRecipe({
      rendererKey: "mapping",
      block: { blockId: "short", content: { headline: "부족한 라벨", diagram_labels: ["하나", "둘", "셋"] }, steps: [], options: [] },
      frame,
      theme,
    }),
    /requires at least 4 labels/i,
  );
});

test("중앙 라벨은 청사진이 정한 값을 쓴다", () => {
  // 이전에는 feedback_loop 중앙 문구가 "품질 환류"로 하드코딩되어 청사진을 무시했다.
  const centered = { blockId: "loop", content: { headline: "구조 변화 최소화", center_label: "유연한 구조", diagram_labels: ["활용", "요건", "변경", "설계"] }, steps: [], options: [] };
  const texts = (rendererKey, currentBlock) => createAssetRecipe({ rendererKey, block: currentBlock, frame, theme })
    .primitives.filter((item) => item.kind === "text").map((item) => item.text);
  const loopTexts = texts("feedback_loop", centered);
  assert.ok(loopTexts.includes("유연한 구조"), "center_label이 중앙에 반영되어야 한다");
  assert.equal(loopTexts.includes("품질 환류"), false, "하드코딩 문구가 남아 있으면 안 된다");
  const noCenter = { ...centered, content: { ...centered.content, center_label: undefined } };
  assert.ok(texts("feedback_loop", noCenter).includes("구조 변화 최소화"), "center_label이 없으면 headline을 쓴다");
});
