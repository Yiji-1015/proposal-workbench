import assert from "node:assert/strict";
import test from "node:test";
import { createAssetRecipe, resolveRendererKey } from "../src/asset-recipes.mjs";

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
  content: { headline: "품질 검증", bullets: ["설계", "검증", "개선", "재검증"] },
  steps: ["설계", "검증", "개선", "재검증"],
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
