import assert from "node:assert/strict";
import test from "node:test";
import { compileRenderModel } from "../src/compile-render-model.mjs";
import { composeShapePlan, summarizeComposition } from "../src/compose-shape-plan.mjs";

const BLOCKS = [
  { block_id: "goal", role: "goal", content: { headline: "목표 체계", summary: "하나의 목표가 세 구현 요소로 나뉘고 각 요소 아래 세부 기능이 붙습니다." } },
  { block_id: "criteria", role: "table", content: { headline: "검증 기준 표", summary: "단계별 검증 항목과 기준을 표로 정리합니다." } },
  { block_id: "custom", role: "custom", content: { headline: "부분 수동 도식", summary: "골격에 없는 순환 게이트 도식을 슬롯 안에서 직접 그립니다." } },
  { block_id: "mapping", role: "mapping", content: { headline: "요구와 대응 매핑", summary: "요구 항목마다 구현 방식을 1:1로 연결합니다." } },
  { block_id: "outcome", role: "outcome", content: { headline: "기대 효과", summary: "요소 조합이 한 장표 안에서 게이트를 통과하는지 확인합니다." } },
];

function composition() {
  return {
    rationale: "상단 계층에서 표·수동 도식으로 갈라진 뒤 매핑과 효과로 모인다.",
    signature: "portrait-items-test-v1",
    blocks: {
      goal: { slot: { left: 36, top: 180, width: 648, height: 220 }, style: "navy", items: [{ type: "hierarchy", root: "AI 활용 가능 지식자산", children: ["전처리", "검색", "업무 기능"], gap: 10 }] },
      criteria: { slot: { left: 36, top: 420, width: 420, height: 310 }, items: [{ type: "table", columns: ["단계", "검증 항목", "기준"], widths: [1, 2, 1.4], rows: [["수집", "파일 형식·중복", "실패 0건"], ["전처리", "청킹·태깅", "샘플 검증"], ["색인", "벡터·키워드", "재현율"]], bold_first_column: true }] },
      custom: { slot: { left: 476, top: 420, width: 208, height: 310 }, style: "pale", items: [{ type: "primitives", gap: 20, primitives: [
        { kind: "ellipse", name: "a", position: { left: 0, top: 0, width: 70, height: 70 }, fill: "primary", stroke: "primary" },
        { kind: "text", name: "a-label", position: { left: 0, top: 24, width: 70, height: 24 }, text: "질의", font_size: 11, bold: true, color: "white", alignment: "center" },
        { kind: "roundRect", name: "retry", position: { left: 0, top: 100, width: 180, height: 36 }, fill: "white", stroke: "accent" },
        { kind: "text", name: "retry-label", position: { left: 0, top: 107, width: 180, height: 24 }, text: "재질의 루프", font_size: 10.5, bold: true, color: "navy", alignment: "center" },
        { kind: "connector", name: "a-retry", from: "a", to: "retry", from_side: "bottom", to_side: "top" },
        { kind: "connector", name: "retry-goal", from: "retry", to: "goal", from_side: "top", to_side: "bottom", stroke: "accent" },
      ] }] },
      mapping: { slot: { left: 36, top: 750, width: 648, height: 250 }, items: [{ type: "mapping", left: ["하이브리드 검색", "신뢰도 점수", "원문 근거"], right: ["키워드+벡터 결합", "근거 일치도 산출", "구절 하이라이트"], gutter: 80 }] },
      outcome: { slot: { left: 36, top: 1020, width: 648, height: 200 }, style: "pale", items: [{ type: "chips", layout: "row", fill: "primary", labels: ["게이트 통과", "요약 출력", "승인 판단"] }] },
    },
  };
}

function inputs(comp = composition()) {
  return {
    requirement: { requirement_id: "DEMO-001", requirement_name: "새 요소", requirement_summary: "표·매핑·계층·부분 수동 요소를 검증한다.", rfp_facts: { quantitative_metrics: [] } },
    blueprint: {
      requirement_id: "DEMO-001", slide_scope: "requirement", primary_requirement_id: "DEMO-001", requirement_ids: ["DEMO-001"],
      slide_title: "새 요소 4종 시연", governing_message: "표, 좌우 매핑, 계층, 부분 수동 도식을 골격 슬롯 안에서 함께 씁니다.",
      orientation: "portrait", layout_family: "agent_authored", density: "high", blocks: BLOCKS, protected_metrics: [], composition: comp, status: "approved",
    },
  };
}

test("table, mapping, hierarchy, and partial primitives compose into a gate-passing plan", () => {
  const plan = composeShapePlan(composition(), { blocks: BLOCKS, orientation: "portrait" });
  const names = new Set(plan.primitives.map((primitive) => primitive.name));
  assert.ok(names.has("criteria-table-1-r0-c1") && names.has("criteria-table-1-r3-c3"));
  assert.ok(names.has("mapping-map-1-l-3") && names.has("mapping-map-1-link-3"));
  assert.ok(names.has("goal-tree-1-root") && names.has("goal-tree-1-root-c3"));
  const model = compileRenderModel(inputs());
  assert.equal(model.shapePlanSource, "composition");
  assert.ok(model.shapePlan.layoutQuality.surfaceCoverage >= 0.6);
});

test("partial primitives get a block prefix and resolve connectors to local names or other blocks", () => {
  const plan = composeShapePlan(composition(), { blocks: BLOCKS, orientation: "portrait" });
  const local = plan.primitives.find((primitive) => primitive.name === "custom-custom-1-a-retry");
  assert.equal(local.from, "custom-custom-1-a");
  assert.equal(local.to, "custom-custom-1-retry");
  const cross = plan.primitives.find((primitive) => primitive.name === "custom-custom-1-retry-goal");
  assert.equal(cross.to, "goal-surface");
  // flow 기준 좌표는 본문 아래에서 시작한다.
  const circle = plan.primitives.find((primitive) => primitive.name === "custom-custom-1-a");
  assert.ok(circle.position.top > 420 + 60);
});

test("slot-origin primitives are placed from the slot corner", () => {
  const comp = composition();
  comp.blocks.custom.items[0].origin = "slot";
  comp.blocks.custom.items[0].primitives = comp.blocks.custom.items[0].primitives.map((primitive) => (primitive.position ? { ...primitive, position: { ...primitive.position, top: primitive.position.top + 150 } } : primitive));
  const plan = composeShapePlan(comp, { blocks: BLOCKS, orientation: "portrait" });
  const circle = plan.primitives.find((primitive) => primitive.name === "custom-custom-1-a");
  assert.equal(circle.position.top, 420 + 150);
  assert.equal(circle.position.left, 476);
});

test("table rows must match the column count and mapping links must exist", () => {
  const badTable = composition();
  badTable.blocks.criteria.items[0].rows[0] = ["수집", "파일 형식"];
  assert.throws(() => composeShapePlan(badTable, { blocks: BLOCKS, orientation: "portrait" }), /table row 1 has 2 cells but 3 columns/);

  const badLink = composition();
  badLink.blocks.mapping.items[0].links = [[1, 9]];
  assert.throws(() => composeShapePlan(badLink, { blocks: BLOCKS, orientation: "portrait" }), /mapping link 1 points outside/);
});

test("summarizes each block's slot and items so reviewers can spot chip-only blocks", () => {
  const summary = summarizeComposition(composition(), BLOCKS);
  assert.deepEqual(summary.criteria.items, ["table(3)"]);
  assert.deepEqual(summary.mapping.items, ["mapping(3)"]);
  assert.deepEqual(summary.custom.items, ["primitives(6)"]);
  assert.equal(summary.goal.slot, "custom 648x220@36,180");
  const model = compileRenderModel(inputs());
  assert.equal(model.compositionSummary.outcome.items[0], "chips(3)");
});
